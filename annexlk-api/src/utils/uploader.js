const multer = require('multer');
const path = require('path');
const { ValidationError } = require('./errors');

// Setup memory storage to hold file buffers for custom validation/processing
const storage = multer.memoryStorage();

// Allowed MIME types
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

// File filter validator
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ValidationError(`Unsupported file type: ${file.mimetype}. Only JPEG, PNG and WebP are allowed.`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_IMAGE_SIZE || '5242880', 10), // Default 5 MB
  },
});

module.exports = {
  upload,
  ALLOWED_MIMES,
};
