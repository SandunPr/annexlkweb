const express = require('express');
const profileController = require('../controllers/profileController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { updateProfileSchema } = require('../validators/profileValidator');
const { upload } = require('../utils/uploader');

const router = express.Router();

// All profile endpoints require authentication
router.use(authenticate);

router.get('/', profileController.getProfile);
router.patch('/', validate(updateProfileSchema), profileController.updateProfile);
router.post('/avatar', upload.single('avatar'), profileController.uploadAvatar);
router.post('/verify-phone', profileController.requestPhoneVerification);
router.post('/confirm-phone', profileController.confirmPhoneVerification);

module.exports = router;
