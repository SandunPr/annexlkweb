const logger = require('../utils/logger');
const multer = require('multer');

function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  // Log error
  logger.error(`${req.method} ${req.originalUrl} - ${statusCode} - ${message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  // Handle Joi validation errors specifically
  if (err.isJoi) {
    statusCode = 400;
    message = 'Validation failed.';
    errors = err.details.map((detail) => ({
      field: detail.context.key || detail.path.join('.'),
      message: detail.message.replace(/['"]/g, ''),
    }));
  }

  // Handle standard JSON syntax errors (e.g. malformed body)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON body.';
  }

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Image is larger than the allowed upload size.'
      : 'Invalid image upload.';
  }

  const response = {
    success: false,
    message,
  };

  if (errors.length > 0) {
    response.errors = errors;
  }

  // Only append stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
