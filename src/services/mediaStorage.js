const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const UPLOADS = path.join(ROOT, 'uploads');

function safeExt(originalName, mime) {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  if (ext && ext.length <= 6) return ext;
  const byMime = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'
  };
  return byMime[mime] || '';
}

async function uploadLocal(file) {
  await fs.mkdir(UPLOADS, { recursive: true });
  const name = `${Date.now()}-${crypto.randomUUID()}${safeExt(file.originalname, file.mimetype)}`;
  const finalPath = path.join(UPLOADS, name);
  await fs.rename(file.path, finalPath);
  return { provider: 'local', url: `/uploads/${name}`, externalId: name };
}

async function uploadBunnyImage(file) {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const key = process.env.BUNNY_STORAGE_API_KEY;
  const publicBase = String(process.env.BUNNY_STORAGE_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!zone || !key || !publicBase) throw new Error('bunny_storage_not_configured');

  const date = new Date();
  const rel = `aura/${date.getUTCFullYear()}/${String(date.getUTCMonth()+1).padStart(2,'0')}/${crypto.randomUUID()}${safeExt(file.originalname, file.mimetype)}`;
  const bytes = await fs.readFile(file.path);
  const response = await fetch(`https://storage.bunnycdn.com/${zone}/${rel}`, {
    method: 'PUT', headers: { AccessKey: key, 'Content-Type': 'application/octet-stream' }, body: bytes
  });
  if (!response.ok) throw new Error(`bunny_storage_upload_failed_${response.status}`);
  await fs.unlink(file.path).catch(() => {});
  return { provider: 'bunny-storage', url: `${publicBase}/${rel}`, externalId: rel };
}

async function uploadBunnyVideo(file) {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const key = process.env.BUNNY_STREAM_API_KEY;
  const hostname = String(process.env.BUNNY_STREAM_CDN_HOSTNAME || '').replace(/^https?:\/\//,'').replace(/\/$/,'');
  if (!libraryId || !key) throw new Error('bunny_stream_not_configured');

  const create = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: 'POST',
    headers: { AccessKey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: file.originalname || `AURA-${Date.now()}` })
  });
  if (!create.ok) throw new Error(`bunny_stream_create_failed_${create.status}`);
  const meta = await create.json();
  const guid = meta.guid || meta.id;
  if (!guid) throw new Error('bunny_stream_missing_guid');

  const bytes = await fs.readFile(file.path);
  const uploaded = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${guid}`, {
    method: 'PUT',
    headers: { AccessKey: key, 'Content-Type': 'application/octet-stream' },
    body: bytes
  });
  if (!uploaded.ok) throw new Error(`bunny_stream_upload_failed_${uploaded.status}`);
  await fs.unlink(file.path).catch(() => {});

  return {
    provider: 'bunny-stream',
    url: `https://iframe.mediadelivery.net/embed/${libraryId}/${guid}`,
    playbackUrl: hostname ? `https://${hostname}/${guid}/playlist.m3u8` : null,
    externalId: guid
  };
}

async function storeMedia(file) {
  const mode = process.env.MEDIA_STORAGE || 'local';
  if (mode !== 'bunny') return uploadLocal(file);
  if (file.mimetype.startsWith('image/')) return uploadBunnyImage(file);
  if (file.mimetype.startsWith('video/')) return uploadBunnyVideo(file);
  throw new Error('unsupported_media_type');
}

module.exports = { storeMedia };
