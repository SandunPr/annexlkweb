const db = require('../config/db');

class UserRepository {
  /**
   * Find a user and their profile/role by email.
   */
  async findByEmail(email) {
    const query = `
      SELECT u.id, u.email, u.password_hash, u.kyc_status, u.is_suspended,
             p.full_name, p.phone_number, p.address, p.date_of_birth, p.avatar_url,
             r.name AS role
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.email = ? AND u.is_suspended = 0
    `;
    const rows = await db.query(query, [email]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find a user and their profile/role by ID.
   */
  async findById(id) {
    const query = `
      SELECT u.id, u.email, u.kyc_status, u.is_suspended,
             p.full_name, p.phone_number, p.address, p.date_of_birth, p.avatar_url,
             r.name AS role
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
    `;
    const rows = await db.query(query, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Create a new user with their profile and default role in a single transaction.
   */
  async create({ email, passwordHash, roleName, fullName, phoneNumber }) {
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      // 1. Insert into users
      const [userResult] = await conn.execute(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        [email, passwordHash]
      );
      const userId = userResult.insertId;

      // 2. Fetch role ID
      const [roleRows] = await conn.execute('SELECT id FROM roles WHERE name = ?', [roleName]);
      if (roleRows.length === 0) {
        throw new Error(`Role ${roleName} does not exist`);
      }
      const roleId = roleRows[0].id;

      // 3. Insert into user_roles
      await conn.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);

      // 4. Insert into user_profiles
      await conn.execute(
        'INSERT INTO user_profiles (user_id, full_name, phone_number) VALUES (?, ?, ?)',
        [userId, fullName || null, phoneNumber || null]
      );

      await conn.commit();
      return userId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Update profile fields.
   */
  async updateProfile(userId, { fullName, phoneNumber, dateOfBirth, address }) {
    const fields = [];
    const params = [];

    if (fullName !== undefined) {
      fields.push('full_name = ?');
      params.push(fullName);
    }
    if (phoneNumber !== undefined) {
      fields.push('phone_number = ?');
      params.push(phoneNumber);
    }
    if (dateOfBirth !== undefined) {
      fields.push('date_of_birth = ?');
      params.push(dateOfBirth);
    }
    if (address !== undefined) {
      fields.push('address = ?');
      params.push(address);
    }

    if (fields.length === 0) return;

    params.push(userId);
    const query = `UPDATE user_profiles SET ${fields.join(', ')} WHERE user_id = ?`;
    await db.query(query, params);
  }

  /**
   * Update KYC Status.
   */
  async updateKycStatus(userId, status) {
    await db.query('UPDATE users SET kyc_status = ? WHERE id = ?', [status, userId]);
  }

  /**
   * Manage User Suspension.
   */
  async suspendUser(userId, isSuspended) {
    await db.query('UPDATE users SET is_suspended = ? WHERE id = ?', [isSuspended ? 1 : 0, userId]);
  }

  /**
   * Track login attempts. Lock out user for 15 minutes after 5 failed attempts.
   */
  async incrementLoginAttempts(ip, email) {
    const query = `
      INSERT INTO login_attempts (ip_address, email, attempt_count, locked_until)
      VALUES (?, ?, 1, NULL)
      ON DUPLICATE KEY UPDATE
        attempt_count = attempt_count + 1,
        locked_until = IF(attempt_count + 1 >= 5, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NULL)
    `;
    await db.query(query, [ip, email]);
  }

  async resetLoginAttempts(ip, email) {
    await db.query('DELETE FROM login_attempts WHERE ip_address = ? AND email = ?', [ip, email]);
  }

  async getLoginAttempts(ip, email) {
    const rows = await db.query(
      'SELECT attempt_count, locked_until FROM login_attempts WHERE ip_address = ? AND email = ?',
      [ip, email]
    );
    return rows.length > 0 ? rows[0] : null;
  }
}

module.exports = new UserRepository();
