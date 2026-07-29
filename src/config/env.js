const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

function validateEnv() {
  const missing = [];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(`CRITICAL CONFIGURATION ERROR: Missing required environment variables: ${missing.join(', ')}`);
  }

  // Ensure directories configuration exist
  process.env.LISTING_STORAGE_PATH = process.env.LISTING_STORAGE_PATH || './storage/public/listings';
  process.env.KYC_STORAGE_PATH = process.env.KYC_STORAGE_PATH || './storage/private/kyc';
  process.env.TEMP_STORAGE_PATH = process.env.TEMP_STORAGE_PATH || './storage/temporary';
}

module.exports = {
  validateEnv,
};
