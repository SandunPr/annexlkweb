const adminService = require('../services/adminService');
const fs = require('fs');

class AdminController {
  /**
   * GET /api/v1/admin/kyc
   */
  async getPendingKyc(req, res, next) {
    try {
      const list = await adminService.getPendingKyc();
      res.status(200).json({
        success: true,
        message: 'Pending KYC queue loaded successfully.',
        data: list,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/kyc/:id
   */
  async getKycDetails(req, res, next) {
    try {
      const submissionId = req.params.id;
      const adminId = req.user.id;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      const details = await adminService.getKycDetails(submissionId, adminId, ip, userAgent);
      res.status(200).json({
        success: true,
        message: 'KYC submission details loaded successfully.',
        data: details,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/kyc/documents/:docId
   */
  async getKycDocument(req, res, next) {
    try {
      const docId = req.params.docId;
      const adminId = req.user.id;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      const { absolutePath, documentType } = await adminService.getKycDocumentFile(docId, adminId, ip, userAgent);

      // Check if file physically exists
      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({
          success: false,
          message: 'Document image file not found on disk.',
        });
      }

      // Enforce strict security headers (prevent local caching of ID copies)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.sendFile(absolutePath);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/kyc/:id/approve
   */
  async approveKyc(req, res, next) {
    try {
      const submissionId = req.params.id;
      const adminId = req.user.id;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      const result = await adminService.approveKyc(submissionId, adminId, ip, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/kyc/:id/reject
   */
  async rejectKyc(req, res, next) {
    try {
      const submissionId = req.params.id;
      const adminId = req.user.id;
      const { reason } = req.body;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required.',
        });
      }

      const result = await adminService.rejectKyc(submissionId, adminId, reason, ip, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/dashboard
   */
  async getDashboard(req, res, next) {
    try {
      const stats = await adminService.getDashboardStats();
      res.status(200).json({
        success: true,
        message: 'Dashboard statistics loaded successfully.',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/users
   */
  async getUsers(req, res, next) {
    try {
      const list = await adminService.getUsers();
      res.status(200).json({
        success: true,
        message: 'Users list loaded successfully.',
        data: list,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/users/:id/suspend
   */
  async toggleUserSuspension(req, res, next) {
    try {
      const userId = parseInt(req.params.id, 10);
      const adminId = req.user.id;
      const { isSuspended } = req.body;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      if (isSuspended === undefined) {
        return res.status(400).json({
          success: false,
          message: 'isSuspended boolean parameter is required.',
        });
      }

      const result = await adminService.suspendUser(userId, isSuspended, adminId, ip, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/listings
   */
  async getListings(req, res, next) {
    try {
      const list = await adminService.getListings();
      res.status(200).json({
        success: true,
        message: 'Properties listing queue loaded successfully.',
        data: list,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/listings/:id/approve
   */
  async approveListing(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const adminId = req.user.id;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      const result = await adminService.approveListing(propertyId, adminId, ip, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/listings/:id/reject
   */
  async rejectListing(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const adminId = req.user.id;
      const { reason } = req.body;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required.',
        });
      }

      const result = await adminService.rejectListing(propertyId, reason, adminId, ip, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/listings/:id/suspend
   */
  async suspendListing(req, res, next) {
    try {
      const propertyId = parseInt(req.params.id, 10);
      const adminId = req.user.id;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      const result = await adminService.suspendListing(propertyId, adminId, ip, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/reports
   */
  async getReports(req, res, next) {
    try {
      const list = await adminService.getReports();
      res.status(200).json({
        success: true,
        message: 'Moderation reports queue loaded successfully.',
        data: list,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/reports/:id
   */
  async updateReportStatus(req, res, next) {
    try {
      const reportId = parseInt(req.params.id, 10);
      const adminId = req.user.id;
      const { status, note } = req.body;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      if (!status || !note) {
        return res.status(400).json({
          success: false,
          message: 'Both status and moderation note are required.',
        });
      }

      const result = await adminService.updateReportStatus(reportId, status, note, adminId, ip, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/audit-logs
   */
  async getAuditLogs(req, res, next) {
    try {
      const logs = await adminService.getAuditLogs();
      res.status(200).json({
        success: true,
        message: 'System audit logs retrieved successfully.',
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
