# Implementation Plan — AnnexLK MVP

This plan outlines the architecture, database schema, API design, security, and verification strategies for building **AnnexLK**, a Sri Lankan discovery platform for boarding rooms, annexes, and rental properties.

The project will consist of two primary parts:
1. `annexlk-api/` (REST API backend using Node.js, Express, and MariaDB)
2. `annexlk-web/` (Responsive mobile-first frontend using HTML5, CSS3, and Vanilla JavaScript with ES modules)

---

## User Review Required

> [!IMPORTANT]
> **Database Environment**: Since a local MariaDB/MySQL installation is not active on this environment, we will write a script-based migration manager and a complete mock database test suite. We recommend setting up a local MariaDB instance at `localhost:3306` with the credentials configured in `.env` to run the actual migrations and application locally.

> [!NOTE]
> **Google OAuth**: A Google OAuth Client ID and Secret will be required for the Google sign-in functionality. We will provide placeholders in the `.env.example` file and implement standard token verification on the backend using the `google-auth-library`.

---

## Open Questions

1. **OTP Provider for Phone Verification**: The `.env` includes `PHONE_OTP_PROVIDER` and `PHONE_OTP_API_KEY`. For the MVP, should we implement a mock OTP verification service that logs the OTP to the console, or do you have a specific Sri Lankan gateway (e.g., Dialog, Mobitel, Hutch, or Twilio) you want us to integrate?
   * *Proposed default*: A mock provider that logs OTPs to the console in development, with an extensible service interface for real provider integration.

---

## Architecture Design

We will adhere to the following backend request flow:
```text
Route ➔ Middleware ➔ Request validation ➔ Authentication ➔ Authorisation policy ➔ Controller ➔ Service ➔ Repository ➔ MariaDB
```

### Folder Structures

We will initialize the following structures:

#### Backend: `annexlk-api/`
```text
annexlk-api/
├── src/
│   ├── config/          # Environment & Database config
│   ├── controllers/     # Controller layer (handles HTTP requests/responses)
│   ├── services/        # Service layer (contains core business logic)
│   ├── repositories/    # Repository layer (handles SQL queries)
│   ├── routes/          # Express route definitions
│   ├── middleware/      # Auth, rate-limiter, error handlers
│   ├── validators/      # Joi/Zod request validation schemas
│   ├── policies/        # RBAC and resource authorization policies
│   ├── jobs/            # Expiry, cleanup, and reminder cron/timed jobs
│   ├── utils/           # Image compression, token generation, helpers
│   ├── constants/       # Error codes, statuses, application constants
│   ├── database/        # Connection pool and migration runner
│   ├── app.js           # Express app setup
│   └── server.js        # Server startup & env validation
├── migrations/          # MariaDB schema migration scripts
├── seeds/               # Database seed scripts for dev/testing
├── tests/               # Unit and integration test suites
├── scripts/             # Backup, restore, and cleanup scripts
├── storage/             # File storage
│   ├── temporary/       # Upload temp folder
│   └── private/         # KYC document storage
├── .env.example
├── package.json
└── README.md
```

#### Frontend: `annexlk-web/`
```text
annexlk-web/
├── index.html           # Home Page
├── pages/
│   ├── search.html      # Browse & Search Page
│   ├── listing.html     # Property Details Page
│   ├── login.html       # Login Page
│   ├── register.html    # Register Page
│   ├── favourites.html  # Renter Favourites Page
│   ├── profile.html     # Profile & Phone Verification
│   ├── owner-dashboard.html # Owner Listing Management
│   ├── create-listing.html # Create Property Listing
│   ├── edit-listing.html   # Edit Property Listing
│   ├── kyc.html         # KYC Submission Page
│   └── admin/
│       ├── dashboard.html # Admin Metrics & Settings
│       ├── kyc-queue.html # KYC Review Page
│       ├── listings.html  # Listing Moderation Page
│       └── reports.html   # Report Moderation Page
├── assets/
│   ├── css/
│   │   ├── base.css       # Core typography, reset, grid
│   │   ├── variables.css  # HSL color system, theme variables
│   │   ├── layout.css     # Header, footer, layout grids
│   │   ├── components.css # Cards, buttons, alerts, badges, skeletons
│   │   ├── forms.css      # Inputs, select menus, validation styles
│   │   └── responsive.css # Media queries, drawer overrides
│   ├── js/
│   │   ├── api/           # Fetch API client wrappers
│   │   ├── auth/          # Authentication handlers
│   │   ├── components/    # Reusable Toast, Modal, Skeletons
│   │   ├── pages/         # Page-specific ES modules
│   │   ├── services/      # Client business services
│   │   ├── state/         # Client-side session and global state
│   │   ├── utils/         # Map, date, format helpers
│   │   └── config.js      # App configuration
│   ├── images/
│   └── icons/
└── README.md
```

---

## Proposed Changes

### Phase 1 — Foundation
* Initialize backend project directory with `package.json`.
* Install core dependencies: `express`, `mysql2` (pool), `dotenv`, `cors`, `helmet`, `express-rate-limit`, `joi`, `jsonwebtoken`, `bcryptjs`, `cookie-parser`, `multer`, `sharp`, `winston`.
* Create `src/config/db.js` for MariaDB connection pool.
* Create a lightweight migration runner in `src/database/migrate.js` to run SQL migration files sequentially.
* Define Phase 1 SQL migrations to create `users`, `user_profiles`, `roles`, `user_roles`, and `refresh_tokens` tables.
* Implement centralized error handler middleware and standard Winston-based logging.
* Implement server-startup validation for required environment variables.
* Setup health-check endpoint `/api/v1/health`.

### Phase 2 — Authentication
* Implement endpoints: `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/refresh`.
* Setup password hashing using `bcryptjs` and session tracking via secure, HTTP-only cookies for refresh tokens.
* Design a roles and permissions system using role-based access control (RBAC) middleware.
* Add Google OAuth verification in `/api/v1/auth/google`.
* Store hashed refresh tokens in the database and enforce rotating refresh tokens.

### Phase 3 — KYC and Trust Levels
* Implement KYC submission endpoint `POST /api/v1/kyc` accepting legal details and ID files.
* Save KYC files into `/storage/private/kyc/` (not accessible by public Nginx).
* Create admin endpoints to view and approve/reject submissions: `GET /api/v1/admin/kyc`, `POST /api/v1/admin/kyc/:id/approve`.
* Set user trust status (`REGISTERED`, `PHONE_VERIFIED`, `IDENTITY_VERIFIED`, etc.).

### Phase 4 — Property Listings & Image Storage
* Create `properties` and `property_locations` schemas.
* Set up Multer file upload validation (limit: exactly 3 images, max 5MB each).
* Use Sharp to process images to three sizes:
  - Thumbnail: 400px (WebP, Quality 70)
  - Medium: 900px (WebP, Quality 75)
  - Full: 1600px (WebP, Quality 80)
* Implement listing CRUD with authorization (only verified owners can post or edit their listings).
* Implement location mapping: store exact lat/lng and generate approximate coordinates for the public API.

### Phase 5 — Search & Distance Filtering
* Write search endpoints with filters (property type, rent, facilities, city, university proximity).
* Implement distance filtering using coordinates.
* Implement sorting: Best Match (using a ranking score), Newest, Lowest/Highest Rent.
* Support paginated results with standard limits (default 20, max 50).

### Phase 6 — Favourites & Moderation
* Implement save/unsave listing logic.
* Implement report submission endpoint `POST /api/v1/listings/:id/reports`.
* Build the contact-reveal mechanism:
  - Record the contact intent (clicks on Call or WhatsApp).
  - Check authentication and rate-limits.
  - Record click analytics, then return the owner's details.

### Phase 7 — Administration & Dashboard
* Implement audit log writing for all administrative and authentication activities.
* Create dashboards for owner stats (views, clicks, status) and administrator control metrics.

### Phase 8 — Scripts & Nginx Config
* Write bash/powershell scripts for database backups, static media backups, and automatic cleanup of temp files.
* Generate a sample `nginx.conf` matching the project paths.

---

## Verification Plan

### Automated Tests
We will set up Jest and Supertest to verify:
* **Authentication**: Registration, Login, Token Refresh, Role restrictions.
* **KYC**: Submission, verification rules, administrator controls.
* **Listings**: Image upload, 3-image rule validation, size processing mock.
* **Search**: Filter logic and coordinates distance query.

Run command:
```bash
npm run test
```

### Manual Verification
1. Run migration script to populate database structure.
2. Seed mock data (Admin, Owner, Renter, Universities, Locations).
3. Test page flows in browser:
   * Login as Renter ➔ Search properties, view details, try to reveal contact (blocked if guest), save to favourites.
   * Login as Owner ➔ Complete KYC, wait for Admin approval, create listing, upload 3 images, verify coordinates.
   * Login as Admin ➔ Approve KYC, review flags/reports, check metrics.
