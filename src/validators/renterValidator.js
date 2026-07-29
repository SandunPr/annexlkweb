const Joi = require('joi');

const submitReportSchema = Joi.object({
  category: Joi.string()
    .valid(
      'Fake listing', 'Wrong price', 'Incorrect location', 'Duplicate listing',
      'Property no longer available', 'Suspicious payment request', 'Inappropriate content',
      'Misleading photos', 'Owner unreachable', 'Other'
    )
    .required()
    .messages({
      'any.only': 'Invalid report category.',
      'any.required': 'Report category is required.',
    }),
  comment: Joi.string().max(1000).allow(null, '').optional(),
});

const submitReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required().messages({
    'number.min': 'Rating must be at least 1.',
    'number.max': 'Rating cannot be more than 5.',
    'any.required': 'Review rating (1-5) is required.',
  }),
  comment: Joi.string().max(1000).allow(null, '').optional(),
});

module.exports = {
  submitReportSchema,
  submitReviewSchema,
};
