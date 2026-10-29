'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const seo=require('../src/services/marketplace-comparador-seo-v32132');
const audit=require('../src/services/marketplace-comparador-indexation-audit-v3465');
const {router,slugFor}=require('../src/routes/marketplace-comparador-v32132');
const DAY=24*60*60*1000;
const offer=(shop,price=25000)=>({
 title:'Apple iPhone 12 128 GB Negro',shop,
 href:'https://'+shop.toLowerCase().replace(/\W/g,'')+'.example/iphone12',
 price_cents:price,price_currency:'EUR',condition:'Nuevo',internal:false,sponsored:false
});
const offers=[offer('Tienda A',24000),offer('Tienda B',25000),offer('Tienda C',26000)];
function page(id,extra={}){
 const query='iphone 12 128 GB negro';
 return {id,slug:slugFor(query+' '+id),query_text:query,provider_status:'ok',
  external_results:offers,seo_blocked:false,index_approved:false,editorial_summary:'',
  last_checked_at:new Date(Date.now()-DAY).toISOString(),
  updated_at:new Date(Date.now()-DAY).toISOString(),...extra};
}
test('el sitemap y auditoría comparten consulta, sin declarar indexación real',()=>{
 assert.match(audit.SITEMAP_CANDIDATES_SQL,/LIMIT 2000$/);
 assert.match(audit.SITEMAP_CANDIDATES_SQL,/last_checked_at>now\(\)-interval '7 days'/);
 assert.match(audit.SITEMAP_CANDIDATES_SQL,/jsonb_array_length\(external_results\)>=2/);
 assert.equal(audit.SITEMAP_LIMIT,2000);
 const p=page(1),blocked=page(2,{seo_blocked:true});
 const report=audit.audit([p],[p,blocked]);
 assert.equal(report.sitemapExpected,1);
 assert.equal(report.counts['en-sitemap'],1);
 assert.equal(report.counts.noindex,1);
 assert.equal(report.rows[0].canonical,'https://redlibertad.com/comparar/'+p.slug);
 assert.equal(report.rows[0].detail.includes('Google aún puede no haberla indexado'),true);
 assert.equal(report.rows[1].eligible,false);
 assert.match(report.rows[1].detail,/Bloqueada/);
 assert.match(report.note,/No es una lectura HTTP/);
});
test('la cola en actualización no pierde elegibilidad, la caducidad y fallos siguen noindex',()=>{
 const p=page(3,{provider_status:'checking'});
 const report=audit.audit([p],[p]);
 assert.equal(report.rows[0].inSitemap,true);
 for(const state of ['unavailable','limit_reached','not_configured']){
  const q=page(4,{provider_status:state});
  assert.equal(audit.audit([], [q]).rows[0].state,'noindex');
 }
 const old=page(5,{last_checked_at:new Date(Date.now()-9*DAY).toISOString()});
 assert.equal(audit.audit([], [old]).rows[0].state,'noindex');
 assert.match(audit.reason(old),/caducados/);
 const empty=page(6,{external_results:[]});
 assert.equal(audit.audit([], [empty]).rows[0].state,'noindex');
});
test('indica discrepancias si una URL pasa SEO pero falta en candidatos o queda fuera de límite',()=>{
 const p=page(11);
 const report=audit.audit([], [p]);
 assert.equal(report.rows[0].eligible,true);
 assert.equal(report.rows[0].inSitemap,false);
 assert.equal(report.rows[0].state,'revisar-sitemap');
 assert.equal(report.counts['revisar-sitemap'],1);
 assert.equal(audit.filter(report,'revisar-sitemap').rows.length,1);
 assert.equal(audit.filter(report,'invalid').selected,'todas');
 const forged=page(12,{slug:'"><script>alert(1)</script>'});
 assert.equal(audit.audit([forged],[forged]).rows[0].canonical,null);
});
test('el endpoint privado evita lecturas sin sesión',async()=>{
 const old=db.query;let calls=0;
 db.query=async()=>{calls++;throw Error('Sin sesión no se debe consultar DB');};
 const app=express();app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const res=await fetch('http://127.0.0.1:'+server.address().port+'/admin/comparador/indexacion');
  assert.equal(res.status,401);
  assert.equal(calls,0);
 }finally{await new Promise(resolve=>server.close(resolve));db.query=old;}
});
test('HTML privado y XML público aplican exactamente las mismas reglas SEO',async()=>{
 const layer=router.stack.find(x=>x.route?.path==='/admin/comparador/indexacion');
 assert.ok(layer);
 assert.equal(layer.route.stack.length,2);
 const handler=layer.route.stack[1].handle;
 const original=db.query,queries=[];
 const good=page(21),bad=page(22,{seo_blocked:true,external_results:[]});
 db.query=async sql=>{
  queries.push(sql);
  if(sql===audit.SITEMAP_CANDIDATES_SQL)return {rowCount:1,rows:[good]};
  if(sql===audit.SAMPLE_SQL)return {rowCount:2,rows:[good,bad]};
  return {rowCount:0,rows:[]};
 };
 const headers={},res={
  set(k,v){headers[k]=v;return this;},
  send(html){this.html=html;return this;}
 };
 let err=null;
 try{
  await handler({query:{estado:'todas'}},res,e=>{err=e;});
  assert.equal(err,null);
  assert.equal(headers['Cache-Control'],'private,no-store');
  assert.equal(headers['X-Robots-Tag'],'noindex,nofollow');
  assert.equal(queries.filter(sql=>sql.startsWith('SELECT')).length,2);
  assert.match(res.html,/Auditoría de indexación y sitemap/);
  assert.match(res.html,/Prevista en sitemap/);
  assert.match(res.html,/No indexable/);
  assert.match(res.html,/index,follow/);
  assert.match(res.html,/noindex,follow/);
  assert.match(res.html,/No se ha conectado ni consultado Search Console/);
  assert.match(res.html,/sitemap-comparador\.xml/);
  assert.doesNotMatch(res.html,/solicitar indexación automáticamente/i);
  assert.equal(audit.SITEMAP_CANDIDATES_SQL,queries.find(sql=>sql.startsWith('SELECT')));
  assert.equal(seo.indexEligible(good,good.external_results),true);
 }finally{db.query=original;}
});
test('filtros y contenido de origen nunca exponen HTML inyectado',()=>{
 const p=page(31,{query_text:'<script>alert(1)</script>'});
 const report=audit.audit([], [p]);
 assert.equal(report.rows.length,1);
 assert.equal(report.rows[0].state,'noindex');
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 const src=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-indexation-audit-v3465.js'),'utf8');
 const route=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
 assert.match(css,/V3\.4\.6\.5/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(src,/\bfetch\s*\(|db\.query|serpapi\.search|setInterval|index_approved\s*=/i);
 assert.match(route,/db\.query\(indexAudit\.SITEMAP_CANDIDATES_SQL\)/);
 assert.match(route,/href="\/admin\/comparador\/indexacion"/);
});
