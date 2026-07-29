const { ValidationError } = require('../utils/errors');

/**
 * Middleware wrapper to validate request payload against Joi schemas.
 * @param {Object} schema Joi schema object
 * @param {string} source Source to validate (body, query, params)
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true, // Strip properties that aren't defined in the schema
    });

    if (error) {
      return next(error); // central error handler will catch Joi validation errors
    }

    // Replace request object with validated/stripped values
    req[source] = value;
    next();
  };
}

module.exports = validate;
