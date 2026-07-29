const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { validateEnv } = require('./config/env');
const logger = require('./utils/logger');
const { runScheduledJobs } = require('./jobs/scheduledJobs');

// Validate critical environment configurations early
try {
  validateEnv();
} catch (error) {
  logger.error('CRITICAL: Server failed to start due to env configuration error.');
  console.error(error.message);
  process.exit(1);
}

const app = require('./app');
const PORT = process.env.PORT || 5000;

// Start Server
const server = app.listen(PORT, () => {
  logger.info(`AnnexLK REST API successfully started on port ${PORT} in ${process.env.NODE_ENV} mode.`);
  
  // Run scheduled jobs on startup
  runScheduledJobs();
});

// Run scheduled jobs every 12 hours
const jobInterval = setInterval(runScheduledJobs, 12 * 60 * 60 * 1000);

// Handle graceful shutdowns
const gracefulShutdown = async () => {
  logger.info('Shutting down API server gracefully...');
  clearInterval(jobInterval);
  
  server.close(async () => {
    logger.info('HTTP server closed.');
    
    // Close database connection pool
    try {
      const { pool } = require('./config/db');
      await pool.end();
      logger.info('Database pool closed.');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing database pool during shutdown: %s', err.message);
      process.exit(1);
    }
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Force shutting down after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Log unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at: %O, reason: %O', promise, reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown: %O', error);
  // Give logger time to write logs before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});
