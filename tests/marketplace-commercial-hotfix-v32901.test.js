'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const db=require('../src/db');
const commercial=require('../src/services/marketplace-subscription-commercial-v3281');
const drafts=require('../src/services/marketplace-contract-drafts-v3288');
const root=path.join(__dirname,'..');
const legacy='Conexión de una tienda externa y sincronización, pendiente de aprobación comercial.';
const corrected='Publicación individual de productos y una tienda externa (propuesta), sin importación CSV ni sincronización automática. Pendiente de aprobación comercial.';
test('new Professional draft description accurately excludes WooCommerce synchronization and CSV',()=>{
 const initial=commercial.DDL.find(sql=>sql.startsWith('INSERT INTO marketplace_subscription_commercial_drafts'));
 assert.ok(initial);
 assert.match(initial,/ON CONFLICT\(plan_code\) DO NOTHING/);
 assert.ok(initial.includes("('professional','"+corrected+"')"));
 assert.ok(initial.includes("('professional_plus','Modalidad para comercios"));
 assert.doesNotMatch(initial,/Conexión de una tienda externa y sincronización/);
});
test('existing legacy summary is conditionally repaired without changing custom texts, prices or sellers',async()=>{
 const sql=commercial.DDL.find(x=>x.startsWith('UPDATE marketplace_subscription_commercial_drafts'));
 assert.ok(sql,'Missing narrowly scoped update');
 assert.match(sql,/SET summary=/);
 assert.match(sql,/WHERE plan_code='professional'/);
 assert.ok(sql.includes("AND summary='"+legacy+"'"));
 assert.ok(sql.includes("SET summary='"+corrected+"'"));
 assert.doesNotMatch(sql,/updated_by|proposed_monthly_cents|updated_at|marketplace_seller_subscriptions|marketplace_professional_stores|DELETE FROM|DROP TABLE/i);
 // Illustrate the actual SQL predicate: anything that was edited by an admin must survive.
 const rows=[
  {plan_code:'professional',summary:legacy,proposed_monthly_cents:990,updated_by:23},
  {plan_code:'professional',summary:'Descripción personalizada por el administrador.',proposed_monthly_cents:1290,updated_by:19},
  {plan_code:'professional_plus',summary:legacy,proposed_monthly_cents:2490,updated_by:18}
 ];
 const snapshot=rows.map(x=>({...x}));
 for(const row of rows){
  if(row.plan_code==='professional'&&row.summary===legacy)row.summary=corrected;
 }
 assert.equal(rows[0].summary,corrected);
 assert.equal(rows[0].proposed_monthly_cents,snapshot[0].proposed_monthly_cents);
 assert.equal(rows[0].updated_by,snapshot[0].updated_by);
 assert.deepEqual(rows[1],snapshot[1]);
 assert.deepEqual(rows[2],snapshot[2]);
 assert.equal(rows.filter(x=>x.summary===legacy&&x.plan_code==='professional').length,0);
});
test('migration is part of idempotent commercial initialization and does not affect public billing or stores',()=>{
 const sql=commercial.DDL.join('\n');
 assert.equal(commercial.DDL.filter(x=>x.startsWith('UPDATE marketplace_subscription_commercial_drafts')).length,1);
 assert.doesNotMatch(sql,/UPDATE marketplace_subscription_plans|UPDATE marketplace_seller_subscriptions|UPDATE marketplace_professional_stores|UPDATE marketplace_listings|UPDATE marketplace_external_products|DROP TABLE|TRUNCATE|DELETE FROM/i);
 assert.match(sql,/ON CONFLICT\(plan_code\) DO NOTHING/);
 assert.match(sql,/ON CONFLICT\(topic\) DO NOTHING/);
});
test('server still rejects unrevised templates for internal review',()=>{
 const guide=require('../src/services/marketplace-commercial-guidance-v3290');
 const draft={expectedRevision:0,reviewState:'internal_review',...guide.suggest('professional').terms};
 assert.throws(()=>drafts.parse('professional',draft),{code:'contract_draft_incomplete'});
 assert.equal(drafts.parse('professional',{...draft,reviewState:'draft'}).reviewState,'draft');
});
test('seller-facing admin error becomes a clear Spanish instruction; failed review resets the selector',()=>{
 const js=fs.readFileSync(path.join(root,'public/marketplace-contract-drafts-v3288.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/error\.message==='contract_draft_incomplete'\)review\.value=draft\.reviewState/);
 assert.match(js,/No se puede iniciar la revisión interna/);
 assert.match(js,/Revisa y sustituye los textos de plantilla/);
 assert.match(js,/El borrador anterior se ha conservado/);
 assert.match(js,/error\.message==='contract_draft_conflict'/);
 assert.match(js,/message\.className='status error'/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
test('hotfix bumps admin JS cache version, no checkout or consent activation',()=>{
 const html=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
 const service=fs.readFileSync(path.join(root,'src/services/marketplace-subscription-commercial-v3281.js'),'utf8');
 assert.match(html,/marketplace-contract-drafts-v3288\.js\?v=3\.2\.\d+(?:\.\d+)?/);
 assert.match(html,/marketplace-commercial-v3281\.js\?v=3\.2\.\d+(?:\.\d+)?/);
 assert.match(html,/Contratación y cobros desactivados/);
 assert.match(html,/MundoTaza conserva su piloto gratuito/);
 assert.match(service,/pricesPublished:false/);
 assert.match(service,/enrollmentEnabled:false/);
 assert.match(service,/entitlementsEnforced:false/);
});
