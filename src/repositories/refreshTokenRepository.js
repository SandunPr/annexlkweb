const db = require('../config/db');

class RefreshTokenRepository {
  /**
   * Insert a new hashed refresh token.
   */
  async create({ userId, tokenHash, expiresAt }) {
    const query = `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `;
    await db.query(query, [userId, tokenHash, expiresAt]);
  }

  /**
   * Find an active non-revoked refresh token.
   */
  async findActiveByHash(tokenHash) {
    const query = `
      SELECT id, user_id, token_hash, expires_at, is_revoked
      FROM refresh_tokens
      WHERE token_hash = ? AND is_revoked = 0 AND expires_at > NOW()
    `;
    const rows = await db.query(query, [tokenHash]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Revoke a single refresh token by hash.
   */
  async revokeByHash(tokenHash) {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = 1
      WHERE token_hash = ?
    `;
    await db.query(query, [tokenHash]);
  }

  /**
   * Revoke all refresh tokens for a specific user (Logout from all devices).
   */
  async revokeAllForUser(userId) {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = 1
      WHERE user_id = ? AND is_revoked = 0
    `;
    await db.query(query, [userId]);
  }
  
  /**
   * Clear expired refresh tokens (scheduled cleanup job helper).
   */
  async deleteExpiredTokens() {
    await db.query('DELETE FROM refresh_tokens WHERE expires_at <= NOW() OR is_revoked = 1');
  }
}

module.exports = new RefreshTokenRepository();
