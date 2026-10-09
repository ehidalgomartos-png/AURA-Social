require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const db = require('./src/db');
const { createAbuseGuard } = require('./src/services/abuse-guard');
const { setPerformanceHeaders, setUploadHeaders } = require('./src/services/performance-headers');
const { createRuntimeMonitor, classifyApiPath } = require('./src/services/runtime-monitor-v213');
const { createDependencyInspector } = require('./src/services/dependency-inspector-v214');
const { createRecoveryAdminRoutes } = require('./src/routes/admin-recovery-v214');
const { createOperationalAlertService } = require('./src/services/operational-alerts-v215');
const { createOperationalAlertAdminRoutes } = require('./src/routes/admin-alerts-v215');
const { createAlertDeliveryService } = require('./src/services/alert-delivery-v216');
const { createAlertDeliveryAdminRoutes } = require('./src/routes/admin-delivery-v216');
const { createReleaseVerifier } = require('./src/services/release-verifier-v217');
const { createReleaseVerificationRoutes } = require('./src/routes/admin-release-verification-v217');
const { createRuntimeAdminRoutes } = require('./src/routes/admin-runtime-v213');
const { requireAuth } = require('./src/middleware/auth');

const authRoutes = require('./src/routes/auth');
const profileRoutes = require('./src/routes/profiles');
const postRoutes = require('./src/routes/posts');
const moderationRoutes = require('./src/routes/moderation');
const adminRoutes = require('./src/routes/admin');
const adminEditorialV320Routes = require('./src/routes/admin-editorial-v320');
const adminEditorialInboxV321Routes = require('./src/routes/admin-editorial-inbox-v321');
const {router:adminEditorialReviewV322Routes} = require('./src/routes/admin-editorial-review-v322');
const {admin:editorialPublishV323Admin,publicRouter:editorialPublishV323Public}=require('./src/routes/editorial-publication-v323');
const {router:editorialQualityV325Admin}=require('./src/routes/admin-editorial-quality-v325');
const {router:editorialPlanningV326Admin}=require('./src/routes/admin-editorial-planning-v326');
const editorialDailyV327Admin=require('./src/routes/admin-editorial-daily-v327');
const {router:editorialSocialV324,admin:editorialSocialV324Admin}=require('./src/routes/editorial-social-v324');
const adminSecurityRoutes = require('./src/routes/admin-security-v211');
const adminVerificationV1891Routes = require('./src/routes/admin-verification-v1891');
const adminSeoV190Routes = require('./src/routes/admin-seo-v190');
const {publicProfileSeo,safeJsonLd}=require('./src/services/public-profile-seo-v302');
const {createGrowthCenterRouter}=require('./src/routes/admin-growth-v219');
const mediaRoutes = require('./src/routes/media');
const storyRoutes = require('./src/routes/stories');
const messageRoutes = require('./src/routes/messages');
const notificationRoutes = require('./src/routes/notifications');
const growthRoutes = require('./src/routes/growth');
const retentionV220Routes = require('./src/routes/retention-v220').router;
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
const publicCommunitySeoV180Routes = require('./src/public-community-seo-v180');
const publicEventSeoV181Routes = require('./src/public-event-seo-v181');
const publicMediaSeoV182Routes = require('./src/public-media-seo-v182');
const publicSearchV183Routes = require('./src/public-search-v183');
const publicDiscoveryV184Routes = require('./src/public-discovery-v184');
const publicTopicsV185Routes = require('./src/public-topics-v185');
const publicStoriesV186Routes = require('./src/public-stories-v186');
const publicGuidesV218 = require('./src/public-guides-v218');
const { startPushWorker, isPushConfigured } = require('./src/services/push');

const app = express();
const runtimeMonitor=createRuntimeMonitor();
const PORT = Number(process.env.PORT || 3000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const APP_VERSION='3.2.17';
const releaseVerifier=createReleaseVerifier({port:PORT,version:APP_VERSION});
const dependencyInspector=createDependencyInspector({
  db,pool:db.pool,uploadsDir:UPLOAD_DIR,mediaMode:process.env.MEDIA_STORAGE||'local',
  pushConfigured:isPushConfigured
});
const operationalAlerts=createOperationalAlertService({db,runtimeMonitor,dependencyInspector});
const alertDelivery=createAlertDeliveryService({db});

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

app.use(runtimeMonitor.middleware);

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

function rateLimitRetrySeconds(req,fallbackSeconds=900){
  const reset=req.rateLimit?.resetTime;
  if(reset instanceof Date){
    return Math.max(1,Math.ceil((reset.getTime()-Date.now())/1000));
  }
  return fallbackSeconds;
}

const registrationNetworkLimiter=rateLimit({
  windowMs:15*60*1000,
  max:120,
  standardHeaders:true,
  legacyHeaders:false,
  handler:(req,res)=>{
    res.status(429).json({
      error:'too_many_registration_attempts',
      scope:'network',
      retryAfterSeconds:rateLimitRetrySeconds(req)
    });
  }
});

const registrationIdentityLimiter=rateLimit({
  windowMs:15*60*1000,
  max:12,
  standardHeaders:true,
  legacyHeaders:false,
  keyGenerator:(req)=>{
    const email=String(req.body?.email||'').trim().toLowerCase();
    const username=String(req.body?.username||'').trim().toLowerCase();
    const identity=(email||username)?`${email}|${username}`:'missing-registration-identity';
    return crypto.createHash('sha256').update(identity).digest('hex');
  },
  handler:(req,res)=>{
    res.status(429).json({
      error:'too_many_registration_attempts',
      scope:'identity',
      retryAfterSeconds:rateLimitRetrySeconds(req)
    });
  }
});

app.use(rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/register', registrationNetworkLimiter);
app.use('/api/auth/login', rateLimit({windowMs:15*60*1000,max:30,standardHeaders:true,legacyHeaders:false,message:{error:'too_many_login_attempts'}}));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/api/auth/register', registrationIdentityLimiter);

app.use('/uploads', express.static(UPLOAD_DIR, {
  fallthrough: false,
  maxAge: '1h',
  setHeaders: setUploadHeaders
}));

app.use(createAbuseGuard({db,requireAuth}));
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/admin', adminVerificationV1891Routes);
app.use('/api/admin', adminSeoV190Routes);
app.use('/api/admin', createGrowthCenterRouter({db}));
app.use('/api/admin', createRuntimeAdminRoutes(runtimeMonitor));
app.use('/api/admin', createRecoveryAdminRoutes(dependencyInspector));
app.use('/api/admin', createOperationalAlertAdminRoutes({db,service:operationalAlerts}));
app.use('/api/admin', createAlertDeliveryAdminRoutes({db,delivery:alertDelivery}));
app.use('/api/admin', createReleaseVerificationRoutes(releaseVerifier));
app.use('/api/admin', adminSecurityRoutes);
app.use('/api/admin/editorial', editorialDailyV327Admin);
app.use('/api/admin/editorial', editorialPlanningV326Admin);
app.use('/api/admin/editorial', editorialQualityV325Admin);
app.use('/api/admin/editorial', editorialSocialV324Admin);
app.use('/api/admin/editorial', editorialPublishV323Admin);
app.use('/api/admin/editorial', adminEditorialReviewV322Routes);
app.use('/api/admin/editorial', adminEditorialInboxV321Routes);
app.use('/api/admin/editorial', adminEditorialV320Routes);
app.use('/api/admin', adminRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/growth', retentionV220Routes);
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
app.use('/api/editorial-social', editorialSocialV324);
app.use('/noticias', editorialPublishV323Public);
app.use(publicCommunitySeoV180Routes);
app.use(publicEventSeoV181Routes);
app.use(publicMediaSeoV182Routes);
app.use(publicSearchV183Routes);
app.use(publicDiscoveryV184Routes);
app.use(publicTopicsV185Routes);
app.use(publicStoriesV186Routes);
app.use(publicGuidesV218.router);

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
      'private-messaging','sensitive-message-consent','notifications','post-participant-consent','consent-revocation','pwa','social-sharing','public-post-links','mobile-first-branding','mobile-experience-v1.1','mobile-composer','mobile-chat-single-pane','mobile-share-cta','mobile-nav-badges','admin-hidden-discovery','clipboard-http-fallback','mobile-polish-v1.1.1','text-only-posts','social-feed-v1.2','toggle-likes','post-edit-delete','relative-timestamps','composer-counter','discovery-v1.3','hashtag-navigation','post-search','trending-content','saved-posts','engagement-rankings','smart-suggestions','visual-refresh-v1.4','glass-mobile-nav','animated-stories','microinteractions','view-transitions','card-depth-system','profile-mobile-hotfix','persistent-media-hotfix','cross-filesystem-upload-fallback','profile-avatar-layer-hotfix','community-v1.5','clickable-mentions','mention-notifications','reposts','repost-feed-propagation','followers-following-lists','internal-post-sharing','profiles-v1.6','profile-content-tabs','mutual-connections','profile-deep-links','activity-v1.6','notification-filters','notification-deep-navigation','post-focus-viewer','retention-v1.7','home-catchup','daily-highlights','recently-active-people','last-visit-momentum','new-content-badge','growth-v1.8','referral-links','referral-attribution','onboarding-checklist','invite-sharing','growth-metrics','privacy-v1.9','message-privacy','discoverability-controls','activity-visibility','mute-users','block-management','muted-feed-filter','privacy-center','community-kickstart-v3.1.0','first-community-guidance','privacy-safe-community-discovery','mobile-navigation-polish-v3.0.6','opaque-dock','svg-mobile-icons','own-profile-full-posts-v3.0.5','own-profile-feed-interactions','production-safety-audit-v3.0.4','persistent-media-check','complete-sitemap-audit','public-profile-experience-v3.0.3','full-width-visited-profiles','readable-public-posts','smart-profile-plurals','public-profile-search-snippets-v3.0.2','google-profilepage-schema','seo-ui-hotfix-v3.0.1','search-console-sitemap-validity','stories-unseen-shortcut','profile-cover-contain','connections-contrast','growth-ready-v3.0','external-public-gate','configuration-preflight','community-return-v2.20','joined-community-snooze','growth-center-v2.19','first-week-activation','eligible-d1-d7-cohorts','guide-attribution-schema','seo-acquisition-guides-v2.18','public-editorial-guides','safe-guide-signup-attribution','release-verification-v2.17','local-health-smoke','release-pwa-checks','alert-delivery-v2.16','optional-outbound-critical-alerts','delivery-retry-audit','operational-alerts-v2.15','operational-alert-audit','persistent-incident-inbox','operational-recovery-center-v2.14','dependency-checks','media-volume-health','runtime-observability-v2.13','private-aggregate-metrics','admin-runtime-diagnostics','performance-v2.12','bounded-pwa-cache','prioritized-feed-media','private-upload-cache','advanced-abuse-protection-v2.11','account-security-v1.10','revocable-sessions','password-change','logout-all-sessions','account-data-export','self-service-account-deletion','local-media-cleanup','trust-safety-v1.11','moderation-history','timed-suspensions','user-warnings','admin-user-actions','report-context','auto-suspension-expiry','verification-trust-v1.12','self-service-verification-requests','verification-review-queue','verification-history','public-trust-badges','creator-hub-v1.13','creator-analytics','featured-profile-posts','creator-profile-v1.14','creator-public-links','aggregate-link-clicks','creator-audience-v1.15','creator-broadcasts','broadcast-cooldown','broadcast-privacy-controls','creator-engagement-v1.16','active-audience-30d','private-top-fans','top-content-analytics','creator-vip-v1.17','private-vip-circle','vip-broadcasts','vip-follower-validation','exclusive-content-v1.18','vip-post-audience','vip-access-enforcement','vip-share-protection','vip-stories-v1.19','exclusive-vip-feed','vip-new-content-signal','vip-story-viewer','vip-free-access','creator-publishing-v1.20','creator-drafts','scheduled-posts','publishing-queue','consent-aware-scheduling','server-publish-scheduler','creator-calendar-v1.21','private-editorial-date','private-editorial-labels','calendar-audience-filter','creator-community-v1.22','creator-polls','open-creator-questions','private-community-inbox','aggregate-poll-results','community-management-v1.23','close-community-tools','archive-community-tools','private-starred-responses','community-status-filters','community-insights-v1.24','creator-community-notifications','first-participation-dedup','community-7d-30d-metrics','community-14d-trend','community-activity-v1.25','community-review-state','grouped-community-activity','review-all-community-activity','community-follow-up-v1.26','private-activity-notes','activity-priority','activity-follow-up','activity-focus-filters','follow-up-dashboard-v1.27','follow-up-due-windows','private-note-search','bulk-follow-up-actions','follow-up-date-index','follow-up-local-day-summary','follow-up-priority-filter','follow-up-quick-complete','follow-up-history-v1.28','follow-up-completed-at','follow-up-reopen','follow-up-reschedule-presets','follow-up-bulk-reschedule','creator-tasks-v1.29','creator-reminders','private-task-priority','creator-task-relations','creator-crm-v1.30','private-contact-notes','creator-contact-labels','creator-contact-priority','audience-segments-v1.31','automatic-audience-segments','manual-audience-segments','creator-communications-v1.32','communication-drafts','scheduled-communications','segmented-communications','communication-history','advanced-creator-analytics-v1.33','period-comparison','creator-growth-analytics','community-recurrence','community-automation-v1.34','creator-automation-rules','automation-hourly-runner','automation-idempotent-tasks','creator-hub-2-v1.35','creator-hub-command-center','creator-hub-area-navigation','creator-hub-live-summary','messaging-2-v1.36','conversation-pin','conversation-archive','conversation-mute','conversation-search','conversation-unread-filter','discovery-2-v1.37','personalized-explore','discovery-hide-post','discovery-hide-person','profiles-2-v1.38','profile-status','profile-social-context','profile-consented-activity','stories-reels-2-v1.39','story-view-signals','story-seen-rings','reel-view-signals','reel-ranked-feed','retention-growth-2-v1.40','cross-device-return-summary','return-pulse','unseen-story-reel-counts','muted-message-notification-fix','comments-2-v1.41','comment-replies','comment-thread-context','reply-notifications','live-activity-2-v1.42','server-sent-events','live-message-badges','live-notification-badges','live-active-chat-refresh','reels-immersive-2-v1.43','vertical-reel-snap','reel-autoplay-muted','reel-auto-pause','reduced-motion-safe-reels','connections-2-v1.44','mutual-follow-connections','connections-explore','connection-direct-message','connection-profile-signal','pwa-performance-2-v1.45','safe-shell-cache','static-stale-while-revalidate','offline-app-navigation','feed-content-visibility','async-image-decoding','chat-presence-v1.46','private-online-status','typing-indicator','message-read-receipts','message-replies-v1.47','message-reactions','sensitive-safe-reply-preview','live-reaction-sync','web-push-v1.48','push-device-opt-in','push-deep-links','push-job-queue','vapid-optional','mobile-social-polish-v1.49','visual-viewport-chat','per-view-scroll-memory','connectivity-banner','coarse-pointer-targets','reduced-motion-polish','group-chats-2-v1.50','group-membership','group-live-presence','group-read-receipts','group-sensitive-consent','group-history-privacy','share-to-chat-v1.51','connection-circles-v1.52','private-connection-circles','favorite-connections','connection-circle-filters','structured-shared-posts','share-chat-picker','shared-post-privacy-gate','shared-post-unavailable-marker','connections-center-2-v1.53','connection-search','connection-social-filters','connection-recent-conversation-signal','community-conversations-v1.54','conversation-resume-signals','gentle-social-continuity','connection-context-v1.55','shared-connection-context','conversation-starter-drafts','public-activity-context','private-audiences-v1.56','connections-audience','circle-audience-posts','circle-audience-stories','private-audience-share-protection','close-connections-v1.57','private-close-circle','close-connections-feed','close-audience-shortcut','social-communities-v1.58','community-discovery-v1.59','community-categories','community-interests','community-suggestion-hide','explainable-community-ranking','public-private-communities','community-membership','community-join-requests','community-rules','community-posts-comments','community-moderation','community-group-chat','events-meetups-v1.60','event-rsvp','event-private-audiences','event-reminders','event-attendee-privacy','collaborative-posts-v1.61','collaborative-reels','collaboration-approval','collaboration-profile-surface','collaboration-revocation','collaborator-management','advanced-mentions-sharing-v1.62','mention-privacy','mention-autocomplete','private-circle-mentions','audience-safe-sharing','profile-story-sharing','community-post-sharing','private-share-history','share-context','community-moderation-3-v1.63','social-search-2-v1.64','relationship-intelligence-v1.65','relationship-shared-interests','relationship-shared-communities','relationship-reconnect-signals','explainable-relationship-suggestions','private-relationship-hide','growth-onboarding-2-v1.66','opaque-invite-links','starter-connection-suggestions','auth-abuse-rate-limits','legacy-referral-compatibility','accessibility-ux-quality-2-v1.67','skip-links','dialog-focus-trap','keyboard-dialog-controls','visible-focus','screen-reader-live-regions','forced-colors-support','performance-reliability-2-v1.68','api-timeout-retry','get-request-deduplication','feed-race-guard','lazy-avatar-loading','database-pool-hardening','performance-query-indexes','readiness-check','graceful-shutdown','slow-api-observability','mobile-ux-final-polish-3-v1.69','mobile-safe-area-polish','mobile-bottom-sheet-polish','horizontal-filter-strips','mobile-retry-states','mobile-form-zoom-guard','product-maturity-launch-readiness-v1.70','request-id-tracing','api-no-store','api-json-404','safe-api-error-envelope','configuration-readiness','launch-checklist','beta-launch-real-user-operations-v1.71','aggregate-activation-metrics','privacy-preserving-product-metrics','admin-operational-incidents','beta-health-console','beta-feedback-support-center-v1.72','user-feedback-center','support-status-tracking','safe-technical-context','admin-feedback-queue','feedback-rate-limit','beta-cohorts-release-control-v1.73','release-feature-kill-switch','cohort-targeting','per-user-feature-evaluation','admin-release-console','support-center-release-gate','release-audit-safe-rollback-v1.74','release-before-after-snapshots','release-actor-audit','rollback-conflict-guard','transactional-release-rollback','release-request-correlation','controlled-rollout-waves-v1.75','deterministic-percentage-rollout','rollout-freeze','beta-graduation','rollout-stage-audit','message-profile-ui-hotfix-v1.75.1','collapsed-message-reactions','received-message-reaction-picker','desktop-profile-header-fix','reply-profile-layer-hotfix-v1.75.2','own-reply-label-fix','desktop-profile-avatar-layer-fix','message-own-actions-hotfix-v1.75.3','received-message-actions-only','production-domain-public-launch-polish-v1.76','canonical-public-origin','canonical-share-links','public-robots-sitemap','public-post-canonical','sensitive-post-noindex','stable-pwa-id','public-profiles-profile-seo-v1.77','clean-public-profile-urls','profile-canonical-og','profile-person-structured-data','discoverability-profile-noindex','profile-sitemap','clean-profile-share-links','public-discovery-seo-hub-v1.78','public-profiles-directory','public-profile-search-noindex','public-profile-pagination','public-itemlist-structured-data','sitemap-index','public-internal-profile-links','public-content-discovery-seo-v1.79','public-posts-directory','public-post-search-noindex','public-hashtag-pages','public-hashtag-sitemap','discoverability-post-noindex','public-content-itemlist','public-content-pagination','public-communities-community-seo-v1.80','public-communities-directory','public-community-pages','public-community-sitemap','public-community-content-privacy','public-events-event-seo-v1.81','public-events-directory','public-event-pages','public-event-sitemap','public-event-privacy','public-reels-media-seo-v1.82','public-reels-directory','public-media-directory','public-reel-pages','public-reels-sitemap','public-media-privacy','public-search-unified-discovery-v1.83','public-search-page','public-search-privacy','public-discovery-hub-v1.84','public-trending-discovery','public-topics-interest-hubs-v1.85','public-topics-directory','public-topic-pages','public-topics-sitemap','public-story-sharing-v1.86','public-stories-directory','public-story-expiry-guard','public-share-social-preview-v1.87','public-entry-signup-attribution-v1.88','signup-attribution','safe-auth-return','growth-attribution-dashboard-v1.89','growth-attribution-admin','verification-independence-v1.89.1','verification-revoke','seo-crawl-health-v1.90','reel-canonical-cleanup','admin-seo-health','global-search','search-private-content-guard','local-search-history','community-moderators','community-report-queue','temporary-community-sanctions','coordinated-report-signals','private-community-moderation-log','mobile-profile-declutter-v1.90.2','profile-visual-polish-v1.90.3','profile-more-menu-hotfix-v1.90.3.1','public-entry-conversion-v1.91','safe-public-return-v1.91','mobile-public-entry-bar-v1.92','public-entry-cta-dedupe-v1.92','public-post-detail-polish-v1.92.1','public-media-mobile-polish-v1.92.1','social-share-preview-v1.92.2','versioned-og-image-v1.92.2','public-social-proof-v1.93','public-related-discovery-v1.93','registration-rate-limit-hotfix-v1.93.1','registration-identity-throttle-v1.93.1','registration-validation-feedback-v1.93.2','registration-field-labels-v1.93.3','legal-transparency-center-v1.94','legal-signup-consent-v1.94','moderation-transparency-v1.94','momentum-card-cta-v1.94.1','profile-media-preview-v1.95','mobile-pull-to-refresh-v1.95','post-edit-live-refresh-v1.95','comment-icon-polish-v1.95','public-profile-layer-hotfix-v1.95.1','public-navigation-responsive-v1.96','public-header-consistency-v1.96','public-legal-footer-v1.97','public-trust-links-v1.97','legal-consent-versioning-v1.98','legal-consent-audit-v1.98','legal-consent-center-v1.99','legal-consent-user-transparency-v1.99','legal-consent-lifecycle-v2.0','explicit-legal-confirmation-v2.0','legal-consent-timeline-v2.1','legal-version-link-clarity-v2.1','legal-consent-receipt-v2.2','private-legal-export-v2.2','readable-legal-receipt-v2.3','offline-printable-legal-record-v2.3','legal-history-filters-v2.4','local-legal-history-search-v2.4','legal-status-overview-v2.5','pending-legal-documents-v2.5','stability-quality-audit-v2.6','auth-submit-guard-v2.6','pwa-safe-notification-navigation-v2.6','release-smoke-checks-v2.6','social-experience-3-v2.7','comment-retry-and-race-guard-v2.7','mobile-submit-safety-v2.7','preview-memory-cleanup-v2.7','discover-3-v2.8','discovery-modes-v2.8','privacy-aware-activity-ranking-v2.8','suggestions-pagination-v2.8','user-activation-guide-v2.9','activation-next-step-v2.9','starter-profile-privacy-v2.9','notifications-3-v2.10','push-category-preferences-v2.10','unread-notifications-filter-v2.10','notification-read-confirmation-v2.10'
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
    area:classifyApiPath(req.path),
    errorCode:String(error?.code||'unclassified').slice(0,32)
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
function publicEntryHrefV188(type,key,pathValue,anchor='registro'){
  const query=new URLSearchParams({entry:String(type||''),entryKey:String(key||''),next:String(pathValue||'')}).toString();
  return '/?'+query+'#'+(anchor==='acceso'?'acceso':'registro');
}
function publicEntryBarV192(type,key,pathValue){
  const signup=publicEntryHrefV188(type,key,pathValue);
  const login=publicEntryHrefV188(type,key,pathValue,'acceso');
  return `<div class="public-entry-spacer-v192" aria-hidden="true"></div><nav class="public-entry-bar-v192" aria-label="Acceso a RedLibertad"><a class="button" href="${escapeHtml(signup)}">Crear cuenta</a><a class="button ghost" href="${escapeHtml(login)}">Entrar</a></nav>`;
}
function publicLegalFooterV197(){
  return `<footer class="public-legal-footer-v197"><div class="public-legal-brand">RedLibertad · 18+</div><nav aria-label="Información legal"><a href="/legal/">Aviso Legal</a><a href="/privacy/">Privacidad</a><a href="/cookies/">Cookies</a><a href="/terms/">Términos</a><a href="/community-guidelines/">Normas</a><a href="/moderation/">Moderación</a></nav><p class="public-legal-note">Libertad de expresión con límites de legalidad, seguridad y consentimiento.</p></footer>`;
}
function seoSlugV190(value=''){
  return String(value||'reel')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80)||'reel';
}
function publicReelPathV190(post){
  const raw=String(post.caption||'').replace(/\s+/g,' ').trim();
  const name=(raw ? (raw.length>70 ? raw.slice(0,69).trimEnd()+'…' : raw) : ('Reel de '+String(post.display_name||post.username||'RedLibertad')));
  return '/reel/'+encodeURIComponent(post.id)+'/'+encodeURIComponent(seoSlugV190(name));
}
function publicContentPathV190(post){
  return post?.post_kind==='reel' && post?.media_type==='video' && post?.media_url
    ? publicReelPathV190(post)
    : '/p/'+encodeURIComponent(post.id);
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
      SELECT p.id,p.user_id,p.caption,p.media_url,p.media_type,p.content_level,p.post_kind,p.created_at,
             u.username,u.display_name,u.avatar_url,u.creator_verified,u.discoverable,u.is_admin,
             (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
             (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count,
             (SELECT count(*)::int FROM reposts rp WHERE rp.post_id=p.id) repost_count
        FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.id=$1 AND p.moderation_status='published' AND p.audience='public' AND u.status='active'
       LIMIT 1
    `,[req.params.id]);
    if (!result.rowCount) return res.status(404).send('Publicación no encontrada.');
    const post=result.rows[0];
    const origin=publicOrigin(req);
    const publicUrl=`${origin}/p/${encodeURIComponent(post.id)}`;
    const indexable=post.content_level==='normal' && post.discoverable===true && post.is_admin===false;
    if(indexable && post.post_kind==='reel' && post.media_type==='video' && post.media_url){
      return res.redirect(301,publicReelPathV190(post));
    }
    const title='Mira mi post en RedLibertad';
    const description=post.caption ? post.caption.slice(0,180) : 'Donde la libertad es lo primero.';
    const mediaAllowed=post.content_level==='normal' && post.media_type==='image' && post.media_url;
    const ogImage=indexable && mediaAllowed ? absoluteUrl(req,post.media_url) : `${origin}/assets/og-redlibertad-v1922.jpg`;
    const publishedLabel=(()=>{try{return new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Madrid'}).format(new Date(post.created_at));}catch(_){return '';}})();
    const authorAvatar=post.avatar_url
      ? `<img class="shared-avatar" src="${escapeHtml(absoluteUrl(req,post.avatar_url))}" alt="Foto de ${escapeHtml(post.display_name)}">`
      : `<span class="shared-avatar placeholder" aria-hidden="true">${escapeHtml(String(post.display_name||post.username||'R').slice(0,2).toUpperCase())}</span>`;
    const authorName=post.discoverable===true&&!post.is_admin
      ? `<a href="/perfil/${encodeURIComponent(post.username)}"><b>${escapeHtml(post.display_name)}</b></a>`
      : `<b>${escapeHtml(post.display_name)}</b>`;
    const creatorBadge=post.creator_verified?'<span class="shared-creator-badge">✓ Creador</span>':'';
    const textOnly=!post.media_url && Boolean(String(post.caption||'').trim());
    const media=!post.media_url
      ? (textOnly ? `<div class="shared-text-post"><p>${escapeHtml(post.caption)}</p></div>` : '')
      : mediaAllowed
        ? `<img class="shared-media" src="${escapeHtml(absoluteUrl(req,post.media_url))}" alt="Publicación de ${escapeHtml(post.display_name)}">`
        : `<div class="shared-lock"><div><b>${post.content_level==='normal'?'Publicación en RedLibertad':'Contenido protegido'}</b><span>${post.content_level==='normal'?'Abre RedLibertad para ver la publicación.':'El contenido sensible no se muestra fuera de la comunidad.'}</span></div></div>`;
    const caption=!textOnly&&post.caption?`<p class="shared-caption">${escapeHtml(post.caption)}</p>`:'';
    const socialProof=post.content_level==='normal'?`<div class="shared-social-proof" aria-label="Actividad pública"><span><b>${Number(post.like_count||0)}</b><small>Me gusta</small></span><span><b>${Number(post.comment_count||0)}</b><small>Comentarios</small></span><span><b>${Number(post.repost_count||0)}</b><small>Republicaciones</small></span></div>`:'';
    let relatedHtml='';
    if(indexable){
      const relatedResult=await db.query(`
        SELECT p.id,p.caption,p.media_url,p.media_type,p.post_kind,p.created_at,
               (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id) like_count,
               (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id) comment_count
          FROM posts p
         WHERE p.user_id=$1
           AND p.id<>$2
           AND p.moderation_status='published'
           AND p.audience='public'
           AND p.content_level='normal'
         ORDER BY p.created_at DESC,p.id DESC
         LIMIT 3
      `,[post.user_id,post.id]);
      if(relatedResult.rowCount){
        const relatedCards=relatedResult.rows.map(item=>{
          const href=publicContentPathV190({...item,display_name:post.display_name,username:post.username});
          const label=item.post_kind==='reel'?'REEL':'PUBLICACIÓN';
          const copy=String(item.caption||'Contenido de '+post.display_name).replace(/\s+/g,' ').trim();
          const excerpt=copy.length>90?copy.slice(0,89).trimEnd()+'…':copy;
          const thumb=item.media_type==='image'&&item.media_url
            ? `<img src="${escapeHtml(absoluteUrl(req,item.media_url))}" loading="lazy" decoding="async" alt="">`
            : `<span class="shared-related-placeholder">${item.post_kind==='reel'?'▶':'R'}</span>`;
          return `<a class="shared-related-card" href="${escapeHtml(href)}"><span class="shared-related-media">${thumb}</span><span class="shared-related-copy"><small>${label}</small><b>${escapeHtml(excerpt||label)}</b><em>${Number(item.like_count||0)} me gusta · ${Number(item.comment_count||0)} comentarios</em></span></a>`;
        }).join('');
        relatedHtml=`<section class="shared-related"><div class="shared-related-head"><div><small>SEGUIR DESCUBRIENDO</small><h2>Más de ${escapeHtml(post.display_name)}</h2></div><a href="/perfil/${encodeURIComponent(post.username)}">Ver perfil →</a></div><div class="shared-related-grid">${relatedCards}</div></section>`;
      }
    }
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${indexable?'index,follow,max-image-preview:large':'noindex,nofollow'}"><link rel="canonical" href="${escapeHtml(publicUrl)}"><meta property="og:site_name" content="RedLibertad"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(publicUrl)}"><meta property="og:image" content="${escapeHtml(ogImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(ogImage)}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/public-nav-v196.css"><link rel="stylesheet" href="/public-footer-v197.css"><script defer src="/public-share-v187.js"></script><style>
.shared-page{min-height:100vh;padding:0 18px 28px;background:radial-gradient(circle at 92% 3%,rgba(239,94,85,.11),transparent 28rem),linear-gradient(180deg,#f8f5ef 0%,var(--ivory) 100%)}
.shared-shell{width:min(760px,100%);margin:0 auto;padding-top:14px}
.shared-topbar{min-height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;padding:9px 12px;border:1px solid var(--line);border-radius:17px;background:rgba(255,253,249,.92);box-shadow:0 8px 24px rgba(13,34,56,.05)}
.shared-brand{display:flex;align-items:center;gap:8px;color:var(--navy);font-weight:900}.shared-brand img{width:30px;height:30px}
.shared-public-label{font-size:9px;font-weight:900;letter-spacing:.12em;color:var(--teal);text-transform:uppercase}
.shared-card{width:100%;background:var(--paper);border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:0 20px 52px rgba(13,34,56,.10)}
.shared-head{padding:18px 20px;display:flex;gap:11px;align-items:center}.shared-avatar{width:46px;height:46px;flex:0 0 46px;border-radius:50%;object-fit:cover}.shared-avatar.placeholder{display:grid;place-items:center;background:linear-gradient(135deg,var(--navy),var(--teal));color:white;font-weight:900}.shared-author{min-width:0;flex:1}.shared-author-line{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.shared-author small{display:block;margin-top:2px;color:var(--muted)}.shared-creator-badge{display:inline-flex;padding:4px 7px;border-radius:999px;background:rgba(43,183,169,.11);color:#0c675b;font-size:8px;font-weight:900}
.shared-media{width:100%;max-height:72vh;object-fit:contain;background:#101923;display:block}
.shared-text-post{margin:0 20px 4px;min-height:190px;padding:30px 26px;display:flex;align-items:center;border:1px solid rgba(13,34,56,.08);border-radius:20px;background:radial-gradient(circle at 90% 12%,rgba(239,94,85,.16),transparent 34%),radial-gradient(circle at 8% 85%,rgba(43,183,169,.15),transparent 34%),linear-gradient(145deg,#fffdf9,#f3efe8)}
.shared-text-post p{margin:0;color:var(--navy);font:800 clamp(23px,4vw,34px)/1.24 Manrope,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}
.shared-lock{min-height:280px;display:grid;place-items:center;text-align:center;padding:40px;background:linear-gradient(135deg,var(--navy),var(--navy2));color:white}.shared-lock b,.shared-lock span{display:block}.shared-lock span{color:rgba(255,255,255,.72);margin-top:8px}
.shared-copy{padding:18px 20px 20px}.shared-caption{margin:0 0 16px;line-height:1.65;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.shared-join{margin:4px 0 14px;padding:13px 14px;border:1px solid rgba(43,183,169,.16);border-radius:15px;background:rgba(43,183,169,.06)}.shared-join b,.shared-join span{display:block}.shared-join b{color:var(--navy);font-size:13px}.shared-join span{margin-top:3px;color:var(--muted);font-size:11px;line-height:1.45}
.shared-copy .button{width:100%}.shared-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.shared-actions .button{min-width:0}
.shared-social-proof{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:4px 0 14px}.shared-social-proof span{padding:10px 8px;border-radius:13px;background:#f5f6f3;text-align:center}.shared-social-proof b,.shared-social-proof small{display:block}.shared-social-proof b{color:var(--navy);font-size:16px}.shared-social-proof small{margin-top:2px;color:var(--muted);font-size:9px}
.shared-related{margin-top:16px;padding:18px;border:1px solid var(--line);border-radius:22px;background:rgba(255,253,249,.88)}.shared-related-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:12px}.shared-related-head small{color:var(--teal);font-size:8px;font-weight:900;letter-spacing:.12em}.shared-related-head h2{margin:3px 0 0;color:var(--navy);font:800 19px Manrope,sans-serif}.shared-related-head>a{font-size:11px;font-weight:800}.shared-related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.shared-related-card{overflow:hidden;border:1px solid var(--line);border-radius:15px;background:var(--paper);color:inherit;text-decoration:none}.shared-related-media{height:88px;display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,var(--navy),#173d58)}.shared-related-media img{width:100%;height:100%;object-fit:cover}.shared-related-placeholder{color:#fff;font:900 24px Manrope,sans-serif}.shared-related-copy{display:block;padding:10px}.shared-related-copy small,.shared-related-copy b,.shared-related-copy em{display:block}.shared-related-copy small{color:var(--teal);font-size:7px;font-weight:900;letter-spacing:.1em}.shared-related-copy b{margin-top:4px;color:var(--navy);font-size:11px;line-height:1.35}.shared-related-copy em{margin-top:6px;color:var(--muted);font-size:8px;font-style:normal}
@media(max-width:620px){.shared-page{padding:0 10px 18px}.shared-shell{padding-top:8px}.shared-topbar{margin-bottom:10px;border-radius:15px}.shared-card{border-radius:20px}.shared-head{padding:14px}.shared-avatar{width:42px;height:42px;flex-basis:42px}.shared-text-post{margin:0 12px 2px;min-height:160px;padding:24px 18px;border-radius:17px}.shared-text-post p{font-size:clamp(22px,7vw,30px)}.shared-copy{padding:14px}.shared-join{margin-top:2px}.shared-actions{grid-template-columns:1fr}.shared-related{padding:14px;border-radius:18px}.shared-related-grid{grid-template-columns:1fr}.shared-related-card{display:grid;grid-template-columns:82px 1fr}.shared-related-media{height:100%;min-height:82px}.shared-public-label{font-size:8px}}
</style></head><body><main class="shared-page"><div class="shared-shell"><header class="shared-topbar"><a class="shared-brand" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a><span class="shared-public-label">Contenido público</span></header><article class="shared-card"><div class="shared-head">${authorAvatar}<div class="shared-author"><div class="shared-author-line">${authorName}${creatorBadge}</div><small>@${escapeHtml(post.username)}${publishedLabel?' · '+escapeHtml(publishedLabel):''}</small></div></div>${media}<div class="shared-copy">${caption}${socialProof}<div class="shared-join"><b>Participa en la conversación</b><span>Crea tu cuenta para responder, seguir a este creador y descubrir más contenido.</span></div><span class="public-entry-inline-v192"><a class="button" href="${escapeHtml(publicEntryHrefV188('post',post.id,'/p/'+encodeURIComponent(post.id)))}">Crear cuenta para participar</a><a class="button ghost" href="${escapeHtml(publicEntryHrefV188('post',post.id,'/p/'+encodeURIComponent(post.id),'acceso'))}">Entrar y volver aquí</a></span><div class="shared-actions"><button type="button" class="button ghost" data-public-share data-share-title="${escapeHtml(title)}" data-share-text="${escapeHtml(description)}">Compartir publicación</button><a class="button ghost" href="/publicaciones">Descubrir publicaciones</a></div></div></article>${relatedHtml}</div></main>${publicLegalFooterV197()}${publicEntryBarV192('post',post.id,'/p/'+encodeURIComponent(post.id))}</body></html>`);
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
            AND p.audience='public'
            AND p.content_level='normal') public_post_count
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
    const defaultOg=`${origin}/assets/og-redlibertad-v1922.jpg`;
    const avatar=profile.avatar_url ? absoluteUrl(req,profile.avatar_url) : '';
    const cover=profile.cover_url ? absoluteUrl(req,profile.cover_url) : '';
    const seo=publicProfileSeo(profile,{url:publicUrl,avatar:indexable?avatar:''});
    const {title,description}=seo;
    const ogImage=indexable && avatar ? avatar : defaultOg;
    const badge=profile.creator_verified
      ? '<span class="public-profile-badge">✓ Creador verificado</span>'
      : profile.age_verified
        ? '<span class="public-profile-badge subtle">✓ +18 verificado</span>'
        : '';
    const structured=seo.structuredData
      ? '<script type="application/ld+json">'+safeJsonLd(seo.structuredData)+'</script>'
      : '';

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
  <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/public-nav-v196.css"><link rel="stylesheet" href="/public-footer-v197.css">
  <script defer src="/public-share-v187.js"></script>
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
    .public-profile-summary{margin:14px 0 0;color:var(--navy);font-size:15px;line-height:1.6}
    .public-profile-copy{margin:18px 0 0;color:var(--muted);line-height:1.6;white-space:pre-wrap}
    .public-profile-stats{display:flex;gap:9px;flex-wrap:wrap;margin:20px 0}
    .public-profile-stat{padding:10px 12px;border-radius:13px;background:#f5f6f3;color:var(--navy);font-size:12px}
    .public-profile-actions{display:flex;gap:10px;flex-wrap:wrap}
    .public-profile-actions .button{flex:1 1 160px;text-align:center;min-height:46px;display:inline-flex;align-items:center;justify-content:center}
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
        ${seo.summary && !profile.creator_headline && !profile.bio?`<p class="public-profile-summary">${escapeHtml(seo.summary)}</p>`:''}
        ${profile.creator_headline?`<p class="public-profile-copy"><b>${escapeHtml(profile.creator_headline)}</b></p>`:''}
        ${profile.bio?`<p class="public-profile-copy">${escapeHtml(profile.bio)}</p>`:''}
        <div class="public-profile-stats">
          <span class="public-profile-stat"><b>${Number(profile.public_post_count||0)}</b> ${Number(profile.public_post_count)===1?'publicación pública':'publicaciones públicas'}</span>
          <span class="public-profile-stat"><b>${Number(profile.follower_count||0)}</b> ${Number(profile.follower_count)===1?'seguidor':'seguidores'}</span>
        </div>
        <div class="public-profile-actions" data-nosnippet>
          <span class="public-entry-inline-v192">
            <a class="button" href="${escapeHtml(publicEntryHrefV188('profile',profile.username,'/perfil/'+encodeURIComponent(profile.username)))}">Crear cuenta para seguir</a>
            <a class="button ghost" href="${escapeHtml(publicEntryHrefV188('profile',profile.username,'/perfil/'+encodeURIComponent(profile.username),'acceso'))}">Entrar y volver aquí</a>
          </span>
          <a class="button ghost" href="/perfiles">Descubrir perfiles</a>
          <a class="button ghost" href="/publicaciones">Publicaciones públicas</a>
          <button type="button" class="button ghost" data-public-share data-share-title="${escapeHtml(title)}" data-share-text="${escapeHtml(description)}">Compartir perfil</button>
        </div>
        ${!indexable?'<p class="public-profile-note">Este perfil no participa en la indexación pública de RedLibertad.</p>':''}
      </div>
    </article>
  </main>
  <div data-nosnippet>${publicLegalFooterV197()}</div>
  <div data-nosnippet>${publicEntryBarV192('profile',profile.username,'/perfil/'+encodeURIComponent(profile.username))}</div>
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
    if(!urls.length)urls.push(`<url><loc>${escapeHtml(origin+'/perfiles')}</loc><changefreq>weekly</changefreq></url>`);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  }catch(error){
    console.error('RedLibertad profile sitemap error:',error);
    res.status(500).type('text/plain').send('Profile sitemap unavailable');
  }
});


app.get('/perfiles',async(req,res)=>{
  try{
    await Promise.all([ensurePublicProfileSeoV177(),ensurePublicPostAudienceV18()]);
    const origin=publicOrigin(req);
    const rawQuery=String(req.query.q||'').trim().slice(0,60);
    const requestedPage=Math.max(1,Math.min(500,Number.parseInt(req.query.page||'1',10)||1));
    const pageSize=24;
    const pattern=rawQuery ? `%${rawQuery.toLowerCase()}%` : null;

    const countResult=await db.query(`
      SELECT count(*)::int AS n
        FROM users u
       WHERE u.status='active'
         AND u.is_admin=false
         AND u.discoverable=true
         AND (
           $1::text IS NULL
           OR lower(u.username) LIKE $1
           OR lower(u.display_name) LIKE $1
           OR lower(u.bio) LIKE $1
           OR lower(u.creator_headline) LIKE $1
         )
    `,[pattern]);

    const total=Number(countResult.rows[0]?.n||0);
    const totalPages=Math.max(1,Math.ceil(total/pageSize));
    const page=Math.min(requestedPage,totalPages);
    const offset=(page-1)*pageSize;

    const result=await db.query(`
      SELECT
        u.username,u.display_name,u.bio,u.avatar_url,u.creator_headline,
        u.creator_verified,u.age_verified,u.updated_at,
        (SELECT count(*)::int FROM follows f WHERE f.following_id=u.id) follower_count,
        (SELECT count(*)::int FROM posts p
          WHERE p.user_id=u.id
            AND p.moderation_status='published'
            AND p.audience='public'
            AND p.content_level='normal') public_post_count
      FROM users u
      WHERE u.status='active'
        AND u.is_admin=false
        AND u.discoverable=true
        AND (
          $1::text IS NULL
          OR lower(u.username) LIKE $1
          OR lower(u.display_name) LIKE $1
          OR lower(u.bio) LIKE $1
          OR lower(u.creator_headline) LIKE $1
        )
      ORDER BY
        u.creator_verified DESC,
        follower_count DESC,
        public_post_count DESC,
        u.updated_at DESC,
        u.username ASC
      LIMIT $2 OFFSET $3
    `,[pattern,pageSize,offset]);

    const canonical=page>1 ? `${origin}/perfiles?page=${page}` : `${origin}/perfiles`;
    const indexable=!rawQuery;
    const title=rawQuery
      ? `Buscar perfiles: ${rawQuery} — RedLibertad`
      : page>1
        ? `Perfiles públicos — Página ${page} — RedLibertad`
        : 'Perfiles públicos — RedLibertad';
    const description=rawQuery
      ? `Resultados públicos para “${rawQuery}” en RedLibertad.`
      : 'Descubre perfiles públicos en RedLibertad y encuentra personas con las que conectar.';
    const querySuffix=rawQuery ? `&q=${encodeURIComponent(rawQuery)}` : '';
    const previous=page>1
      ? `/perfiles?${page-1>1?`page=${page-1}${querySuffix}`:rawQuery?`q=${encodeURIComponent(rawQuery)}`:''}`
      : '';
    const next=page<totalPages
      ? `/perfiles?page=${page+1}${querySuffix}`
      : '';
    const cards=result.rows.map(profile=>{
      const avatar=profile.avatar_url ? absoluteUrl(req,profile.avatar_url) : '';
      const bio=String(profile.creator_headline || profile.bio || '').trim().slice(0,150);
      const badge=profile.creator_verified
        ? '<span class="directory-badge">✓ Creador</span>'
        : profile.age_verified
          ? '<span class="directory-badge subtle">✓ +18</span>'
          : '';
      return `<article class="directory-card">
        <a class="directory-card-main" href="/perfil/${encodeURIComponent(profile.username)}">
          ${avatar
            ? `<img class="directory-avatar" src="${escapeHtml(avatar)}" loading="lazy" decoding="async" alt="Foto de perfil de ${escapeHtml(profile.display_name)}">`
            : `<span class="directory-avatar placeholder" aria-hidden="true">${escapeHtml(String(profile.display_name||profile.username).slice(0,2).toUpperCase())}</span>`}
          <span class="directory-card-copy">
            <span class="directory-name">${escapeHtml(profile.display_name)} ${badge}</span>
            <span class="directory-handle">@${escapeHtml(profile.username)}</span>
            ${bio?`<span class="directory-bio">${escapeHtml(bio)}</span>`:''}
            <span class="directory-stats"><b>${Number(profile.public_post_count||0)}</b> ${Number(profile.public_post_count)===1?'publicación':'publicaciones'} · <b>${Number(profile.follower_count||0)}</b> ${Number(profile.follower_count)===1?'seguidor':'seguidores'}</span>
          </span>
        </a>
      </article>`;
    }).join('');

    const listStructured=indexable && page===1 ? `<script type="application/ld+json">${JSON.stringify({
      '@context':'https://schema.org',
      '@type':'ItemList',
      name:'Perfiles públicos en RedLibertad',
      itemListElement:result.rows.map((profile,index)=>({
        '@type':'ListItem',
        position:index+1,
        url:`${origin}/perfil/${encodeURIComponent(profile.username)}`,
        name:profile.display_name
      }))
    }).replace(/</g,'\\u003c')}</script>` : '';

    res.type('html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${indexable?'index,follow,max-image-preview:large':'noindex,follow'}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${previous?`<link rel="prev" href="${escapeHtml(origin+previous)}">`:''}
  ${next?`<link rel="next" href="${escapeHtml(origin+next)}">`:''}
  <meta property="og:site_name" content="RedLibertad">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(origin+'/assets/og-redlibertad-v1922.jpg')}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(origin+'/assets/og-redlibertad-v1922.jpg')}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/public-nav-v196.css"><link rel="stylesheet" href="/public-footer-v197.css">
  ${listStructured}
  <style>
    .directory-page{min-height:100vh;background:var(--bg);color:var(--navy)}
    .directory-top{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px max(20px,calc((100vw - 1180px)/2));border-bottom:1px solid var(--line);background:rgba(255,253,249,.94);backdrop-filter:blur(16px)}
    .directory-brand{display:flex;align-items:center;gap:9px;color:var(--navy);font-weight:900;text-decoration:none}
    .directory-brand img{width:34px;height:34px}
    .directory-top-actions{display:flex;gap:8px;align-items:center}
    .directory-shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:46px 0 70px}
    .directory-hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:24px;align-items:end;margin-bottom:28px}
    .directory-hero h1{margin:5px 0 8px;font:800 clamp(30px,5vw,52px) Manrope,sans-serif}
    .directory-hero p{margin:0;color:var(--muted);line-height:1.6}
    .directory-search{display:flex;gap:8px;padding:8px;border:1px solid var(--line);border-radius:16px;background:var(--paper);box-shadow:0 12px 34px rgba(13,34,56,.06)}
    .directory-search input{min-width:0;flex:1;border:0;background:transparent;padding:10px 12px;font:inherit;color:var(--navy);outline:0}
    .directory-count{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:0 0 14px;color:var(--muted);font-size:12px}
    .directory-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .directory-card{min-width:0;border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 9px 25px rgba(13,34,56,.05);transition:transform .16s ease,box-shadow .16s ease}
    .directory-card:hover{transform:translateY(-2px);box-shadow:0 15px 34px rgba(13,34,56,.08)}
    .directory-card-main{display:flex;gap:12px;padding:15px;color:inherit;text-decoration:none}
    .directory-avatar{width:64px;height:64px;flex:0 0 64px;border-radius:50%;object-fit:cover;background:linear-gradient(135deg,var(--navy),var(--teal));border:3px solid #fff;box-shadow:0 7px 18px rgba(13,34,56,.10)}
    .directory-avatar.placeholder{display:grid;place-items:center;color:white;font-weight:900}
    .directory-card-copy{min-width:0;display:grid;align-content:start}
    .directory-name{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-weight:900}
    .directory-handle{margin-top:2px;color:var(--muted);font-size:11px}
    .directory-bio{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.45}
    .directory-stats{margin-top:9px;color:var(--muted);font-size:9px}
    .directory-stats b{color:var(--navy)}
    .directory-badge{display:inline-flex;padding:4px 6px;border-radius:999px;background:rgba(43,183,169,.12);color:#0c675b;font-size:8px}
    .directory-badge.subtle{background:#f1f4f3;color:var(--muted)}
    .directory-empty{padding:38px;border:1px dashed var(--line);border-radius:18px;text-align:center;color:var(--muted);background:var(--paper)}
    .directory-pagination{display:flex;justify-content:center;gap:8px;margin-top:24px;align-items:center}
    .directory-page-label{padding:8px 10px;color:var(--muted);font-size:11px}
    @media(max-width:900px){.directory-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.directory-hero{grid-template-columns:1fr}}
    @media(max-width:620px){.directory-shell{width:min(100% - 20px,1180px);padding-top:28px}.directory-grid{grid-template-columns:1fr}.directory-top{padding:10px 12px}.directory-top-actions .button.ghost{display:none}.directory-search{display:grid;grid-template-columns:1fr auto}.directory-card-main{padding:13px}.directory-avatar{width:58px;height:58px;flex-basis:58px}}
  </style>
</head>
<body>
  <main class="directory-page">
    <header class="directory-top">
      <a class="directory-brand" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a>
      <div class="directory-top-actions">
        <a class="button small ghost" href="/publicaciones">Publicaciones</a>
        <a class="button small ghost" href="/comunidades">Comunidades</a>
        <a class="button small ghost" href="/eventos">Eventos</a>
        <a class="button small ghost" href="/reels">Reels</a>
        <a class="button small ghost" href="/buscar">Buscar</a>
        <a class="button small ghost" href="/#acceso">Entrar</a>
        <a class="button small" href="/#registro">Crear cuenta</a>
      </div>
    </header>
    <div class="directory-shell">
      <section class="directory-hero">
        <div>
          <span class="eyebrow">PERSONAS · COMUNIDAD</span>
          <h1>Perfiles públicos</h1>
          <p>Descubre personas que han decidido participar en la parte pública de RedLibertad.</p>
        </div>
        <form class="directory-search" method="get" action="/perfiles">
          <input name="q" value="${escapeHtml(rawQuery)}" maxlength="60" placeholder="Buscar por nombre, usuario o bio" aria-label="Buscar perfiles">
          <button class="button" type="submit">Buscar</button>
        </form>
      </section>
      <div class="directory-count">
        <span>${rawQuery?`${total} resultados para “${escapeHtml(rawQuery)}”`:`${total} perfiles públicos`}</span>
        ${rawQuery?'<a href="/perfiles">Limpiar búsqueda</a>':''}
      </div>
      ${cards?`<section class="directory-grid" aria-label="Perfiles públicos">${cards}</section>`:'<div class="directory-empty"><b>No encontramos perfiles.</b><p>Prueba otra búsqueda o vuelve más tarde.</p></div>'}
      <nav class="directory-pagination" aria-label="Paginación de perfiles">
        ${previous?`<a class="button ghost small" rel="prev" href="${escapeHtml(previous)}">← Anterior</a>`:''}
        <span class="directory-page-label">Página ${page} de ${totalPages}</span>
        ${next?`<a class="button ghost small" rel="next" href="${escapeHtml(next)}">Siguiente →</a>`:''}
      </nav>
    </div>
  </main>
  ${publicLegalFooterV197()}
</body>
</html>`);
  }catch(error){
    console.error('RedLibertad public profiles directory error:',error);
    res.status(500).send('No se pudo cargar el directorio de perfiles.');
  }
});


let publicContentSeoV179Ready=null;
async function ensurePublicContentSeoV179(){
  await ensurePublicPostAudienceV18();
  if(!publicContentSeoV179Ready){
    publicContentSeoV179Ready=db.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_public_discovery_v179
        ON posts(created_at DESC,user_id)
        WHERE moderation_status='published'
          AND audience='public'
          AND content_level='normal'
    `).catch(error=>{
      publicContentSeoV179Ready=null;
      throw error;
    });
  }
  return publicContentSeoV179Ready;
}

function extractPublicHashtagsV179(value=''){
  const tags=[];
  const seen=new Set();
  for(const match of String(value||'').matchAll(/#([\p{L}\p{N}_]{2,40})/gu)){
    const tag=match[1].normalize('NFC').toLowerCase();
    if(!seen.has(tag)){seen.add(tag);tags.push(tag);}
  }
  return tags;
}

function publicCaptionHtmlV179(value=''){
  const source=String(value||'');
  const token=/(^|\s)#([\p{L}\p{N}_]{2,40})/gu;
  let out='',last=0;
  for(const match of source.matchAll(token)){
    out+=escapeHtml(source.slice(last,match.index));
    out+=escapeHtml(match[1]||'');
    const tag=match[2].normalize('NFC').toLowerCase();
    out+=`<a class="public-tag-link" href="/hashtag/${encodeURIComponent(tag)}">#${escapeHtml(match[2])}</a>`;
    last=match.index+match[0].length;
  }
  out+=escapeHtml(source.slice(last));
  return out.replace(/\n/g,'<br>');
}

function publicPostCardV179(req,post){
  const avatar=post.avatar_url ? absoluteUrl(req,post.avatar_url) : '';
  const href=publicContentPathV190(post);
  const image=post.media_type==='image' && post.media_url
    ? `<a class="public-post-media" href="${escapeHtml(href)}"><img src="${escapeHtml(absoluteUrl(req,post.media_url))}" loading="lazy" decoding="async" alt="Publicación de ${escapeHtml(post.display_name)}"></a>`
    : post.media_type==='video' && post.media_url
      ? `<a class="public-post-media public-video-placeholder" href="${escapeHtml(href)}"><span>▶</span><b>Vídeo público</b></a>`
      : '';
  const date=new Date(post.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
  return `<article class="public-post-card">
    <div class="public-post-head">
      <a class="public-post-author" href="/perfil/${encodeURIComponent(post.username)}">
        ${avatar
          ? `<img src="${escapeHtml(avatar)}" loading="lazy" decoding="async" alt="">`
          : `<span class="public-post-avatar">${escapeHtml(String(post.display_name||post.username).slice(0,2).toUpperCase())}</span>`}
        <span><b>${escapeHtml(post.display_name)}</b><small>@${escapeHtml(post.username)} · ${escapeHtml(date)}</small></span>
      </a>
      ${post.creator_verified?'<span class="public-post-badge">✓ Creador</span>':''}
    </div>
    ${image}
    <div class="public-post-copy">
      ${post.caption?`<p>${publicCaptionHtmlV179(post.caption)}</p>`:'<p class="muted">Publicación sin texto.</p>'}
      <a class="public-post-open" href="${escapeHtml(href)}">${post.post_kind==='reel'?'Abrir Reel':'Abrir publicación'} →</a>
    </div>
  </article>`;
}

async function trendingPublicHashtagsV179(limit=12){
  const recent=await db.query(`
    SELECT p.caption,p.created_at
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE p.moderation_status='published'
       AND p.audience='public'
       AND p.content_level='normal'
       AND u.status='active'
       AND u.is_admin=false
       AND u.discoverable=true
       AND p.caption IS NOT NULL
       AND p.caption LIKE '%#%'
     ORDER BY p.created_at DESC
     LIMIT 500
  `);
  const map=new Map();
  for(const row of recent.rows){
    for(const tag of extractPublicHashtagsV179(row.caption)){
      const current=map.get(tag)||{tag,count:0,lastmod:row.created_at};
      current.count+=1;
      if(new Date(row.created_at)>new Date(current.lastmod))current.lastmod=row.created_at;
      map.set(tag,current);
    }
  }
  return [...map.values()].sort((a,b)=>b.count-a.count || String(b.lastmod).localeCompare(String(a.lastmod))).slice(0,limit);
}

async function renderPublicContentV179(req,res,{tag=null}={}){
  await Promise.all([ensurePublicContentSeoV179(),ensurePublicProfileSeoV177()]);
  const origin=publicOrigin(req);
  const rawQuery=tag ? '' : String(req.query.q||'').trim().slice(0,80);
  const requestedPage=Math.max(1,Math.min(500,Number.parseInt(req.query.page||'1',10)||1));
  const pageSize=24;
  const searchPattern=rawQuery ? `%${rawQuery.toLowerCase()}%` : null;
  const tagPattern=tag ? `(^|[^[:alnum:]_])#${tag}([^[:alnum:]_]|$)` : null;

  const params=[searchPattern,tagPattern];
  const filterSql=`
    p.moderation_status='published'
    AND p.audience='public'
    AND p.content_level='normal'
    AND u.status='active'
    AND u.is_admin=false
    AND u.discoverable=true
    AND ($1::text IS NULL OR lower(COALESCE(p.caption,'')) LIKE $1 OR lower(u.username) LIKE $1 OR lower(u.display_name) LIKE $1)
    AND ($2::text IS NULL OR COALESCE(p.caption,'') ~* $2)
  `;

  const countResult=await db.query(`
    SELECT count(*)::int AS n
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE ${filterSql}
  `,params);
  const total=Number(countResult.rows[0]?.n||0);
  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  const page=Math.min(requestedPage,totalPages);
  const offset=(page-1)*pageSize;

  const result=await db.query(`
    SELECT p.id,p.caption,p.media_url,p.media_type,p.post_kind,p.created_at,
           u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM posts p
      JOIN users u ON u.id=p.user_id
     WHERE ${filterSql}
     ORDER BY p.created_at DESC,p.id DESC
     LIMIT $3 OFFSET $4
  `,[...params,pageSize,offset]);

  const basePath=tag ? `/hashtag/${encodeURIComponent(tag)}` : '/publicaciones';
  const canonical=page>1 ? `${origin}${basePath}?page=${page}` : `${origin}${basePath}`;
  const indexable=tag ? total>=2 : !rawQuery;
  const title=tag
    ? `#${tag} — Publicaciones en RedLibertad`
    : rawQuery
      ? `Buscar publicaciones: ${rawQuery} — RedLibertad`
      : page>1
        ? `Publicaciones públicas — Página ${page} — RedLibertad`
        : 'Publicaciones públicas — RedLibertad';
  const description=tag
    ? `Publicaciones públicas con #${tag} en RedLibertad.`
    : rawQuery
      ? `Resultados públicos para “${rawQuery}” en RedLibertad.`
      : 'Descubre publicaciones públicas normales compartidas por personas que participan en el descubrimiento público de RedLibertad.';

  const querySuffix=rawQuery ? `&q=${encodeURIComponent(rawQuery)}` : '';
  const previous=page>1
    ? `${basePath}?${page-1>1?`page=${page-1}${querySuffix}`:rawQuery?`q=${encodeURIComponent(rawQuery)}`:''}`
    : '';
  const next=page<totalPages ? `${basePath}?page=${page+1}${querySuffix}` : '';
  const cards=result.rows.map(post=>publicPostCardV179(req,post)).join('');
  const trending=tag ? [] : await trendingPublicHashtagsV179(12);
  const tagNav=trending.length
    ? `<div class="public-tag-cloud">${trending.map(item=>`<a href="/hashtag/${encodeURIComponent(item.tag)}">#${escapeHtml(item.tag)} <span>${item.count}</span></a>`).join('')}</div>`
    : '';

  const listStructured=indexable && page===1 ? `<script type="application/ld+json">${JSON.stringify({
    '@context':'https://schema.org',
    '@type':'ItemList',
    name:tag?`Publicaciones #${tag} en RedLibertad`:'Publicaciones públicas en RedLibertad',
    itemListElement:result.rows.map((post,index)=>({
      '@type':'ListItem',
      position:index+1,
      url:`${origin}${publicContentPathV190(post)}`,
      name:String(post.caption||`Publicación de ${post.display_name}`).slice(0,100)
    }))
  }).replace(/</g,'\\u003c')}</script>` : '';

  res.type('html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${indexable?'index,follow,max-image-preview:large':'noindex,follow'}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${previous?`<link rel="prev" href="${escapeHtml(origin+previous)}">`:''}
  ${next?`<link rel="next" href="${escapeHtml(origin+next)}">`:''}
  <meta property="og:site_name" content="RedLibertad">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(origin+'/assets/og-redlibertad-v1922.jpg')}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(origin+'/assets/og-redlibertad-v1922.jpg')}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/public-nav-v196.css"><link rel="stylesheet" href="/public-footer-v197.css">
  ${listStructured}
  <style>
    .public-content-page{min-height:100vh;background:var(--bg);color:var(--navy)}
    .public-content-top{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px max(20px,calc((100vw - 1180px)/2));border-bottom:1px solid var(--line);background:rgba(255,253,249,.94);backdrop-filter:blur(16px)}
    .public-content-brand{display:flex;align-items:center;gap:9px;color:var(--navy);font-weight:900}.public-content-brand img{width:34px;height:34px}
    .public-content-top-actions{display:flex;align-items:center;gap:8px}
    .public-content-shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:44px 0 72px}
    .public-content-hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:24px;align-items:end}
    .public-content-hero h1{margin:5px 0 8px;font:800 clamp(30px,5vw,52px) Manrope,sans-serif}
    .public-content-hero p{margin:0;color:var(--muted);line-height:1.6}
    .public-content-search{display:flex;gap:8px;padding:8px;border:1px solid var(--line);border-radius:16px;background:var(--paper)}
    .public-content-search input{min-width:0;flex:1;border:0;background:transparent;padding:10px 12px;font:inherit;color:var(--navy);outline:0}
    .public-content-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .public-tag-cloud{display:flex;gap:7px;flex-wrap:wrap;margin:22px 0}
    .public-tag-cloud a,.public-tag-link{color:#0c675b;font-weight:800}.public-tag-cloud a{padding:7px 9px;border-radius:999px;background:rgba(43,183,169,.10);font-size:10px}.public-tag-cloud span{opacity:.62}
    .public-content-count{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:22px 0 14px;color:var(--muted);font-size:12px}
    .public-post-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
    .public-post-card{min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 9px 26px rgba(13,34,56,.05)}
    .public-post-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:13px}
    .public-post-author{min-width:0;display:flex;align-items:center;gap:9px}.public-post-author img,.public-post-avatar{width:40px;height:40px;flex:0 0 40px;border-radius:50%;object-fit:cover;background:linear-gradient(135deg,var(--navy),var(--teal))}
    .public-post-avatar{display:grid;place-items:center;color:white;font-weight:900}.public-post-author span{min-width:0}.public-post-author b,.public-post-author small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.public-post-author small{margin-top:2px;color:var(--muted);font-size:9px}
    .public-post-badge{padding:4px 6px;border-radius:999px;background:rgba(43,183,169,.12);color:#0c675b;font-size:8px;font-weight:900}
    .public-post-media{display:block;aspect-ratio:4/3;background:#101923;overflow:hidden}.public-post-media img{width:100%;height:100%;object-fit:cover;display:block}.public-video-placeholder{display:grid;place-items:center;color:white}.public-video-placeholder span{font-size:28px}.public-video-placeholder b{font-size:11px}
    .public-post-copy{padding:13px}.public-post-copy p{margin:0;color:var(--ink);font-size:12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}.public-post-open{display:inline-block;margin-top:10px;color:var(--navy);font-size:10px;font-weight:900}
    .public-content-empty{padding:38px;border:1px dashed var(--line);border-radius:18px;text-align:center;color:var(--muted);background:var(--paper)}
    .public-content-pagination{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:24px}.public-content-page-label{padding:8px 10px;color:var(--muted);font-size:11px}
    @media(max-width:900px){.public-post-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.public-content-hero{grid-template-columns:1fr}}
    @media(max-width:620px){.public-content-shell{width:min(100% - 20px,1180px);padding-top:28px}.public-post-grid{grid-template-columns:1fr}.public-content-top{padding:10px 12px}.public-content-top-actions .button.ghost{display:none}.public-content-search{display:grid;grid-template-columns:1fr auto}.public-post-card{border-radius:16px}}
  </style>
</head>
<body>
  <main class="public-content-page">
    <header class="public-content-top">
      <a class="public-content-brand" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a>
      <div class="public-content-top-actions"><a class="button small ghost" href="/perfiles">Personas</a><a class="button small ghost" href="/comunidades">Comunidades</a><a class="button small ghost" href="/eventos">Eventos</a><a class="button small ghost" href="/reels">Reels</a><a class="button small ghost" href="/buscar">Buscar</a><a class="button small" href="/#registro">Crear cuenta</a></div>
    </header>
    <div class="public-content-shell">
      <section class="public-content-hero">
        <div>
          <span class="eyebrow">${tag?'HASHTAG PÚBLICO':'CONTENIDO PÚBLICO'}</span>
          <h1>${tag?`#${escapeHtml(tag)}`:'Publicaciones públicas'}</h1>
          <p>${escapeHtml(description)}</p>
          <div class="public-content-links">${tag?'<a class="button ghost small" href="/publicaciones">Todas las publicaciones</a>':''}<a class="button ghost small" href="/perfiles">Descubrir personas</a></div>
        </div>
        ${tag?'':`<form class="public-content-search" method="get" action="/publicaciones"><input name="q" value="${escapeHtml(rawQuery)}" maxlength="80" placeholder="Buscar texto, nombre o usuario" aria-label="Buscar publicaciones"><button class="button" type="submit">Buscar</button></form>`}
      </section>
      ${tagNav}
      <div class="public-content-count"><span>${rawQuery?`${total} resultados para “${escapeHtml(rawQuery)}”`:tag?`${total} publicaciones con #${escapeHtml(tag)}`:`${total} publicaciones públicas`}</span>${rawQuery?'<a href="/publicaciones">Limpiar búsqueda</a>':''}</div>
      ${cards?`<section class="public-post-grid" aria-label="Publicaciones públicas">${cards}</section>`:'<div class="public-content-empty"><b>No encontramos publicaciones.</b><p>Prueba otra búsqueda o vuelve más tarde.</p></div>'}
      <nav class="public-content-pagination" aria-label="Paginación de publicaciones">${previous?`<a class="button ghost small" rel="prev" href="${escapeHtml(previous)}">← Anterior</a>`:''}<span class="public-content-page-label">Página ${page} de ${totalPages}</span>${next?`<a class="button ghost small" rel="next" href="${escapeHtml(next)}">Siguiente →</a>`:''}</nav>
    </div>
  </main>
  ${publicLegalFooterV197()}
</body>
</html>`);
}

app.get('/publicaciones',async(req,res)=>{
  try{
    await renderPublicContentV179(req,res);
  }catch(error){
    console.error('RedLibertad public content directory error:',error);
    res.status(500).send('No se pudo cargar el directorio de publicaciones.');
  }
});

app.get('/hashtag/:tag',async(req,res)=>{
  try{
    const tag=String(req.params.tag||'').normalize('NFC').toLowerCase();
    if(!/^[\p{L}\p{N}_]{2,40}$/u.test(tag))return res.status(404).send('Hashtag no encontrado.');
    if(req.params.tag!==tag)return res.redirect(301,`/hashtag/${encodeURIComponent(tag)}`);
    await renderPublicContentV179(req,res,{tag});
  }catch(error){
    console.error('RedLibertad public hashtag error:',error);
    res.status(500).send('No se pudo cargar el hashtag.');
  }
});

app.get('/sitemap-hashtags.xml',async(req,res)=>{
  try{
    await ensurePublicContentSeoV179();
    const origin=publicOrigin(req);
    const rows=await db.query(`
      SELECT p.caption,p.created_at
        FROM posts p
        JOIN users u ON u.id=p.user_id
       WHERE p.moderation_status='published'
         AND p.audience='public'
         AND p.content_level='normal'
         AND u.status='active'
         AND u.is_admin=false
         AND u.discoverable=true
         AND p.caption IS NOT NULL
         AND p.caption LIKE '%#%'
       ORDER BY p.created_at DESC
       LIMIT 5000
    `);
    const map=new Map();
    for(const row of rows.rows){
      for(const tag of extractPublicHashtagsV179(row.caption)){
        const current=map.get(tag)||{count:0,lastmod:row.created_at};
        current.count+=1;
        if(new Date(row.created_at)>new Date(current.lastmod))current.lastmod=row.created_at;
        map.set(tag,current);
      }
    }
    const urls=[...map.entries()]
      .filter(([,data])=>data.count>=2)
      .sort((a,b)=>b[1].count-a[1].count)
      .slice(0,1000)
      .map(([tag,data])=>`<url><loc>${escapeHtml(origin+'/hashtag/'+encodeURIComponent(tag))}</loc><lastmod>${new Date(data.lastmod).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`);
    if(!urls.length)urls.push(`<url><loc>${escapeHtml(origin+'/publicaciones')}</loc><changefreq>weekly</changefreq></url>`);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  }catch(error){
    console.error('RedLibertad hashtag sitemap error:',error);
    res.status(500).type('text/plain').send('Hashtag sitemap unavailable');
  }
});

app.get('/sitemap-index.xml',(req,res)=>{
  const origin=publicOrigin(req);
  const now=new Date().toISOString();
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${escapeHtml(origin+'/sitemap.xml')}</loc><lastmod>${now}</lastmod></sitemap><sitemap><loc>${escapeHtml(origin+'/sitemap-profiles.xml')}</loc><lastmod>${now}</lastmod></sitemap><sitemap><loc>${escapeHtml(origin+'/sitemap-hashtags.xml')}</loc><lastmod>${now}</lastmod></sitemap><sitemap><loc>${escapeHtml(origin+'/sitemap-communities.xml')}</loc><lastmod>${now}</lastmod></sitemap><sitemap><loc>${escapeHtml(origin+'/sitemap-events.xml')}</loc><lastmod>${now}</lastmod></sitemap><sitemap><loc>${escapeHtml(origin+'/sitemap-reels.xml')}</loc><lastmod>${now}</lastmod></sitemap><sitemap><loc>${escapeHtml(origin+'/sitemap-topics.xml')}</loc><lastmod>${now}</lastmod></sitemap><sitemap><loc>${escapeHtml(origin+'/sitemap-guias.xml')}</loc><lastmod>2026-10-08</lastmod></sitemap><sitemap><loc>${escapeHtml(origin+'/noticias/sitemap.xml')}</loc><lastmod>${now}</lastmod></sitemap></sitemapindex>`);
});

app.get('/robots.txt',(req,res)=>{
  const origin=publicOrigin(req);
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Allow: /p/',
    'Allow: /perfil/',
    'Allow: /perfiles',
    'Allow: /publicaciones',
    'Allow: /hashtag/',
    'Allow: /comunidades',
    'Allow: /comunidad/',
    'Allow: /eventos',
    'Allow: /evento/',
    'Allow: /reels',
    'Allow: /reel/',
    'Allow: /multimedia',
    'Allow: /buscar',
    'Allow: /descubrir',
    'Allow: /temas',
    'Allow: /tema/',
    'Allow: /guias',
    'Allow: /guias/',
    'Allow: /noticias',
    'Allow: /noticias/',
    'Allow: /historias',
    'Allow: /historia/',
    'Disallow: /app',
    'Disallow: /admin',
    'Disallow: /admin-recovery',
    'Disallow: /api/',
    'Disallow: /uploads/',
    `Sitemap: ${origin}/sitemap-index.xml`,
    `Sitemap: ${origin}/sitemap.xml`,
    `Sitemap: ${origin}/sitemap-profiles.xml`,
    `Sitemap: ${origin}/sitemap-hashtags.xml`,
    `Sitemap: ${origin}/sitemap-communities.xml`,
    `Sitemap: ${origin}/sitemap-events.xml`,
    `Sitemap: ${origin}/sitemap-reels.xml`,
    `Sitemap: ${origin}/sitemap-topics.xml`,
    `Sitemap: ${origin}/sitemap-guias.xml`,
    `Sitemap: ${origin}/noticias/sitemap.xml`
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
         AND u.is_admin=false
         AND u.discoverable=true
         AND p.post_kind<>'reel'
       ORDER BY p.created_at DESC
       LIMIT 10000
    `);
    const urls=[
      `<url><loc>${escapeHtml(origin+'/')}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/perfiles')}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/publicaciones')}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/comunidades')}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/eventos')}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/reels')}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/multimedia')}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/buscar')}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/descubrir')}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/temas')}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/legal/')}</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/privacy/')}</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/cookies/')}</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/terms/')}</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/community-guidelines/')}</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`,
      `<url><loc>${escapeHtml(origin+'/moderation/')}</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`,
      ...posts.rows.map(post=>`<url><loc>${escapeHtml(origin+'/p/'+encodeURIComponent(post.id))}</loc><lastmod>${new Date(post.created_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`)
    ];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  }catch(error){
    console.error('RedLibertad sitemap error:',error);
    res.status(500).type('text/plain').send('Sitemap unavailable');
  }
});

app.use(express.static(path.join(__dirname, 'public'),{
  setHeaders: setPerformanceHeaders
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

const server=app.listen(PORT, () => console.log(`RedLibertad V${APP_VERSION} running on http://localhost:${PORT}`));
server.keepAliveTimeout=5000;
server.headersTimeout=65000;
server.requestTimeout=120000;

let shuttingDown=false;
async function gracefulShutdown(signal){
  if(shuttingDown)return;
  shuttingDown=true;
  operationalAlerts.stop();
  alertDelivery.stop();
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

operationalAlerts.start();
alertDelivery.start();

ensurePerformanceIndexesV168()
  .then(()=>console.log('RedLibertad V1.68 performance indexes ready'))
  .catch(error=>console.error('RedLibertad V1.68 performance index bootstrap failed:',error));

startPushWorker()
  .then(()=>console.log(`RedLibertad Web Push ${isPushConfigured() ? 'enabled' : 'disabled (VAPID not configured)'}`))
  .catch(error=>console.error('RedLibertad push worker startup failed:',error));


eventRoutes.startReminderWorker?.()
  .then(()=>console.log('RedLibertad event reminder worker enabled'))
  .catch(error=>console.error('RedLibertad event reminder worker startup failed:',error));
