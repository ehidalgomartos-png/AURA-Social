'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const next=require('../src/services/marketplace-comparador-seo-priorities-v3460');
const {seoAdminView}=require('../src/routes/marketplace-comparador-v32132');
function page(id,query,status='ok',extra={}){
 return {id,slug:'comparacion-'+id,query_text:query,provider_status:status,
  seo_blocked:false,index_approved:false,editorial_summary:'',
  last_checked_at:new Date().toISOString(),external_results:[],...extra};
}
const offers=[{title:'ASUS ROG Strix G16',shop:'Tienda A',href:'https://a.es/g16'},
 {title:'ASUS ROG Strix G17',shop:'Tienda B',href:'https://b.es/g17'}];
test('acciones SEO dependen del estado y nunca aprueban una ficha por sí solas',()=>{
 const p=page(1,'portatil asus rog strix gaming');
 assert.equal(next.plan(p,offers,false,{reason:'Precios incompatibles para una comparación fiable'}).priority,'alta');
 assert.match(next.plan(p,offers,false,{reason:'Precios incompatibles para una comparación fiable'}).action,/No indexar/);
 assert.equal(next.plan({...p,provider_status:'unavailable'},offers,false).priority,'sin-datos');
 assert.equal(next.plan({...p,seo_blocked:true},offers,false).priority,'bloqueada');
 assert.equal(next.plan(p,offers,true).priority,'apta');
 assert.equal(next.plan(p,[],false,{reason:'Faltan ofertas independientes con precio real'}).priority,'sin-datos');
 assert.equal(next.plan(page(2,'zapatillas skechers mujer'),offers,false,{reason:'Consulta demasiado genérica para indexarse'}).priority,'baja');
});
test('filtra prioritarias, conserva orden estable y no altera datos originales',()=>{
 const a={plan:{priority:'baja'},p:{id:1}},b={plan:{priority:'alta'},p:{id:2}},
  c={plan:{priority:'alta'},p:{id:3}},d={plan:{priority:'apta'},p:{id:4}};
 const src=[a,b,c,d];const r=next.queue(src);
 assert.equal(r.priorityCount,2);
 assert.deepEqual(r.rows.map(x=>x.p.id),[4,2,3,1]);
 assert.deepEqual(next.queue(src,'prioritarias').rows.map(x=>x.p.id),[2,3]);
 assert.deepEqual(src.map(x=>x.p.id),[1,2,3,4]);
});
test('el panel de 21 fichas distingue prioridad real sin consultar SerpApi',()=>{
 const ones=[
  page(1,'zapatillas skechers mujer','ok',{external_results:offers}),
  page(2,'portatil asus rog strix gaming','ok',{external_results:[
    {title:'portatil asus rog strix gaming g16',shop:'Tienda A',price_cents:20000,price_currency:'EUR',href:'https://a.es/g16',condition:'Nuevo'},
    {title:'portatil asus rog strix gaming g17',shop:'Tienda B',price_cents:299900,price_currency:'EUR',href:'https://b.es/g17',condition:'Nuevo'},
    {title:'portatil asus rog strix gaming g18',shop:'Tienda C',price_cents:275000,price_currency:'EUR',href:'https://c.es/g18',condition:'Nuevo'}
  ]}),
  page(3,'smartwatch samsung galaxy watch 7','unavailable')
 ];
 const all=seoAdminView(ones,'f'.repeat(48),'todas');
 assert.match(all,/Prioritarias <span>1<\/span>/);
 assert.match(all,/Qué hacer ahora: Revisar precios extremos/);
 assert.match(all,/Qué hacer ahora: Consulta externa incompleta/);
 assert.match(all,/No convierten una ficha en indexable/);
 assert.match(all,/Son datos guardados, no un análisis en directo/);
 const only=seoAdminView(ones,'f'.repeat(48),'prioritarias');
 assert.match(only,/portatil asus rog strix gaming/);
 assert.doesNotMatch(only,/id="comparacion-1"/);
 assert.doesNotMatch(only,/id="comparacion-3"/);
 assert.match(only,/id="comparacion-2"/);
 assert.doesNotMatch(only,/name="action" value="publish"/);
});
test('el panel SEO es exclusivamente informativo, sin gastar consultas',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../src/services/marketplace-comparador-seo-priorities-v3460.js'),'utf8');
 assert.doesNotMatch(text,/fetch\(|db\.query|worker\.enqueue|resend|stripe/);
 const style=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(style,/V3\.4\.6\.0/);
 assert.match(style,/@media\(max-width:620px\)/);
});
