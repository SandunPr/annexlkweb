const Joi = require('joi');

const updateProfileSchema = Joi.object({
  fullName: Joi.string().min(2).max(100).optional(),
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
    'string.pattern.base': 'Please enter a valid phone number (international format e.g. +94771234567).',
  }),
  dateOfBirth: Joi.date().iso().less('now').optional().messages({
    'date.less': 'Date of birth must be in the past.',
  }),
  address: Joi.string().max(500).optional(),
});

module.exports = {
  updateProfileSchema,
};
