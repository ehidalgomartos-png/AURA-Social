const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { storeMedia } = require('../services/mediaStorage');

const router = express.Router();
const tempDir = path.join(__dirname, '..', '..', 'tmp');
fs.mkdirSync(tempDir, { recursive: true });

const imageMax = Number(process.env.MAX_IMAGE_MB || 15) * 1024 * 1024;
const videoMax = Number(process.env.MAX_VIDEO_MB || 120) * 1024 * 1024;

const upload = multer({
  dest: tempDir,
  limits: { fileSize: Math.max(imageMax, videoMax) },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'];
    cb(allowed.includes(file.mimetype) ? null : new Error('unsupported_media_type'), allowed.includes(file.mimetype));
  }
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file_required' });
  const isImage = req.file.mimetype.startsWith('image/');
  const max = isImage ? imageMax : videoMax;
  if (req.file.size > max) {
    fs.unlink(req.file.path, () => {});
    return res.status(413).json({ error: 'file_too_large' });
  }

  try {
    const stored = await storeMedia(req.file);
    res.status(201).json({
      ok: true,
      media: {
        ...stored,
        mediaType: isImage ? 'image' : 'video',
        originalName: req.file.originalname,
        size: req.file.size
      }
    });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    console.error(error);
    res.status(500).json({ error: 'media_upload_failed' });
  }
});

module.exports = router;
