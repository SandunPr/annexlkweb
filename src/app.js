const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { NotFoundError } = require('./utils/errors');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const kycRoutes = require('./routes/kycRoutes');
const adminRoutes = require('./routes/adminRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const searchRoutes = require('./routes/searchRoutes');
const favouritesRoutes = require('./routes/favouritesRoutes');
const renterController = require('./controllers/renterController');
const authenticate = require('./middleware/authenticate');

const app = express();

// 1. Trust proxy if behind Nginx (for accurate IP rate-limiting)
app.set('trust proxy', 1);

// 2. Global Middleware
app.use(helmet());

// Configure CORS to allow our web portal domain
const corsOptions = {
  origin: process.env.WEB_URL || 'http://localhost:3000',
  credentials: true, // Allow cookies
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' })); // Request payload size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// 3. Logger Middleware to trace incoming API requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl} - IP: ${req.ip} - User Agent: ${req.get('User-Agent')}`);
  next();
});

// 4. Rate Limiter (Max 100 requests per 15 minutes per IP by default)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, 
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// 5. Serve public listings images static files (using express in dev, Nginx will take over in production)
if (process.env.NODE_ENV !== 'production') {
  app.use('/media', express.static('storage/public'));
}

// 6. API Routes
// Health Check endpoint
app.get('/api/v1/health', async (req, res, next) => {
  try {
    const { pool } = require('./config/db');
    // Test DB connection
    const connection = await pool.getConnection();
    connection.release();

    res.status(200).json({
      success: true,
      message: 'AnnexLK API is healthy and connected to database.',
      timestamp: new Date(),
      uptime: process.uptime(),
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/listings', propertyRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/favourites', favouritesRoutes);
app.use('/api/v1/my-reports', authenticate, renterController.getMyReports);

// 7. Route fallback (404 Not Found)
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl} does not exist.`));
});

// 8. Centralized Error Handler (must be registered last)
app.use(errorHandler);

module.exports = app;
