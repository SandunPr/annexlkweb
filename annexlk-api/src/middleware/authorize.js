const { ForbiddenError, UnauthorizedError } = require('../utils/errors');

/**
 * Middleware to authorize requests based on user roles.
 * @param  {...string} allowedRoles Roles that are permitted to access the endpoint
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Unauthenticated request.'));
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to access this resource.'));
    }

    next();
  };
}

module.exports = authorize;
