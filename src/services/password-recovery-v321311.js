'use strict';
// V3.2.131.1 — restablecimiento de contraseña mediante enlace temporal (no requiere sesión).
// Sin identificación de cuentas y sin almacenar tokens en claro.
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const dbDefault=require('../db');
const {config:verificationEmailConfig}=require('./signup-email-verification-v32131');
const TOKEN_TTL_MINUTES=30;
let schemaReady=null;

function tokenHash(token){return crypto.createHash('sha256').update(token).digest('hex');}
function passwordResetLink(token){
  return 'https://redlibertad.com/recuperar-contrasena/#token='+encodeURIComponent(token);
}
async function ensureSchema(db=dbDefault){
  if(db!==dbDefault){
    return db.query([
      'CREATE TABLE IF NOT EXISTS password_resets_v321311 (',
      'user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,',
      'token_hash CHAR(64),',
      'expires_at TIMESTAMPTZ NOT NULL DEFAULT now(),',
      'sent_at TIMESTAMPTZ,',
      'used_at TIMESTAMPTZ,',
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      ')'
    ].join(' '));
  }
  if(!schemaReady){
    schemaReady=db.query([
      'CREATE TABLE IF NOT EXISTS password_resets_v321311 (',
      'user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,',
      'token_hash CHAR(64),',
      'expires_at TIMESTAMPTZ NOT NULL DEFAULT now(),',
      'sent_at TIMESTAMPTZ,',
      'used_at TIMESTAMPTZ,',
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      ')'
    ].join(' ')).catch(e=>{schemaReady=null;throw e;});
  }
  return schemaReady;
}

async function requestPasswordReset({email,db=dbDefault,env=process.env,fetchImpl=globalThis.fetch}){
  const settings=verificationEmailConfig(env);
  if(!settings.enabled)return {accepted:false,reason:'email_unavailable'};
  const clean=String(email||'').trim().toLowerCase();
  if(!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(clean)||clean.length>254)
    return {accepted:false,reason:'invalid_email'};
  await ensureSchema(db);
  const user=await db.query("SELECT id,email FROM users WHERE lower(email)=$1 AND status='active' LIMIT 1",[clean]);
  // Mismo resultado para cuentas existentes e inexistentes.
  if(!user.rowCount)return {accepted:true};
  const id=user.rows[0].id;
  const token=crypto.randomBytes(32).toString('base64url');
  const stored=await db.query([
    'INSERT INTO password_resets_v321311 (user_id,token_hash,expires_at,used_at,updated_at)',
    "VALUES($1,$2,now()+interval '30 minutes',NULL,now())",
    'ON CONFLICT (user_id) DO UPDATE',
    'SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,used_at=NULL,updated_at=now()',
    "WHERE password_resets_v321311.sent_at IS NULL OR password_resets_v321311.sent_at < now()-interval '15 minutes'",
    'RETURNING user_id'
  ].join(' '),[id,tokenHash(token)]);
  if(!stored.rowCount)return {accepted:true};

  const response=await fetchImpl('https://api.resend.com/emails',{
    method:'POST',
    redirect:'error',
    headers:{Authorization:'Bearer '+settings.key,'Content-Type':'application/json'},
    body:JSON.stringify({
      from:settings.from,
      to:[user.rows[0].email],
      subject:'Recupera tu contraseña de RedLibertad',
      text:'Has solicitado restablecer la contraseña de tu cuenta en RedLibertad.\n\nAbre este enlace válido durante 30 minutos:\n'+passwordResetLink(token)+'\n\nSi no lo has solicitado, ignora este correo.'
    }),
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw Error('password_reset_provider_error_'+response.status);
  await db.query('UPDATE password_resets_v321311 SET sent_at=now() WHERE user_id=$1 AND token_hash=$2',[id,tokenHash(token)]);
  return {accepted:true};
}

async function resetPassword({token,newPassword,db=dbDefault}){
  if(!/^[A-Za-z0-9_-]{40,64}$/.test(String(token||'')) ||
     typeof newPassword!=='string'||newPassword.length<10||newPassword.length>128)
    return {ok:false,reason:'invalid_token_or_password'};
  await ensureSchema(db);
  const hash=await bcrypt.hash(newPassword,12);
  const client=await db.pool.connect();
  let inTransaction=false;
  try{
    await client.query('BEGIN');
    inTransaction=true;
    const used=await client.query([
      'UPDATE password_resets_v321311 SET token_hash=NULL,used_at=now(),updated_at=now()',
      'WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()',
      'RETURNING user_id'
    ].join(' '),[tokenHash(token)]);
    if(!used.rowCount){
      await client.query('ROLLBACK');inTransaction=false;
      return {ok:false,reason:'invalid_or_expired'};
    }
    const change=await client.query([
      'UPDATE users SET password_hash=$2,auth_token_version=auth_token_version+1,',
      'password_changed_at=now(),updated_at=now() WHERE id=$1 AND status=',
      "'active' RETURNING id"
    ].join(' '),[used.rows[0].user_id,hash]);
    if(!change.rowCount){
      await client.query('ROLLBACK');inTransaction=false;
      return {ok:false,reason:'account_unavailable'};
    }
    await client.query('COMMIT');
    inTransaction=false;
    return {ok:true};
  }catch(e){
    if(inTransaction)await client.query('ROLLBACK');
    throw e;
  }finally{client.release();}
}
module.exports={TOKEN_TTL_MINUTES,tokenHash,passwordResetLink,ensureSchema,requestPasswordReset,resetPassword};
