const express = require('express');
const kycController = require('../controllers/kycController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { upload } = require('../utils/uploader');
const { submitKycSchema } = require('../validators/kycValidator');

const router = express.Router();

router.use(authenticate);

// KYC upload accepts exactly one id_front and one id_back file, and an optional selfie
const kycUploadFields = upload.fields([
  { name: 'id_front', maxCount: 1 },
  { name: 'id_back', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]);

router.post('/', kycUploadFields, validate(submitKycSchema), kycController.submitKyc);
router.get('/status', kycController.getStatus);
router.get('/submission', kycController.getSubmission);

module.exports = router;
