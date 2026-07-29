const db = require('../config/db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');
const path = require('path');

class AdminService {
  /**
   * Helper to write records to the security audit logs table.
   */
  async logAuditEvent({ userId, action, targetType, targetId, ipAddress, userAgent, details }) {
    try {
      await db.query(
        `INSERT INTO audit_logs 
          (user_id, action, target_type, target_id, ip_address, user_agent, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, action, targetType, targetId, ipAddress, userAgent, details]
      );
    } catch (err) {
      logger.error('Failed to write to audit log: %s', err.message);
    }
  }

  /**
   * Fetch pending KYC submissions list.
   */
  async getPendingKyc() {
    const query = `
      SELECT ks.id, ks.user_id, ks.status, ks.full_name, ks.dob, ks.id_type, ks.id_number, ks.submitted_at, ks.address,
             u.email, p.phone_number,
             kd_front.file_path AS id_front_path,
             kd_back.file_path AS id_back_path
      FROM kyc_submissions ks
      JOIN users u ON ks.user_id = u.id
      JOIN user_profiles p ON u.id = p.user_id
      LEFT JOIN kyc_documents kd_front ON ks.id = kd_front.kyc_submission_id AND kd_front.document_type = "id_front"
      LEFT JOIN kyc_documents kd_back ON ks.id = kd_back.kyc_submission_id AND kd_back.document_type = "id_back"
      WHERE ks.status = "PENDING_REVIEW"
      ORDER BY ks.submitted_at ASC
    `;
    return await db.query(query);
  }

  /**
   * View details of a specific KYC submission with audit logging.
   */
  async getKycDetails(submissionId, adminId, ip, userAgent) {
    const submissions = await db.query(
      `SELECT ks.id, ks.user_id, ks.status, ks.full_name, ks.dob, ks.id_type, ks.id_number, ks.address, ks.phone_number, ks.submitted_at, ks.reviewed_at, ks.review_notes,
              u.email
       FROM kyc_submissions ks
       JOIN users u ON ks.user_id = u.id
       WHERE ks.id = ?`,
      [submissionId]
    );

    if (submissions.length === 0) {
      throw new NotFoundError('KYC submission not found.');
    }
    const submission = submissions[0];

    const documents = await db.query(
      'SELECT id, document_type FROM kyc_documents WHERE kyc_submission_id = ?',
      [submissionId]
    );
    submission.documents = documents;

    // Security logging
    await this.logAuditEvent({
      userId: adminId,
      action: 'KYC_VIEW_DETAILS',
      targetType: 'kyc_submissions',
      targetId: submissionId,
      ipAddress: ip,
      userAgent: userAgent,
      details: `Viewed KYC details for submission ID ${submissionId} (User ID ${submission.user_id})`,
    });

    return submission;
  }

  /**
   * Retrieve file path of a private document and write access logs.
   */
  async getKycDocumentFile(documentId, adminId, ip, userAgent) {
    const rows = await db.query(
      `SELECT kd.id, kd.document_type, kd.file_path, ks.user_id, ks.id AS submission_id
       FROM kyc_documents kd
       JOIN kyc_submissions ks ON kd.kyc_submission_id = ks.id
       WHERE kd.id = ?`,
      [documentId]
    );

    if (rows.length === 0) {
      throw new NotFoundError('Document record not found.');
    }
    const doc = rows[0];

    // Audit log entry for document access
    await this.logAuditEvent({
      userId: adminId,
      action: 'KYC_VIEW_DOCUMENT',
      targetType: 'kyc_documents',
      targetId: documentId,
      ipAddress: ip,
      userAgent: userAgent,
      details: `Accessed private document image ID ${documentId} (${doc.document_type}) for submission ID ${doc.submission_id}`,
    });

    const absolutePath = path.resolve(doc.file_path);
    return {
      absolutePath,
      documentType: doc.document_type,
    };
  }

  /**
   * Approve a KYC submission and promote user to IDENTITY_VERIFIED status.
   */
  async approveKyc(submissionId, reviewerId, ip, userAgent) {
    const submissions = await db.query('SELECT user_id, status FROM kyc_submissions WHERE id = ?', [submissionId]);
    if (submissions.length === 0) {
      throw new NotFoundError('KYC submission not found.');
    }
    const sub = submissions[0];

    if (sub.status !== 'PENDING_REVIEW') {
      throw new ValidationError(`Cannot approve submission with status: ${sub.status}`);
    }

    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      // Update submission status
      await conn.execute(
        'UPDATE kyc_submissions SET status = "APPROVED", reviewer_id = ?, reviewed_at = NOW() WHERE id = ?',
        [reviewerId, submissionId]
      );

      // Promote user trust level
      await conn.execute(
        'UPDATE users SET kyc_status = "IDENTITY_VERIFIED" WHERE id = ?',
        [sub.user_id]
      );

      await conn.commit();
      logger.info(`KYC approved. Submission: ${submissionId}, Reviewer: ${reviewerId}`);

      // Log audit
      await this.logAuditEvent({
        userId: reviewerId,
        action: 'KYC_APPROVE',
        targetType: 'kyc_submissions',
        targetId: submissionId,
        ipAddress: ip,
        userAgent: userAgent,
        details: `Approved KYC submission ID ${submissionId}. User ID ${sub.user_id} promoted to IDENTITY_VERIFIED.`,
      });

      return { success: true, message: 'KYC submission approved.' };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Reject a KYC submission.
   */
  async rejectKyc(submissionId, reviewerId, notes, ip, userAgent) {
    const submissions = await db.query('SELECT user_id, status FROM kyc_submissions WHERE id = ?', [submissionId]);
    if (submissions.length === 0) {
      throw new NotFoundError('KYC submission not found.');
    }
    const sub = submissions[0];

    if (sub.status !== 'PENDING_REVIEW') {
      throw new ValidationError(`Cannot reject submission with status: ${sub.status}`);
    }

    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      // Update submission status
      await conn.execute(
        'UPDATE kyc_submissions SET status = "REJECTED", reviewer_id = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?',
        [reviewerId, notes, submissionId]
      );

      // Revert user trust level to REGISTERED
      await conn.execute(
        'UPDATE users SET kyc_status = "REGISTERED" WHERE id = ?',
        [sub.user_id]
      );

      await conn.commit();
      logger.info(`KYC rejected. Submission: ${submissionId}, Reviewer: ${reviewerId}`);

      // Log audit
      await this.logAuditEvent({
        userId: reviewerId,
        action: 'KYC_REJECT',
        targetType: 'kyc_submissions',
        targetId: submissionId,
        ipAddress: ip,
        userAgent: userAgent,
        details: `Rejected KYC submission ID ${submissionId}. User ID ${sub.user_id} reset to REGISTERED status. Reason: ${notes}`,
      });

      return { success: true, message: 'KYC submission rejected.' };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Fetch general system administrative statistics.
   */
  async getDashboardStats() {
    const usersCount = (await db.query('SELECT COUNT(id) AS count FROM users'))[0].count;
    const verifiedCount = (await db.query('SELECT COUNT(id) AS count FROM users WHERE kyc_status IN ("IDENTITY_VERIFIED", "PROPERTY_VERIFIED", "TRUSTED_OWNER")'))[0].count;
    const activeListingsCount = (await db.query('SELECT COUNT(id) AS count FROM properties WHERE status = "ACTIVE"'))[0].count;
    const pendingListingsCount = (await db.query('SELECT COUNT(id) AS count FROM properties WHERE status = "PENDING_REVIEW"'))[0].count;
    const pendingKycCount = (await db.query('SELECT COUNT(id) AS count FROM kyc_submissions WHERE status = "PENDING_REVIEW"'))[0].count;
    const openReportsCount = (await db.query('SELECT COUNT(id) AS count FROM reports WHERE status = "OPEN"'))[0].count;
    const totalClicks = (await db.query('SELECT SUM(contact_clicks_count) AS count FROM properties'))[0].count || 0;

    const registrations = await db.query(
      `SELECT DATE(created_at) AS date, COUNT(id) AS count 
       FROM users 
       GROUP BY DATE(created_at) 
       ORDER BY date DESC 
       LIMIT 15`
    );

    return {
      totals: {
        users: usersCount.count,
        verifiedUsers: verifiedCount.count,
        activeListings: activeListingsCount.count,
        pendingListings: pendingListingsCount.count,
        pendingKyc: pendingKycCount.count,
        openReports: openReportsCount.count,
        contactRevealClicks: totalClicks.count || 0,
      },
      charts: {
        registrations,
      },
    };
  }

  /**
   * Fetch full list of registered users.
   */
  async getUsers() {
    const query = `
      SELECT u.id, u.email, u.kyc_status, u.is_suspended, u.created_at,
             up.full_name, up.phone_number, r.name AS role
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ORDER BY u.created_at DESC
    `;
    return await db.query(query);
  }

  /**
   * Suspend or unsuspend user. Revokes all active user sessions immediately on suspension.
   */
  async suspendUser(userId, isSuspended, adminId, ip, userAgent) {
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      await conn.execute('UPDATE users SET is_suspended = ? WHERE id = ?', [isSuspended ? 1 : 0, userId]);

      if (isSuspended) {
        // Force log out of all sessions immediately by revoking refresh tokens
        await conn.execute('UPDATE refresh_tokens SET is_revoked = 1 WHERE user_id = ?', [userId]);
      }

      await conn.commit();
      logger.warn(`Admin ${adminId} ${isSuspended ? 'SUSPENDED' : 'UNSUSPENDED'} user ${userId}`);

      await this.logAuditEvent({
        userId: adminId,
        action: isSuspended ? 'USER_SUSPEND' : 'USER_UNSUSPEND',
        targetType: 'users',
        targetId: userId,
        ipAddress: ip,
        userAgent,
        details: `${isSuspended ? 'Suspended' : 'Unsuspended'} user ID ${userId}`,
      });

      return { success: true, message: `User account has been ${isSuspended ? 'suspended' : 'unsuspended'}.` };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Fetch all listing properties for moderation reviews.
   */
  async getListings() {
    const query = `
      SELECT p.id, p.title, p.property_type, p.rent, p.status, p.created_at,
             u.email AS owner_email, up.full_name AS owner_name
      FROM properties p
      JOIN users u ON p.owner_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE p.status != 'DELETED'
      ORDER BY CASE p.status WHEN 'PENDING_REVIEW' THEN 1 ELSE 2 END, p.created_at DESC
    `;
    return await db.query(query);
  }

  /**
   * Approve property listing submission.
   */
  async approveListing(propertyId, adminId, ip, userAgent) {
    const prop = await db.query('SELECT owner_id, status FROM properties WHERE id = ?', [propertyId]);
    if (prop.length === 0) {
      throw new NotFoundError('Property listing not found.');
    }

    const conn = await db.getTransaction();
    await conn.beginTransaction();
    try {
      await conn.execute('UPDATE properties SET status = "ACTIVE", last_confirmed_at = NOW() WHERE id = ?', [propertyId]);
      
      // Log availability change
      await conn.execute(
        'INSERT INTO property_availability_logs (property_id, action, performed_by) VALUES (?, "admin_approved", ?)',
        [propertyId, adminId]
      );

      await conn.commit();
      logger.info(`Listing ${propertyId} approved by Admin ${adminId}`);

      await this.logAuditEvent({
        userId: adminId,
        action: 'LISTING_APPROVE',
        targetType: 'properties',
        targetId: propertyId,
        ipAddress: ip,
        userAgent,
        details: `Approved property listing ID ${propertyId} (Owner ID ${prop[0].owner_id})`,
      });

      return { success: true, message: 'Property listing approved successfully.' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Reject property listing submission.
   */
  async rejectListing(propertyId, reason, adminId, ip, userAgent) {
    const prop = await db.query('SELECT owner_id FROM properties WHERE id = ?', [propertyId]);
    if (prop.length === 0) {
      throw new NotFoundError('Property listing not found.');
    }

    const conn = await db.getTransaction();
    await conn.beginTransaction();
    try {
      await conn.execute('UPDATE properties SET status = "REJECTED" WHERE id = ?', [propertyId]);
      
      // Log availability change
      await conn.execute(
        'INSERT INTO property_availability_logs (property_id, action, performed_by) VALUES (?, ?, ?)',
        [propertyId, `admin_rejected: ${reason.substring(0, 100)}`, adminId]
      );

      await conn.commit();
      logger.warn(`Listing ${propertyId} rejected by Admin ${adminId}. Reason: ${reason}`);

      await this.logAuditEvent({
        userId: adminId,
        action: 'LISTING_REJECT',
        targetType: 'properties',
        targetId: propertyId,
        ipAddress: ip,
        userAgent,
        details: `Rejected listing ID ${propertyId}. Reason: ${reason}`,
      });

      return { success: true, message: 'Listing submission rejected.' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Suspend active listing (hides it from public searches).
   */
  async suspendListing(propertyId, adminId, ip, userAgent) {
    const prop = await db.query('SELECT owner_id FROM properties WHERE id = ?', [propertyId]);
    if (prop.length === 0) {
      throw new NotFoundError('Property listing not found.');
    }

    const conn = await db.getTransaction();
    await conn.beginTransaction();
    try {
      await conn.execute('UPDATE properties SET status = "SUSPENDED" WHERE id = ?', [propertyId]);
      
      await conn.execute(
        'INSERT INTO property_availability_logs (property_id, action, performed_by) VALUES (?, "admin_suspended", ?)',
        [propertyId, adminId]
      );

      await conn.commit();
      logger.warn(`Listing ${propertyId} suspended by Admin ${adminId}`);

      await this.logAuditEvent({
        userId: adminId,
        action: 'LISTING_SUSPEND',
        targetType: 'properties',
        targetId: propertyId,
        ipAddress: ip,
        userAgent,
        details: `Suspended property listing ID ${propertyId}`,
      });

      return { success: true, message: 'Property listing suspended.' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Fetch reports for listing moderation.
   */
  async getReports() {
    const query = `
      SELECT r.id, r.property_id, r.category, r.comment, r.status, r.created_at,
             p.title AS property_title, p.slug AS property_slug,
             u.email AS reporter_email
      FROM reports r
      JOIN properties p ON r.property_id = p.id
      JOIN users u ON r.reporter_id = u.id
      ORDER BY CASE r.status WHEN 'OPEN' THEN 1 WHEN 'UNDER_REVIEW' THEN 2 ELSE 3 END, r.created_at DESC
    `;
    return await db.query(query);
  }

  /**
   * Moderate reports and update status (with internal admin review notes).
   */
  async updateReportStatus(reportId, status, note, adminId, ip, userAgent) {
    const reports = await db.query('SELECT property_id, status FROM reports WHERE id = ?', [reportId]);
    if (reports.length === 0) {
      throw new NotFoundError('Report record not found.');
    }

    const validStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'ESCALATED'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid report status transition to: ${status}`);
    }

    const conn = await db.getTransaction();
    await conn.beginTransaction();
    try {
      // Update report status
      await conn.execute('UPDATE reports SET status = ? WHERE id = ?', [status, reportId]);

      // Write administrative note
      await conn.execute(
        'INSERT INTO report_notes (report_id, admin_id, note) VALUES (?, ?, ?)',
        [reportId, adminId, note]
      );

      await conn.commit();
      logger.info(`Admin ${adminId} updated report ${reportId} status to ${status}`);

      await this.logAuditEvent({
        userId: adminId,
        action: 'REPORT_MODERATE',
        targetType: 'reports',
        targetId: reportId,
        ipAddress: ip,
        userAgent,
        details: `Updated report ID ${reportId} status to ${status}. Admin note: ${note}`,
      });

      return { success: true, message: 'Report status updated successfully.' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Retrieve platform security and change logs.
   */
  async getAuditLogs() {
    const query = `
      SELECT al.id, al.action, al.target_type, al.target_id, al.ip_address, al.user_agent, al.details, al.created_at,
             u.email AS user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 100
    `;
    return await db.query(query);
  }
}

module.exports = new AdminService();
