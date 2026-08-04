// Set environment variables before any application code is required
process.env.JWT_ACCESS_SECRET = 'test_secret_for_unit_tests';
process.env.JWT_REFRESH_SECRET = 'test_secret_for_refresh_units';
process.env.JWT_ACCESS_EXPIRY = '15m';

const request = require('supertest');
const jwt = require('jsonwebtoken');

let mockRateLimitCount = 2;

// Mock the database pool and transaction connections
jest.mock('../src/config/db', () => {
  const mockConnection = {
    execute: jest.fn().mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT id FROM roles') || sql.includes('SELECT id FROM user_roles')) {
        return [[{ id: 1 }], []];
      }
      return [{ insertId: 10 }, []];
    }),
    beginTransaction: jest.fn().mockResolvedValue(true),
    commit: jest.fn().mockResolvedValue(true),
    rollback: jest.fn().mockResolvedValue(true),
    release: jest.fn(),
  };

  return {
    pool: {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      execute: jest.fn().mockResolvedValue([[ { id: 1 } ], []]),
    },
    query: jest.fn().mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT attempt_count, locked_until')) {
        return [];
      }
      if (sql.includes('FROM users u') || sql.includes('SELECT u.id') || sql.includes('SELECT u.email')) {
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('Password123!', 10);
        return [{
          id: 20,
          email: 'owner@annexlk.com',
          password_hash: hash,
          kyc_status: 'REGISTERED', // KYC is optional for listing eligibility
          is_suspended: 0,
          role: 'PROPERTY_OWNER',
          email_verified: 1,
          google_authenticated: 0,
        }];
      }
      if (sql.includes('SELECT owner_id FROM properties')) {
        return [{ owner_id: 20 }];
      }
      if (sql.includes('SELECT COUNT(id) AS count FROM contact_events')) {
        return [{ count: mockRateLimitCount }];
      }
      if (sql.includes('SELECT p.id, p.owner_id')) {
        return [{ id: 1, owner_id: 20, phone_number: '+94771234567', full_name: 'Owner Sahan' }];
      }
      return [];
    }),
    getTransaction: jest.fn().mockResolvedValue(mockConnection),
  };
});

const db = require('../src/config/db');
const app = require('../src/app');

describe('AnnexLK REST API Test Suite', () => {
  let renterToken;
  let ownerToken;

  beforeAll(() => {
    // Generate valid JWT tokens using the correct userId payload key
    renterToken = jwt.sign(
      { userId: '10', email: 'renter@annexlk.com', role: 'RENTER' },
      process.env.JWT_ACCESS_SECRET
    );

    ownerToken = jwt.sign(
      { userId: '20', email: 'owner@annexlk.com', role: 'PROPERTY_OWNER' },
      process.env.JWT_ACCESS_SECRET
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // 1. User Registration Flow
  describe('POST /api/v1/auth/register', () => {
    it('should successfully register a new user', async () => {
      db.query.mockImplementationOnce(async (sql) => {
        if (sql.includes('SELECT id FROM users')) return []; // user does not exist
        return [];
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@annexlk.com',
          password: 'Password123!',
          roleName: 'RENTER',
          fullName: 'Test Renter',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Registration successful');
    });

    it('should fail registration with invalid password format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'badpassword@annexlk.com',
          password: '123',
          roleName: 'RENTER',
          fullName: 'Test Bad',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // 2. User Login Flow
  describe('POST /api/v1/auth/login', () => {
    it('should authenticate user and return access token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'owner@annexlk.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
    });
  });

  describe('Email verification', () => {
    it('should verify a valid, unexpired single-use token', async () => {
      db.query.mockImplementationOnce(async () => [{
        id: 44,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
        verified_at: null,
      }]);

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'a'.repeat(80) });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('verified successfully');
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE email_verifications SET verified_at = NOW() WHERE id = ?',
        [44]
      );
    });

    it('should reject an expired verification token', async () => {
      db.query.mockImplementationOnce(async () => [{
        id: 45,
        expires_at: new Date(Date.now() - 1000),
        verified_at: null,
      }]);

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'b'.repeat(80) });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('expired');
    });
  });

  // 3. KYC Submission Flow
  describe('POST /api/v1/kyc', () => {
    it('should block KYC upload for guests', async () => {
      const res = await request(app)
        .post('/api/v1/kyc')
        .send({ fullName: 'Unauthorized Renter' });

      expect(res.status).toBe(401);
    });

    it('should fail with validation errors on empty inputs', async () => {
      const res = await request(app)
        .post('/api/v1/kyc')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // 4. Image Upload limits (Exactly 3 images)
  describe('POST /api/v1/listings - Image uploads count check', () => {
    it('should reject an owner whose email is not verified and has no Google identity', async () => {
      db.query.mockImplementationOnce(async () => [{
        id: 20,
        email: 'unverified@annexlk.com',
        kyc_status: 'IDENTITY_VERIFIED',
        is_suspended: 0,
        role: 'PROPERTY_OWNER',
        email_verified: 0,
        google_authenticated: 0,
      }]);

      const res = await request(app)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          description: 'A complete listing description for verification testing.',
          propertyType: 'annex',
          availableDate: '2026-09-01',
          maxOccupants: 2,
          currentOccupants: 0,
          rent: 25000,
          deposit: 25000,
          advanceMonths: 1,
          billsIncluded: false,
          cityId: 1,
          addressText: 'A valid property address in Colombo, Sri Lanka',
          exactLatitude: 6.9271,
          exactLongitude: 79.8612,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Verify your email');
    });

    it('should reject listing creation if less than 3 images are provided', async () => {
      const res = await request(app)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('main', Buffer.from('fake image 1'), 'img1.png')
        .attach('interior', Buffer.from('fake image 2'), 'img2.png')
        // Omitting 'facility' image to trigger 400 validation error
        .field('title', 'Moratuwa Boarding Room')
        .field('description', 'Fails count test description')
        .field('propertyType', 'boarding_room')
        .field('availableDate', '2026-08-01')
        .field('maxOccupants', 1)
        .field('currentOccupants', 0)
        .field('rent', 15000)
        .field('deposit', 30000)
        .field('advanceMonths', 2)
        .field('billsIncluded', 'true')
        .field('cityId', 3)
        .field('addressText', 'Katubedda Road, Moratuwa Sri Lanka')
        .field('exactLatitude', 6.788)
        .field('exactLongitude', 79.891);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('You must upload exactly three listing photos');
    });

    it('should allow a Google-authenticated owner through the identity gate without KYC', async () => {
      db.query.mockImplementationOnce(async () => [{
        id: 20,
        email: 'google-owner@example.com',
        kyc_status: 'REGISTERED',
        is_suspended: 0,
        role: 'PROPERTY_OWNER',
        email_verified: 0,
        google_authenticated: 1,
      }]);

      const res = await request(app)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          description: 'A complete listing description for Google identity testing.',
          propertyType: 'annex', availableDate: '2026-09-01', maxOccupants: 2,
          currentOccupants: 0, rent: 25000, deposit: 25000, advanceMonths: 1,
          billsIncluded: false, cityId: 1,
          addressText: 'A valid property address in Colombo, Sri Lanka',
          exactLatitude: 6.9271, exactLongitude: 79.8612,
        });

      // Missing photos is the next validation, proving identity eligibility passed.
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('exactly three listing photos');
    });
  });

  // 5. Public search filters
  describe('GET /api/v1/search', () => {
    it('should perform search returning listings list', async () => {
      const res = await request(app)
        .get('/api/v1/search?propertyType=boarding_room&maxRent=20000');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  // 6. Contact reveal intent & tracking limits
  describe('POST /api/v1/listings/:id/reveal-contact', () => {
    it('should reveal phone numbers and increment reveal counters within limits', async () => {
      mockRateLimitCount = 2; // under limit

      const res = await request(app)
        .post('/api/v1/listings/1/reveal-contact')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ contactType: 'call' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('phoneNumber', '+94771234567');
    });

    it('should enforce rate limit of 10 contact reveals per hour', async () => {
      mockRateLimitCount = 11; // above limit

      const res = await request(app)
        .post('/api/v1/listings/1/reveal-contact')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ contactType: 'call' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('limit exceeded');
    });
  });
});
