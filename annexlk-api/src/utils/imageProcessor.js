const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const SIZES = {
  thumb: { width: 400, quality: 70, suffix: 'thumb' },
  medium: { width: 900, quality: 75, suffix: 'medium' },
  full: { width: 1600, quality: 80, suffix: 'full' },
};

/**
 * Process a single image into three WebP sizes and save them to the directory.
 * @param {Buffer} buffer File buffer
 * @param {string} positionName Image position identifier ('main', 'interior', 'facility')
 * @param {string} targetDir Local path where files should be stored
 * @param {string} webSubDir Relative path for database storing
 */
async function processAndSaveImage(buffer, positionName, targetDir, webSubDir) {
  const uuid = crypto.randomUUID();
  const filenames = {};
  const relativePaths = {};

  // For each size configuration, process the buffer
  for (const [sizeKey, config] of Object.entries(SIZES)) {
    const filename = `${positionName}-${uuid}-${config.suffix}.webp`;
    const destPath = path.join(targetDir, filename);
    const dbPath = `/${webSubDir}/${filename}`.replace(/\\/g, '/'); // Ensure standard web slashes

    // Sharp pipeline
    await sharp(buffer)
      .rotate() // Auto-orient photo based on EXIF camera metadata
      .resize({ width: config.width, withoutEnlargement: true }) // Resize to width, do not enlarge if smaller
      .webp({ quality: config.quality }) // Compress & convert to WebP
      .toFile(destPath); // Write to disk

    filenames[sizeKey] = filename;
    relativePaths[sizeKey] = dbPath;
  }

  return relativePaths;
}

/**
 * Process property images and save them.
 * @param {number} propertyId Property ID
 * @param {Object} files Object containing files for main, interior, and facility
 */
async function processPropertyImages(propertyId, files) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  // Subdirectory path format: listings/YYYY/MM/listing-{id}
  const relativeSubDir = `media/listings/${year}/${month}/listing-${propertyId}`;
  
  // Local filesystem path (mapped to storage/public)
  const localDir = path.resolve(
    process.env.LISTING_STORAGE_PATH || './storage/public/listings',
    `${year}/${month}/listing-${propertyId}`
  );

  // Ensure directory exists
  await fs.mkdir(localDir, { recursive: true });

  const processedImages = [];
  const generatedFiles = [];

  try {
    const positions = ['main', 'interior', 'facility'];

    for (let index = 0; index < positions.length; index++) {
      const posName = positions[index];
      const file = files[posName][0]; // Multer field returns array of files

      // Process and save images
      const relativePaths = await processAndSaveImage(
        file.buffer,
        posName,
        localDir,
        `media/listings/${year}/${month}/listing-${propertyId}`
      );

      // Track files created to clean up on error
      Object.values(relativePaths).forEach((p) => {
        const basename = path.basename(p);
        generatedFiles.push(path.join(localDir, basename));
      });

      processedImages.push({
        position: index + 1, // 1 = main, 2 = interior, 3 = facility
        paths: relativePaths,
      });
    }

    return processedImages;
  } catch (error) {
    logger.error(`Error processing images for listing ${propertyId}: ${error.message}`);
    // Rollback: delete any files created
    for (const filePath of generatedFiles) {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        logger.error(`Failed to delete orphaned file during fallback: ${filePath}. Error: ${err.message}`);
      }
    }
    throw error;
  }
}

/**
 * Delete images related to a listing from the filesystem.
 */
async function deletePropertyImagesFiles(imagesList) {
  for (const img of imagesList) {
    // Relative paths in db look like: /media/listings/YYYY/MM/listing-ID/filename.webp
    // Map to local file: storage/public/listings/YYYY/MM/listing-ID/filename.webp
    const relativePart = img.thumbnail_path.replace(/^\/media\/listings\//, '');
    const localPath = path.resolve(
      process.env.LISTING_STORAGE_PATH || './storage/public/listings',
      relativePart
    );
    const parentDir = path.dirname(localPath);

    // Delete thumbnail, medium, and full files
    const sizes = [img.thumbnail_path, img.medium_path, img.full_path];
    for (const sizePath of sizes) {
      try {
        const fileBase = path.basename(sizePath);
        const fullLocalPath = path.join(parentDir, fileBase);
        await fs.unlink(fullLocalPath);
      } catch (err) {
        logger.warn(`Could not delete file ${sizePath}: ${err.message}`);
      }
    }

    // Try deleting the listing directory if empty
    try {
      const filesInDir = await fs.readdir(parentDir);
      if (filesInDir.length === 0) {
        await fs.rmdir(parentDir);
      }
    } catch (err) {
      // Ignore if directory deletion fails or is not empty
    }
  }
}

module.exports = {
  processPropertyImages,
  deletePropertyImagesFiles,
};
