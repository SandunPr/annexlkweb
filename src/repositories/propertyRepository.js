const db = require('../config/db');

class PropertyRepository {
  /**
   * Find a property by ID (including location, images, facilities, and owner profile).
   */
  async findById(id) {
    const query = `
      SELECT p.*, 
             pl.exact_latitude, pl.exact_longitude, pl.approx_latitude, pl.approx_longitude, pl.address_text, pl.city_id, pl.google_place_id,
             c.name AS city_name, d.name AS district_name,
             u.email AS owner_email, up.full_name AS owner_name, up.phone_number AS owner_phone
      FROM properties p
      LEFT JOIN property_locations pl ON p.id = pl.property_id
      LEFT JOIN cities c ON pl.city_id = c.id
      LEFT JOIN districts d ON c.district_id = d.id
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE p.id = ? AND p.status != 'DELETED'
    `;
    const rows = await db.query(query, [id]);
    if (rows.length === 0) return null;

    const property = rows[0];
    property.images = await this.getImages(id);
    property.facilities = await this.getFacilities(id);

    return property;
  }

  /**
   * Find property by slug.
   */
  async findBySlug(slug) {
    const query = `
      SELECT p.*, 
             pl.exact_latitude, pl.exact_longitude, pl.approx_latitude, pl.approx_longitude, pl.address_text, pl.city_id, pl.google_place_id,
             c.name AS city_name, d.name AS district_name,
             u.email AS owner_email, up.full_name AS owner_name
      FROM properties p
      LEFT JOIN property_locations pl ON p.id = pl.property_id
      LEFT JOIN cities c ON pl.city_id = c.id
      LEFT JOIN districts d ON c.district_id = d.id
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE p.slug = ? AND p.status != 'DELETED'
    `;
    const rows = await db.query(query, [slug]);
    if (rows.length === 0) return null;

    const property = rows[0];
    property.images = await this.getImages(property.id);
    property.facilities = await this.getFacilities(property.id);

    return property;
  }

  /**
   * Helper to retrieve images.
   */
  async getImages(propertyId) {
    return await db.query(
      'SELECT id, image_position, thumbnail_path, medium_path, full_path FROM property_images WHERE property_id = ? ORDER BY image_position ASC',
      [propertyId]
    );
  }

  /**
   * Helper to retrieve facilities.
   */
  async getFacilities(propertyId) {
    const query = `
      SELECT f.id, f.name, f.display_name
      FROM property_facilities pf
      JOIN facilities f ON pf.facility_id = f.id
      WHERE pf.property_id = ?
    `;
    return await db.query(query, [propertyId]);
  }

  /**
   * Fetch promoted/featured listings by an array of IDs (for advertisement carousel).
   * Only returns ACTIVE listings so expired promotions don't show stale cards.
   */
  async findFeaturedByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const query = `
      SELECT p.id, p.title, p.slug, p.property_type, p.rent, p.bills_included,
             p.max_occupants, p.furnished_status, p.status,
             pl.approx_latitude, pl.approx_longitude, pl.address_text,
             c.name AS city_name, d.name AS district_name,
             pi.thumbnail_path AS main_thumbnail,
             up.full_name AS owner_name
      FROM properties p
      LEFT JOIN property_locations pl ON p.id = pl.property_id
      LEFT JOIN cities c ON pl.city_id = c.id
      LEFT JOIN districts d ON c.district_id = d.id
      LEFT JOIN property_images pi ON p.id = pi.property_id AND pi.image_position = 1
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE p.id IN (${placeholders}) AND p.status = 'ACTIVE'
      ORDER BY FIELD(p.id, ${placeholders})
    `;
    return await db.query(query, [...ids, ...ids]);
  }

  /**
   * Create a property listing.
   */

  async create(propertyData, locationData, facilityIds) {
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      // 1. Insert into properties
      const [propResult] = await conn.execute(
        `INSERT INTO properties 
          (owner_id, title, slug, description, property_type, rent, deposit, advance_months, bills_included, available_date, min_duration_months, furnished_status, occupancy_type, max_occupants, current_occupants, status, last_confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', NOW())`,
        [
          propertyData.ownerId,
          propertyData.title,
          propertyData.slug,
          propertyData.description,
          propertyData.propertyType,
          propertyData.rent,
          propertyData.deposit || 0.0,
          propertyData.advanceMonths || 0,
          propertyData.billsIncluded ? 1 : 0,
          propertyData.availableDate,
          propertyData.minDurationMonths || 1,
          propertyData.furnishedStatus || 'UNFURNISHED',
          propertyData.occupancyType || 'INDIVIDUAL',
          propertyData.maxOccupants || 1,
          propertyData.currentOccupants || 0,
        ]
      );
      const propertyId = propResult.insertId;

      // 2. Insert into locations
      await conn.execute(
        `INSERT INTO property_locations 
          (property_id, exact_latitude, exact_longitude, approx_latitude, approx_longitude, address_text, city_id, google_place_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          propertyId,
          locationData.exactLatitude,
          locationData.exactLongitude,
          locationData.approxLatitude,
          locationData.approxLongitude,
          locationData.addressText,
          locationData.cityId,
          locationData.googlePlaceId || null,
        ]
      );

      // 3. Link facilities
      if (facilityIds && facilityIds.length > 0) {
        for (const fId of facilityIds) {
          await conn.execute(
            'INSERT INTO property_facilities (property_id, facility_id) VALUES (?, ?)',
            [propertyId, fId]
          );
        }
      }

      // Log availability
      await conn.execute(
        'INSERT INTO property_availability_logs (property_id, action, performed_by) VALUES (?, "created_draft", ?)',
        [propertyId, propertyData.ownerId]
      );

      await conn.commit();
      return propertyId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Save property image paths.
   */
  async saveImages(propertyId, imagesList) {
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      // Clear existing positions just in case (to support overwrites)
      await conn.execute('DELETE FROM property_images WHERE property_id = ?', [propertyId]);

      for (const img of imagesList) {
        await conn.execute(
          `INSERT INTO property_images 
            (property_id, image_position, thumbnail_path, medium_path, full_path)
           VALUES (?, ?, ?, ?, ?)`,
          [propertyId, img.position, img.paths.thumb, img.paths.medium, img.paths.full]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Update property details.
   */
  async update(propertyId, propertyData, locationData, facilityIds) {
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      // 1. Update properties
      const propFields = [];
      const propParams = [];
      const updatablePropKeys = [
        'title', 'slug', 'description', 'propertyType', 'rent', 'deposit', 'advanceMonths',
        'billsIncluded', 'availableDate', 'minDurationMonths', 'furnishedStatus',
        'occupancyType', 'maxOccupants', 'currentOccupants', 'status'
      ];

      // Map camelCase fields to snake_case db columns
      const columnMapping = {
        propertyType: 'property_type',
        advanceMonths: 'advance_months',
        billsIncluded: 'bills_included',
        availableDate: 'available_date',
        minDurationMonths: 'min_duration_months',
        furnishedStatus: 'furnished_status',
        occupancyType: 'occupancy_type',
        maxOccupants: 'max_occupants',
        currentOccupants: 'current_occupants',
      };

      for (const key of updatablePropKeys) {
        if (propertyData[key] !== undefined) {
          const colName = columnMapping[key] || key;
          propFields.push(`${colName} = ?`);
          // Format boolean for SQL
          if (typeof propertyData[key] === 'boolean') {
            propParams.push(propertyData[key] ? 1 : 0);
          } else {
            propParams.push(propertyData[key]);
          }
        }
      }

      if (propFields.length > 0) {
        propParams.push(propertyId);
        await conn.execute(`UPDATE properties SET ${propFields.join(', ')} WHERE id = ?`, propParams);
      }

      // 2. Update location
      if (locationData) {
        const locFields = [];
        const locParams = [];
        const locationMapping = {
          exactLatitude: 'exact_latitude',
          exactLongitude: 'exact_longitude',
          approxLatitude: 'approx_latitude',
          approxLongitude: 'approx_longitude',
          addressText: 'address_text',
          cityId: 'city_id',
          googlePlaceId: 'google_place_id',
        };

        for (const [key, colName] of Object.entries(locationMapping)) {
          if (locationData[key] !== undefined) {
            locFields.push(`${colName} = ?`);
            locParams.push(locationData[key]);
          }
        }

        if (locFields.length > 0) {
          locParams.push(propertyId);
          await conn.execute(`UPDATE property_locations SET ${locFields.join(', ')} WHERE property_id = ?`, locParams);
        }
      }

      // 3. Re-sync facilities
      if (facilityIds) {
        await conn.execute('DELETE FROM property_facilities WHERE property_id = ?', [propertyId]);
        for (const fId of facilityIds) {
          await conn.execute(
            'INSERT INTO property_facilities (property_id, facility_id) VALUES (?, ?)',
            [propertyId, fId]
          );
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Log action to availability audit log.
   */
  async updateStatus(propertyId, status, performedBy) {
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      await conn.execute('UPDATE properties SET status = ? WHERE id = ?', [status, propertyId]);
      await conn.execute(
        'INSERT INTO property_availability_logs (property_id, action, performed_by) VALUES (?, ?, ?)',
        [propertyId, `status_changed_${status.toLowerCase()}`, performedBy]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Confirm availability (resets confirmation period).
   */
  async confirmAvailability(propertyId, performedBy) {
    const conn = await db.getTransaction();
    await conn.beginTransaction();

    try {
      await conn.execute(
        'UPDATE properties SET last_confirmed_at = NOW(), status = "ACTIVE" WHERE id = ?',
        [propertyId]
      );
      await conn.execute(
        'INSERT INTO property_availability_logs (property_id, action, performed_by) VALUES (?, "confirmed_availability", ?)',
        [propertyId, performedBy]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Get listings created by a specific owner.
   */
  async getOwnerListings(ownerId) {
    const query = `
      SELECT p.id, p.title, p.slug, p.property_type, p.description,
             p.rent, p.deposit, p.advance_months, p.bills_included,
             p.available_date, p.min_duration_months, p.furnished_status,
             p.occupancy_type, p.max_occupants, p.current_occupants,
             p.status, p.last_confirmed_at, p.views_count, p.favourites_count, p.contact_clicks_count,
             pl.city_id, pl.address_text, pl.exact_latitude AS latitude, pl.exact_longitude AS longitude,
             pl.approx_latitude, pl.approx_longitude, pl.google_place_id,
             c.name AS city_name, d.name AS district_name,
             pi.thumbnail_path AS main_thumbnail,
             GROUP_CONCAT(DISTINCT pf.facility_id) AS facility_ids
      FROM properties p
      LEFT JOIN property_locations pl ON p.id = pl.property_id
      LEFT JOIN cities c ON pl.city_id = c.id
      LEFT JOIN districts d ON c.district_id = d.id
      LEFT JOIN property_images pi ON p.id = pi.property_id AND pi.image_position = 1
      LEFT JOIN property_facilities pf ON p.id = pf.property_id
      WHERE p.owner_id = ? AND p.status != 'DELETED'
      GROUP BY p.id, pl.city_id, pl.address_text, pl.exact_latitude, pl.exact_longitude,
               pl.approx_latitude, pl.approx_longitude, pl.google_place_id,
               c.name, d.name, pi.thumbnail_path
      ORDER BY p.created_at DESC
    `;
    return await db.query(query, [ownerId]);
  }


  /**
   * Search for property listings dynamically based on filters, coordinates, and ranking.
   */
  async search(filters, { limit = 20, offset = 0 }) {
    const selectFields = [
      'p.id', 'p.title', 'p.slug', 'p.property_type', 'p.rent', 'p.deposit', 'p.bills_included',
      'p.available_date', 'p.furnished_status', 'p.occupancy_type', 'p.max_occupants', 'p.current_occupants',
      'p.status', 'p.views_count', 'p.favourites_count', 'p.last_confirmed_at', 'p.created_at',
      'pl.approx_latitude', 'pl.approx_longitude', 'pl.address_text', 'c.name AS city_name', 'd.name AS district_name',
      'pi.thumbnail_path AS main_thumbnail', 'u.kyc_status AS owner_kyc_status'
    ];

    const joins = [
      'JOIN property_locations pl ON p.id = pl.property_id',
      'JOIN cities c ON pl.city_id = c.id',
      'JOIN districts d ON c.district_id = d.id',
      'JOIN users u ON p.owner_id = u.id',
      'LEFT JOIN property_images pi ON p.id = pi.property_id AND pi.image_position = 1'
    ];

    const whereClauses = ["p.status = 'ACTIVE'"];
    const queryParams = [];

    // 1. Text keyword search using Full-Text index
    if (filters.keyword) {
      whereClauses.push('MATCH(p.title, p.description) AGAINST(? IN BOOLEAN MODE)');
      queryParams.push(filters.keyword);
    }

    // 2. Location filters
    if (filters.cityId) {
      whereClauses.push('pl.city_id = ?');
      queryParams.push(filters.cityId);
    }
    if (filters.districtId) {
      whereClauses.push('c.district_id = ?');
      queryParams.push(filters.districtId);
    }

    // 3. Proximity / Coordinates distance filter
    let distanceFormula = null;
    if (filters.latitude && filters.longitude) {
      distanceFormula = `
        (6371 * acos(
          cos(radians(?)) * cos(radians(pl.approx_latitude)) * 
          cos(radians(pl.approx_longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(pl.approx_latitude))
        ))
      `;
      // Inject parameters for the formula (3 occurrences: lat, lng, lat)
      queryParams.push(filters.latitude, filters.longitude, filters.latitude);
      
      selectFields.push(`${distanceFormula} AS distance`);
      
      const maxDistance = parseFloat(filters.distance || 5.0); // Default 5 km
      whereClauses.push(`${distanceFormula} <= ?`);
      // Re-inject for formula in WHERE clause and the threshold value
      queryParams.push(filters.latitude, filters.longitude, filters.latitude, maxDistance);
    }

    // 4. University Proximity filter
    if (filters.universityId) {
      // Find university coordinates
      const uniRows = await db.query('SELECT latitude, longitude FROM universities WHERE id = ?', [filters.universityId]);
      if (uniRows.length > 0) {
        const uni = uniRows[0];
        const uniDistanceFormula = `
          (6371 * acos(
            cos(radians(?)) * cos(radians(pl.approx_latitude)) * 
            cos(radians(pl.approx_longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(pl.approx_latitude))
          ))
        `;
        whereClauses.push(`${uniDistanceFormula} <= ?`);
        queryParams.push(uni.latitude, uni.longitude, uni.latitude, parseFloat(filters.universityDistance || 5.0));
      }
    }

    // 5. Basic criteria filters
    if (filters.propertyType) {
      whereClauses.push('p.property_type = ?');
      queryParams.push(filters.propertyType);
    }
    if (filters.minRent) {
      whereClauses.push('p.rent >= ?');
      queryParams.push(filters.minRent);
    }
    if (filters.maxRent) {
      whereClauses.push('p.rent <= ?');
      queryParams.push(filters.maxRent);
    }
    if (filters.furnishedStatus) {
      whereClauses.push('p.furnished_status = ?');
      queryParams.push(filters.furnishedStatus);
    }
    if (filters.billsIncluded !== undefined && filters.billsIncluded !== null) {
      whereClauses.push('p.bills_included = ?');
      queryParams.push(filters.billsIncluded ? 1 : 0);
    }
    if (filters.maxOccupants) {
      whereClauses.push('p.max_occupants >= ?');
      queryParams.push(filters.maxOccupants);
    }
    if (filters.currentOccupants !== undefined && filters.currentOccupants !== null) {
      whereClauses.push('p.current_occupants <= ?');
      queryParams.push(filters.currentOccupants);
    }
    if (filters.verifiedOwner) {
      whereClauses.push('u.kyc_status IN ("IDENTITY_VERIFIED", "PROPERTY_VERIFIED", "TRUSTED_OWNER")');
    }

    // 6. Multiple facilities match (must contain ALL selected facility IDs)
    if (filters.facilityIds && filters.facilityIds.length > 0) {
      whereClauses.push(`
        p.id IN (
          SELECT property_id 
          FROM property_facilities 
          WHERE facility_id IN (${filters.facilityIds.map(() => '?').join(',')}) 
          GROUP BY property_id 
          HAVING COUNT(DISTINCT facility_id) = ?
        )
      `);
      queryParams.push(...filters.facilityIds, filters.facilityIds.length);
    }

    // Assemble WHERE clause
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Calculate Best Match Ranking score
    let orderBySql = 'ORDER BY p.created_at DESC'; // default to newest
    if (filters.sortBy === 'best_match') {
      const scoreParts = [];
      const scoreParams = [];

      // Keyword match score (up to 10 points)
      if (filters.keyword) {
        scoreParts.push('MATCH(p.title, p.description) AGAINST(? IN NATURAL LANGUAGE MODE) * 10');
        scoreParams.push(filters.keyword);
      }

      // Freshness score (up to 10 points)
      scoreParts.push(`
        CASE 
          WHEN p.created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY) THEN 10 
          WHEN p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 5
          ELSE 0 
        END
      `);

      // Verified owner trust score (+5 points)
      scoreParts.push('CASE WHEN u.kyc_status IN ("IDENTITY_VERIFIED", "PROPERTY_VERIFIED", "TRUSTED_OWNER") THEN 5 ELSE 0 END');

      // Closeness score (up to 10 points) if latitude/longitude provided
      if (filters.latitude && filters.longitude) {
        scoreParts.push(`(10 / (1 + ${distanceFormula}))`);
        scoreParams.push(filters.latitude, filters.longitude, filters.latitude);
      }

      // Stale confirmation deduction (-10 points)
      scoreParts.push('CASE WHEN p.last_confirmed_at < DATE_SUB(NOW(), INTERVAL 14 DAY) THEN -10 ELSE 0 END');

      const rankingScoreSql = `(${scoreParts.join(' + ')})`;
      selectFields.push(`${rankingScoreSql} AS ranking_score`);
      
      // Inject ranking params before the offset params in ordering
      orderBySql = `ORDER BY ranking_score DESC, p.created_at DESC`;
      
      // We prepend ranking parameters to the query
      queryParams.unshift(...scoreParams);
    } else if (filters.sortBy === 'newest') {
      orderBySql = 'ORDER BY p.created_at DESC';
    } else if (filters.sortBy === 'lowest_rent') {
      orderBySql = 'ORDER BY p.rent ASC';
    } else if (filters.sortBy === 'highest_rent') {
      orderBySql = 'ORDER BY p.rent DESC';
    } else if (filters.sortBy === 'closest' && distanceFormula) {
      orderBySql = 'ORDER BY distance ASC';
    }

    const selectSql = `SELECT ${selectFields.join(', ')}`;
    const fromSql = `FROM properties p ${joins.join(' ')}`;
    
    // Limits
    const limitParams = [limit, offset];
    const fullQuery = `${selectSql} ${fromSql} ${whereSql} ${orderBySql} LIMIT ? OFFSET ?`;
    const fullParams = [...queryParams, ...limitParams];

    const listings = await db.query(fullQuery, fullParams);
    return listings;
  }

  /**
   * Count total listings matching the search filter query.
   */
  async countSearch(filters) {
    const joins = [
      'JOIN property_locations pl ON p.id = pl.property_id',
      'JOIN cities c ON pl.city_id = c.id',
      'JOIN users u ON p.owner_id = u.id'
    ];

    const whereClauses = ["p.status = 'ACTIVE'"];
    const queryParams = [];

    if (filters.keyword) {
      whereClauses.push('MATCH(p.title, p.description) AGAINST(? IN BOOLEAN MODE)');
      queryParams.push(filters.keyword);
    }
    if (filters.cityId) {
      whereClauses.push('pl.city_id = ?');
      queryParams.push(filters.cityId);
    }
    if (filters.districtId) {
      whereClauses.push('c.district_id = ?');
      queryParams.push(filters.districtId);
    }
    if (filters.latitude && filters.longitude) {
      const distanceFormula = `
        (6371 * acos(
          cos(radians(?)) * cos(radians(pl.approx_latitude)) * 
          cos(radians(pl.approx_longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(pl.approx_latitude))
        ))
      `;
      const maxDistance = parseFloat(filters.distance || 5.0);
      whereClauses.push(`${distanceFormula} <= ?`);
      queryParams.push(filters.latitude, filters.longitude, filters.latitude, maxDistance);
    }
    if (filters.universityId) {
      const uniRows = await db.query('SELECT latitude, longitude FROM universities WHERE id = ?', [filters.universityId]);
      if (uniRows.length > 0) {
        const uni = uniRows[0];
        const uniDistanceFormula = `
          (6371 * acos(
            cos(radians(?)) * cos(radians(pl.approx_latitude)) * 
            cos(radians(pl.approx_longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(pl.approx_latitude))
          ))
        `;
        whereClauses.push(`${uniDistanceFormula} <= ?`);
        queryParams.push(uni.latitude, uni.longitude, uni.latitude, parseFloat(filters.universityDistance || 5.0));
      }
    }
    if (filters.propertyType) {
      whereClauses.push('p.property_type = ?');
      queryParams.push(filters.propertyType);
    }
    if (filters.minRent) {
      whereClauses.push('p.rent >= ?');
      queryParams.push(filters.minRent);
    }
    if (filters.maxRent) {
      whereClauses.push('p.rent <= ?');
      queryParams.push(filters.maxRent);
    }
    if (filters.furnishedStatus) {
      whereClauses.push('p.furnished_status = ?');
      queryParams.push(filters.furnishedStatus);
    }
    if (filters.billsIncluded !== undefined && filters.billsIncluded !== null) {
      whereClauses.push('p.bills_included = ?');
      queryParams.push(filters.billsIncluded ? 1 : 0);
    }
    if (filters.maxOccupants) {
      whereClauses.push('p.max_occupants >= ?');
      queryParams.push(filters.maxOccupants);
    }
    if (filters.currentOccupants !== undefined && filters.currentOccupants !== null) {
      whereClauses.push('p.current_occupants <= ?');
      queryParams.push(filters.currentOccupants);
    }
    if (filters.verifiedOwner) {
      whereClauses.push('u.kyc_status IN ("IDENTITY_VERIFIED", "PROPERTY_VERIFIED", "TRUSTED_OWNER")');
    }
    if (filters.facilityIds && filters.facilityIds.length > 0) {
      whereClauses.push(`
        p.id IN (
          SELECT property_id 
          FROM property_facilities 
          WHERE facility_id IN (${filters.facilityIds.map(() => '?').join(',')}) 
          GROUP BY property_id 
          HAVING COUNT(DISTINCT facility_id) = ?
        )
      `);
      queryParams.push(...filters.facilityIds, filters.facilityIds.length);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const query = `SELECT COUNT(p.id) AS count FROM properties p ${joins.join(' ')} ${whereSql}`;

    const rows = await db.query(query, queryParams);
    return rows.length > 0 ? rows[0].count : 0;
  }
}

module.exports = new PropertyRepository();

