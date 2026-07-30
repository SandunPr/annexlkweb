/**
 * Featured/Promoted Listings Configuration
 *
 * To promote a listing on the homepage/search carousel:
 *   1. Add its numeric property ID to FEATURED_LISTING_IDS below.
 *   2. Order here controls the carousel display order.
 *   3. Only ACTIVE listings are shown � paused/expired ones are silently skipped.
 *
 * Future: replace this with a DB-backed promotions table with expiry dates and billing.
 */
const FEATURED_LISTING_IDS = [
  1, 2
];

module.exports = { FEATURED_LISTING_IDS };
