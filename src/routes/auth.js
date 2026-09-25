const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email().max(254),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/),
  displayName: z.string().min(1).max(80),
  password: z.string().min(10).max(128),
  birthDate: z.string(),
  acceptTerms: z.literal(true)
});

function signUser(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      isAdmin: user.is_admin,
      ageVerified: user.age_verified,
      showSensitive: user.show_sensitive
    },
    process.env.JWT_SECRET,
    { expiresIn: '14d' }
  );
}

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_data', details: parsed.error.flatten() });
  }

  const { email, username, displayName, password, birthDate } = parsed.data;
  const dob = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) {
    return res.status(400).json({ error: 'invalid_birth_date' });
  }

  const now = new Date();
  const age18 = new Date(Date.UTC(
    now.getUTCFullYear() - 18,
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  if (dob > age18) {
    return res.status(403).json({ error: 'adult_only' });
  }

  const existing = await db.query(
    'SELECT id FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($2) LIMIT 1',
    [email, username]
  );

  if (existing.rowCount) {
    return res.status(409).json({ error: 'account_exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const isAdmin = email.toLowerCase() === adminEmail;

  const result = await db.query(`
    INSERT INTO users (
      email, username, display_name, password_hash, birth_date,
      is_admin, age_verified, show_sensitive, terms_accepted_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,false,false,now())
    RETURNING id,email,username,display_name,is_admin,age_verified,show_sensitive
  `, [email, username, displayName, passwordHash, birthDate, isAdmin]);

  const user = result.rows[0];
  const token = signUser(user);

  res.cookie('aura_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 14 * 24 * 60 * 60 * 1000
  });

  res.status(201).json({ ok: true, user });
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');

  const result = await db.query(`
    SELECT id,email,username,display_name,password_hash,is_admin,
           age_verified,show_sensitive,status
    FROM users
    WHERE lower(email)=lower($1)
    LIMIT 1
  `, [email]);

  if (!result.rowCount) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const user = result.rows[0];
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'account_unavailable' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  const token = signUser(user);
  res.cookie('aura_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 14 * 24 * 60 * 60 * 1000
  });

  delete user.password_hash;
  res.json({ ok: true, user });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('aura_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await db.query(`
    SELECT id,email,username,display_name,bio,avatar_url,cover_url,
           is_admin,age_verified,creator_verified,show_sensitive,status
    FROM users WHERE id=$1
  `, [req.user.id]);

  if (!result.rowCount) return res.status(404).json({ error: 'user_not_found' });
  res.json({ user: result.rows[0] });
});

module.exports = router;
