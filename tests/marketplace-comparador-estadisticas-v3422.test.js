'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const clicks=require('../src/services/marketplace-comparador-clicks-v3422');
test('prueba firmada para clic de producto y tienda sin datos personales',()=>{
 const secret='local-test-secret',now=Date.parse('2026-10-28T15:00:00Z');
 const token=clicks.sign(12,91,'2026-10-28',secret);
 assert.match(token,/^[a-f0-9]{64}$/);
 assert.equal(clicks.validProof(12,91,token,now,secret),true);
 assert.equal(clicks.validProof(13,91,token,now,secret),false);
 assert.equal(clicks.validProof(12,92,token,now,secret),false);
 assert.equal(clicks.validProof(12,91,token,now+3*86400000,secret),false);
 assert.equal(clicks.validProof(12,91,'no-token',now,secret),false);
 assert.equal(clicks.sign('abc',91,'2026-10-28',secret),null);
});
test('contabiliza solo vínculos aprobados con stock y dominio verificado',async()=>{
 const saved=db.query;const sql=[];
 try{
  db.query=async(query,args=[])=>{
   sql.push({query,args});
   if(query.startsWith('SELECT x.product_url,s.store_url'))return {
    rowCount:1,rows:[{product_url:'https://tienda.es/iphone',store_url:'https://tienda.es/'}]};
   return {rowCount:0,rows:[]};
  };
  assert.equal(await clicks.record('12','91'),true);
  const inserted=sql.find(x=>x.query.startsWith('INSERT INTO marketplace_comparison_store_clicks'));
  assert.ok(inserted,'solo contador agregado');
  assert.deepEqual(inserted.args.slice(0,2),['12','91']);
  assert.match(inserted.args[2],/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!sql.some(x=>/ip_address|user_agent|cookie|stripe|payment/i.test(x.query)));
  sql.length=0;
  db.query=async(q,...args)=>{
   if(q.startsWith('SELECT x.product_url,s.store_url'))return {rowCount:1,rows:[{product_url:'https://otro.es/iphone',store_url:'https://tienda.es/'}]};
   sql.push(q);return {rowCount:0,rows:[]};
  };
  assert.equal(await clicks.record('12','91'),false);
  assert.equal(sql.some(q=>q.startsWith('INSERT INTO marketplace_comparison_store_clicks')),false);
 }finally{db.query=saved;}
});
test('cliente registra evento solo cuando el usuario pulsa y no modifica el href directo',()=>{
 const client=fs.readFileSync(path.join(__dirname,'../public/comparador-v32135.js'),'utf8');
 assert.match(client,/data-comparison-merchant-click/);
 assert.match(client,/keepalive:true/);
 assert.match(client,/credentials:'omit'/);
 const clicksOnly=client.split('/* V3.4.2.2: registrar clic')[1]?.split('/* V3.4.3.8')[0]||'';
 assert.ok(clicksOnly.length>50);
 assert.doesNotMatch(clicksOnly,/preventDefault\(|window\.location=|location\.assign\(/);
 const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(route,/router\.post\('\/comparar\/comercios\/registrar-clic'/);
 assert.match(route,/merchantClicks\.validProof/);
 assert.match(route,/mis-estadisticas/);
 assert.match(route,/billingEnabled:false/);
});
