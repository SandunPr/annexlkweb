const authService = require('../services/authService');
const logger = require('../utils/logger');

// Cookie options helper
const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true' || isProd,
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    domain: process.env.COOKIE_DOMAIN || 'localhost',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
};

class AuthController {
  /**
   * Public registration.
   */
  async register(req, res, next) {
    try {
      const data = await authService.register(req.body);
      res.status(201).json({
        success: true,
        message: 'Registration successful. You can now log in.',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Log in using email and password.
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const ip = req.ip;

      const { user, accessToken, refreshToken } = await authService.login({ email, password, ip });

      // Set cookie
      res.cookie('refresh_token', refreshToken, getCookieOptions());

      res.status(200).json({
        success: true,
        message: 'Login successful.',
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Log in using Google Sign-In.
   */
  async googleLogin(req, res, next) {
    try {
      const { idToken } = req.body;
      const { user, accessToken, refreshToken } = await authService.loginWithGoogle(idToken);

      res.cookie('refresh_token', refreshToken, getCookieOptions());

      res.status(200).json({
        success: true,
        message: 'Google login successful.',
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Rotate access and refresh tokens.
   */
  async refresh(req, res, next) {
    try {
      // Refresh token can be in cookies or req.body (for mobile app compatibility!)
      const token = req.cookies.refresh_token || req.body.refreshToken;

      const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(token);

      res.cookie('refresh_token', newRefreshToken, getCookieOptions());

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully.',
        data: {
          accessToken,
          // We also return refreshToken in JSON data for mobile clients that don't support cookies!
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Log out of current session.
   */
  async logout(req, res, next) {
    try {
      const token = req.cookies.refresh_token || req.body.refreshToken;
      await authService.logout(token);

      res.clearCookie('refresh_token', {
        domain: process.env.COOKIE_DOMAIN || 'localhost',
        path: '/',
      });

      res.status(200).json({
        success: true,
        message: 'Logged out successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Log out of all sessions (revoke all user tokens).
   */
  async logoutAll(req, res, next) {
    try {
      const userId = req.user.id;
      await authService.logoutAll(userId);

      res.clearCookie('refresh_token', {
        domain: process.env.COOKIE_DOMAIN || 'localhost',
        path: '/',
      });

      res.status(200).json({
        success: true,
        message: 'Logged out of all devices successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get currently authenticated user details.
   */
  async me(req, res, next) {
    try {
      const user = await authService.getUserById(req.user.id);
      res.status(200).json({
        success: true,
        message: 'Current user details loaded.',
        data: {
          user,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
