const Joi = require('joi');

const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid email address.',
      'any.required': 'Email is required.',
    }),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long.',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).',
      'any.required': 'Password is required.',
    }),
  roleName: Joi.string()
    .valid('PROPERTY_OWNER', 'RENTER')
    .required()
    .messages({
      'any.only': 'Role must be either PROPERTY_OWNER or RENTER.',
      'any.required': 'User role is required.',
    }),
  fullName: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Full name must be at least 2 characters.',
      'any.required': 'Full name is required.',
    }),
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Please enter a valid phone number (international format e.g. +94771234567).',
    }),
});

const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please enter a valid email address.',
      'any.required': 'Email is required.',
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required.',
    }),
});

const googleAuthSchema = Joi.object({
  idToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Google ID Token is required.',
    }),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
