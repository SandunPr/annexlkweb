const express = require('express');
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const {
  registerSchema,
  loginSchema,
  googleAuthSchema,
} = require('../validators/authValidator');

const router = express.Router();

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/google', validate(googleAuthSchema), authController.googleLogin);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Protected routes (require valid JWT access token)
router.post('/logout-all', authenticate, authController.logoutAll);
router.get('/me', authenticate, authController.me);

module.exports = router;
