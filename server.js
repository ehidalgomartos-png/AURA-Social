require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const db = require('./src/db');

const authRoutes = require('./src/routes/auth');
const profileRoutes = require('./src/routes/profiles');
const postRoutes = require('./src/routes/posts');
const moderationRoutes = require('./src/routes/moderation');
const adminRoutes = require('./src/routes/admin');
const mediaRoutes = require('./src/routes/media');
const storyRoutes = require('./src/routes/stories');
const messageRoutes = require('./src/routes/messages');
const notificationRoutes = require('./src/routes/notifications');
const growthRoutes = require('./src/routes/growth');
const trustRoutes = require('./src/routes/trust');
const creatorWorkflowRoutes = require('./src/routes/creator-workflow');
const liveRoutes = require('./src/routes/live');
const pushRoutes = require('./src/routes/push');
const communityRoutes = require('./src/routes/communities');
const searchRoutes = require('./src/routes/search');
const eventRoutes = require('./src/routes/events');
const shareRoutes = require('./src/routes/shares');
const { startPushWorker, isPushConfigured } = require('./src/services/push');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

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
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null
    }
  }
}));

app.use(rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/uploads', express.static(UPLOAD_DIR, {
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
app.use('/api/growth', growthRoutes);
app.use('/api/trust', trustRoutes);
app.use('/api/creator', creatorWorkflowRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/shares', shareRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '1.64.0',
    mode: 'redlibertad-social',
    media: process.env.MEDIA_STORAGE || 'local',
    features: [
      '18-plus-registration','profiles','feed','discover','content-classification',
      'nsfw-gating','creator-verification-state','media-upload','bunny-ready',
      'stories','reels','reports','blocking','admin-moderation','responsive-social-ui',
      'private-messaging','sensitive-message-consent','notifications','post-participant-consent','consent-revocation','pwa','social-sharing','public-post-links','mobile-first-branding','mobile-experience-v1.1','mobile-composer','mobile-chat-single-pane','mobile-share-cta','mobile-nav-badges','admin-hidden-discovery','clipboard-http-fallback','mobile-polish-v1.1.1','text-only-posts','social-feed-v1.2','toggle-likes','post-edit-delete','relative-timestamps','composer-counter','discovery-v1.3','hashtag-navigation','post-search','trending-content','saved-posts','engagement-rankings','smart-suggestions','visual-refresh-v1.4','glass-mobile-nav','animated-stories','microinteractions','view-transitions','card-depth-system','profile-mobile-hotfix','persistent-media-hotfix','cross-filesystem-upload-fallback','profile-avatar-layer-hotfix','community-v1.5','clickable-mentions','mention-notifications','reposts','repost-feed-propagation','followers-following-lists','internal-post-sharing','profiles-v1.6','profile-content-tabs','mutual-connections','profile-deep-links','activity-v1.6','notification-filters','notification-deep-navigation','post-focus-viewer','retention-v1.7','home-catchup','daily-highlights','recently-active-people','last-visit-momentum','new-content-badge','growth-v1.8','referral-links','referral-attribution','onboarding-checklist','invite-sharing','growth-metrics','privacy-v1.9','message-privacy','discoverability-controls','activity-visibility','mute-users','block-management','muted-feed-filter','privacy-center','account-security-v1.10','revocable-sessions','password-change','logout-all-sessions','account-data-export','self-service-account-deletion','local-media-cleanup','trust-safety-v1.11','moderation-history','timed-suspensions','user-warnings','admin-user-actions','report-context','auto-suspension-expiry','verification-trust-v1.12','self-service-verification-requests','verification-review-queue','verification-history','public-trust-badges','creator-hub-v1.13','creator-analytics','featured-profile-posts','creator-profile-v1.14','creator-public-links','aggregate-link-clicks','creator-audience-v1.15','creator-broadcasts','broadcast-cooldown','broadcast-privacy-controls','creator-engagement-v1.16','active-audience-30d','private-top-fans','top-content-analytics','creator-vip-v1.17','private-vip-circle','vip-broadcasts','vip-follower-validation','exclusive-content-v1.18','vip-post-audience','vip-access-enforcement','vip-share-protection','vip-stories-v1.19','exclusive-vip-feed','vip-new-content-signal','vip-story-viewer','vip-free-access','creator-publishing-v1.20','creator-drafts','scheduled-posts','publishing-queue','consent-aware-scheduling','server-publish-scheduler','creator-calendar-v1.21','private-editorial-date','private-editorial-labels','calendar-audience-filter','creator-community-v1.22','creator-polls','open-creator-questions','private-community-inbox','aggregate-poll-results','community-management-v1.23','close-community-tools','archive-community-tools','private-starred-responses','community-status-filters','community-insights-v1.24','creator-community-notifications','first-participation-dedup','community-7d-30d-metrics','community-14d-trend','community-activity-v1.25','community-review-state','grouped-community-activity','review-all-community-activity','community-follow-up-v1.26','private-activity-notes','activity-priority','activity-follow-up','activity-focus-filters','follow-up-dashboard-v1.27','follow-up-due-windows','private-note-search','bulk-follow-up-actions','follow-up-date-index','follow-up-local-day-summary','follow-up-priority-filter','follow-up-quick-complete','follow-up-history-v1.28','follow-up-completed-at','follow-up-reopen','follow-up-reschedule-presets','follow-up-bulk-reschedule','creator-tasks-v1.29','creator-reminders','private-task-priority','creator-task-relations','creator-crm-v1.30','private-contact-notes','creator-contact-labels','creator-contact-priority','audience-segments-v1.31','automatic-audience-segments','manual-audience-segments','creator-communications-v1.32','communication-drafts','scheduled-communications','segmented-communications','communication-history','advanced-creator-analytics-v1.33','period-comparison','creator-growth-analytics','community-recurrence','community-automation-v1.34','creator-automation-rules','automation-hourly-runner','automation-idempotent-tasks','creator-hub-2-v1.35','creator-hub-command-center','creator-hub-area-navigation','creator-hub-live-summary','messaging-2-v1.36','conversation-pin','conversation-archive','conversation-mute','conversation-search','conversation-unread-filter','discovery-2-v1.37','personalized-explore','discovery-hide-post','discovery-hide-person','profiles-2-v1.38','profile-status','profile-social-context','profile-consented-activity','stories-reels-2-v1.39','story-view-signals','story-seen-rings','reel-view-signals','reel-ranked-feed','retention-growth-2-v1.40','cross-device-return-summary','return-pulse','unseen-story-reel-counts','muted-message-notification-fix','comments-2-v1.41','comment-replies','comment-thread-context','reply-notifications','live-activity-2-v1.42','server-sent-events','live-message-badges','live-notification-badges','live-active-chat-refresh','reels-immersive-2-v1.43','vertical-reel-snap','reel-autoplay-muted','reel-auto-pause','reduced-motion-safe-reels','connections-2-v1.44','mutual-follow-connections','connections-explore','connection-direct-message','connection-profile-signal','pwa-performance-2-v1.45','safe-shell-cache','static-stale-while-revalidate','offline-app-navigation','feed-content-visibility','async-image-decoding','chat-presence-v1.46','private-online-status','typing-indicator','message-read-receipts','message-replies-v1.47','message-reactions','sensitive-safe-reply-preview','live-reaction-sync','web-push-v1.48','push-device-opt-in','push-deep-links','push-job-queue','vapid-optional','mobile-social-polish-v1.49','visual-viewport-chat','per-view-scroll-memory','connectivity-banner','coarse-pointer-targets','reduced-motion-polish','group-chats-2-v1.50','group-membership','group-live-presence','group-read-receipts','group-sensitive-consent','group-history-privacy','share-to-chat-v1.51','connection-circles-v1.52','private-connection-circles','favorite-connections','connection-circle-filters','structured-shared-posts','share-chat-picker','shared-post-privacy-gate','shared-post-unavailable-marker','connections-center-2-v1.53','connection-search','connection-social-filters','connection-recent-conversation-signal','community-conversations-v1.54','conversation-resume-signals','gentle-social-continuity','connection-context-v1.55','shared-connection-context','conversation-starter-drafts','public-activity-context','private-audiences-v1.56','connections-audience','circle-audience-posts','circle-audience-stories','private-audience-share-protection','close-connections-v1.57','private-close-circle','close-connections-feed','close-audience-shortcut','social-communities-v1.58','community-discovery-v1.59','community-categories','community-interests','community-suggestion-hide','explainable-community-ranking','public-private-communities','community-membership','community-join-requests','community-rules','community-posts-comments','community-moderation','community-group-chat','events-meetups-v1.60','event-rsvp','event-private-audiences','event-reminders','event-attendee-privacy','collaborative-posts-v1.61','collaborative-reels','collaboration-approval','collaboration-profile-surface','collaboration-revocation','collaborator-management','advanced-mentions-sharing-v1.62','mention-privacy','mention-autocomplete','private-circle-mentions','audience-safe-sharing','profile-story-sharing','community-post-sharing','private-share-history','share-context','community-moderation-3-v1.63','social-search-2-v1.64','global-search','search-private-content-guard','local-search-history','community-moderators','community-report-queue','temporary-community-sanctions','coordinated-report-signals','private-community-moderation-log'
    ]
  });
});


function escapeHtml(value='') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function absoluteUrl(req, value='') {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const configured = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const base = configured || `${req.protocol}://${req.get('host')}`;
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
}

let publicPostAudienceV18Ready=null;
async function ensurePublicPostAudienceV18(){
  if(!publicPostAudienceV18Ready){
    publicPostAudienceV18Ready=db.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public'")
      .catch(error=>{
        publicPostAudienceV18Ready=null;
        throw error;
      });
  }
  return publicPostAudienceV18Ready;
}
app.get('/p/:id', async (req, res) => {
  try {
    await ensurePublicPostAudienceV18();
    const result = await db.query(`
      SELECT p.id,p.caption,p.media_url,p.media_type,p.content_level,p.post_kind,p.created_at,
             u.username,u.display_name
        FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.id=$1 AND p.moderation_status='published' AND p.audience='public' AND u.status='active'
       LIMIT 1
    `,[req.params.id]);
    if (!result.rowCount) return res.status(404).send('Publicación no encontrada.');
    const post=result.rows[0];
    const origin=String(process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
    const publicUrl=`${origin}/p/${encodeURIComponent(post.id)}`;
    const title='Mira mi post en RedLibertad';
    const description=post.caption ? post.caption.slice(0,180) : 'Donde la libertad es lo primero.';
    const ogImage=`${origin}/assets/og-redlibertad.png`;
    const mediaAllowed=post.content_level==='normal' && post.media_type==='image' && post.media_url;
    const media=!post.media_url ? '' : mediaAllowed ? `<img class="shared-media" src="${escapeHtml(absoluteUrl(req,post.media_url))}" alt="Publicación de ${escapeHtml(post.display_name)}">` : `<div class="shared-lock"><b>${post.content_level==='normal'?'Publicación en RedLibertad':'Contenido protegido'}</b><span>${post.content_level==='normal'?'Abre RedLibertad para ver la publicación.':'El contenido sensible no se muestra fuera de la comunidad.'}</span></div>`;
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(publicUrl)}"><meta property="og:image" content="${escapeHtml(ogImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(ogImage)}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><style>.shared-page{min-height:100vh;display:grid;place-items:center;padding:24px}.shared-card{width:min(620px,100%);background:var(--paper);border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:var(--shadow)}.shared-head{padding:20px;display:flex;gap:12px;align-items:center}.shared-head img{width:44px;height:44px}.shared-head small{display:block;color:var(--muted)}.shared-media{width:100%;max-height:70vh;object-fit:contain;background:#101923;display:block}.shared-lock{min-height:300px;display:grid;place-items:center;text-align:center;padding:40px;background:linear-gradient(135deg,var(--navy),var(--navy2));color:white}.shared-lock b,.shared-lock span{display:block}.shared-lock span{color:rgba(255,255,255,.72);margin-top:8px}.shared-copy{padding:20px}.shared-copy p{line-height:1.6;color:var(--muted)}.shared-copy .button{width:100%}</style></head><body><main class="shared-page"><article class="shared-card"><div class="shared-head"><img src="/assets/logo-mark.svg" alt=""><div><b>${escapeHtml(post.display_name)}</b><small>@${escapeHtml(post.username)} · RedLibertad</small></div></div>${media}<div class="shared-copy">${post.caption?`<p>${escapeHtml(post.caption)}</p>`:''}<a class="button" href="/app">Ver en RedLibertad</a></div></article></main></body></html>`);
  } catch (error) {
    console.error('RedLibertad public post error:', error);
    res.status(500).send('No se pudo cargar la publicación.');
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin-recovery', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-recovery.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`RedLibertad V1.64.0 running on http://localhost:${PORT}`));

startPushWorker()
  .then(()=>console.log(`RedLibertad Web Push ${isPushConfigured() ? 'enabled' : 'disabled (VAPID not configured)'}`))
  .catch(error=>console.error('RedLibertad push worker startup failed:',error));


eventRoutes.startReminderWorker?.()
  .then(()=>console.log('RedLibertad event reminder worker enabled'))
  .catch(error=>console.error('RedLibertad event reminder worker startup failed:',error));
