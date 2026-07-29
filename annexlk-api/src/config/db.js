const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

// Create the connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_NAME || 'annexlk',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  waitForConnections: true,
  queueLimit: 0,
  // Automatically cast decimal columns to float/number if they fit, or keep as string to prevent precision loss.
  // We'll keep decimals as strings or custom parse, but mysql2 allows configuring this.
});

// Test connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('Database pool connected successfully to %s:%s', process.env.DB_HOST, process.env.DB_PORT);
    connection.release();
  } catch (error) {
    logger.error('CRITICAL: Failed to connect to the database: %s', error.message);
  }
})();

module.exports = {
  pool,
  // Helper for quick query execution
  query: async (sql, params) => {
    const [results] = await pool.execute(sql, params);
    return results;
  },
  // Helper for transactions
  getTransaction: async () => {
    return await pool.getConnection();
  },
};
