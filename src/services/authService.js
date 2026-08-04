const userRepository = require('../repositories/userRepository');
const refreshTokenRepository = require('../repositories/refreshTokenRepository');
const authUtils = require('../utils/auth');
const { OAuth2Client } = require('google-auth-library');
const { ValidationError, UnauthorizedError, ConflictError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');
const db = require('../config/db');
const emailService = require('./emailService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

class AuthService {
  /**
   * Register a new user local credentials.
   */
  async register({ email, password, roleName, fullName, phoneNumber }) {
    // Validate role is either PROPERTY_OWNER or RENTER (Administrators/Moderators cannot be registered publicly)
    const allowedRoles = ['PROPERTY_OWNER', 'RENTER'];
    if (!allowedRoles.includes(roleName)) {
      throw new ValidationError('Invalid role selection for public registration.');
    }

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('A user with this email address already exists.');
    }

    const passwordHash = await authUtils.hashPassword(password);

    const userId = await userRepository.create({
      email,
      passwordHash,
      roleName,
      fullName,
      phoneNumber,
    });

    const verificationEmailSent = await this.issueEmailVerification({
      userId,
      email,
      fullName,
    });

    logger.info(`User registered successfully. ID: ${userId}, Email: ${email}, Role: ${roleName}`);

    return {
      userId,
      email,
      role: roleName,
      verificationRequired: true,
      verificationEmailSent,
    };
  }

  /**
   * Log in user with local credentials.
   */
  async login({ email, password, ip }) {
    // 1. Check lockout status
    const lockout = await userRepository.getLoginAttempts(ip, email);
    if (lockout && lockout.locked_until && new Date(lockout.locked_until) > new Date()) {
      const waitMinutes = Math.ceil((new Date(lockout.locked_until) - new Date()) / 1000 / 60);
      throw new ForbiddenError(`Account temporarily locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`);
    }

    // 2. Retrieve user
    const user = await userRepository.findByEmail(email);
    if (!user) {
      await userRepository.incrementLoginAttempts(ip, email);
      throw new UnauthorizedError('Invalid email or password.');
    }

    // 3. Verify password
    const isMatch = await authUtils.comparePassword(password, user.password_hash);
    if (!isMatch) {
      await userRepository.incrementLoginAttempts(ip, email);
      throw new UnauthorizedError('Invalid email or password.');
    }

    // Reset login attempts
    await userRepository.resetLoginAttempts(ip, email);

    // 4. Generate tokens
    const accessToken = authUtils.generateAccessToken(user);
    const rawRefreshToken = `${user.id}:${authUtils.generateRandomToken()}`;
    const tokenHash = authUtils.hashToken(rawRefreshToken);
    const expiresAt = authUtils.getExpiryDate(authUtils.REFRESH_EXPIRES);

    // Save refresh token
    await refreshTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    logger.info(`User logged in. ID: ${user.id}, Email: ${user.email}`);

    // Remove password hash from response user object
    const { password_hash, ...safeUser } = user;

    return {
      user: safeUser,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Login or register via Google Sign-In.
   */
  async loginWithGoogle(idToken, requestedRole = 'RENTER') {
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (error) {
      logger.error('Google ID token verification failed: %s', error.message);
      throw new UnauthorizedError('Invalid Google authentication token.');
    }

    const { sub: googleUserId, email, email_verified: emailVerified, name, picture } = payload;
    if (!email || emailVerified !== true) {
      throw new ValidationError('Google account must provide a verified email address.');
    }

    // Look for user by email
    let user = await userRepository.findByEmail(email);
    let userId;

    if (!user) {
      // 1. User doesn't exist, create automatically as a Renter
      const conn = await db.getTransaction();
      await conn.beginTransaction();
      try {
        const [userResult] = await conn.execute(
          'INSERT INTO users (email, password_hash, kyc_status) VALUES (?, NULL, "REGISTERED")',
          [email]
        );
        userId = userResult.insertId;

        // Registration may explicitly choose renter or property owner; login defaults to renter.
        const roleName = ['PROPERTY_OWNER', 'RENTER'].includes(requestedRole) ? requestedRole : 'RENTER';
        const [roleRows] = await conn.execute('SELECT id FROM roles WHERE name = ?', [roleName]);
        const roleId = roleRows[0].id;
        await conn.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);

        // Profile
        await conn.execute(
          'INSERT INTO user_profiles (user_id, full_name, avatar_url) VALUES (?, ?, ?)',
          [userId, name, picture || null]
        );

        // Auth identity linking Google
        await conn.execute(
          'INSERT INTO auth_identities (user_id, provider, provider_user_id) VALUES (?, "google", ?)',
          [userId, googleUserId]
        );

        await conn.commit();
        logger.info(`Created new user via Google authentication. ID: ${userId}, Email: ${email}`);
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      user = await userRepository.findById(userId);
    } else {
      userId = user.id;
      // 2. User exists, check if google identity is linked, if not link it
      const identities = await db.query(
        'SELECT id FROM auth_identities WHERE user_id = ? AND provider = "google"',
        [userId]
      );
      if (identities.length === 0) {
        await db.query(
          'INSERT INTO auth_identities (user_id, provider, provider_user_id) VALUES (?, "google", ?)',
          [userId, googleUserId]
        );
        logger.info(`Linked Google identity to existing email user. ID: ${userId}`);
      }
      user.google_authenticated = 1;

      // Keep Google's picture current unless the user chose a locally uploaded avatar.
      const hasManualAvatar = user.avatar_url && user.avatar_url.startsWith('/media/avatars/');
      if (picture && !hasManualAvatar && user.avatar_url !== picture) {
        await db.query(
          'UPDATE user_profiles SET avatar_url = ? WHERE user_id = ?',
          [picture, userId]
        );
        user.avatar_url = picture;
      }
    }

    if (user.is_suspended) {
      throw new ForbiddenError('This account has been suspended by an administrator.');
    }

    // Generate tokens
    const accessToken = authUtils.generateAccessToken(user);
    const rawRefreshToken = `${user.id}:${authUtils.generateRandomToken()}`;
    const tokenHash = authUtils.hashToken(rawRefreshToken);
    const expiresAt = authUtils.getExpiryDate(authUtils.REFRESH_EXPIRES);

    await refreshTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return {
      user,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async issueEmailVerification({ userId, email, fullName }) {
    const rawToken = authUtils.generateRandomToken();
    const tokenHash = authUtils.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.query(
      'DELETE FROM email_verifications WHERE user_id = ? AND verified_at IS NULL',
      [userId]
    );
    await db.query(
      'INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );

    try {
      await emailService.sendVerificationEmail({ email, fullName, token: rawToken });
      return true;
    } catch (error) {
      logger.error(`Could not send verification email to ${email}: ${error.message}`);
      return false;
    }
  }

  async verifyEmail(rawToken) {
    const tokenHash = authUtils.hashToken(rawToken);
    const rows = await db.query(
      `SELECT ev.id, ev.expires_at, ev.verified_at
       FROM email_verifications ev
       WHERE ev.token = ? LIMIT 1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      throw new ValidationError('This verification link is invalid or has already been replaced.');
    }
    const verification = rows[0];
    if (verification.verified_at) return { alreadyVerified: true };
    if (new Date(verification.expires_at) < new Date()) {
      throw new ValidationError('This verification link has expired. Please request a new one.');
    }

    await db.query('UPDATE email_verifications SET verified_at = NOW() WHERE id = ?', [verification.id]);
    return { alreadyVerified: false };
  }

  async resendEmailVerification(email) {
    const user = await userRepository.findByEmail(email);
    // Return the same response for unknown, Google, and verified accounts to prevent enumeration.
    if (!user || user.email_verified || user.google_authenticated) return;
    await this.issueEmailVerification({
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
    });
  }

  /**
   * Rotate refresh token.
   */
  async refresh(rawRefreshToken) {
    if (!rawRefreshToken || !rawRefreshToken.includes(':')) {
      throw new UnauthorizedError('Invalid session refresh token format.');
    }

    const [userIdStr, randomPart] = rawRefreshToken.split(':');
    const userId = parseInt(userIdStr, 10);
    const tokenHash = authUtils.hashToken(rawRefreshToken);

    const activeToken = await refreshTokenRepository.findActiveByHash(tokenHash);

    if (!activeToken) {
      // SECURITY WARNING: Possible reuse attempt!
      // Revoke all tokens for this parsed userId to prevent token theft compromise
      logger.warn(`Security alert: Detected revoked or invalid token reuse for User ID: ${userId}. Revoking all sessions.`);
      await refreshTokenRepository.revokeAllForUser(userId);
      throw new UnauthorizedError('Session expired. Please log in again.');
    }

    // Revoke old token
    await refreshTokenRepository.revokeByHash(tokenHash);

    // Fetch user details
    const user = await userRepository.findById(userId);
    if (!user || user.is_suspended) {
      throw new UnauthorizedError('User account not found or suspended.');
    }

    // Generate new set
    const accessToken = authUtils.generateAccessToken(user);
    const newRawRefreshToken = `${user.id}:${authUtils.generateRandomToken()}`;
    const newHash = authUtils.hashToken(newRawRefreshToken);
    const expiresAt = authUtils.getExpiryDate(authUtils.REFRESH_EXPIRES);

    await refreshTokenRepository.create({
      userId: user.id,
      tokenHash: newHash,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Log out single session.
   */
  async logout(rawRefreshToken) {
    if (!rawRefreshToken) return;
    const tokenHash = authUtils.hashToken(rawRefreshToken);
    await refreshTokenRepository.revokeByHash(tokenHash);
  }

  /**
   * Log out all sessions (Revoke all active tokens).
   */
  async logoutAll(userId) {
    await refreshTokenRepository.revokeAllForUser(userId);
  }

  /**
   * Fetch current user profile.
   */
  async getUserById(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User account not found.');
    }
    return user;
  }
}

module.exports = new AuthService();
