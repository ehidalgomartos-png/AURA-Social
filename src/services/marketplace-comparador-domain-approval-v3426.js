'use strict';
// V3.4.2.6 — Evitar aprobar simultáneamente dos cuentas para un mismo dominio.
// Una solicitud pendiente no acredita titularidad. Solo la revisión humana permite activar compras.
const db=require('../db');
const {normalizeStoreUrl}=require('./marketplace-professional-v3276');

function domainKey(url){
 const safe=normalizeStoreUrl(url);
 if(!safe)return null;
 return new URL(safe).hostname.toLowerCase().replace(/^www\./,'');
}
async function approvePendingStore(storeId,pool=db.pool){
 const client=await pool.connect();
 let inTransaction=false;
 try{
  await client.query('BEGIN');inTransaction=true;
  const selected=await client.query(
   "SELECT id,store_url,status FROM marketplace_professional_stores "+
   "WHERE id=$1 AND status='pending' FOR UPDATE",[storeId]);
  if(!selected.rowCount){
   await client.query('ROLLBACK');inTransaction=false;
   return {state:'not_pending'};
  }
  const domain=domainKey(selected.rows[0].store_url);
  if(!domain){
   await client.query('ROLLBACK');inTransaction=false;
   return {state:'invalid_domain'};
  }
  // Bloqueo por dominio: dos aprobaciones competidoras esperan a la misma transacción.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[domain]);
  const duplicate=await client.query(
   "SELECT id FROM marketplace_professional_stores "+
   "WHERE id<>$1 AND status='approved' AND "+
   "lower(regexp_replace(store_url,'^https://(www[.])?',''))=$2 LIMIT 1",
   [storeId,domain+'/']);
  if(duplicate.rowCount){
   await client.query('ROLLBACK');inTransaction=false;
   return {state:'domain_already_approved'};
  }
  const updated=await client.query(
   "UPDATE marketplace_professional_stores SET status='approved',purchase_enabled=true,updated_at=now() "+
   "WHERE id=$1 AND status='pending' RETURNING id,status,purchase_enabled",[storeId]);
  if(!updated.rowCount)throw new Error('store_approval_state_changed');
  await client.query('COMMIT');inTransaction=false;
  return {state:'approved',store:updated.rows[0]};
 }catch(error){
  if(inTransaction)await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release();}
}
module.exports={domainKey,approvePendingStore};
