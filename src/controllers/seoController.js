const db = require('../config/db');

const SITE_URL = 'https://annexlk.lk';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sitemapUrl(location, lastModified = null) {
  const lastmod = lastModified
    ? `<lastmod>${new Date(lastModified).toISOString().slice(0, 10)}</lastmod>`
    : '';
  return `<url><loc>${escapeXml(location)}</loc>${lastmod}</url>`;
}

class SeoController {
  async sitemap(req, res, next) {
    try {
      const listings = await db.query(
        `SELECT slug, updated_at
         FROM properties
         WHERE status = 'ACTIVE'
         ORDER BY updated_at DESC, id DESC`
      );

      const staticUrls = [
        `${SITE_URL}/`,
        `${SITE_URL}/pages/search.html`,
        `${SITE_URL}/pages/about.html`,
        `${SITE_URL}/pages/contact.html`,
        `${SITE_URL}/pages/privacy.html`,
        `${SITE_URL}/pages/terms.html`,
        `${SITE_URL}/pages/cookies.html`,
      ].map((url) => sitemapUrl(url));

      const listingUrls = listings.map((listing) =>
        sitemapUrl(`${SITE_URL}/property/${encodeURIComponent(listing.slug)}`, listing.updated_at)
      );

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...staticUrls,
        ...listingUrls,
        '</urlset>',
      ].join('\n');

      res
        .set('Content-Type', 'application/xml; charset=utf-8')
        .set('Cache-Control', 'public, max-age=900')
        .status(200)
        .send(xml);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SeoController();
