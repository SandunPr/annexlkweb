const renterService = require('../services/renterService');

class RenterController {
  // ==========================================
  // FAVOURITES CONTROLLER
  // ==========================================
  async getFavourites(req, res, next) {
    try {
      const userId = req.user.id;
      const list = await renterService.getFavourites(userId);
      res.status(200).json({
        success: true,
        message: 'Favourites fetched successfully.',
        data: list,
      });
    } catch (error) {
      next(error);
    }
  }

  async addFavourite(req, res, next) {
    try {
      const userId = req.user.id;
      const propertyId = parseInt(req.params.listingId, 10);

      const result = await renterService.addFavourite(userId, propertyId);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async removeFavourite(req, res, next) {
    try {
      const userId = req.user.id;
      const propertyId = parseInt(req.params.listingId, 10);

      const result = await renterService.removeFavourite(userId, propertyId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // CONTACT REVEAL CONTROLLER
  // ==========================================
  async recordContactIntent(req, res, next) {
    try {
      const userId = req.user.id;
      const propertyId = parseInt(req.params.id, 10);
      const { contactType } = req.body; // 'call' or 'whatsapp'

      if (!contactType || !['call', 'whatsapp'].includes(contactType)) {
        return res.status(400).json({
          success: false,
          message: 'Contact type must be either call or whatsapp.',
        });
      }

      const ip = req.ip;
      const userAgent = req.get('User-Agent') || '';

      const result = await renterService.recordContactIntent(userId, propertyId, contactType, ip, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async revealContact(req, res, next) {
    try {
      const userId = req.user.id;
      const propertyId = parseInt(req.params.id, 10);
      const { contactType } = req.body; // 'call' or 'whatsapp'

      if (!contactType || !['call', 'whatsapp'].includes(contactType)) {
        return res.status(400).json({
          success: false,
          message: 'Contact type must be either call or whatsapp.',
        });
      }

      const ip = req.ip;
      const userAgent = req.get('User-Agent') || '';

      const result = await renterService.revealContact(userId, propertyId, contactType, ip, userAgent);
      res.status(200).json({
        success: true,
        message: 'Owner contact details revealed.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // REPORTING CONTROLLER
  // ==========================================
  async submitReport(req, res, next) {
    try {
      const userId = req.user.id;
      const propertyId = parseInt(req.params.id, 10);

      const result = await renterService.submitReport(userId, propertyId, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getMyReports(req, res, next) {
    try {
      const userId = req.user.id;
      const list = await renterService.getMyReports(userId);
      res.status(200).json({
        success: true,
        message: 'Your reports list loaded.',
        data: list,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // REVIEW CONTROLLER
  // ==========================================
  async submitReview(req, res, next) {
    try {
      const userId = req.user.id;
      const propertyId = parseInt(req.params.id, 10);
      const { rating, comment } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating is required and must be between 1 and 5.',
        });
      }

      const result = await renterService.submitReview(userId, propertyId, { rating, comment });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RenterController();
