const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

let accountSecurityReady = null;
async function ensureAccountSecurity() {
  if (!accountSecurityReady) {
    accountSecurityReady = (async () => {
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_token_version INTEGER NOT NULL DEFAULT 0');
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ');
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS message_privacy TEXT NOT NULL DEFAULT 'everyone'");
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT TRUE');
      await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_activity BOOLEAN NOT NULL DEFAULT TRUE');
      await db.query(`
        CREATE TABLE IF NOT EXISTS mutes (
          muter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(muter_id,muted_id),
          CHECK(muter_id<>muted_id)
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS referrals (
          id BIGSERIAL PRIMARY KEY,
          inviter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          invited_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    })().catch(error => {
      accountSecurityReady = null;
      throw error;
    });
  }
  return accountSecurityReady;
}

router.use(async (_req,res,next)=>{
  try {
    await ensureAccountSecurity();
    next();
  } catch (error) {
    console.error('RedLibertad V1.10 account security bootstrap failed:', error);
    res.status(500).json({ error: 'account_security_bootstrap_failed' });
  }
});

let referralsReady = null;
async function ensureReferralsTable() {
  if (!referralsReady) {
    referralsReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS referrals (
          id BIGSERIAL PRIMARY KEY,
          inviter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          invited_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_referrals_inviter_created ON referrals(inviter_user_id,created_at DESC)');
    })().catch(error => {
      referralsReady = null;
      throw error;
    });
  }
  return referralsReady;
}


function safeEqualText(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}


const registerSchema = z.object({
  email: z.string().email().max(254),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/),
  displayName: z.string().min(1).max(80),
  password: z.string().min(10).max(128),
  birthDate: z.string(),
  acceptTerms: z.literal(true),
  referralUsername: z.string().max(30).optional().default('')
});

function signUser(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      isAdmin: user.is_admin,
      ageVerified: user.age_verified,
      showSensitive: user.show_sensitive,
      authVersion: Number(user.auth_token_version ?? user.authVersion ?? 0)
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

  const { email, username, displayName, password, birthDate, referralUsername } = parsed.data;
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
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const isAdmin = email.trim().toLowerCase() === adminEmail;

  await ensureReferralsTable();

  let inviter = null;
  const cleanReferral = String(referralUsername || '').trim().replace(/^@/,'');
  if (/^[a-zA-Z0-9_.]{3,30}$/.test(cleanReferral)) {
    const inviterResult = await db.query(
      `SELECT id,username FROM users WHERE lower(username)=lower($1) AND status='active' LIMIT 1`,
      [cleanReferral]
    );
    inviter = inviterResult.rows[0] || null;
  }

  const client = await db.pool.connect();
  let user;
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO users (
        email, username, display_name, password_hash, birth_date,
        is_admin, age_verified, show_sensitive, terms_accepted_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,false,false,now())
      RETURNING id,email,username,display_name,is_admin,age_verified,show_sensitive,auth_token_version
    `, [email, username, displayName, passwordHash, birthDate, isAdmin]);

    user = result.rows[0];

    if (inviter && String(inviter.id) !== String(user.id)) {
      const referralInsert = await client.query(`
        INSERT INTO referrals (inviter_user_id,invited_user_id)
        VALUES ($1,$2)
        ON CONFLICT (invited_user_id) DO NOTHING
        RETURNING id
      `,[inviter.id,user.id]);

      if (referralInsert.rowCount) {
        await client.query(`
          INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
          VALUES ($1,$2,'system','user',$2,'Se ha unido a RedLibertad con tu invitación.')
        `,[inviter.id,user.id]);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('RedLibertad registration failed:', error);
    return res.status(500).json({ error: 'registration_failed' });
  } finally {
    client.release();
  }

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
           age_verified,show_sensitive,status,auth_token_version
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

  // ADMIN HOTFIX:
  // If the account email matches ADMIN_EMAIL, promote it automatically.
  // This repairs accounts created before ADMIN_EMAIL was configured correctly.
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail && user.email.trim().toLowerCase() === adminEmail && !user.is_admin) {
    await db.query(
      'UPDATE users SET is_admin=true, updated_at=now() WHERE id=$1',
      [user.id]
    );
    user.is_admin = true;
  }

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


router.post('/admin-recovery', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const token = String(req.body.token || '');
  const newPassword = String(req.body.newPassword || '');

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const recoveryToken = String(process.env.ADMIN_RECOVERY_TOKEN || '');

  if (!adminEmail || !recoveryToken) {
    return res.status(404).json({ error: 'recovery_disabled' });
  }

  if (email !== adminEmail || !safeEqualText(token, recoveryToken)) {
    return res.status(403).json({ error: 'invalid_recovery_credentials' });
  }

  if (newPassword.length < 10 || newPassword.length > 128) {
    return res.status(400).json({ error: 'invalid_password_length' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  const result = await db.query(`
    UPDATE users
       SET password_hash=$2,
           is_admin=true,
           auth_token_version=auth_token_version+1,
           password_changed_at=now(),
           updated_at=now()
     WHERE lower(email)=lower($1)
     RETURNING id,email,username,display_name,is_admin,age_verified,show_sensitive,auth_token_version
  `, [adminEmail, passwordHash]);

  if (!result.rowCount) {
    return res.status(404).json({ error: 'admin_account_not_found' });
  }

  // Disable recovery for the lifetime of this running process after a successful reset.
  process.env.ADMIN_RECOVERY_TOKEN = '';

  const user = result.rows[0];
  const sessionToken = signUser(user);

  res.cookie('aura_token', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 14 * 24 * 60 * 60 * 1000
  });

  res.json({ ok: true, user, recoveryDisabledForCurrentProcess: true });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('aura_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await db.query(`
    SELECT id,email,username,display_name,bio,avatar_url,cover_url,
           is_admin,age_verified,creator_verified,show_sensitive,status,
           created_at,password_changed_at
    FROM users WHERE id=$1
  `, [req.user.id]);

  if (!result.rowCount) return res.status(404).json({ error: 'user_not_found' });
  res.json({ user: result.rows[0] });
});

router.get('/account', requireAuth, async (req,res)=>{
  const result=await db.query(`
    SELECT
      id,email,username,display_name,is_admin,status,created_at,password_changed_at,
      (SELECT count(*)::int FROM posts WHERE user_id=users.id) post_count,
      (SELECT count(*)::int FROM comments WHERE user_id=users.id) comment_count,
      (SELECT count(*)::int FROM follows WHERE follower_id=users.id) following_count,
      (SELECT count(*)::int FROM follows WHERE following_id=users.id) follower_count
      FROM users
     WHERE id=$1
     LIMIT 1
  `,[req.user.id]);

  if(!result.rowCount)return res.status(404).json({error:'user_not_found'});
  res.json({account:result.rows[0]});
});

const passwordChangeSchema=z.object({
  currentPassword:z.string().min(1).max(128),
  newPassword:z.string().min(10).max(128)
});

router.post('/account/change-password',requireAuth,async(req,res)=>{
  const parsed=passwordChangeSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_data'});

  const current=await db.query(
    'SELECT id,username,password_hash,is_admin,age_verified,show_sensitive,auth_token_version FROM users WHERE id=$1 AND status=\'active\' LIMIT 1',
    [req.user.id]
  );
  if(!current.rowCount)return res.status(404).json({error:'user_not_found'});

  const user=current.rows[0];
  const passwordOk=await bcrypt.compare(parsed.data.currentPassword,user.password_hash);
  if(!passwordOk)return res.status(403).json({error:'current_password_incorrect'});

  const samePassword=await bcrypt.compare(parsed.data.newPassword,user.password_hash);
  if(samePassword)return res.status(400).json({error:'password_unchanged'});

  const passwordHash=await bcrypt.hash(parsed.data.newPassword,12);
  const updated=await db.query(`
    UPDATE users
       SET password_hash=$2,
           auth_token_version=auth_token_version+1,
           password_changed_at=now(),
           updated_at=now()
     WHERE id=$1
     RETURNING id,username,is_admin,age_verified,show_sensitive,auth_token_version,password_changed_at
  `,[req.user.id,passwordHash]);

  const refreshed=updated.rows[0];
  const sessionToken=signUser(refreshed);
  res.cookie('aura_token',sessionToken,{
    httpOnly:true,
    sameSite:'lax',
    secure:process.env.COOKIE_SECURE==='true',
    maxAge:14*24*60*60*1000
  });

  res.json({ok:true,passwordChangedAt:refreshed.password_changed_at});
});

router.post('/account/logout-all',requireAuth,async(req,res)=>{
  await db.query(
    'UPDATE users SET auth_token_version=auth_token_version+1,updated_at=now() WHERE id=$1',
    [req.user.id]
  );
  res.clearCookie('aura_token');
  res.json({ok:true});
});

router.get('/account/export',requireAuth,async(req,res)=>{
  const userId=req.user.id;
  const [
    account,
    interests,
    posts,
    comments,
    following,
    followers,
    blocks,
    muted,
    messages,
    referrals
  ]=await Promise.all([
    db.query(`
      SELECT id,email,username,display_name,birth_date,bio,avatar_url,cover_url,
             location_label,website_url,age_verified,creator_verified,show_sensitive,
             message_privacy,discoverable,show_activity,status,terms_accepted_at,
             created_at,updated_at,password_changed_at
        FROM users WHERE id=$1
    `,[userId]),
    db.query('SELECT interest,created_at FROM user_interests WHERE user_id=$1 ORDER BY interest',[userId]),
    db.query(`
      SELECT id,caption,media_url,media_type,content_level,post_kind,consent_state,
             moderation_status,created_at,updated_at
        FROM posts WHERE user_id=$1 ORDER BY created_at DESC
    `,[userId]),
    db.query('SELECT id,post_id,body,created_at FROM comments WHERE user_id=$1 ORDER BY created_at DESC',[userId]),
    db.query(`
      SELECT u.username,u.display_name,f.created_at
        FROM follows f JOIN users u ON u.id=f.following_id
       WHERE f.follower_id=$1 ORDER BY f.created_at DESC
    `,[userId]),
    db.query(`
      SELECT u.username,u.display_name,f.created_at
        FROM follows f JOIN users u ON u.id=f.follower_id
       WHERE f.following_id=$1 ORDER BY f.created_at DESC
    `,[userId]),
    db.query(`
      SELECT u.username,u.display_name,b.created_at
        FROM blocks b JOIN users u ON u.id=b.blocked_id
       WHERE b.blocker_id=$1 ORDER BY b.created_at DESC
    `,[userId]),
    db.query(`
      SELECT u.username,u.display_name,m.created_at
        FROM mutes m JOIN users u ON u.id=m.muted_id
       WHERE m.muter_id=$1 ORDER BY m.created_at DESC
    `,[userId]),
    db.query(`
      SELECT m.id,m.conversation_id,m.body,m.media_url,m.media_type,m.content_level,m.created_at,
             sender.username AS sender_username,sender.display_name AS sender_display_name
        FROM conversation_members mine
        JOIN messages m ON m.conversation_id=mine.conversation_id
        JOIN users sender ON sender.id=m.sender_id
       WHERE mine.user_id=$1
       ORDER BY m.created_at DESC
    `,[userId]),
    db.query(`
      SELECT u.username,u.display_name,r.created_at
        FROM referrals r JOIN users u ON u.id=r.invited_user_id
       WHERE r.inviter_user_id=$1 ORDER BY r.created_at DESC
    `,[userId])
  ]);

  if(!account.rowCount)return res.status(404).json({error:'user_not_found'});

  res.setHeader('Content-Disposition',`attachment; filename="redlibertad-${account.rows[0].username}-datos.json"`);
  res.json({
    exportedAt:new Date().toISOString(),
    account:account.rows[0],
    interests:interests.rows,
    posts:posts.rows,
    comments:comments.rows,
    following:following.rows,
    followers:followers.rows,
    blocked:blocks.rows,
    muted:muted.rows,
    messages:messages.rows,
    invitedUsers:referrals.rows
  });
});

const deleteAccountSchema=z.object({
  password:z.string().min(1).max(128),
  confirmUsername:z.string().min(1).max(30)
});

function localUploadPath(value=''){
  const url=String(value||'');
  if(!url.startsWith('/uploads/'))return null;
  try{
    const uploadRoot=path.resolve(process.env.UPLOAD_DIR || path.join(__dirname,'..','..','uploads'));
    const fileName=path.basename(decodeURIComponent(url.split('?')[0]));
    const fullPath=path.resolve(uploadRoot,fileName);
    if(!fullPath.startsWith(uploadRoot+path.sep))return null;
    return fullPath;
  }catch(_){
    return null;
  }
}

async function cleanupLocalMedia(paths){
  const unique=[...new Set(paths.filter(Boolean))];
  await Promise.all(unique.map(async file=>{
    try{await fs.promises.unlink(file);}
    catch(error){if(error?.code!=='ENOENT')console.warn('RedLibertad media cleanup failed:',error?.message||error);}
  }));
}

router.delete('/account',requireAuth,async(req,res)=>{
  const parsed=deleteAccountSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_data'});

  const current=await db.query(
    'SELECT id,email,username,password_hash,is_admin,avatar_url,cover_url FROM users WHERE id=$1 AND status=\'active\' LIMIT 1',
    [req.user.id]
  );
  if(!current.rowCount)return res.status(404).json({error:'user_not_found'});

  const user=current.rows[0];
  if(user.is_admin)return res.status(403).json({error:'admin_account_protected'});
  if(String(parsed.data.confirmUsername).trim().toLowerCase()!==String(user.username).toLowerCase()){
    return res.status(400).json({error:'username_confirmation_mismatch'});
  }

  const passwordOk=await bcrypt.compare(parsed.data.password,user.password_hash);
  if(!passwordOk)return res.status(403).json({error:'current_password_incorrect'});

  const mediaRows=await db.query(`
    SELECT media_url,playback_url FROM posts WHERE user_id=$1
    UNION ALL
    SELECT media_url,playback_url FROM stories WHERE user_id=$1
    UNION ALL
    SELECT media_url,playback_url FROM messages WHERE sender_id=$1
  `,[req.user.id]);

  const localFiles=[
    localUploadPath(user.avatar_url),
    localUploadPath(user.cover_url),
    ...mediaRows.rows.flatMap(row=>[
      localUploadPath(row.media_url),
      localUploadPath(row.playback_url)
    ])
  ];

  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM users WHERE id=$1',[req.user.id]);
    await client.query(`
      DELETE FROM conversations c
       WHERE (SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id=c.id)<2
    `);
    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad account deletion failed:',error);
    return res.status(500).json({error:'account_deletion_failed'});
  }finally{
    client.release();
  }

  res.clearCookie('aura_token');
  cleanupLocalMedia(localFiles).catch(()=>{});
  res.json({ok:true});
});

module.exports = router;
