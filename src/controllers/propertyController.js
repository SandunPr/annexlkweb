const propertyService = require('../services/propertyService');

class PropertyController {
  /**
   * GET /api/v1/listings/featured
   * Public — returns promoted listings for the advertisement carousel.
   */
  async getFeaturedListings(req, res, next) {
    try {
      const listings = await propertyService.getFeaturedListings();
      res.status(200).json({ success: true, data: listings });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/listings
   */

  async createProperty(req, res, next) {
    try {
      const userId = req.user.id;
      // Separation of schemas inside payload mapping
      const propertyPayload = {
        title: req.body.title,
        propertyType: req.body.propertyType,
        description: req.body.description,
        rent: req.body.rent,
        deposit: req.body.deposit,
        advanceMonths: req.body.advanceMonths,
        billsIncluded: req.body.billsIncluded,
        availableDate: req.body.availableDate,
        minDurationMonths: req.body.minDurationMonths,
        furnishedStatus: req.body.furnishedStatus,
        occupancyType: req.body.occupancyType,
        preferredGender: req.body.preferredGender,
        maxOccupants: req.body.maxOccupants,
        currentOccupants: req.body.currentOccupants,
      };

      const locationPayload = {
        exactLatitude: req.body.exactLatitude,
        exactLongitude: req.body.exactLongitude,
        addressText: req.body.addressText,
        cityId: req.body.cityId,
        googlePlaceId: req.body.googlePlaceId,
      };

      const facilityIds = req.body.facilityIds || [];

      // files are in req.files (main, interior, facility)
      const newProperty = await propertyService.createProperty(
        userId,
        propertyPayload,
        locationPayload,
        facilityIds,
        req.files
      );

      res.status(201).json({
        success: true,
        message: 'Listing created successfully and saved as draft.',
        data: newProperty,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/listings/:slug
   */
  async getProperty(req, res, next) {
    try {
      const slug = req.params.slug;
      const property = await propertyService.getPropertyBySlug(slug);
      res.status(200).json({
        success: true,
        message: 'Property listing retrieved successfully.',
        data: property,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/listings/:id
   */
  async updateProperty(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      const propertyPayload = {};
      const updatablePropKeys = [
        'title', 'description', 'propertyType', 'rent', 'deposit', 'advanceMonths',
        'billsIncluded', 'availableDate', 'minDurationMonths', 'furnishedStatus',
        'occupancyType', 'preferredGender', 'maxOccupants', 'currentOccupants', 'status'
      ];
      for (const key of updatablePropKeys) {
        if (req.body[key] !== undefined) {
          propertyPayload[key] = req.body[key];
        }
      }

      let locationPayload = null;
      const updatableLocKeys = ['exactLatitude', 'exactLongitude', 'addressText', 'cityId', 'googlePlaceId'];
      const hasLocUpdate = updatableLocKeys.some((k) => req.body[k] !== undefined);
      
      if (hasLocUpdate) {
        locationPayload = {};
        for (const key of updatableLocKeys) {
          if (req.body[key] !== undefined) {
            locationPayload[key] = req.body[key];
          }
        }
      }

      const facilityIds = req.body.facilityIds;

      const updated = await propertyService.updateProperty(
        propertyId,
        userId,
        propertyPayload,
        locationPayload,
        facilityIds,
        req.files
      );

      res.status(200).json({
        success: true,
        message: 'Property listing updated successfully.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/listings/:id
   */
  async deleteProperty(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      const result = await propertyService.deleteProperty(propertyId, userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/listings/owner/my-listings
   */
  async getMyListings(req, res, next) {
    try {
      const userId = req.user.id;
      const listings = await propertyService.getOwnerDashboardListings(userId);
      res.status(200).json({
        success: true,
        message: 'Owner listings loaded.',
        data: listings,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/listings/:id/pause
   */
  async pauseListing(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      const result = await propertyService.changeStatus(propertyId, userId, 'PAUSED');
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/listings/:id/confirm-availability
   */
  async confirmAvailability(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      const result = await propertyService.confirmAvailability(propertyId, userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/listings/:id/mark-reserved
   */
  async markReserved(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      const result = await propertyService.changeStatus(propertyId, userId, 'RESERVED');
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/listings/:id/mark-occupied
   */
  async markOccupied(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      const result = await propertyService.changeStatus(propertyId, userId, 'OCCUPIED');
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PropertyController();
