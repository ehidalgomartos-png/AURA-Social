'use strict';
// V3.2.77.5: change a draft professional shop's future seller identity.
// Never reattribute existing listings or move linked products without reconciliation.
const db=require('../db');
class TransferError extends Error{
 constructor(code,status=409){super(code);this.name='TransferError';this.status=status;}
}
async function transferStoreOwner({storeId,targetUsername,expectedSellerId,adminId}){
 const client=await db.pool.connect();
 let inTransaction=false;
 try{
  await client.query('BEGIN');inTransaction=true;
  const existing=await client.query(
   "SELECT s.id,s.name,s.store_url,s.seller_id,s.status,s.purchase_enabled,u.username AS current_username FROM marketplace_professional_stores s JOIN users u ON u.id=s.seller_id WHERE s.id=$1 FOR UPDATE OF s",
   [storeId]);
  if(!existing.rowCount)throw new TransferError('store_not_found',404);
  const store=existing.rows[0];
  if(Number(store.seller_id)!==expectedSellerId)throw new TransferError('store_owner_changed',409);
  if(store.status!=='draft'||store.purchase_enabled===true)throw new TransferError('store_requires_draft',409);
  const target=await client.query(
   "SELECT id,username FROM users WHERE LOWER(username)=LOWER($1) AND status='active' LIMIT 2",
   [targetUsername]);
  if(!target.rowCount)throw new TransferError('target_user_not_found',404);
  if(target.rowCount!==1)throw new TransferError('target_user_ambiguous',409);
  const newOwner=target.rows[0];
  if(Number(newOwner.id)===Number(store.seller_id))throw new TransferError('store_already_owned_by_user',409);

  // Relationships are not migrated automatically. A store with linked products or
  // saved Woo API credentials must be reconciled in a separate verified workflow.
  const usage=await client.query(
   "SELECT EXISTS(SELECT 1 FROM marketplace_external_products WHERE store_id=$1) AS has_products,"+
   " EXISTS(SELECT 1 FROM marketplace_woocommerce_product_links WHERE store_id=$1) AS has_woo_links,"+
   " EXISTS(SELECT 1 FROM marketplace_woocommerce_connections WHERE store_id=$1 AND credentials_encrypted IS NOT NULL) AS has_credentials",
   [storeId]);
  if(usage.rows[0]?.has_products||usage.rows[0]?.has_woo_links||usage.rows[0]?.has_credentials)
   throw new TransferError('store_transfer_has_linked_data',409);

  const duplicate=await client.query(
   'SELECT id FROM marketplace_professional_stores WHERE seller_id=$1 AND store_url=$2 AND id<>$3 LIMIT 1',
   [newOwner.id,store.store_url,storeId]);
  if(duplicate.rowCount)throw new TransferError('target_already_has_store',409);

  const update=await client.query(
   "UPDATE marketplace_professional_stores SET seller_id=$2,purchase_enabled=false,updated_at=now() WHERE id=$1 AND seller_id=$3 AND status='draft' RETURNING id,name,status,seller_id,store_url",
   [storeId,newOwner.id,store.seller_id]);
  if(!update.rowCount)throw new TransferError('store_owner_changed',409);
  await client.query(
   'INSERT INTO marketplace_professional_owner_audit(store_id,actor_id,previous_seller_id,new_seller_id) VALUES($1,$2,$3,$4)',
   [storeId,adminId,store.seller_id,newOwner.id]);
  await client.query('COMMIT');inTransaction=false;
  return {id:update.rows[0].id,name:update.rows[0].name,
   status:update.rows[0].status,previousUsername:store.current_username,
   username:newOwner.username};
 }catch(err){
  if(inTransaction)await client.query('ROLLBACK').catch(()=>{});
  if(err?.code==='23505')throw new TransferError('target_already_has_store',409);
  throw err;
 }finally{client.release();}
}
module.exports={TransferError,transferStoreOwner};
