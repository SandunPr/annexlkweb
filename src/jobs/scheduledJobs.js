const db = require('../config/db');
const refreshTokenRepository = require('../repositories/refreshTokenRepository');
const fs = require('fs/promises');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Clean up files in a directory that are older than a specific date.
 */
async function cleanDirectory(dirPath, maxAgeMs) {
  try {
    const resolvedPath = path.resolve(dirPath);
    // Ensure dir exists
    await fs.mkdir(resolvedPath, { recursive: true });
    
    const files = await fs.readdir(resolvedPath);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(resolvedPath, file);
      const stats = await fs.stat(filePath);
      const fileAge = now - stats.mtimeMs;

      if (fileAge > maxAgeMs) {
        if (stats.isDirectory()) {
          await fs.rm(filePath, { recursive: true, force: true });
        } else {
          await fs.unlink(filePath);
        }
        logger.debug(`Cleaned up temp upload file: ${file}`);
      }
    }
  } catch (err) {
    logger.error(`Error cleaning directory ${dirPath}: ${err.message}`);
  }
}

/**
 * Main jobs execution coordinator.
 */
async function runScheduledJobs() {
  logger.info('Scheduled jobs: Starting operations...');

  try {
    // 1. Purge expired and revoked refresh tokens
    logger.info('Scheduled jobs: Purging expired refresh sessions...');
    await refreshTokenRepository.deleteExpiredTokens();

    // 2. Clean up temporary upload storage (files older than 24 hours)
    logger.info('Scheduled jobs: Cleaning temporary upload cache...');
    const maxTempAge = 24 * 60 * 60 * 1000; // 24 hours
    const tempStorage = process.env.TEMP_STORAGE_PATH || './storage/temporary';
    await cleanDirectory(tempStorage, maxTempAge);

    // 3. Mark listings that have not been confirmed in 30 days as EXPIRED
    logger.info('Scheduled jobs: Checking stale property listings...');
    const expiryDays = parseInt(process.env.LISTING_EXPIRY_DAYS || '30', 10);
    
    // Find properties that are about to be marked expired
    const expiredQuery = `
      SELECT id, owner_id, title 
      FROM properties 
      WHERE status = 'ACTIVE' AND last_confirmed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    const expiringProperties = await db.query(expiredQuery, [expiryDays]);

    if (expiringProperties.length > 0) {
      logger.info(`Scheduled jobs: Expiring ${expiringProperties.length} listings due to inactivity...`);
      
      // Update statuses to EXPIRED
      const updateQuery = `
        UPDATE properties 
        SET status = 'EXPIRED' 
        WHERE status = 'ACTIVE' AND last_confirmed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      `;
      await db.query(updateQuery, [expiryDays]);

      // Create owner notifications and log entries
      for (const p of expiringProperties) {
        await db.query(
          `INSERT INTO notifications (user_id, title, message) 
           VALUES (?, 'Listing Expired', ?)`,
          [p.owner_id, `Your property listing "${p.title}" has been marked EXPIRED due to inactivity. Please confirm availability to reactivate.`]
        );
        logger.info(`Listing ID ${p.id} automatically marked EXPIRED.`);
      }
    }

    // 4. Send reminders to owners whose listings will expire in 3 days (at day 27 of inactivity)
    const reminderQuery = `
      SELECT id, owner_id, title
      FROM properties
      WHERE status = 'ACTIVE' 
        AND last_confirmed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND last_confirmed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    // Find those active between 27 and 28 days of no confirmation
    const reminderProperties = await db.query(reminderQuery, [expiryDays - 3, expiryDays - 2]);

    for (const p of reminderProperties) {
      // Check if we already sent a reminder today (to prevent duplicate spam)
      const existsRows = await db.query(
        `SELECT id FROM notifications 
         WHERE user_id = ? AND title = 'Listing Expiry Warning' AND created_at >= DATE(NOW()) LIMIT 1`,
        [p.owner_id]
      );

      if (existsRows.length === 0) {
        await db.query(
          `INSERT INTO notifications (user_id, title, message) 
           VALUES (?, 'Listing Expiry Warning', ?)`,
          [p.owner_id, `Your listing "${p.title}" will expire in 3 days. Please click Confirm Availability on your dashboard to keep it active.`]
        );
        logger.info(`Sent expiry warning notification to Owner ID ${p.owner_id} for Listing ID ${p.id}`);
      }
    }

    logger.info('Scheduled jobs completed successfully.');
  } catch (error) {
    logger.error(`Scheduled jobs failed: ${error.message}`);
  }
}

// Support running directly from CLI
if (require.main === module) {
  (async () => {
    await runScheduledJobs();
    // End pool to allow process exit
    const { pool } = require('../config/db');
    await pool.end();
    process.exit(0);
  })();
}

module.exports = {
  runScheduledJobs,
};
