const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const AVATAR_SIZE = 320;

function getAvatarStorageRoot() {
  return path.resolve(process.env.AVATAR_STORAGE_PATH || './storage/public/avatars');
}

async function processAvatar(userId, buffer) {
  const storageRoot = getAvatarStorageRoot();
  const userDirectory = path.join(storageRoot, `user-${userId}`);
  await fs.mkdir(userDirectory, { recursive: true });

  const filename = `avatar-${crypto.randomUUID()}.webp`;
  const destination = path.join(userDirectory, filename);

  await sharp(buffer)
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(destination);

  return `/media/avatars/user-${userId}/${filename}`;
}

async function deleteLocalAvatar(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith('/media/avatars/')) return;

  const storageRoot = getAvatarStorageRoot();
  const relativePath = avatarUrl.slice('/media/avatars/'.length);
  const target = path.resolve(storageRoot, relativePath);
  const relativeToRoot = path.relative(storageRoot, target);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return;

  try {
    await fs.unlink(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { processAvatar, deleteLocalAvatar };
