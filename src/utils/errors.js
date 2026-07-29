class AppError extends Error {
  constructor(message, statusCode, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed.', errors = []) {
    super(message, 400, errors);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access.') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden.') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict.') {
    super(message, 409);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
