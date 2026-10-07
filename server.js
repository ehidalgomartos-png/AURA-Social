require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const relationshipRoutes = require('./src/routes/relationships');
const eventRoutes = require('./src/routes/events');
const shareRoutes = require('./src/routes/shares');
const supportRoutes = require('./src/routes/support');
const releaseControlRoutes = require('./src/routes/release-control');
const { startPushWorker, isPushConfigured } = require('./src/services/push');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const APP_VERSION='1.76.0';

function configurationStatus(){
  const missing=[];
  const warnings=[];
  const jwtSecret=String(process.env.JWT_SECRET || '');
  const appOrigin=String(process.env.APP_ORIGIN || '').trim();
  const production=String(process.env.NODE_ENV || '').toLowerCase()==='production';

  if(!process.env.DATABASE_URL)missing.push('DATABASE_URL');
  if(!jwtSecret)missing.push('JWT_SECRET');
  else if(jwtSecret.length<32)warnings.push('JWT_SECRET should be at least 32 characters');

  if(production && !appOrigin)warnings.push('APP_ORIGIN is recommended in production');
  if(production && appOrigin && !/^https:\/\//i.test(appOrigin))warnings.push('APP_ORIGIN should use HTTPS in production');
  if(production && String(process.env.COOKIE_SECURE || '').toLowerCase()!=='true')warnings.push('COOKIE_SECURE should be true in production');
  if((process.env.MEDIA_STORAGE || 'local')==='local' && !process.env.UPLOAD_DIR)warnings.push('UPLOAD_DIR should point to persistent storage for local media');

  return {
    ready:missing.length===0,
    missing,
    warnings,
    environment:production?'production':'non-production'
  };
}

const bootConfig=configurationStatus();
if(!bootConfig.ready){
  console.error('RedLibertad critical configuration missing:',bootConfig.missing);
}
for(const warning of bootConfig.warnings){
  console.warn('RedLibertad configuration warning:',warning);
}

async function ensurePerformanceIndexesV168(){
  const statements=[
    'CREATE INDEX IF NOT EXISTS idx_likes_post_created ON likes(post_id,created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_follows_following_follower ON follows(following_id,follower_id)',
    'CREATE INDEX IF NOT EXISTS idx_blocks_blocked_blocker ON blocks(blocked_id,blocker_id)',
    "CREATE INDEX IF NOT EXISTS idx_posts_published_created ON posts(created_at DESC) WHERE moderation_status='published'"
  ];
  for(const statement of statements)await db.query(statement);
}

app.set('trust proxy', 1);

app.use((req,res,next)=>{
  const incoming=String(req.get('x-request-id') || '').trim();
  req.requestId=/^[A-Za-z0-9._:-]{1,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id',req.requestId);
  if(req.path.startsWith('/api/')){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Pragma','no-cache');
  }
  next();
});

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
app.use('/api/auth/register', rateLimit({windowMs:15*60*1000,max:8,standardHeaders:true,legacyHeaders:false,message:{error:'too_many_registration_attempts'}}));
app.use('/api/auth/login', rateLimit({windowMs:15*60*1000,max:30,standardHeaders:true,legacyHeaders:false,message:{error:'too_many_login_attempts'}}));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req,res,next)=>{
  const started=process.hrtime.bigint();
  res.on('finish',()=>{
    if(!req.path.startsWith('/api/'))return;
    const elapsedMs=Number(process.hrtime.bigint()-started)/1e6;
    if(elapsedMs>=1500){
      console.warn('RedLibertad slow API request',{
        method:req.method,
        path:req.path,
        status:res.statusCode,
        elapsedMs:Math.round(elapsedMs)
      });
    }
  });
  next();
});

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
app.use('/api/relationships', relationshipRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/release', releaseControlRoutes);

app.get('/api/health', (_req, res) => {
  const config=configurationStatus();
  res.json({
    ok: true,
    version: APP_VERSION,
    mode: 'redlibertad-social',
    uptimeSeconds:Math.round(process.uptime()),
    environment:config.environment,
    configuration:{criticalReady:config.ready,warnings:config.warnings.length},
    media: process.env.MEDIA_STORAGE || 'local',
    features: [
      '18-plus-registration','profiles','feed','discover','content-classification',
      'nsfw-gating','creator-verification-state','media-upload','bunny-ready',
      'stories','reels','reports','blocking','admin-moderation','responsive-social-ui',
      'private-messaging','sensitive-message-consent','notifications','post-participant-consent','consent-revocation','pwa','social-sharing','public-post-links','mobile-first-branding','mobile-experience-v1.1','mobile-composer','mobile-chat-single-pane','mobile-share-cta','mobile-nav-badges','admin-hidden-discovery','clipboard-http-fallback','mobile-polish-v1.1.1','text-only-posts','social-feed-v1.2','toggle-likes','post-edit-delete','relative-timestamps','composer-counter','discovery-v1.3','hashtag-navigation','post-search','trending-content','saved-posts','engagement-rankings','smart-suggestions','visual-refresh-v1.4','glass-mobile-nav','animated-stories','microinteractions','view-transitions','card-depth-system','profile-mobile-hotfix','persistent-media-hotfix','cross-filesystem-upload-fallback','profile-avatar-layer-hotfix','community-v1.5','clickable-mentions','mention-notifications','reposts','repost-feed-propagation','followers-following-lists','internal-post-sharing','profiles-v1.6','profile-content-tabs','mutual-connections','profile-deep-links','activity-v1.6','notification-filters','notification-deep-navigation','post-focus-viewer','retention-v1.7','home-catchup','daily-highlights','recently-active-people','last-visit-momentum','new-content-badge','growth-v1.8','referral-links','referral-attribution','onboarding-checklist','invite-sharing','growth-metrics','privacy-v1.9','message-privacy','discoverability-controls','activity-visibility','mute-users','block-management','muted-feed-filter','privacy-center','account-security-v1.10','revocable-sessions','password-change','logout-all-sessions','account-data-export','self-service-account-deletion','local-media-cleanup','trust-safety-v1.11','moderation-history','timed-suspensions','user-warnings','admin-user-actions','report-context','auto-suspension-expiry','verification-trust-v1.12','self-service-verification-requests','verification-review-queue','verification-history','public-trust-badges','creator-hub-v1.13','creator-analytics','featured-profile-posts','creator-profile-v1.14','creator-public-links','aggregate-link-clicks','creator-audience-v1.15','creator-broadcasts','broadcast-cooldown','broadcast-privacy-controls','creator-engagement-v1.16','active-audience-30d','private-top-fans','top-content-analytics','creator-vip-v1.17','private-vip-circle','vip-broadcasts','vip-follower-validation','exclusive-content-v1.18','vip-post-audience','vip-access-enforcement','vip-share-protection','vip-stories-v1.19','exclusive-vip-feed','vip-new-content-signal','vip-story-viewer','vip-free-access','creator-publishing-v1.20','creator-drafts','scheduled-posts','publishing-queue','consent-aware-scheduling','server-publish-scheduler','creator-calendar-v1.21','private-editorial-date','private-editorial-labels','calendar-audience-filter','creator-community-v1.22','creator-polls','open-creator-questions','private-community-inbox','aggregate-poll-results','community-management-v1.23','close-community-tools','archive-community-tools','private-starred-responses','community-status-filters','community-insights-v1.24','creator-community-notifications','first-participation-dedup','community-7d-30d-metrics','community-14d-trend','community-activity-v1.25','community-review-state','grouped-community-activity','review-all-community-activity','community-follow-up-v1.26','private-activity-notes','activity-priority','activity-follow-up','activity-focus-filters','follow-up-dashboard-v1.27','follow-up-due-windows','private-note-search','bulk-follow-up-actions','follow-up-date-index','follow-up-local-day-summary','follow-up-priority-filter','follow-up-quick-complete','follow-up-history-v1.28','follow-up-completed-at','follow-up-reopen','follow-up-reschedule-presets','follow-up-bulk-reschedule','creator-tasks-v1.29','creator-reminders','private-task-priority','creator-task-relations','creator-crm-v1.30','private-contact-notes','creator-contact-labels','creator-contact-priority','audience-segments-v1.31','automatic-audience-segments','manual-audience-segments','creator-communications-v1.32','communication-drafts','scheduled-communications','segmented-communications','communication-history','advanced-creator-analytics-v1.33','period-comparison','creator-growth-analytics','community-recurrence','community-automation-v1.34','creator-automation-rules','automation-hourly-runner','automation-idempotent-tasks','creator-hub-2-v1.35','creator-hub-command-center','creator-hub-area-navigation','creator-hub-live-summary','messaging-2-v1.36','conversation-pin','conversation-archive','conversation-mute','conversation-search','conversation-unread-filter','discovery-2-v1.37','personalized-explore','discovery-hide-post','discovery-hide-person','profiles-2-v1.38','profile-status','profile-social-context','profile-consented-activity','stories-reels-2-v1.39','story-view-signals','story-seen-rings','reel-view-signals','reel-ranked-feed','retention-growth-2-v1.40','cross-device-return-summary','return-pulse','unseen-story-reel-counts','muted-message-notification-fix','comments-2-v1.41','comment-replies','comment-thread-context','reply-notifications','live-activity-2-v1.42','server-sent-events','live-message-badges','live-notification-badges','live-active-chat-refresh','reels-immersive-2-v1.43','vertical-reel-snap','reel-autoplay-muted','reel-auto-pause','reduced-motion-safe-reels','connections-2-v1.44','mutual-follow-connections','connections-explore','connection-direct-message','connection-profile-signal','pwa-performance-2-v1.45','safe-shell-cache','static-stale-while-revalidate','offline-app-navigation','feed-content-visibility','async-image-decoding','chat-presence-v1.46','private-online-status','typing-indicator','message-read-receipts','message-replies-v1.47','message-reactions','sensitive-safe-reply-preview','live-reaction-sync','web-push-v1.48','push-device-opt-in','push-deep-links','push-job-queue','vapid-optional','mobile-social-polish-v1.49','visual-viewport-chat','per-view-scroll-memory','connectivity-banner','coarse-pointer-targets','reduced-motion-polish','group-chats-2-v1.50','group-membership','group-live-presence','group-read-receipts','group-sensitive-consent','group-history-privacy','share-to-chat-v1.51','connection-circles-v1.52','private-connection-circles','favorite-connections','connection-circle-filters','structured-shared-posts','share-chat-picker','shared-post-privacy-gate','shared-post-unavailable-marker','connections-center-2-v1.53','connection-search','connection-social-filters','connection-recent-conversation-signal','community-conversations-v1.54','conversation-resume-signals','gentle-social-continuity','connection-context-v1.55','shared-connection-context','conversation-starter-drafts','public-activity-context','private-audiences-v1.56','connections-audience','circle-audience-posts','circle-audience-stories','private-audience-share-protection','close-connections-v1.57','private-close-circle','close-connections-feed','close-audience-shortcut','social-communities-v1.58','community-discovery-v1.59','community-categories','community-interests','community-suggestion-hide','explainable-community-ranking','public-private-communities','community-membership','community-join-requests','community-rules','community-posts-comments','community-moderation','community-group-chat','events-meetups-v1.60','event-rsvp','event-private-audiences','event-reminders','event-attendee-privacy','collaborative-posts-v1.61','collaborative-reels','collaboration-approval','collaboration-profile-surface','collaboration-revocation','collaborator-management','advanced-mentions-sharing-v1.62','mention-privacy','mention-autocomplete','private-circle-mentions','audience-safe-sharing','profile-story-sharing','community-post-sharing','private-share-history','share-context','community-moderation-3-v1.63','social-search-2-v1.64','relationship-intelligence-v1.65','relationship-shared-interests','relationship-shared-communities','relationship-reconnect-signals','explainable-relationship-suggestions','private-relationship-hide','growth-onboarding-2-v1.66','opaque-invite-links','starter-connection-suggestions','auth-abuse-rate-limits','legacy-referral-compatibility','accessibility-ux-quality-2-v1.67','skip-links','dialog-focus-trap','keyboard-dialog-controls','visible-focus','screen-reader-live-regions','forced-colors-support','performance-reliability-2-v1.68','api-timeout-retry','get-request-deduplication','feed-race-guard','lazy-avatar-loading','database-pool-hardening','performance-query-indexes','readiness-check','graceful-shutdown','slow-api-observability','mobile-ux-final-polish-3-v1.69','mobile-safe-area-polish','mobile-bottom-sheet-polish','horizontal-filter-strips','mobile-retry-states','mobile-form-zoom-guard','product-maturity-launch-readiness-v1.70','request-id-tracing','api-no-store','api-json-404','safe-api-error-envelope','configuration-readiness','launch-checklist','beta-launch-real-user-operations-v1.71','aggregate-activation-metrics','privacy-preserving-product-metrics','admin-operational-incidents','beta-health-console','beta-feedback-support-center-v1.72','user-feedback-center','support-status-tracking','safe-technical-context','admin-feedback-queue','feedback-rate-limit','beta-cohorts-release-control-v1.73','release-feature-kill-switch','cohort-targeting','per-user-feature-evaluation','admin-release-console','support-center-release-gate','release-audit-safe-rollback-v1.74','release-before-after-snapshots','release-actor-audit','rollback-conflict-guard','transactional-release-rollback','release-request-correlation','controlled-rollout-waves-v1.75','deterministic-percentage-rollout','rollout-freeze','beta-graduation','rollout-stage-audit','message-profile-ui-hotfix-v1.75.1','collapsed-message-reactions','received-message-reaction-picker','desktop-profile-header-fix','reply-profile-layer-hotfix-v1.75.2','own-reply-label-fix','desktop-profile-avatar-layer-fix','message-own-actions-hotfix-v1.75.3','received-message-actions-only','production-domain-public-launch-polish-v1.76','canonical-public-origin','canonical-share-links','public-robots-sitemap','public-post-canonical','sensitive-post-noindex','stable-pwa-id','global-search','search-private-content-guard','local-search-history','community-moderators','community-report-queue','temporary-community-sanctions','coordinated-report-signals','private-community-moderation-log'
    ]
  });
});


app.get('/api/public-config',(req,res)=>{
  const origin=String(process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
  res.json({origin,version:APP_VERSION});
});

app.get('/api/ready', async (req,res)=>{
  const started=Date.now();
  const config=configurationStatus();
  if(!config.ready){
    return res.status(503).json({
      ok:false,
      error:'configuration_incomplete',
      missing:config.missing,
      version:APP_VERSION,
      requestId:req.requestId
    });
  }
  try{
    await db.query('SELECT 1');
    res.json({
      ok:true,
      database:'ready',
      latencyMs:Date.now()-started,
      version:APP_VERSION,
      configuration:{warnings:config.warnings.length},
      requestId:req.requestId
    });
  }catch(error){
    console.error('RedLibertad readiness check failed:',{requestId:req.requestId,message:error?.message || error});
    res.status(503).json({ok:false,database:'unavailable',version:APP_VERSION,requestId:req.requestId});
  }
});

app.use('/api',(req,res)=>{
  res.status(404).json({error:'api_not_found',path:req.originalUrl,requestId:req.requestId});
});

app.use('/api',(error,req,res,next)=>{
  if(res.headersSent)return next(error);
  console.error('RedLibertad API error',{
    requestId:req.requestId,
    method:req.method,
    path:req.originalUrl,
    message:error?.message || String(error)
  });
  res.status(Number(error?.status)||500).json({
    error:'internal_server_error',
    requestId:req.requestId
  });
});

function escapeHtml(value='') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function publicOrigin(req){
  return String(process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
}
function absoluteUrl(req, value='') {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base=publicOrigin(req);
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
    const origin=publicOrigin(req);
    const publicUrl=`${origin}/p/${encodeURIComponent(post.id)}`;
    const title='Mira mi post en RedLibertad';
    const description=post.caption ? post.caption.slice(0,180) : 'Donde la libertad es lo primero.';
    const ogImage=`${origin}/assets/og-redlibertad.png`;
    const mediaAllowed=post.content_level==='normal' && post.media_type==='image' && post.media_url;
    const media=!post.media_url ? '' : mediaAllowed ? `<img class="shared-media" src="${escapeHtml(absoluteUrl(req,post.media_url))}" alt="Publicación de ${escapeHtml(post.display_name)}">` : `<div class="shared-lock"><b>${post.content_level==='normal'?'Publicación en RedLibertad':'Contenido protegido'}</b><span>${post.content_level==='normal'?'Abre RedLibertad para ver la publicación.':'El contenido sensible no se muestra fuera de la comunidad.'}</span></div>`;
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${post.content_level==='normal'?'index,follow':'noindex,nofollow'}"><link rel="canonical" href="${escapeHtml(publicUrl)}"><meta property="og:site_name" content="RedLibertad"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(publicUrl)}"><meta property="og:image" content="${escapeHtml(ogImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(ogImage)}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><style>.shared-page{min-height:100vh;display:grid;place-items:center;padding:24px}.shared-card{width:min(620px,100%);background:var(--paper);border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:var(--shadow)}.shared-head{padding:20px;display:flex;gap:12px;align-items:center}.shared-head img{width:44px;height:44px}.shared-head small{display:block;color:var(--muted)}.shared-media{width:100%;max-height:70vh;object-fit:contain;background:#101923;display:block}.shared-lock{min-height:300px;display:grid;place-items:center;text-align:center;padding:40px;background:linear-gradient(135deg,var(--navy),var(--navy2));color:white}.shared-lock b,.shared-lock span{display:block}.shared-lock span{color:rgba(255,255,255,.72);margin-top:8px}.shared-copy{padding:20px}.shared-copy p{line-height:1.6;color:var(--muted)}.shared-copy .button{width:100%}</style></head><body><main class="shared-page"><article class="shared-card"><div class="shared-head"><img src="/assets/logo-mark.svg" alt=""><div><b>${escapeHtml(post.display_name)}</b><small>@${escapeHtml(post.username)} · RedLibertad</small></div></div>${media}<div class="shared-copy">${post.caption?`<p>${escapeHtml(post.caption)}</p>`:''}<a class="button" href="/app">Ver en RedLibertad</a></div></article></main></body></html>`);
  } catch (error) {
    console.error('RedLibertad public post error:', error);
    res.status(500).send('No se pudo cargar la publicación.');
  }
});


let publicProfileSeoV177Ready=null;
async function ensurePublicProfileSeoV177(){
  if(!publicProfileSeoV177Ready){
    publicProfileSeoV177Ready=db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_public_profile_seo
        ON users(discoverable,updated_at DESC)
        WHERE status='active' AND is_admin=false
    `).catch(error=>{
      publicProfileSeoV177Ready=null;
      throw error;
    });
  }
  return publicProfileSeoV177Ready;
}

app.get('/perfil/:username',async(req,res)=>{
  try{
    await Promise.all([ensurePublicProfileSeoV177(),ensurePublicPostAudienceV18()]);
    const result=await db.query(`
      SELECT
        u.id,u.username,u.display_name,u.bio,u.avatar_url,u.cover_url,
        u.creator_headline,u.age_verified,u.creator_verified,u.discoverable,
        u.created_at,u.updated_at,
        (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) follower_count,
        (SELECT count(*)::int FROM posts p
          WHERE p.user_id=u.id
            AND p.moderation_status='published'
            AND p.audience='public') public_post_count
      FROM users u
      WHERE lower(u.username)=lower($1)
        AND u.status='active'
        AND u.is_admin=false
      LIMIT 1
    `,[req.params.username]);
    if(!result.rowCount)return res.status(404).send('Perfil no encontrado.');

    const profile=result.rows[0];
    const origin=publicOrigin(req);
    const publicUrl=`${origin}/perfil/${encodeURIComponent(profile.username)}`;
    const indexable=profile.discoverable===true;
    const title=`${profile.display_name} (@${profile.username}) — RedLibertad`;
    const description=String(profile.creator_headline || profile.bio || 'Perfil en RedLibertad — Donde la libertad es lo primero.').trim().slice(0,180);
    const defaultOg=`${origin}/assets/og-redlibertad.png`;
    const avatar=profile.avatar_url ? absoluteUrl(req,profile.avatar_url) : '';
    const cover=profile.cover_url ? absoluteUrl(req,profile.cover_url) : '';
    const ogImage=indexable && avatar ? avatar : defaultOg;
    const badge=profile.creator_verified
      ? '<span class="public-profile-badge">✓ Creador verificado</span>'
      : profile.age_verified
        ? '<span class="public-profile-badge subtle">✓ +18 verificado</span>'
        : '';
    const structured=indexable ? `<script type="application/ld+json">${JSON.stringify({
      '@context':'https://schema.org',
      '@type':'Person',
      name:profile.display_name,
      alternateName:'@'+profile.username,
      url:publicUrl,
      description,
      image:ogImage
    }).replace(/</g,'\\u003c')}</script>` : '';

    res.type('html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${indexable?'index,follow,max-image-preview:large':'noindex,nofollow'}">
  <link rel="canonical" href="${escapeHtml(publicUrl)}">
  <meta property="og:site_name" content="RedLibertad">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(publicUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
  ${structured}
  <style>
    .public-profile-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg)}
    .public-profile-card{width:min(760px,100%);overflow:hidden;border:1px solid var(--line);border-radius:28px;background:var(--paper);box-shadow:var(--shadow)}
    .public-profile-cover{height:220px;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--navy),var(--teal))}
    .public-profile-cover img{width:100%;height:100%;object-fit:cover;display:block}
    .public-profile-body{position:relative;padding:0 28px 28px}
    .public-profile-avatar{width:112px;height:112px;border-radius:50%;object-fit:cover;background:var(--navy);border:5px solid var(--paper);margin-top:-56px;box-shadow:0 12px 30px rgba(13,34,56,.16)}
    .public-profile-avatar.placeholder{display:grid;place-items:center;color:#fff;font:800 34px Manrope,sans-serif}
    .public-profile-title{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px}
    .public-profile-title h1{margin:0;font:800 clamp(24px,4vw,38px) Manrope,sans-serif;color:var(--navy)}
    .public-profile-handle{display:block;color:var(--muted);margin-top:3px}
    .public-profile-badge{display:inline-flex;padding:6px 9px;border-radius:999px;background:rgba(43,183,169,.12);color:#0c675b;font-size:10px;font-weight:800}
    .public-profile-badge.subtle{background:#f1f4f3;color:var(--muted)}
    .public-profile-copy{margin:18px 0 0;color:var(--muted);line-height:1.6;white-space:pre-wrap}
    .public-profile-stats{display:flex;gap:9px;flex-wrap:wrap;margin:20px 0}
    .public-profile-stat{padding:10px 12px;border-radius:13px;background:#f5f6f3;color:var(--navy);font-size:12px}
    .public-profile-actions{display:flex;gap:10px;flex-wrap:wrap}
    .public-profile-actions .button{flex:1 1 220px;text-align:center}
    .public-profile-note{margin-top:16px;color:var(--muted);font-size:10px}
    @media(max-width:600px){.public-profile-page{padding:0}.public-profile-card{min-height:100vh;border-radius:0;border:0}.public-profile-cover{height:180px}.public-profile-body{padding:0 20px 24px}.public-profile-avatar{width:96px;height:96px;margin-top:-48px}}
  </style>
</head>
<body>
  <main class="public-profile-page">
    <article class="public-profile-card">
      <div class="public-profile-cover">${cover?`<img src="${escapeHtml(cover)}" alt="">`:''}</div>
      <div class="public-profile-body">
        ${avatar
          ? `<img class="public-profile-avatar" src="${escapeHtml(avatar)}" alt="Foto de perfil de ${escapeHtml(profile.display_name)}">`
          : `<div class="public-profile-avatar placeholder" aria-hidden="true">${escapeHtml(String(profile.display_name||profile.username).slice(0,2).toUpperCase())}</div>`}
        <div class="public-profile-title">
          <div>
            <h1>${escapeHtml(profile.display_name)}</h1>
            <span class="public-profile-handle">@${escapeHtml(profile.username)}</span>
          </div>
          ${badge}
        </div>
        ${profile.creator_headline?`<p class="public-profile-copy"><b>${escapeHtml(profile.creator_headline)}</b></p>`:''}
        ${profile.bio?`<p class="public-profile-copy">${escapeHtml(profile.bio)}</p>`:''}
        <div class="public-profile-stats">
          <span class="public-profile-stat"><b>${Number(profile.public_post_count||0)}</b> publicaciones públicas</span>
          <span class="public-profile-stat"><b>${Number(profile.follower_count||0)}</b> seguidores</span>
        </div>
        <div class="public-profile-actions">
          <a class="button" href="/app?profile=${encodeURIComponent(profile.username)}">Ver perfil en RedLibertad</a>
          <a class="button ghost" href="/#registro">Crear cuenta</a>
        </div>
        ${!indexable?'<p class="public-profile-note">Este perfil no participa en la indexación pública de RedLibertad.</p>':''}
      </div>
    </article>
  </main>
</body>
</html>`);
  }catch(error){
    console.error('RedLibertad public profile error:',error);
    res.status(500).send('No se pudo cargar el perfil.');
  }
});

app.get('/sitemap-profiles.xml',async(req,res)=>{
  try{
    await ensurePublicProfileSeoV177();
    const origin=publicOrigin(req);
    const profiles=await db.query(`
      SELECT username,updated_at
        FROM users
       WHERE status='active'
         AND is_admin=false
         AND discoverable=true
       ORDER BY updated_at DESC
       LIMIT 10000
    `);
    const urls=profiles.rows.map(profile=>`<url><loc>${escapeHtml(origin+'/perfil/'+encodeURIComponent(profile.username))}</loc><lastmod>${new Date(profile.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  }catch(error){
    console.error('RedLibertad profile sitemap error:',error);
    res.status(500).type('text/plain').send('Profile sitemap unavailable');
  }
});

app.get('/robots.txt',(req,res)=>{
  const origin=publicOrigin(req);
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Allow: /p/',
    'Allow: /perfil/',
    'Disallow: /app',
    'Disallow: /admin',
    'Disallow: /admin-recovery',
    'Disallow: /api/',
    'Disallow: /uploads/',
    `Sitemap: ${origin}/sitemap.xml`,
    `Sitemap: ${origin}/sitemap-profiles.xml`
  ].join('\n'));
});

app.get('/sitemap.xml',async(req,res)=>{
  try{
    await ensurePublicPostAudienceV18();
    const origin=publicOrigin(req);
    const posts=await db.query(`
      SELECT p.id,p.created_at
        FROM posts p
        JOIN users u ON u.id=p.user_id
       WHERE p.moderation_status='published'
         AND p.audience='public'
         AND p.content_level='normal'
         AND u.status='active'
       ORDER BY p.created_at DESC
       LIMIT 10000
    `);
    const urls=[
      `<url><loc>${escapeHtml(origin+'/')}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...posts.rows.map(post=>`<url><loc>${escapeHtml(origin+'/p/'+encodeURIComponent(post.id))}</loc><lastmod>${new Date(post.created_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`)
    ];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  }catch(error){
    console.error('RedLibertad sitemap error:',error);
    res.status(500).type('text/plain').send('Sitemap unavailable');
  }
});

app.use(express.static(path.join(__dirname, 'public'),{
  setHeaders:(res,filePath)=>{
    if(/\.(?:html)$/i.test(filePath))res.setHeader('Cache-Control','no-cache');
  }
}));
function sendHtmlShell(file){
  return (_req,res)=>{
    res.setHeader('Cache-Control','no-cache');
    res.sendFile(path.join(__dirname,'public',file));
  };
}
app.get('/app', sendHtmlShell('app.html'));
app.get('/admin', sendHtmlShell('admin.html'));
app.get('/admin-recovery', sendHtmlShell('admin-recovery.html'));
app.get('*', sendHtmlShell('index.html'));

const server=app.listen(PORT, () => console.log(`RedLibertad V1.76.0 running on http://localhost:${PORT}`));
server.keepAliveTimeout=5000;
server.headersTimeout=65000;
server.requestTimeout=120000;

let shuttingDown=false;
async function gracefulShutdown(signal){
  if(shuttingDown)return;
  shuttingDown=true;
  console.log(`RedLibertad received ${signal}; shutting down gracefully.`);

  const forceTimer=setTimeout(()=>{
    console.error('RedLibertad graceful shutdown timed out.');
    process.exit(1);
  },12000);
  forceTimer.unref?.();

  server.close(async error=>{
    if(error)console.error('RedLibertad HTTP server close failed:',error);
    try{
      await db.pool.end();
      clearTimeout(forceTimer);
      process.exit(error ? 1 : 0);
    }catch(poolError){
      console.error('RedLibertad PostgreSQL pool close failed:',poolError);
      clearTimeout(forceTimer);
      process.exit(1);
    }
  });
}

process.once('SIGTERM',()=>gracefulShutdown('SIGTERM'));
process.once('SIGINT',()=>gracefulShutdown('SIGINT'));
process.on('unhandledRejection',error=>console.error('RedLibertad unhandled rejection:',error));

ensurePerformanceIndexesV168()
  .then(()=>console.log('RedLibertad V1.68 performance indexes ready'))
  .catch(error=>console.error('RedLibertad V1.68 performance index bootstrap failed:',error));

startPushWorker()
  .then(()=>console.log(`RedLibertad Web Push ${isPushConfigured() ? 'enabled' : 'disabled (VAPID not configured)'}`))
  .catch(error=>console.error('RedLibertad push worker startup failed:',error));


eventRoutes.startReminderWorker?.()
  .then(()=>console.log('RedLibertad event reminder worker enabled'))
  .catch(error=>console.error('RedLibertad event reminder worker startup failed:',error));
