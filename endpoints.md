# AnnexLK REST API Endpoints Directory

All production endpoints run under the base prefix: `https://annexlk.ekafy.com/api/v1`

| Method | Endpoint | Category | Auth Level | Payload / Params | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **POST** | `/auth/register` | Authentication | Public | `{ email, password, roleName, fullName, phoneNumber }` | Registers a new user account (role: `RENTER` or `PROPERTY_OWNER`). |
| **POST** | `/auth/verify-email` | Authentication | Public | `{ token }` | Verifies a local account using a single-use, 24-hour email token. |
| **POST** | `/auth/resend-verification` | Authentication | Public | `{ email }` | Sends a replacement email verification link when required. |
| **POST** | `/auth/login` | Authentication | Public | `{ email, password }` | Authenticates local credentials, issues JWT access token, and sets refresh token cookie. |
| **POST** | `/auth/google` | Authentication | Public | `{ idToken }` | Validates Google identity tokens and issues login credentials. |
| **POST** | `/auth/refresh` | Authentication | Public | *Credentials cookie sent automatically* | Rotates tokens silently on expiration. |
| **POST** | `/auth/logout` | Authentication | Authenticated | None | Invalidates current refresh token session. |
| **POST** | `/auth/logout-all` | Authentication | Authenticated | None | Force logs out user sessions on all devices immediately. |
| **GET** | `/profile` | User Profile | Authenticated | None | Retrieves user profile metadata (name, phone, address, status). |
| **PATCH** | `/profile` | User Profile | Authenticated | `{ fullName, phoneNumber, dateOfBirth, address }` | Updates profile details. |
| **POST** | `/profile/verify-phone` | User Profile | Authenticated | None | Requests mock phone verification (writes OTP code to backend terminal console log). |
| **POST** | `/profile/confirm-phone` | User Profile | Authenticated | `{ code }` | Submits the OTP code. Promotes status to `PHONE_VERIFIED`. |
| **POST** | `/kyc` | KYC Onboarding | Authenticated (Owner only) | `multipart/form-data` with files: `id_front`, `id_back`, optional `selfie`. Fields: `{ fullName, dob, idType, idNumber, address, phoneNumber }` | Submits identity documents for review. |
| **GET** | `/kyc/status` | KYC Onboarding | Authenticated (Owner only) | None | Checks current KYC status (`NOT_SUBMITTED`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`). |
| **POST** | `/listings` | Property Listings | Authenticated (Owner, KYC Verified) | `multipart/form-data` with exactly three images: `main`, `interior`, `facility`. Fields: `{ title, description, propertyType, availableDate, maxOccupants, currentOccupants, rent, deposit, advanceMonths, billsIncluded, cityId, addressText, exactLatitude, exactLongitude, facilityIds }` | Creates a property listing (saved as `PENDING_REVIEW`). |
| **PATCH** | `/listings/:id` | Property Listings | Authenticated (Owner only) | `multipart/form-data` (images optional). Fields: same as POST (supports partial updates). | Updates listing details. |
| **DELETE** | `/listings/:id` | Property Listings | Authenticated (Owner only) | None | Soft-deletes listing (sets status to `DELETED`). |
| **GET** | `/listings/owner/my-listings` | Property Listings | Authenticated (Owner only) | None | Returns listing analytics metrics (views, clicks, favorites count, confirm availability timers). |
| **POST** | `/listings/:id/pause` | Property Listings | Authenticated (Owner only) | None | Pauses listing (hides it from public searches). |
| **POST** | `/listings/:id/confirm-availability` | Property Listings | Authenticated (Owner only) | None | Sets status back to `ACTIVE` and resets the 30-day expiry timer. |
| **POST** | `/listings/:id/mark-reserved` | Property Listings | Authenticated (Owner only) | None | Sets listing status to `RESERVED`. |
| **POST** | `/listings/:id/mark-occupied` | Property Listings | Authenticated (Owner only) | None | Sets listing status to `OCCUPIED`. |
| **GET** | `/listings/:slug` | Property Listings | Public | None | Returns property details by slug (coordinates obfuscated). |
| **GET** | `/search` | Search & Discovery | Public | Query: `keyword`, `cityId`, `propertyType`, `minRent`, `maxRent`, `universityId`, `universityDistance`, `verifiedOwner`, `sortBy`, `page`, `limit` | Performs matching algorithm calculations and returns obfuscated list items. |
| **POST** | `/favourites/:propertyId` | Renter Operations | Authenticated (Renter only) | None | Saves listing to renter favorites list. |
| **DELETE** | `/favourites/:propertyId` | Renter Operations | Authenticated (Renter only) | None | Removes listing from renter favorites list. |
| **GET** | `/favourites` | Renter Operations | Authenticated (Renter only) | None | Lists renter's saved properties. |
| **POST** | `/listings/:id/contact-intent` | Renter Operations | Authenticated (Renter only) | `{ contactType }` (call / whatsapp) | Records contact intent analytics. |
| **POST** | `/listings/:id/reveal-contact` | Renter Operations | Authenticated (Renter only) | `{ contactType }` (call / whatsapp) | Reveals owner contact details (checks 10 reveals/hr limit). |
| **POST** | `/listings/:id/reports` | Renter Operations | Authenticated (Renter only) | `{ category, comment }` | Reports suspicious property. |
| **GET** | `/my-reports` | Renter Operations | Authenticated (Renter only) | None | Retrieves reports submitted by renter. |
| **POST** | `/listings/:id/reviews` | Renter Operations | Authenticated (Renter only) | `{ rating, comment }` | Leaves a review (requires logged contact reveal, self-reviews blocked). |
| **GET** | `/admin/dashboard` | Administration | Administrator only | None | Returns platform performance stats. |
| **GET** | `/admin/users` | Administration | Administrator only | None | Lists all platform users. |
| **POST** | `/admin/users/:id/suspend` | Administration | Administrator only | `{ isSuspended }` (true/false) | Suspends user and revokes refresh sessions. |
| **GET** | `/admin/kyc` | Administration | Administrator only | None | Lists pending KYC uploads. |
| **POST** | `/admin/kyc/:id/approve` | Administration | Administrator only | None | Approves KYC document. |
| **POST** | `/admin/kyc/:id/reject` | Administration | Administrator only | `{ reason }` | Rejects KYC and reverts status. |
| **GET** | `/admin/listings` | Administration | Administrator only | None | Lists all properties catalog. |
| **POST** | `/admin/listings/:id/approve` | Administration | Administrator only | None | Activates pending listing. |
| **POST** | `/admin/listings/:id/reject` | Administration | Administrator only | `{ reason }` | Rejects listing submission. |
| **POST** | `/admin/listings/:id/suspend` | Administration | Administrator only | None | Suspends listing from search. |
| **GET** | `/admin/reports` | Administration | Administrator only | None | Lists moderation reports queue. |
| **PATCH** | `/admin/reports/:id` | Administration | Administrator only | `{ status, note }` | Resolves reports and logs notes. |
| **GET** | `/admin/audit-logs` | Administration | Administrator only | None | Lists platform audit logs. |
