'use strict';
/* V3.2.131 — verificacion voluntaria de email con token efimero; no altera el login.
 * Solo una confirmacion NUEVA y valida produce un id de conversion.
 */
const crypto = require('node:crypto');
const database = require('../db');

const TTL_HOURS = 24;
let pendingSchema = null;
function ensureSchema(db=database) {
  if (!pendingSchema) {
    pendingSchema = db.query([
      'CREATE TABLE IF NOT EXISTS signup_email_verifications_v32131 (',
      'user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,',
      'token_hash CHAR(64),',
      "expires_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
      'verified_at TIMESTAMPTZ,',
      'conversion_id UUID NOT NULL DEFAULT gen_random_uuid(),',
      'sent_at TIMESTAMPTZ,',
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      ')'
    ].join(' ')).catch(e=>{pendingSchema=null;throw e;});
  }
  return pendingSchema;
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function config(env=process.env) {
  const from=String(env.EMAIL_VERIFICATION_FROM||env.MESSAGE_EMAIL_FROM||'').trim();
  const key=String(env.RESEND_API_KEY||'').trim();
  const enabled=env.EMAIL_VERIFICATION_ENABLED==='true' && key.length>=10 &&
    /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from);
  return {enabled,from,key};
}
function publicUrl(token) {
  return 'https://redlibertad.com/verificar-email/?token='+encodeURIComponent(token);
}
async function requestVerification({userId,email,db=database,env=process.env,fetchImpl=globalThis.fetch}) {
  const settings=config(env);
  if (!settings.enabled) return {sent:false,reason:'not_configured'};
  if (!Number.isSafeInteger(Number(userId)) || !String(email||'').includes('@'))
    return {sent:false,reason:'invalid_input'};
  await ensureSchema(db);
  const token=crypto.randomBytes(32).toString('base64url');
  const tokenHash=sha256(token);
  // Solo reenviar a cuentas que NO se hayan verificado previamente.
  const result=await db.query([
    'INSERT INTO signup_email_verifications_v32131',
    '(user_id,token_hash,expires_at,updated_at)',
    "VALUES($1,$2,now()+interval '24 hours',now())",
    'ON CONFLICT(user_id) DO UPDATE',
    'SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,updated_at=now()',
    "WHERE signup_email_verifications_v32131.verified_at IS NULL " +
    "AND (signup_email_verifications_v32131.sent_at IS NULL OR signup_email_verifications_v32131.sent_at < now()-interval '15 minutes')",
    'RETURNING user_id'
  ].join(' '),[userId,tokenHash]);
  if (!result.rowCount) return {sent:false,reason:'already_verified_or_cooldown'};

  const link=publicUrl(token);
  const response=await fetchImpl('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+settings.key,'Content-Type':'application/json'},
    body:JSON.stringify({
      from:settings.from,to:[String(email)],subject:'Confirma tu correo en RedLibertad',
      text:'Confirma tu correo en RedLibertad utilizando este enlace de un solo uso (caduca en 24 horas):\n\n'+link+'\n\nSi no has creado esta cuenta, ignora este mensaje.'
    }),
    signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Error('email_verification_provider_error_'+response.status);
  await db.query('UPDATE signup_email_verifications_v32131 SET sent_at=now() WHERE user_id=$1 AND token_hash=$2',[userId,tokenHash]);
  return {sent:true};
}
async function confirmVerification({token,db=database}) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(String(token||''))) return {ok:false,reason:'invalid_or_expired'};
  await ensureSchema(db);
  const hash=sha256(token);
  // Uso atomico: el mismo enlace no puede generar dos confirmaciones.
  const result=await db.query([
    'UPDATE signup_email_verifications_v32131',
    'SET verified_at=now(), token_hash=NULL,updated_at=now()',
    'WHERE token_hash=$1 AND verified_at IS NULL AND expires_at>now()',
    'RETURNING conversion_id'
  ].join(' '),[hash]);
  if (!result.rowCount) return {ok:false,reason:'invalid_or_expired'};
  return {ok:true,emailVerified:true,conversionId:String(result.rows[0].conversion_id)};
}
module.exports={TTL_HOURS,ensureSchema,config,requestVerification,confirmVerification,sha256};
