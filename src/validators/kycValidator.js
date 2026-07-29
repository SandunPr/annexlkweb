const Joi = require('joi');

const submitKycSchema = Joi.object({
  fullName: Joi.string().min(2).max(100).required().messages({
    'any.required': 'Legal full name is required.',
  }),
  dob: Joi.date().iso().max('now').required().messages({
    'date.max': 'Date of birth must be in the past.',
    'any.required': 'Date of birth is required.',
  }),
  idType: Joi.string().valid('NIC', 'Passport', 'Driving License').required().messages({
    'any.only': 'ID Type must be either NIC, Passport, or Driving License.',
    'any.required': 'Identity document type is required.',
  }),
  idNumber: Joi.string().min(5).max(50).required().messages({
    'any.required': 'Identity document number is required.',
  }),
  address: Joi.string().min(10).max(500).required().messages({
    'any.required': 'Legal address is required.',
  }),
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
    'string.pattern.base': 'Please enter a valid phone number (international format e.g. +94771234567).',
    'any.required': 'Contact phone number is required.',
  }),
});

module.exports = {
  submitKycSchema,
};
