const userService = require('../services/userService');

class ProfileController {
  /**
   * GET /api/v1/profile
   */
  async getProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const profile = await userService.getProfile(userId);
      res.status(200).json({
        success: true,
        message: 'Profile fetched successfully.',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/profile
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const updated = await userService.updateProfile(userId, req.body);
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/profile/verify-phone
   */
  async requestPhoneVerification(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await userService.requestPhoneVerification(userId);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/profile/confirm-phone
   */
  async confirmPhoneVerification(req, res, next) {
    try {
      const userId = req.user.id;
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Verification code is required.',
        });
      }

      const result = await userService.confirmPhoneVerification(userId, code);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProfileController();
