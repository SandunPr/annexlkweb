const userRepository = require('../repositories/userRepository');
const db = require('../config/db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

class UserService {
  /**
   * Get user profile.
   */
  async getProfile(userId) {
    const profile = await userRepository.findById(userId);
    if (!profile) {
      throw new NotFoundError('User profile not found.');
    }
    return profile;
  }

  /**
   * Update user profile.
   */
  async updateProfile(userId, profileData) {
    // Phone numbers must be unique, so check if another user has it
    if (profileData.phoneNumber) {
      const existing = await userRepository.findByEmail(profileData.phoneNumber); // helper or custom check
      const [rows] = await db.query(
        'SELECT user_id FROM user_profiles WHERE phone_number = ? AND user_id != ?',
        [profileData.phoneNumber, userId]
      );
      if (rows.length > 0) {
        throw new ValidationError('This phone number is already registered to another account.');
      }
    }

    await userRepository.updateProfile(userId, profileData);
    logger.info(`Profile updated for user ID: ${userId}`);
    return await this.getProfile(userId);
  }

  /**
   * Request phone verification code.
   */
  async requestPhoneVerification(userId) {
    const profile = await userRepository.findById(userId);
    if (!profile) {
      throw new NotFoundError('User profile not found.');
    }

    if (!profile.phone_number) {
      throw new ValidationError('Please save a phone number to your profile before verifying.');
    }

    // Generate random 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Insert phone verification record
    await db.query(
      'INSERT INTO phone_verifications (user_id, code, expires_at) VALUES (?, ?, ?)',
      [userId, code, expiresAt]
    );

    // MOCK SMS delivery: log directly to console
    console.log(`\n======================================================`);
    console.log(`[MOCK SMS SENDER] To: ${profile.phone_number}`);
    console.log(`Your AnnexLK verification code is: ${code}`);
    console.log(`This code will expire in 10 minutes.`);
    console.log(`======================================================\n`);

    logger.info(`Phone verification code generated for user ${userId}. OTP: ${code} (Mock SMS logged)`);
    return { message: 'Verification code sent successfully.' };
  }

  /**
   * Confirm phone verification code.
   */
  async confirmPhoneVerification(userId, code) {
    // Fetch latest active code
    const [rows] = await db.query(
      'SELECT id, code, expires_at, verified_at FROM phone_verifications WHERE user_id = ? AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      throw new ValidationError('No active phone verification request found.');
    }

    const verification = rows[0];

    if (new Date(verification.expires_at) < new Date()) {
      throw new ValidationError('Verification code has expired. Please request a new code.');
    }

    if (verification.code !== code) {
      throw new ValidationError('Invalid verification code.');
    }

    // Set code as verified and update user status
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      await conn.execute(
        'UPDATE phone_verifications SET verified_at = NOW() WHERE id = ?',
        [verification.id]
      );

      // Check current user KYC status.
      // REGISTERED -> PHONE_VERIFIED
      // If they are already IDENTITY_VERIFIED or higher, do not downgrade them.
      const [userRows] = await conn.execute('SELECT kyc_status FROM users WHERE id = ?', [userId]);
      const currentKyc = userRows[0].kyc_status;

      if (currentKyc === 'REGISTERED') {
        await conn.execute('UPDATE users SET kyc_status = "PHONE_VERIFIED" WHERE id = ?', [userId]);
      }

      await conn.commit();
      logger.info(`Phone number verified successfully for user ${userId}`);
      return { success: true, message: 'Phone number verified successfully.' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = new UserService();
