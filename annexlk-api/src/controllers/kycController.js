const kycService = require('../services/kycService');

class KycController {
  /**
   * POST /api/v1/kyc
   */
  async submitKyc(req, res, next) {
    try {
      const userId = req.user.id;
      // files are in req.files (id_front, id_back, selfie)
      // body is in req.body
      const result = await kycService.submitKyc(userId, req.body, req.files);
      res.status(201).json({
        success: true,
        message: result.message,
        data: {
          submissionId: result.submissionId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/kyc/status
   */
  async getStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const status = await kycService.getKycStatus(userId);
      res.status(200).json({
        success: true,
        message: 'KYC status retrieved successfully.',
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/kyc/submission
   */
  async getSubmission(req, res, next) {
    try {
      const userId = req.user.id;
      const submission = await kycService.getKycSubmission(userId);
      res.status(200).json({
        success: true,
        message: 'KYC submission retrieved successfully.',
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new KycController();
