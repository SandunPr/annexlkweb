const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_NAME = process.env.DB_NAME || 'annexlk';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

async function runMigrations() {
  console.log(`Starting database migrations... connecting as user "${DB_USER}" to ${DB_HOST}:${DB_PORT}`);

  let connection;
  try {
    // 1. Connect without database to ensure database exists
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });

    console.log(`Ensuring database "${DB_NAME}" exists...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.end();

    // 2. Reconnect to the specific database
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      multipleStatements: true, // Enable multiple statements for running full sql migration files
    });

    // 3. Create migrations table
    console.log('Ensuring migrations track table exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // 4. Read migration directory
    const migrationsDir = path.join(__dirname, '../../migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('Migrations directory does not exist, creating it...');
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Run in alphabetical/numeric order: e.g., 001_init.sql

    // 5. Get executed migrations
    const [rows] = await connection.query('SELECT name FROM migrations');
    const executedMigrations = new Set(rows.map(row => row.name));

    // 6. Run pending migrations
    for (const file of migrationFiles) {
      if (executedMigrations.has(file)) {
        console.log(`Migration "${file}" already executed. Skipping.`);
        continue;
      }

      console.log(`Running migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Start transaction for each file
      await connection.query('START TRANSACTION');
      try {
        if (sql.trim().length > 0) {
          await connection.query(sql);
        }
        await connection.query('INSERT INTO migrations (name) VALUES (?)', [file]);
        await connection.query('COMMIT');
        console.log(`Migration "${file}" executed successfully.`);
      } catch (err) {
        await connection.query('ROLLBACK');
        console.error(`ERROR running migration "${file}":`, err.message);
        process.exit(1);
      }
    }

    console.log('All migrations completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration runner failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (err) {
        // Ignore closing errors
      }
    }
  }
}

// Run runner if called directly
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
