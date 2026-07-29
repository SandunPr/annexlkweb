const express = require('express');
const adminController = require('../controllers/adminController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = express.Router();

// Enforce auth and Administrator role checks globally on this router
router.use(authenticate);
router.use(authorize('ADMINISTRATOR'));

// KYC admin routes
router.get('/kyc', adminController.getPendingKyc);
router.get('/kyc/:id', adminController.getKycDetails);
router.get('/kyc/documents/:docId', adminController.getKycDocument);
router.post('/kyc/:id/approve', adminController.approveKyc);
router.post('/kyc/:id/reject', adminController.rejectKyc);

// System dashboard stats
router.get('/dashboard', adminController.getDashboard);

// User management routes
router.get('/users', adminController.getUsers);
router.post('/users/:id/suspend', adminController.toggleUserSuspension);

// Listing moderation routes
router.get('/listings', adminController.getListings);
router.post('/listings/:id/approve', adminController.approveListing);
router.post('/listings/:id/reject', adminController.rejectListing);
router.post('/listings/:id/suspend', adminController.suspendListing);

// Report moderation routes
router.get('/reports', adminController.getReports);
router.patch('/reports/:id', adminController.updateReportStatus);

// System logs route
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
