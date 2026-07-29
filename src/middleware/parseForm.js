/**
 * Middleware to parse stringified numeric, boolean, and array fields in multipart form data.
 */
function parsePropertyForm(req, res, next) {
  if (!req.body) return next();

  // Convert numeric fields
  const numFields = [
    'rent',
    'deposit',
    'advanceMonths',
    'minDurationMonths',
    'maxOccupants',
    'currentOccupants',
    'exactLatitude',
    'exactLongitude',
    'cityId',
  ];

  for (const field of numFields) {
    if (req.body[field] !== undefined && req.body[field] !== '') {
      const parsed = parseFloat(req.body[field]);
      if (!isNaN(parsed)) {
        req.body[field] = parsed;
      }
    }
  }

  // Convert boolean fields
  if (req.body.billsIncluded !== undefined) {
    if (req.body.billsIncluded === 'true') {
      req.body.billsIncluded = true;
    } else if (req.body.billsIncluded === 'false') {
      req.body.billsIncluded = false;
    }
  }

  // Convert facilityIds from stringified JSON e.g., "[1, 2]" or comma-separated string
  if (req.body.facilityIds !== undefined && req.body.facilityIds !== '') {
    if (typeof req.body.facilityIds === 'string') {
      try {
        req.body.facilityIds = JSON.parse(req.body.facilityIds);
      } catch (err) {
        // Fallback to comma-split
        req.body.facilityIds = req.body.facilityIds
          .split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id));
      }
    }
  }

  next();
}

module.exports = {
  parsePropertyForm,
};
