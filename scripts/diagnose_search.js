const dotenv = require('dotenv');
dotenv.config();

const db = require('../src/config/db');

async function diagnose() {
  console.log('--- STARTING SEARCH DIAGNOSTIC SYSTEM ---');
  try {
    // 1. Verify property ID 1 raw status
    const properties = await db.query('SELECT id, title, owner_id, status FROM properties WHERE id = 1');
    console.log('\n1. Raw Property in DB:', properties);
    if (properties.length === 0) {
      console.log('ERROR: Listing with ID 1 does not exist in properties table!');
      return;
    }

    const prop = properties[0];

    // 2. Check property locations join
    const locations = await db.query('SELECT * FROM property_locations WHERE property_id = ?', [prop.id]);
    console.log('\n2. Location Entry in DB:', locations);
    if (locations.length === 0) {
      console.log('ERROR: No matching entry in property_locations table! This inner join will fail.');
    }

    // 3. Check city join
    if (locations.length > 0) {
      const cityId = locations[0].city_id;
      const cities = await db.query('SELECT * FROM cities WHERE id = ?', [cityId]);
      console.log('\n3. City Entry in DB:', cities);
      if (cities.length === 0) {
        console.log(`ERROR: City with ID ${cityId} does not exist in cities table! This inner join will fail.`);
      } else {
        const districtId = cities[0].district_id;
        const districts = await db.query('SELECT * FROM districts WHERE id = ?', [districtId]);
        console.log('\n4. District Entry in DB:', districts);
        if (districts.length === 0) {
          console.log(`ERROR: District with ID ${districtId} does not exist in districts table! This inner join will fail.`);
        }
      }
    }

    // 4. Check owner user join
    const users = await db.query('SELECT id, email, kyc_status, is_suspended FROM users WHERE id = ?', [prop.owner_id]);
    console.log('\n5. Owner User Entry in DB:', users);
    if (users.length === 0) {
      console.log(`ERROR: Owner User with ID ${prop.owner_id} does not exist in users table! This inner join will fail.`);
    }

    // 5. Test Full Query with LEFT JOINs to see what is NULL
    const diagnosticQuery = `
      SELECT p.id AS prop_id, p.status AS prop_status,
             pl.property_id AS loc_prop_id, pl.city_id AS loc_city_id,
             c.id AS city_table_id, c.district_id AS city_district_id,
             d.id AS district_table_id,
             u.id AS user_table_id
      FROM properties p
      LEFT JOIN property_locations pl ON p.id = pl.property_id
      LEFT JOIN cities c ON pl.city_id = c.id
      LEFT JOIN districts d ON c.district_id = d.id
      LEFT JOIN users u ON p.owner_id = u.id
      WHERE p.id = 1
    `;
    const fullResult = await db.query(diagnosticQuery);
    console.log('\n6. Full Diagnostic LEFT JOIN Output (any NULL value indicates a join failure):');
    console.log(JSON.stringify(fullResult, null, 2));

  } catch (error) {
    console.error('Diagnostic failed with error:', error);
  } finally {
    const { pool } = db;
    await pool.end();
  }
}

diagnose();
