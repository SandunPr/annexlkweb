const Joi = require('joi');

const createPropertySchema = Joi.object({
  // Basic info
  title: Joi.string().min(10).max(100).optional(),
  propertyType: Joi.string()
    .valid('boarding_room', 'shared_room', 'annex', 'house', 'apartment', 'hostel', 'studio', 'other')
    .required(),
  description: Joi.string().min(20).max(2000).required(),
  rent: Joi.number().positive().precision(2).required(),
  deposit: Joi.number().min(0).precision(2).default(0.0),
  advanceMonths: Joi.number().integer().min(0).default(0),
  billsIncluded: Joi.boolean().default(false),
  availableDate: Joi.date().iso().required(),
  minDurationMonths: Joi.number().integer().min(0).default(1),
  furnishedStatus: Joi.string().valid('UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED').default('UNFURNISHED'),
  occupancyType: Joi.string().valid('INDIVIDUAL', 'SHARED', 'FAMILY').default('INDIVIDUAL'),
  maxOccupants: Joi.number().integer().positive().default(1),
  currentOccupants: Joi.number().integer().min(0).default(0),

  // Location fields
  exactLatitude: Joi.number().min(-90).max(90).required(),
  exactLongitude: Joi.number().min(-180).max(180).required(),
  addressText: Joi.string().min(10).max(500).required(),
  cityId: Joi.number().integer().positive().required(),
  googlePlaceId: Joi.string().allow(null, '').optional(),

  // Facilities list
  facilityIds: Joi.array().items(Joi.number().integer().positive()).optional().default([]),
});

const updatePropertySchema = Joi.object({
  title: Joi.string().min(10).max(100).optional(),
  propertyType: Joi.string().valid('boarding_room', 'shared_room', 'annex', 'house', 'apartment', 'hostel', 'studio', 'other').optional(),
  description: Joi.string().min(20).max(2000).optional(),
  rent: Joi.number().positive().precision(2).optional(),
  deposit: Joi.number().min(0).precision(2).optional(),
  advanceMonths: Joi.number().integer().min(0).optional(),
  billsIncluded: Joi.boolean().optional(),
  availableDate: Joi.date().iso().optional(),
  minDurationMonths: Joi.number().integer().min(0).optional(),
  furnishedStatus: Joi.string().valid('UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED').optional(),
  occupancyType: Joi.string().valid('INDIVIDUAL', 'SHARED', 'FAMILY').optional(),
  maxOccupants: Joi.number().integer().positive().optional(),
  currentOccupants: Joi.number().integer().min(0).optional(),
  status: Joi.string().valid('ACTIVE', 'PAUSED', 'RESERVED', 'OCCUPIED').optional(),

  exactLatitude: Joi.number().min(-90).max(90).optional(),
  exactLongitude: Joi.number().min(-180).max(180).optional(),
  addressText: Joi.string().min(10).max(500).optional(),
  cityId: Joi.number().integer().positive().optional(),
  googlePlaceId: Joi.string().allow(null, '').optional(),

  facilityIds: Joi.array().items(Joi.number().integer().positive()).optional(),
});

module.exports = {
  createPropertySchema,
  updatePropertySchema,
};
