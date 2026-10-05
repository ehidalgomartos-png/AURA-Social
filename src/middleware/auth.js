const jwt = require('jsonwebtoken');
const db = require('../db');

let authSecurityReady = null;
async function ensureAuthSecurity() {
  if (!authSecurityReady) {
    authSecurityReady = (async () => {
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_token_version INTEGER NOT NULL DEFAULT 0');
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ');
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(500) NOT NULL DEFAULT ''");
    })().catch(error => {
      authSecurityReady = null;
      throw error;
    });
  }
  return authSecurityReady;
}

function getToken(req) {
  if (req.cookies && req.cookies.aura_token) return req.cookies.aura_token;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function sessionUserFromToken(token) {
  await ensureAuthSecurity();

  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const result = await db.query(
    `SELECT id,username,is_admin,age_verified,show_sensitive,status,auth_token_version,
              suspended_until,suspension_reason
       FROM users
      WHERE id=$1
      LIMIT 1`,
    [payload.id]
  );

  if (!result.rowCount) return null;
  const row = result.rows[0];

  if (row.status === 'suspended' && row.suspended_until && new Date(row.suspended_until).getTime() <= Date.now()) {
    await db.query(
      "UPDATE users SET status='active',suspended_until=NULL,suspension_reason='',updated_at=now() WHERE id=$1 AND status='suspended'",
      [row.id]
    );
    row.status = 'active';
    row.suspended_until = null;
    row.suspension_reason = '';
  }

  if (row.status !== 'active') return null;

  const tokenVersion = Number(payload.authVersion ?? 0);
  const currentVersion = Number(row.auth_token_version ?? 0);
  if (tokenVersion !== currentVersion) return null;

  return {
    id: row.id,
    username: row.username,
    isAdmin: row.is_admin,
    ageVerified: row.age_verified,
    showSensitive: row.show_sensitive,
    authVersion: currentVersion
  };
}

async function optionalAuth(req, _res, next) {
  const token = getToken(req);
  if (!token) return next();

  try {
    req.user = await sessionUserFromToken(token);
  } catch (_) {
    req.user = null;
  }
  next();
}

async function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'authentication_required' });

  try {
    const user = await sessionUserFromToken(token);
    if (!user) return res.status(401).json({ error: 'invalid_session' });
    req.user = user;
    next();
  } catch (_) {
    res.status(401).json({ error: 'invalid_session' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'admin_required' });
    }
    next();
  });
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
