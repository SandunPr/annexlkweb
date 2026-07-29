const db = require('../config/db');
const crypto = require('crypto');
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

class RenterService {
  /**
   * Helper to hash IP addresses for privacy-compliant analytics tracking.
   */
  hashIp(ip) {
    return crypto.createHash('sha256').update(ip || '').digest('hex');
  }

  // ==========================================
  // FAVOURITES FEATURES
  // ==========================================

  async getFavourites(userId) {
    const query = `
      SELECT p.id, p.title, p.slug, p.rent, p.property_type, p.status, p.last_confirmed_at,
             pl.approx_latitude, pl.approx_longitude, pl.address_text, c.name AS city_name,
             pi.thumbnail_path AS main_thumbnail
      FROM favourites f
      JOIN properties p ON f.property_id = p.id
      JOIN property_locations pl ON p.id = pl.property_id
      JOIN cities c ON pl.city_id = c.id
      LEFT JOIN property_images pi ON p.id = pi.property_id AND pi.image_position = 1
      WHERE f.user_id = ? AND p.status != 'DELETED'
      ORDER BY f.created_at DESC
    `;
    return await db.query(query, [userId]);
  }

  async addFavourite(userId, propertyId) {
    const [prop] = await db.query('SELECT id FROM properties WHERE id = ? AND status != "DELETED"', [propertyId]);
    if (prop.length === 0) {
      throw new NotFoundError('Property listing not found.');
    }

    const conn = await db.getTransaction();
    await conn.beginTransaction();
    try {
      await conn.execute(
        'INSERT IGNORE INTO favourites (user_id, property_id) VALUES (?, ?)',
        [userId, propertyId]
      );
      // Increment favourites count
      await conn.execute('UPDATE properties SET favourites_count = favourites_count + 1 WHERE id = ?', [propertyId]);
      await conn.commit();
      logger.info(`Renter ${userId} added property ${propertyId} to favourites.`);
      return { success: true, message: 'Added to favourites.' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async removeFavourite(userId, propertyId) {
    const conn = await db.getTransaction();
    await conn.beginTransaction();
    try {
      const [result] = await conn.execute(
        'DELETE FROM favourites WHERE user_id = ? AND property_id = ?',
        [userId, propertyId]
      );

      if (result.affectedRows > 0) {
        // Decrement favourites count
        await conn.execute(
          'UPDATE properties SET favourites_count = GREATEST(0, CAST(favourites_count AS SIGNED) - 1) WHERE id = ?',
          [propertyId]
        );
      }

      await conn.commit();
      logger.info(`Renter ${userId} removed property ${propertyId} from favourites.`);
      return { success: true, message: 'Removed from favourites.' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // CONTACT REVEAL FEATURES
  // ==========================================

  async recordContactIntent(userId, propertyId, contactType, ip, userAgent) {
    const propRows = await db.query('SELECT owner_id FROM properties WHERE id = ? AND status != "DELETED"', [propertyId]);
    if (propRows.length === 0) {
      throw new NotFoundError('Property listing not found.');
    }
    const prop = propRows[0];

    const ipHash = this.hashIp(ip);
    await db.query(
      `INSERT INTO contact_events 
        (user_id, property_id, owner_id, contact_type, ip_hash, user_agent_summary, revealed)
       VALUES (?, ?, ?, ?, ?, ?, FALSE)`,
      [userId, propertyId, prop.owner_id, contactType, ipHash, userAgent.substring(0, 255)]
    );

    return { success: true };
  }

  async revealContact(userId, propertyId, contactType, ip, userAgent) {
    // 1. Enforce rate limiting: Max 10 phone reveals per user per hour
    const rateCheckRows = await db.query(
      'SELECT COUNT(id) AS count FROM contact_events WHERE user_id = ? AND revealed = 1 AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)',
      [userId]
    );
    const rateCheck = rateCheckRows[0] || { count: 0 };
    if (rateCheck.count >= 10) {
      throw new ForbiddenError('Reveal limit exceeded. You can only reveal 10 owner phone numbers per hour.');
    }

    // 2. Fetch property and owner info
    const query = `
      SELECT p.id, p.owner_id, up.phone_number, up.full_name
      FROM properties p
      JOIN user_profiles up ON p.owner_id = up.user_id
      WHERE p.id = ? AND p.status != 'DELETED'
    `;
    const rows = await db.query(query, [propertyId]);
    if (rows.length === 0) {
      throw new NotFoundError('Property listing not found.');
    }
    const prop = rows[0];

    if (!prop.phone_number) {
      throw new NotFoundError('Owner contact number not registered.');
    }

    const conn = await db.getTransaction();
    await conn.beginTransaction();
    try {
      // Record click reveal
      const ipHash = this.hashIp(ip);
      await conn.execute(
        `INSERT INTO contact_events 
          (user_id, property_id, owner_id, contact_type, ip_hash, user_agent_summary, revealed)
         VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
        [userId, propertyId, prop.owner_id, contactType, ipHash, userAgent.substring(0, 255)]
      );

      // Increment click metrics
      await conn.execute('UPDATE properties SET contact_clicks_count = contact_clicks_count + 1 WHERE id = ?', [propertyId]);

      await conn.commit();
      logger.info(`Renter ${userId} revealed contact for property ${propertyId} (Owner: ${prop.owner_id}).`);

      return {
        phoneNumber: prop.phone_number,
        ownerName: prop.full_name,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // REPORTING FEATURES
  // ==========================================

  async submitReport(userId, propertyId, { category, comment }) {
    const [prop] = await db.query('SELECT id FROM properties WHERE id = ? AND status != "DELETED"', [propertyId]);
    if (prop.length === 0) {
      throw new NotFoundError('Property listing not found.');
    }

    const validCategories = [
      'Fake listing', 'Wrong price', 'Incorrect location', 'Duplicate listing',
      'Property no longer available', 'Suspicious payment request', 'Inappropriate content',
      'Misleading photos', 'Owner unreachable', 'Other'
    ];

    if (!validCategories.includes(category)) {
      throw new ValidationError('Invalid report category selected.');
    }

    await db.query(
      `INSERT INTO reports (reporter_id, property_id, category, comment, status) 
       VALUES (?, ?, ?, ?, 'OPEN')`,
      [userId, propertyId, category, comment || null]
    );

    logger.warn(`Property ${propertyId} reported by user ${userId} for: ${category}`);
    return { success: true, message: 'Report submitted successfully. We will investigate.' };
  }

  async getMyReports(userId) {
    const query = `
      SELECT r.id, r.property_id, r.category, r.comment, r.status, r.created_at,
             p.title AS property_title, p.slug AS property_slug
      FROM reports r
      JOIN properties p ON r.property_id = p.id
      WHERE r.reporter_id = ?
      ORDER BY r.created_at DESC
    `;
    return await db.query(query, [userId]);
  }

  // ==========================================
  // REVIEW FEATURES
  // ==========================================

  async submitReview(userId, propertyId, { rating, comment }) {
    // 1. Verify property
    const [propRows] = await db.query('SELECT owner_id FROM properties WHERE id = ? AND status = "ACTIVE"', [propertyId]);
    if (propRows.length === 0) {
      throw new NotFoundError('Active property listing not found.');
    }
    const ownerId = propRows[0].owner_id;

    // 2. Prevent self-reviewing
    if (ownerId === userId) {
      throw new ForbiddenError('Property owners cannot write reviews for their own listings.');
    }

    // 3. Prevent reviewing without interaction (contact events check)
    const [contactCheck] = await db.query(
      'SELECT id FROM contact_events WHERE user_id = ? AND property_id = ? LIMIT 1',
      [userId, propertyId]
    );
    if (contactCheck.length === 0) {
      throw new ForbiddenError('You can only review this listing after revealing the owner contact details.');
    }

    // 4. Prevent duplicate reviews
    const [existing] = await db.query(
      'SELECT id FROM reviews WHERE reviewer_id = ? AND property_id = ?',
      [userId, propertyId]
    );
    if (existing.length > 0) {
      throw new ValidationError('You have already submitted a review for this property.');
    }

    // 5. Save review
    await db.query(
      'INSERT INTO reviews (reviewer_id, property_id, owner_id, rating, comment, status) VALUES (?, ?, ?, ?, ?, "APPROVED")',
      [userId, propertyId, ownerId, rating, comment || null]
    );

    logger.info(`User ${userId} reviewed property ${propertyId} with rating ${rating}`);
    return { success: true, message: 'Review published successfully.' };
  }
}

module.exports = new RenterService();
