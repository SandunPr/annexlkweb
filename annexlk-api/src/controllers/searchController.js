const propertyService = require('../services/propertyService');

class SearchController {
  /**
   * GET /api/v1/search
   */
  async search(req, res, next) {
    try {
      const result = await propertyService.searchProperties(req.query);
      res.status(200).json({
        success: true,
        message: 'Search query executed successfully.',
        data: result.listings,
        meta: {
          pagination: result.pagination,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SearchController();
