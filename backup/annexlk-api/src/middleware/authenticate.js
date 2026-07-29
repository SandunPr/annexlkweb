const authUtils = require('../utils/auth');
const { UnauthorizedError } = require('../utils/errors');

function authenticate(req, res, next) {
  let token = null;

  // 1. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Fallback to access_token cookie
  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    return next(new UnauthorizedError('Access token is missing. Please log in.'));
  }

  // 3. Verify token
  const decoded = authUtils.verifyAccessToken(token);
  if (!decoded) {
    return next(new UnauthorizedError('Access token is invalid or expired.'));
  }

  // 4. Attach user data to request object
  req.user = {
    id: parseInt(decoded.userId, 10),
    email: decoded.email,
    role: decoded.role,
  };

  next();
}

module.exports = authenticate;
