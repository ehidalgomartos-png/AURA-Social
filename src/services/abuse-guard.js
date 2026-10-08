'use strict';

const crypto = require('node:crypto');

const POLICIES = Object.freeze([
  {method:'POST', path:/^\/api\/auth\/login$/, category:'login', limit:25, seconds:900, actor:'network'},
  {method:'POST', path:/^\/api\/auth\/register$/, category:'registration', limit:20, seconds:3600, actor:'network'},
  {method:'POST', path:/^\/api\/auth\/admin-recovery$/, category:'recovery', limit:6, seconds:3600, actor:'network'},
  {method:'POST', path:/^\/api\/auth\/account\/change-password$/, category:'password', limit:12, seconds:3600, actor:'user'},
  {method:'POST', path:/^\/api\/posts\/?$/, category:'publishing', limit:40, seconds:3600, actor:'user'},
  {method:'POST', path:/^\/api\/stories\/?$/, category:'publishing', limit:40, seconds:3600, actor:'user'},
  {method:'POST', path:/^\/api\/posts\/[0-9]+\/comments$/, category:'comments', limit:90, seconds:600, actor:'user'},
  {method:'POST', path:/^\/api\/messages\/conversations\/[0-9]+\/messages$/, category:'messages', limit:120, seconds:600, actor:'user'},
  {method:'POST', path:/^\/api\/messages\/(conversations|groups)$/, category:'new_chats', limit:30, seconds:3600, actor:'user'},
  {method:'POST', path:/^\/api\/profiles\/[0-9]+\/follow$/, category:'follows', limit:100, seconds:600, actor:'user'},
  {method:'POST', path:/^\/api\/posts\/[0-9]+\/(like|repost|save)$/, category:'reactions', limit:240, seconds:600, actor:'user'},
  {method:'POST', path:/^\/api\/moderation\/report$/, category:'reports', limit:30, seconds:3600, actor:'user'},
  {method:'POST', path:/^\/api\/profiles\/me\/creator-(vip-)?broadcasts$/, category:'broadcasts', limit:20, seconds:3600, actor:'user'}
]);

function matchPolicy(method, path) {
  return POLICIES.find(policy => policy.method === method && policy.path.test(path)) || null;
}

function actorHash(type, value, secret = process.env.JWT_SECRET) {
  if (!secret) throw new Error('JWT_SECRET is required for security actor hashes');
  return crypto.createHmac('sha256', secret).update(type + ':' + String(value)).digest('hex');
}

let schemaReady = null;
async function ensureAbuseSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query('CREATE TABLE IF NOT EXISTS abuse_rate_buckets (actor_hash CHAR(64) NOT NULL, category VARCHAR(32) NOT NULL, window_start TIMESTAMPTZ NOT NULL, hits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(actor_hash,category,window_start))');
      await db.query("CREATE TABLE IF NOT EXISTS abuse_events (id BIGSERIAL PRIMARY KEY, actor_hash CHAR(64) NOT NULL, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, category VARCHAR(32) NOT NULL, window_start TIMESTAMPTZ NOT NULL, blocked_hits INTEGER NOT NULL, threshold INTEGER NOT NULL, first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ, reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL, review_note VARCHAR(500) NOT NULL DEFAULT '', UNIQUE(actor_hash,category,window_start))");
      await db.query('CREATE INDEX IF NOT EXISTS idx_abuse_events_open ON abuse_events(reviewed_at,last_seen_at DESC)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_abuse_events_user ON abuse_events(user_id,last_seen_at DESC)');
      await db.query("CREATE TABLE IF NOT EXISTS abuse_admin_audit (id BIGSERIAL PRIMARY KEY, admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL, target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, action VARCHAR(40) NOT NULL, reason VARCHAR(500) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    })().catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

let lastCleanupAt = 0;
async function cleanupOldSecurityData(db, now = Date.now()) {
  if (now - lastCleanupAt < 6 * 3600 * 1000) return;
  // Maintenance failures cannot defeat rate-limiting; retry after the next six hours.
  lastCleanupAt = now;
  try {
    await db.query("DELETE FROM abuse_rate_buckets WHERE window_start < now() - interval '2 days'");
    await db.query("DELETE FROM abuse_events WHERE last_seen_at < now() - interval '90 days'");
  } catch (error) {
    console.warn('Security retention cleanup failed:',error.message);
  }
}

function createAbuseGuard({db, requireAuth, now = () => Date.now()}) {
  if (!db || !requireAuth) throw new TypeError('db and requireAuth are required');
  return (req, res, next) => {
    const policy = matchPolicy(req.method, req.path);
    if (!policy) return next();
    const check = async () => {
      try {
        await ensureAbuseSchema(db);
        const timestamp = now();
        const windowStart = Math.floor(timestamp / (policy.seconds * 1000)) * policy.seconds;
        const value = policy.actor === 'user' ? req.user.id : req.ip;
        const hash = actorHash(policy.actor, value);
        const result = await db.query(
          'INSERT INTO abuse_rate_buckets(actor_hash,category,window_start,hits) VALUES ($1,$2,to_timestamp($3),1) ON CONFLICT(actor_hash,category,window_start) DO UPDATE SET hits=abuse_rate_buckets.hits+1 RETURNING hits',
          [hash,policy.category,windowStart]
        );
        const hits = Number(result.rows[0].hits);
        if (hits > policy.limit) {
          await db.query(
            "INSERT INTO abuse_events(actor_hash,user_id,category,window_start,blocked_hits,threshold) VALUES($1,$2,$3,to_timestamp($4),$5,$6) ON CONFLICT(actor_hash,category,window_start) DO UPDATE SET blocked_hits=EXCLUDED.blocked_hits,last_seen_at=now()",
            [hash,policy.actor === 'user' ? req.user.id : null,policy.category,windowStart,hits,policy.limit]
          );
          const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + policy.seconds) - timestamp / 1000));
          res.setHeader('Retry-After', String(retryAfterSeconds));
          return res.status(429).json({
            error:'action_rate_limited',
            category:policy.category,
            retryAfterSeconds,
            message:'Demasiadas acciones seguidas. Puedes volver a intentarlo dentro de unos minutos.'
          });
        }
        // Cleanup is deliberately not in the blocking response path.
        if (timestamp - lastCleanupAt >= 6 * 3600 * 1000) {
          void cleanupOldSecurityData(db, timestamp);
        }
        return next();
      } catch (error) {
        console.error('Security rate guard unavailable:',error);
        return res.status(503).json({error:'security_guard_unavailable'});
      }
    };
    return policy.actor === 'user' ? requireAuth(req,res,check) : check();
  };
}

module.exports = { POLICIES, matchPolicy, actorHash, ensureAbuseSchema, createAbuseGuard, cleanupOldSecurityData };
