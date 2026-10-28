'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const db=require('../src/db');
const {sourceKeys,findMatches,linkExisting,ReconcileError}=require('../src/services/marketplace-woocommerce-reconcile-v32776');

const store={id:5,seller_id:8,store_url:'https://mundotaza.com/',status:'draft'};
const product={id:18,title:'Taza Ironman',priceCents:1599,sku:'IRON-01',state:'ready',
 description:'Una taza para regalar con ilustraciones.',category:'Tazas',stock:'in_stock',quantity:7,
 productUrl:'https://mundotaza.com/producto/taza-ironman/',images:['https://mundotaza.com/iron.jpg']};
const candidate=(overrides={})=>({id:17,seller_id:8,title:'Taza Ironman',price_cents:1599,
 category:'Tazas',status:'active',moderation_status:'published',username:'mundotaza',
 source_key:'sku:iron-01',external_store_id:null,linked_woo_store_id:null,...overrides});
function mockRead(rows=[],linked=[]){
 return {query:async(sql,args)=>{
  if(sql.includes('FROM marketplace_woocommerce_product_links WHERE store_id'))return {rowCount:linked.length,rows:linked};
  if(sql.includes('FROM marketplace_listings l'))return {rowCount:rows.length,rows};
  throw new Error('Unexpected SQL in fixture: '+sql);
 }};
}

test('Woo SKU and ID map to historical CSV import links without trusting product titles',async()=>{
 assert.deepEqual(sourceKeys(product),['sku:iron-01','id:18']);
 const result=await findMatches(store,product,mockRead([candidate()]));
 assert.equal(result.state,'possible_duplicate');
 assert.equal(result.canImport,false);
 assert.equal(result.matches[0].reason,'sku');
 assert.equal(result.matches[0].sameOwner,true);
 const byId=await findMatches(store,{...product,sku:''},mockRead([candidate({source_key:'id:18'})]));
 assert.equal(byId.matches[0].reason,'woocommerce_id');
});
test('title and price are a review hint, not proof of identical goods',async()=>{
 const possible=await findMatches(store,product,mockRead([candidate({source_key:null})]));
 assert.equal(possible.matches[0].reason,'title_price');
 assert.equal(possible.canImport,false);
 const oldPrice=await findMatches(store,product,mockRead([candidate({source_key:null,price_cents:999})]));
 assert.equal(oldPrice.matches[0].reason,'title_only');
 assert.equal(oldPrice.canImport,false);
 const fresh=await findMatches(store,product,mockRead());
 assert.equal(fresh.canImport,true);
 assert.equal(fresh.state,'new');
});
test('other seller candidate is never linkable; foreign Woo IDs are not global keys',async()=>{
 const other=await findMatches(store,product,mockRead([candidate({seller_id:2,username:'hidalgovalencia'})]));
 assert.equal(other.matches[0].sameOwner,false);
 assert.equal(other.matches[0].reason,'other_owner');
 assert.equal(other.canImport,false);
 const sql=fs.readFileSync('src/services/marketplace-woocommerce-reconcile-v32776.js','utf8');
 assert.match(sql,/l\.seller_id=\$1 OR i\.source_key LIKE 'sku:%'/);
 assert.match(sql,/LOWER\(BTRIM\(l\.title\)\)=LOWER\(BTRIM\(\$3\)\)/);
});
test('previously API-linked item is recognized before checking new matches',async()=>{
 const found=await findMatches(store,product,mockRead([], [{listing_id:33}]));
 assert.deepEqual({state:found.state,id:found.existingListingId},{state:'linked',id:33});
 assert.equal(found.canImport,false);
});
test('too many candidates makes importing fail closed',async()=>{
 const rows=Array.from({length:16},(_,i)=>candidate({id:i+1}));
 const x=await findMatches(store,product,mockRead(rows));
 assert.equal(x.truncated,true);
 assert.equal(x.canImport,false);
});

function transactionFixture({otherOwner=false,alreadyLinked=false}={}){
 const captured=[];
 const connection={
  async query(sql,args=[]){
   captured.push({sql:String(sql),args});
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
   if(sql.includes('pg_advisory_xact_lock'))return {rowCount:1,rows:[{}]};
   if(sql.includes('marketplace_professional_stores WHERE id=$1 FOR UPDATE'))
    return {rowCount:1,rows:[{...store}]};
   if(sql.includes('FROM marketplace_woocommerce_product_links WHERE store_id'))
    return {rowCount:0,rows:[]};
   if(sql.includes('FROM marketplace_listings l'))
    return {rowCount:1,rows:[candidate(otherOwner?{seller_id:2,username:'hidalgovalencia'}:{})]};
   if(sql.includes('SELECT id FROM marketplace_listings WHERE id=$1'))
    return {rowCount:1,rows:[{id:17}]};
   if(sql.includes('FROM marketplace_external_products WHERE listing_id=$1'))
    return {rowCount:alreadyLinked?1:0,rows:alreadyLinked?[{listing_id:17}]:[]};
   if(sql.startsWith('INSERT INTO marketplace_woocommerce_product_links'))
    return {rowCount:1,rows:[{listing_id:17}]};
   if(sql.startsWith('INSERT INTO marketplace_external_products'))
    return {rowCount:1,rows:[]};
   if(sql.startsWith('INSERT INTO marketplace_woocommerce_reconciliation_audit'))
    return {rowCount:1,rows:[]};
   throw new Error('Unknown transaction query: '+sql);
  },
  release(){captured.push({sql:'released'});}
 };
 return {captured,connection};
}
async function withConnection(fixture,fn){
 const old=db.pool.connect;
 db.pool.connect=async()=>fixture.connection;
 try{return await fn();}finally{db.pool.connect=old;}
}
test('explicit link reuses seller listing without changing photos, prices, titles or seller ownership',async()=>{
 const fixture=transactionFixture();
 const result=await withConnection(fixture,()=>linkExisting(store,{},18,17,1,{getProduct:async()=>product}));
 assert.deepEqual({state:result.state,id:result.listingId},{state:'linked_existing',id:17});
 const q=fixture.captured.map(x=>x.sql);
 assert.ok(q.includes('BEGIN'));assert.ok(q.includes('COMMIT'));
 assert.ok(q.some(x=>x.includes('pg_advisory_xact_lock')));
 assert.ok(q.some(x=>x.includes('INSERT INTO marketplace_external_products')));
 assert.ok(q.some(x=>x.includes('INSERT INTO marketplace_woocommerce_reconciliation_audit')));
 assert.ok(!q.some(x=>x.includes('UPDATE marketplace_listings')));
 assert.ok(!q.some(x=>x.includes('UPDATE marketplace_professional_stores')));
 assert.ok(!q.some(x=>x.includes('DELETE FROM')));
});
test('cross-seller match cannot be linked and transaction rolls back',async()=>{
 const fixture=transactionFixture({otherOwner:true});
 await assert.rejects(withConnection(fixture,()=>linkExisting(store,{},18,17,1,{getProduct:async()=>product})),
 e=>e instanceof ReconcileError&&e.message==='woocommerce_match_not_owned');
 assert.ok(fixture.captured.some(x=>x.sql==='ROLLBACK'));
 assert.ok(!fixture.captured.some(x=>x.sql.startsWith('INSERT INTO marketplace_external_products')));
});
test('already externally linked listing is refused without altering existing link',async()=>{
 const fixture=transactionFixture({alreadyLinked:true});
 await assert.rejects(withConnection(fixture,()=>linkExisting(store,{},18,17,1,{getProduct:async()=>product})),
 e=>e instanceof ReconcileError&&e.message==='woocommerce_listing_already_linked');
 assert.ok(fixture.captured.some(x=>x.sql==='ROLLBACK'));
});

test('preflight and transactional recheck prevent duplicate API imports even if frontend is bypassed',()=>{
 const sync=fs.readFileSync('src/services/marketplace-woocommerce-sync-v3277.js','utf8');
 const api=fs.readFileSync('src/routes/marketplace-woocommerce-v3277.js','utf8');
 const html=fs.readFileSync('src/views/marketplace-professional-v3276.html','utf8');
 const script=fs.readFileSync('public/marketplace-professional-v3276.js','utf8');
 assert.ok(sync.indexOf('const before=await findMatches')<sync.indexOf('await saveImages'));
 assert.ok(sync.indexOf('const current=await findMatches')<sync.indexOf('INSERT INTO marketplace_listings'));
 assert.match(sync,/pg_advisory_xact_lock/);
 assert.match(api,/await ensureImportSchema\(\)/);
 assert.match(api,/router\.post\('\/stores\/:id\/link-existing\/:wooId'/);
 assert.match(script,/Ya existe o puede existir en Marketplace/);
 assert.match(script,/data-woo-link/);
 assert.match(script,/in_stock:'Disponible'/);
 assert.match(script,/referrerpolicy="no-referrer"/);
 assert.match(html,/marketplace-woo-reconcile-v32776\.css/);
 assert.match(html,/marketplace-professional-v3276\.js\?v=3\.4\.2\.6/);
});
