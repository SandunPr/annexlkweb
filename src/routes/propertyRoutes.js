const express = require('express');
const propertyController = require('../controllers/propertyController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { parsePropertyForm } = require('../middleware/parseForm');
const { upload } = require('../utils/uploader');
const { createPropertySchema, updatePropertySchema } = require('../validators/propertyValidator');
const renterController = require('../controllers/renterController');
const { submitReportSchema, submitReviewSchema } = require('../validators/renterValidator');

const router = express.Router();

// Upload middleware accepting exactly three images
const listingUploadFields = upload.fields([
  { name: 'main', maxCount: 1 },
  { name: 'interior', maxCount: 1 },
  { name: 'facility', maxCount: 1 },
]);

// 1. Owner Dashboard Listings (Must place before /:slug parameter route)
router.get('/owner/my-listings', authenticate, authorize('PROPERTY_OWNER'), propertyController.getMyListings);

// 2. Featured/Promoted Listings carousel (Public — no auth required)
router.get('/featured', propertyController.getFeaturedListings);

// 3. Public Detail Page Route
router.get('/:slug', propertyController.getProperty);

// 3. Write actions (Require authentication)
router.post('/', authenticate, listingUploadFields, parsePropertyForm, validate(createPropertySchema), propertyController.createProperty);
router.patch('/:id', authenticate, listingUploadFields, parsePropertyForm, validate(updatePropertySchema), propertyController.updateProperty);
router.delete('/:id', authenticate, propertyController.deleteProperty);

// 4. Status updates (Require authentication)
router.post('/:id/pause', authenticate, propertyController.pauseListing);
router.post('/:id/confirm-availability', authenticate, propertyController.confirmAvailability);
router.post('/:id/mark-reserved', authenticate, propertyController.markReserved);
router.post('/:id/mark-occupied', authenticate, propertyController.markOccupied);

// 5. Contact Reveal Analytics & Intent Tracking
router.post('/:id/contact-intent', authenticate, renterController.recordContactIntent);
router.post('/:id/reveal-contact', authenticate, renterController.revealContact);

// 6. Reports & Reviews
router.post('/:id/reports', authenticate, validate(submitReportSchema), renterController.submitReport);
router.post('/:id/reviews', authenticate, validate(submitReviewSchema), renterController.submitReview);

module.exports = router;
