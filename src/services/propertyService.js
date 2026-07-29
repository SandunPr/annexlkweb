const propertyRepository = require('../repositories/propertyRepository');
const userRepository = require('../repositories/userRepository');
const imageProcessor = require('../utils/imageProcessor');
const geoUtils = require('../utils/geo');
const db = require('../config/db');
const { ForbiddenError, ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

class PropertyService {
  /**
   * Helper to generate a unique listing slug.
   */
  async generateUniqueSlug(title) {
    let baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    if (!baseSlug) {
      baseSlug = 'property';
    }

    let uniqueSlug = baseSlug;
    let counter = 1;

    while (counter < 100) {
      const [rows] = await db.query('SELECT id FROM properties WHERE slug = ? AND status != "DELETED"', [uniqueSlug]);
      if (rows.length === 0) {
        return uniqueSlug;
      }
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    return `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Create a new property listing.
   */
  async createProperty(userId, propertyPayload, locationPayload, facilityIds, files) {
    // 1. Verify owner KYC trust level
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User account not found.');
    }

    const verifiedStatuses = ['IDENTITY_VERIFIED', 'PROPERTY_VERIFIED', 'TRUSTED_OWNER'];
    if (!verifiedStatuses.includes(user.kyc_status)) {
      throw new ForbiddenError('You must complete KYC identity verification before you can submit property listings.');
    }

    // 2. Validate exact 3 image files rule
    if (!files || !files.main || !files.interior || !files.facility) {
      throw new ValidationError('You must upload exactly three listing photos (main, interior, facility).');
    }

    // 3. Generate slug
    const slug = await this.generateUniqueSlug(propertyPayload.title);
    propertyPayload.slug = slug;
    propertyPayload.ownerId = userId;

    // 4. Generate approximate public coordinates
    const { approxLatitude, approxLongitude } = geoUtils.obfuscateCoordinates(
      locationPayload.exactLatitude,
      locationPayload.exactLongitude
    );
    locationPayload.approxLatitude = approxLatitude;
    locationPayload.approxLongitude = approxLongitude;

    // 5. Save metadata to DB
    const propertyId = await propertyRepository.create(propertyPayload, locationPayload, facilityIds);

    try {
      // 6. Process & Save Uploaded Images using Sharp
      const processedImages = await imageProcessor.processPropertyImages(propertyId, files);
      await propertyRepository.saveImages(propertyId, processedImages);

      logger.info(`Property listing created. ID: ${propertyId}, Slug: ${slug}, Owner: ${userId}`);
      return await propertyRepository.findById(propertyId);
    } catch (err) {
      // Rollback listing creation if image processing fails
      logger.error(`Image processing failed for new listing. Rolling back DB entries. Error: ${err.message}`);
      await db.query('DELETE FROM properties WHERE id = ?', [propertyId]);
      throw err;
    }
  }

  /**
   * Get property listing details.
   */
  async getPropertyBySlug(slug) {
    const property = await propertyRepository.findBySlug(slug);
    if (!property) {
      throw new NotFoundError('Property listing not found.');
    }

    // Obfuscate exact coordinates for public visitors
    const safeProperty = { ...property };
    delete safeProperty.exact_latitude;
    delete safeProperty.exact_longitude;

    return safeProperty;
  }

  /**
   * Update listing details.
   */
  async updateProperty(propertyId, userId, propertyPayload, locationPayload, facilityIds, files) {
    // 1. Check ownership permissions
    const property = await propertyRepository.findById(propertyId);
    if (!property) {
      throw new NotFoundError('Property listing not found.');
    }

    if (property.owner_id !== userId) {
      throw new ForbiddenError('You are not authorized to update this listing.');
    }

    // 2. Handle coordinate approximations if exact location changes
    if (locationPayload && locationPayload.exactLatitude && locationPayload.exactLongitude) {
      const { approxLatitude, approxLongitude } = geoUtils.obfuscateCoordinates(
        locationPayload.exactLatitude,
        locationPayload.exactLongitude
      );
      locationPayload.approxLatitude = approxLatitude;
      locationPayload.approxLongitude = approxLongitude;
    }

    // 3. Regenerate slug if title changes
    if (propertyPayload.title && propertyPayload.title !== property.title) {
      propertyPayload.slug = await this.generateUniqueSlug(propertyPayload.title);
    }

    // Save updates
    await propertyRepository.update(propertyId, propertyPayload, locationPayload, facilityIds);

    // 4. Handle image updates (if new files are uploaded, all 3 must be replaced)
    if (files && (files.main || files.interior || files.facility)) {
      if (!files.main || !files.interior || !files.facility) {
        throw new ValidationError('To update photos, you must upload a complete set of exactly three images (main, interior, facility).');
      }

      // Fetch old images for deletion
      const oldImages = await propertyRepository.getImages(propertyId);

      // Process new files
      const processedImages = await imageProcessor.processPropertyImages(propertyId, files);
      await propertyRepository.saveImages(propertyId, processedImages);

      // Delete old files from disk
      await imageProcessor.deletePropertyImagesFiles(oldImages);
    }

    logger.info(`Property listing updated. ID: ${propertyId}`);
    return await propertyRepository.findById(propertyId);
  }

  /**
   * Delete a listing (Mark status as DELETED).
   */
  async deleteProperty(propertyId, userId) {
    const property = await propertyRepository.findById(propertyId);
    if (!property) {
      throw new NotFoundError('Property listing not found.');
    }

    // Verify ownership
    if (property.owner_id !== userId) {
      throw new ForbiddenError('You are not authorized to delete this listing.');
    }

    // Mark as DELETED
    await propertyRepository.updateStatus(propertyId, 'DELETED', userId);
    logger.info(`Property listing marked deleted. ID: ${propertyId}`);

    // Fetch and delete disk images related to this listing
    const oldImages = await propertyRepository.getImages(propertyId);
    await imageProcessor.deletePropertyImagesFiles(oldImages);

    return { success: true, message: 'Property listing deleted successfully.' };
  }

  /**
   * Get owner dashboard details.
   */
  async getOwnerDashboardListings(ownerId) {
    return await propertyRepository.getOwnerListings(ownerId);
  }

  /**
   * Update listing status.
   */
  async changeStatus(propertyId, userId, status) {
    const property = await propertyRepository.findById(propertyId);
    if (!property) {
      throw new NotFoundError('Property listing not found.');
    }

    if (property.owner_id !== userId) {
      throw new ForbiddenError('You are not authorized to modify this listing status.');
    }

    const validStatuses = ['ACTIVE', 'PAUSED', 'RESERVED', 'OCCUPIED'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status transition to: ${status}`);
    }

    await propertyRepository.updateStatus(propertyId, status, userId);
    logger.info(`Owner changed property ${propertyId} status to ${status}`);
    return { success: true, message: `Listing status updated to ${status.toLowerCase()}.` };
  }

  /**
   * Confirm listing availability.
   */
  async confirmAvailability(propertyId, userId) {
    const property = await propertyRepository.findById(propertyId);
    if (!property) {
      throw new NotFoundError('Property listing not found.');
    }

    if (property.owner_id !== userId) {
      throw new ForbiddenError('You are not authorized to confirm this listing availability.');
    }

    await propertyRepository.confirmAvailability(propertyId, userId);
    logger.info(`Owner confirmed availability for property ${propertyId}`);
    return { success: true, message: 'Listing availability confirmed successfully.' };
  }

  /**
   * Search property listings with pagination and sorting.
   */
  async searchProperties(filters) {
    const page = parseInt(filters.page || '1', 10);
    const rawLimit = parseInt(filters.limit || '20', 10);
    const limit = Math.min(Math.max(rawLimit, 1), 50); // Enforce min 1, max 50
    const offset = (page - 1) * limit;

    // Sanitize filter fields
    const sanitizedFilters = {
      keyword: filters.keyword || null,
      cityId: filters.cityId ? parseInt(filters.cityId, 10) : null,
      districtId: filters.districtId ? parseInt(filters.districtId, 10) : null,
      universityId: filters.universityId ? parseInt(filters.universityId, 10) : null,
      universityDistance: filters.universityDistance ? parseFloat(filters.universityDistance) : null,
      propertyType: filters.propertyType || null,
      minRent: filters.minRent ? parseFloat(filters.minRent) : null,
      maxRent: filters.maxRent ? parseFloat(filters.maxRent) : null,
      furnishedStatus: filters.furnishedStatus || null,
      billsIncluded: filters.billsIncluded === 'true' ? true : filters.billsIncluded === 'false' ? false : undefined,
      maxOccupants: filters.maxOccupants ? parseInt(filters.maxOccupants, 10) : null,
      currentOccupants: filters.currentOccupants ? parseInt(filters.currentOccupants, 10) : null,
      verifiedOwner: filters.verifiedOwner === 'true',
      facilityIds: filters.facilityIds ? (Array.isArray(filters.facilityIds) ? filters.facilityIds.map(Number) : [parseInt(filters.facilityIds, 10)]) : [],
      latitude: filters.latitude ? parseFloat(filters.latitude) : null,
      longitude: filters.longitude ? parseFloat(filters.longitude) : null,
      distance: filters.distance ? parseFloat(filters.distance) : null,
      sortBy: filters.sortBy || 'best_match',
    };

    const listings = await propertyRepository.search(sanitizedFilters, { limit, offset });
    const total = await propertyRepository.countSearch(sanitizedFilters);
    const totalPages = Math.ceil(total / limit);

    return {
      listings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}

module.exports = new PropertyService();
