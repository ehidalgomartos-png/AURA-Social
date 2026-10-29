'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const {router}=require('../src/routes/marketplace-comparador-v32132');
const {dailyTrend,productRows,normalizeCount}=require('../src/services/marketplace-comparador-merchant-dashboard-v3452');
const source=fs.readFileSync(path.join(__dirname,'../src/routes/marketplace-comparador-v32132.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');

test('tendencia UTC rellena días sin clics y calcula total sin sumar visitas imaginarias',()=>{
 const now=Date.parse('2026-10-29T12:00:00.000Z');
 const data=dailyTrend([
  {day:'2026-10-29',clicks:'6'},
  {day:'2026-10-27',clicks:3},
  {day:'2026-10-02',clicks:50},
  {day:'2026-11-01',clicks:100},
  {day:'2026-10-28',clicks:-4},
  {day:'not-date',clicks:2}
 ],now);
 assert.equal(data.series.length,30);
 assert.equal(data.series[0].day,'2026-09-30');
 assert.equal(data.series.at(-1).day,'2026-10-29');
 assert.equal(data.series.find(x=>x.day==='2026-10-28').clicks,0);
 assert.equal(data.total,59);
 assert.equal(data.peak,50);
 assert.equal(data.series.filter(x=>x.clicks===0).length,27);
});
test('valores no fiables y filas incompletas no producen métricas negativas',()=>{
 assert.equal(normalizeCount(Infinity),0);
 assert.equal(normalizeCount('2.5'),0);
 assert.equal(normalizeCount(-1),0);
 assert.equal(normalizeCount('4'),4);
 const rows=productRows([
  {id:10,title:'Tienda <script>alert(1)</script>',clicks:'2'},
  {id:11,title:'Otro artículo',clicks:null}
 ]);
 assert.equal(rows[0].clicks,2);
 assert.equal(rows[1].clicks,0);
 assert.equal(rows[0].title,'Tienda <script>alert(1)</script>');
 assert.throws(()=>dailyTrend([],Date.now(),365),/invalid_trend_range/);
});
async function withServer(fn,{authenticated=true,owned=true}={}){
 const old=db.query,oldSecret=process.env.JWT_SECRET,events=[];
 process.env.JWT_SECRET='test-only-v3452-merchant-dashboard-secret';
 db.query=async(sql,params=[])=>{
  events.push({sql,params});
  if(/^(ALTER TABLE|CREATE TABLE|CREATE INDEX)/.test(sql))return {rows:[],rowCount:0};
  if(sql.includes('FROM users')&&sql.includes('auth_token_version'))
   return {rowCount:1,rows:[{
    id:517,username:'vendedor',is_admin:false,status:'active',age_verified:true,
    auth_token_version:0,suspended_until:null,show_sensitive:false
   }]};
  if(sql.startsWith('SELECT id,name,status,platform,store_url,purchase_enabled FROM marketplace_professional_stores'))
   return owned&&params[0]==='14'&&params[1]===517?
    {rowCount:1,rows:[{id:14,name:'Tienda <Especial>',status:'approved',
      platform:'woocommerce',store_url:'https://tienda.example/',purchase_enabled:true}]}:
    {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT clicked_day::text AS day'))
   return {rowCount:2,rows:[
    {day:new Date().toISOString().slice(0,10),clicks:'6'},
    {day:new Date(Date.now()-86400000).toISOString().slice(0,10),clicks:'3'}
   ]};
  if(sql.startsWith('SELECT l.id,l.title,COALESCE(SUM(t.click_count),0)::bigint AS clicks'))
   return {rowCount:2,rows:[
    {id:291,title:'Mueble <script>alert(1)</script>',clicks:'7'},
    {id:292,title:'Mueble auxiliar',clicks:'2'}
   ]};
  throw Error('SQL no esperado: '+sql);
 };
 const app=express();app.use(express.urlencoded({extended:true}));app.use(cookieParser());app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const token=authenticated?jwt.sign({id:517,authVersion:0},process.env.JWT_SECRET):null;
  const base='http://127.0.0.1:'+server.address().port;
  return await fn(base,token?{Cookie:'aura_token='+token}:{},events);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.query=old;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
 }
}
test('sin iniciar sesión no expone estadísticas ni consulta PostgreSQL',async()=>{
 await withServer(async(base,headers,queries)=>{
  const r=await fetch(base+'/comparar/comercios/estadisticas/14',{headers});
  assert.equal(r.status,401);
  assert.equal(queries.length,0);
 },{authenticated:false});
});
test('id inválido no ejecuta consultas comerciales',async()=>{
 await withServer(async(base,headers,queries)=>{
  const r=await fetch(base+'/comparar/comercios/estadisticas/14-not-id',{headers});
  assert.equal(r.status,400);
  assert.equal(queries.some(x=>x.sql.includes('marketplace_comparison_store_clicks')),false);
 });
});
test('no permite a un comerciante leer métricas de tiendas ajenas',async()=>{
 await withServer(async(base,headers,queries)=>{
  const r=await fetch(base+'/comparar/comercios/estadisticas/14',{headers});
  assert.equal(r.status,404);
  assert.equal(queries.some(x=>x.sql.startsWith('SELECT clicked_day::text')),false);
  assert.equal(queries.some(x=>x.sql.startsWith('SELECT l.id,l.title,COALESCE')),false);
 },{owned:false});
});
test('propietario visualiza métricas verdaderas y nunca las denomina ventas',async()=>{
 await withServer(async(base,headers,queries)=>{
  const r=await fetch(base+'/comparar/comercios/estadisticas/14',{headers});
  const html=await r.text();
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'private,no-store');
  assert.equal(r.headers.get('x-robots-tag'),'noindex,nofollow');
  assert.match(html,/Estadísticas de Tienda &lt;Especial&gt;/);
  assert.match(html,/Clics registrados · 30 días/);
  assert.match(html,/no ventas, ingresos ni visitantes únicos/);
  assert.match(html,/>9<\/strong><span>Clics registrados · 30 días/);
  assert.match(html,/Clics diarios/);
  assert.match(html,/Clics · 30 días/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/href="\/comparar\/comercios\/catalogo\/14"/);
  assert.match(html,/href="\/comparar\/comercios\/productos\/14"/);
  const daily=queries.find(x=>x.sql.startsWith('SELECT clicked_day::text'));
  const top=queries.find(x=>x.sql.startsWith('SELECT l.id,l.title,COALESCE'));
  assert.deepEqual(daily.params,['14']);
  assert.deepEqual(top.params,['14',517]);
  assert.match(daily.sql,/LIMIT 30/);
  assert.match(top.sql,/LIMIT 10/);
  assert.match(top.sql,/x.seller_id=\$2/);
  assert.equal(queries.some(x=>/^(INSERT|UPDATE|DELETE)\b|serpapi/i.test(x.sql)),false);
 });
});
test('30 días es el horizonte acotado de eventos reales y no usuarios',()=>{
 const block=source.split("// V3.4.5.2 — informe profesional propio")[1].split("router.get('/admin/comparador/comercios-estadisticas'")[0];
 assert.ok(block);
 assert.match(block,/LEFT JOIN marketplace_comparison_store_clicks/);
 assert.match(block,/clicked_day BETWEEN \(now\(\) AT TIME ZONE 'UTC'\)::date-INTERVAL '29 days'/);
 assert.doesNotMatch(block,/COUNT\(DISTINCT user|ip_address|user_agent|conversion|SUM\(revenue|fetch\(|serpapi/i);
});
test('móvil, foco y visualización sin overlays ni librerías externas',()=>{
 const section=css.split('/* V3.4.5.2 — informe privado por tienda')[1];
 assert.ok(section);
 assert.match(section,/grid-template-columns:repeat\(14,minmax\(0,1fr\)\)/);
 assert.match(section,/@media\(max-width:650px\)/);
 assert.match(section,/@media\(max-width:360px\)/);
 assert.match(section,/:focus-visible/);
 assert.doesNotMatch(section,/position:\s*fixed|pointer-events:\s*none|@import|https?:\/\//i);
 assert.match(source,/Ver estadísticas de esta tienda/);
 assert.match(source,/Ver detalle de mi tienda/);
});
