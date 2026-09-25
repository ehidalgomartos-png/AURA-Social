require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./src/routes/auth');
const profileRoutes = require('./src/routes/profiles');
const postRoutes = require('./src/routes/posts');
const moderationRoutes = require('./src/routes/moderation');
const adminRoutes = require('./src/routes/admin');
const mediaRoutes = require('./src/routes/media');
const storyRoutes = require('./src/routes/stories');
const messageRoutes = require('./src/routes/messages');
const notificationRoutes = require('./src/routes/notifications');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      frameSrc: ["'self'", 'https://iframe.mediadelivery.net'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  fallthrough: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '0.3.0',
    mode: 'adult-social',
    media: process.env.MEDIA_STORAGE || 'local',
    features: [
      '18-plus-registration','profiles','feed','discover','content-classification',
      'nsfw-gating','creator-verification-state','media-upload','bunny-ready',
      'stories','reels','reports','blocking','admin-moderation','responsive-social-ui',
      'private-messaging','sensitive-message-consent','notifications','post-participant-consent','consent-revocation','pwa'
    ]
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin-recovery', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-recovery.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`AURA V0.3.0 running on http://localhost:${PORT}`));
