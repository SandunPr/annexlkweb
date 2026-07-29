const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Hash a plain text password.
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * Compare plain text password against hash.
 */
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a short-lived access token containing user metadata.
 */
function generateAccessToken(user) {
  const payload = {
    userId: user.id.toString(),
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

/**
 * Verify access token and return decoded payload.
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Generate a cryptographically secure random refresh token.
 */
function generateRandomToken() {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Hash a refresh token using SHA-256.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Parse standard duration string (e.g. '7d', '15m') into a Date object.
 */
function getExpiryDate(durationString) {
  const match = durationString.match(/^(\d+)([smhd])$/);
  if (!match) {
    // Default to 7 days
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  const val = parseInt(match[1], 10);
  const unit = match[2];
  let ms = 0;
  switch (unit) {
    case 's': ms = val * 1000; break;
    case 'm': ms = val * 60 * 1000; break;
    case 'h': ms = val * 60 * 60 * 1000; break;
    case 'd': ms = val * 24 * 60 * 60 * 1000; break;
  }
  return new Date(Date.now() + ms);
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyAccessToken,
  generateRandomToken,
  hashToken,
  getExpiryDate,
  REFRESH_EXPIRES,
};
