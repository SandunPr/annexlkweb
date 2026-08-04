const db = require('../config/db');

class LocationController {
  async getCities(req, res, next) {
    try {
      const cities = await db.query(
        `SELECT c.id, c.name, c.latitude, c.longitude,
                d.id AS district_id, d.name AS district_name
         FROM cities c
         JOIN districts d ON d.id = c.district_id
         ORDER BY d.name ASC, c.name ASC`
      );

      res.status(200).json({
        success: true,
        data: cities,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LocationController();
