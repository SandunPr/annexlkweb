const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_NAME = process.env.DB_NAME || 'annexlk';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

const saltRounds = 10;

async function seed() {
  console.log('Starting database seeding...');
  let connection;
  try {
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    });

    console.log('Connected to database.');

    // 1. Seed Roles
    console.log('Seeding roles...');
    const roles = [
      { name: 'ADMINISTRATOR', display_name: 'System Administrator', description: 'Full system control' },
      { name: 'MODERATOR', display_name: 'Moderator', description: 'Moderate listings and reports' },
      { name: 'PROPERTY_OWNER', display_name: 'Property Owner', description: 'Publish property listings' },
      { name: 'RENTER', display_name: 'Renter', description: 'Browse and contact owners' },
    ];

    for (const role of roles) {
      await connection.query(
        'INSERT INTO roles (name, display_name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)',
        [role.name, role.display_name, role.description]
      );
    }

    // Get role IDs
    const [roleRows] = await connection.query('SELECT id, name FROM roles');
    const roleIdMap = {};
    roleRows.forEach(r => { roleIdMap[r.name] = r.id; });

    // 2. Seed Permissions
    console.log('Seeding permissions...');
    const permissions = [
      { name: 'bypass_kyc', display_name: 'Bypass KYC requirements' },
      { name: 'approve_kyc', display_name: 'Approve KYC submissions' },
      { name: 'moderate_listings', display_name: 'Moderate listings' },
      { name: 'view_audit_logs', display_name: 'View audit logs' },
      { name: 'manage_users', display_name: 'Suspend/unsuspend users' },
      { name: 'create_listings', display_name: 'Create property listings' },
      { name: 'reveal_contacts', display_name: 'Reveal owner contact information' },
    ];

    for (const perm of permissions) {
      await connection.query(
        'INSERT INTO permissions (name, display_name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)',
        [perm.name, perm.display_name, perm.description]
      );
    }

    // Get permission IDs
    const [permRows] = await connection.query('SELECT id, name FROM permissions');
    const permIdMap = {};
    permRows.forEach(p => { permIdMap[p.name] = p.id; });

    // Link role permissions
    console.log('Linking role permissions...');
    const rolePermissions = [
      // Admin permissions
      { role: 'ADMINISTRATOR', perm: 'bypass_kyc' },
      { role: 'ADMINISTRATOR', perm: 'approve_kyc' },
      { role: 'ADMINISTRATOR', perm: 'moderate_listings' },
      { role: 'ADMINISTRATOR', perm: 'view_audit_logs' },
      { role: 'ADMINISTRATOR', perm: 'manage_users' },
      { role: 'ADMINISTRATOR', perm: 'create_listings' },
      { role: 'ADMINISTRATOR', perm: 'reveal_contacts' },
      // Moderator permissions
      { role: 'MODERATOR', perm: 'moderate_listings' },
      // Property Owner permissions
      { role: 'PROPERTY_OWNER', perm: 'create_listings' },
      // Renter permissions
      { role: 'RENTER', perm: 'reveal_contacts' },
    ];

    for (const rp of rolePermissions) {
      await connection.query(
        'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [roleIdMap[rp.role], permIdMap[rp.perm]]
      );
    }

    // 3. Seed Districts and Cities
    console.log('Seeding districts & cities...');
    const districts = ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Galle', 'Matara', 'Jaffna', 'Kurunegala'];
    const districtIdMap = {};

    for (const dist of districts) {
      await connection.query('INSERT INTO districts (name) VALUES (?) ON DUPLICATE KEY UPDATE name=name', [dist]);
      const [[row]] = await connection.query('SELECT id FROM districts WHERE name = ?', [dist]);
      districtIdMap[dist] = row.id;
    }

    const cities = [
      { name: 'Colombo 03', district: 'Colombo', lat: 6.9148, lng: 79.8496 },
      { name: 'Colombo 07', district: 'Colombo', lat: 6.9064, lng: 79.8696 },
      { name: 'Moratuwa', district: 'Colombo', lat: 6.7730, lng: 79.8816 },
      { name: 'Kelaniya', district: 'Gampaha', lat: 6.9531, lng: 79.9142 },
      { name: 'Nugegoda', district: 'Colombo', lat: 6.8741, lng: 79.8974 },
      { name: 'Peradeniya', district: 'Kandy', lat: 7.2711, lng: 80.5925 },
      { name: 'Galle Fort', district: 'Galle', lat: 6.0264, lng: 80.2180 },
    ];

    for (const city of cities) {
      await connection.query(
        'INSERT INTO cities (name, district_id, latitude, longitude) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE latitude=VALUES(latitude), longitude=VALUES(longitude)',
        [city.name, districtIdMap[city.district], city.lat, city.lng]
      );
    }

    // 4. Seed Universities
    console.log('Seeding universities...');
    const universities = [
      { name: 'University of Moratuwa', acronym: 'UOM', lat: 6.7951, lng: 79.9008 },
      { name: 'University of Colombo', acronym: 'UOC', lat: 6.9001, lng: 79.8601 },
      { name: 'University of Kelaniya', acronym: 'UOK', lat: 6.9739, lng: 79.9157 },
      { name: 'University of Sri Jayewardenepura', acronym: 'USJP', lat: 6.8528, lng: 79.9036 },
      { name: 'University of Peradeniya', acronym: 'UOP', lat: 7.2549, lng: 80.5974 },
    ];

    for (const uni of universities) {
      await connection.query(
        'INSERT INTO universities (name, acronym, latitude, longitude) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE latitude=VALUES(latitude), longitude=VALUES(longitude)',
        [uni.name, uni.acronym, uni.lat, uni.lng]
      );
    }

    // 5. Seed Facilities
    console.log('Seeding facilities...');
    const facilities = [
      { name: 'attached_bathroom', display_name: 'Attached Bathroom' },
      { name: 'shared_bathroom', display_name: 'Shared Bathroom' },
      { name: 'kitchen', display_name: 'Kitchen Kitchenette' },
      { name: 'cooking_allowed', display_name: 'Cooking Allowed' },
      { name: 'wifi', display_name: 'Wi-Fi / Internet' },
      { name: 'furniture', display_name: 'Furniture Included' },
      { name: 'bed', display_name: 'Bed Included' },
      { name: 'study_table', display_name: 'Study Table' },
      { name: 'fan', display_name: 'Ceiling/Table Fan' },
      { name: 'air_conditioning', display_name: 'Air Conditioning (A/C)' },
      { name: 'parking', display_name: 'Parking Space' },
      { name: 'laundry', display_name: 'Washing Machine / Laundry' },
      { name: 'water_included', display_name: 'Water Bills Included' },
      { name: 'electricity_included', display_name: 'Electricity Bills Included' },
      { name: 'separate_entrance', display_name: 'Separate Entrance' },
      { name: 'cctv', display_name: 'CCTV Security' },
      { name: 'security_gate', display_name: 'Secure Gate' },
      { name: 'pets_allowed', display_name: 'Pets Allowed' },
      { name: 'smoking_allowed', display_name: 'Smoking Allowed' },
      { name: 'public_transport', display_name: 'Near Public Transport' },
    ];

    for (const fac of facilities) {
      await connection.query(
        'INSERT INTO facilities (name, display_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)',
        [fac.name, fac.display_name]
      );
    }

    // 6. Seed Users
    console.log('Seeding user profiles...');
    const seedUsers = [
      {
        email: 'admin@annexlk.com',
        password: 'AdminPass123!',
        role: 'ADMINISTRATOR',
        kyc: 'IDENTITY_VERIFIED',
        fullName: 'System Administrator',
        phone: '+94771234567',
        address: 'AnnexLK Headquarters, Colombo 03',
      },
      {
        email: 'moderator@annexlk.com',
        password: 'ModPass123!',
        role: 'MODERATOR',
        kyc: 'IDENTITY_VERIFIED',
        fullName: 'Content Moderator',
        phone: '+94777654321',
        address: 'AnnexLK Office, Colombo 07',
      },
      {
        email: 'owner@annexlk.com',
        password: 'OwnerPass123!',
        role: 'PROPERTY_OWNER',
        kyc: 'IDENTITY_VERIFIED', // Already verified owner
        fullName: 'Sunil Perera',
        phone: '+94711112222',
        address: 'No. 45, Galle Road, Moratuwa',
      },
      {
        email: 'pending@annexlk.com',
        password: 'PendingPass123!',
        role: 'PROPERTY_OWNER',
        kyc: 'REGISTERED', // Needs KYC verification
        fullName: 'Kusal Mendis',
        phone: '+94722223333',
        address: 'No. 12, Kandy Road, Kelaniya',
      },
      {
        email: 'renter@annexlk.com',
        password: 'RenterPass123!',
        role: 'RENTER',
        kyc: 'REGISTERED',
        fullName: 'Saman Silva',
        phone: '+94755556666',
        address: 'Nugegoda, Sri Lanka',
      },
    ];

    for (const u of seedUsers) {
      // Check if user exists
      const [existing] = await connection.query('SELECT id FROM users WHERE email = ?', [u.email]);
      let userId;

      if (existing.length === 0) {
        const hash = await bcrypt.hash(u.password, saltRounds);
        const [userResult] = await connection.query(
          'INSERT INTO users (email, password_hash, kyc_status) VALUES (?, ?, ?)',
          [u.email, hash, u.kyc]
        );
        userId = userResult.insertId;

        // User role
        await connection.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleIdMap[u.role]]);

        // Profile
        await connection.query(
          'INSERT INTO user_profiles (user_id, full_name, phone_number, address) VALUES (?, ?, ?, ?)',
          [userId, u.fullName, u.phone, u.address]
        );

        console.log(`Created user: ${u.email} with role ${u.role}`);
      } else {
        console.log(`User ${u.email} already exists. Skipping.`);
      }
    }

    console.log('Database seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run seeder if called directly
if (require.main === module) {
  seed();
}

module.exports = seed;
