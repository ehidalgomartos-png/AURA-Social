const jwt = require('jsonwebtoken');

function getToken(req) {
  if (req.cookies && req.cookies.aura_token) return req.cookies.aura_token;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function optionalAuth(req, _res, next) {
  const token = getToken(req);
  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {}
  next();
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'authentication_required' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
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
