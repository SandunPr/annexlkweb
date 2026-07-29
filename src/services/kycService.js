const db = require('../config/db');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

class KycService {
  /**
   * Submit KYC verification documents.
   */
  async submitKyc(userId, { fullName, dob, idType, idNumber, address, phoneNumber }, files) {
    // 1. Validate user eligibility
    const userRows = await db.query('SELECT kyc_status, is_suspended FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      throw new NotFoundError('User not found.');
    }
    const user = userRows[0];

    if (user.is_suspended) {
      throw new ForbiddenError('This account is suspended.');
    }

    if (user.kyc_status === 'IDENTITY_VERIFIED' || user.kyc_status === 'PROPERTY_VERIFIED' || user.kyc_status === 'TRUSTED_OWNER') {
      throw new ValidationError('You have already completed identity verification.');
    }

    // 2. Validate files
    if (!files || !files.id_front || !files.id_back) {
      throw new ValidationError('Both ID front and back images are required.');
    }

    const docFiles = [
      { type: 'id_front', file: files.id_front[0] },
      { type: 'id_back', file: files.id_back[0] },
    ];
    if (files.selfie) {
      docFiles.push({ type: 'selfie', file: files.selfie[0] });
    }

    // Ensure KYC storage folder exists
    const storagePath = path.resolve(process.env.KYC_STORAGE_PATH || './storage/private/kyc');
    await fs.mkdir(storagePath, { recursive: true });

    const savedFiles = [];
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      // 3. Create KYC submission record
      const [submissionResult] = await conn.execute(
        `INSERT INTO kyc_submissions 
          (user_id, status, full_name, dob, id_type, id_number, address, phone_number)
         VALUES (?, 'PENDING_REVIEW', ?, ?, ?, ?, ?, ?)`,
        [userId, fullName, dob, idType, idNumber, address, phoneNumber]
      );
      const submissionId = submissionResult.insertId;

      // 4. Save files and insert records
      for (const item of docFiles) {
        const randomString = crypto.randomBytes(16).toString('hex');
        const extension = path.extname(item.file.originalname) || '.webp';
        const filename = `kyc-${userId}-${item.type}-${randomString}${extension}`;
        const filePath = path.join(storagePath, filename);

        // Write file buffer to private disk location
        await fs.writeFile(filePath, item.file.buffer);
        savedFiles.push(filePath);

        // Record document in database (storing relative path for portability)
        const dbPath = `private/kyc/${filename}`;
        await conn.execute(
          'INSERT INTO kyc_documents (kyc_submission_id, document_type, file_path) VALUES (?, ?, ?)',
          [submissionId, item.type, dbPath]
        );
      }

      await conn.commit();
      logger.info(`KYC submitted successfully by user ${userId}. Submission ID: ${submissionId}`);

      return {
        success: true,
        message: 'KYC submitted successfully and is pending review.',
        submissionId,
      };
    } catch (error) {
      await conn.rollback();
      // Rollback saved files on file system
      for (const filePath of savedFiles) {
        try {
          await fs.unlink(filePath);
        } catch (unlinkErr) {
          logger.error(`Failed to delete temporary KYC file on rollback: ${filePath}. Error: ${unlinkErr.message}`);
        }
      }
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Fetch current KYC verification status.
   */
  async getKycStatus(userId) {
    const query = `
      SELECT status, submitted_at, reviewed_at, review_notes
      FROM kyc_submissions
      WHERE user_id = ?
      ORDER BY submitted_at DESC
      LIMIT 1
    `;
    const rows = await db.query(query, [userId]);
    return rows.length > 0 ? rows[0] : { status: 'NOT_SUBMITTED' };
  }

  /**
   * Fetch full submission details (restricted access).
   */
  async getKycSubmission(userId) {
    const query = `
      SELECT id, status, full_name, dob, id_type, id_number, address, phone_number, submitted_at, reviewed_at, review_notes
      FROM kyc_submissions
      WHERE user_id = ?
      ORDER BY submitted_at DESC
      LIMIT 1
    `;
    const rows = await db.query(query, [userId]);
    if (rows.length === 0) {
      throw new NotFoundError('No KYC submission found.');
    }

    const submission = rows[0];

    // Fetch document list
    const docs = await db.query(
      'SELECT id, document_type FROM kyc_documents WHERE kyc_submission_id = ?',
      [submission.id]
    );

    submission.documents = docs;
    return submission;
  }
}

module.exports = new KycService();
