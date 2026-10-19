'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const audit=require('../src/services/marketplace-seo-audit-v32120');
const seo=require('../src/routes/marketplace-seo-v3251');

function sample(id,options={}){
 return {
  id,title:'Armario de tres puertas '+id,
  description:'Armario de tres puertas con acabados, medidas y fotografía del producto publicable.',
  kind:'product',deal:'sale',category:'Armarios Puertas Batientes',
  image_urls:['/uploads/armario-'+id+'.webp'],details:{},
  updated_at:'2026-10-19T10:00:00.000Z',
  ...options
 };
}
function report(rows){
 return audit.report({
  rows,metrics:{public_total:rows.length,products:rows.length},categories:[],
  isCategoryIndexable:()=>false,listingPath:seo.listingPath
 });
}
test('V3.2.121 prioritize photo issues first, then missing titles/categories, then text within recent sample',()=>{
 const rows=[
  sample(1,{description:'Breve'}),
  sample(2,{title:'Taza',description:'Breve'}),
  sample(3,{image_urls:[]}),
  sample(4,{image_urls:['https://outside.example.org/secret.jpg']}),
  sample(5,{image_urls:['/uploads/same.webp','/uploads/same.webp']}),
  sample(6,{description:'Pequeña descripción, algo más corta'}),
  sample(7,{title:'Taza Cuphead'})
 ];
 const result=report(rows);
 assert.deepEqual(result.examples.map(row=>row.id),['3','4','5','2','1']);
 assert.deepEqual(result.examples.map(row=>row.reviewGroup),['fotos','fotos','fotos','datos','descripcion']);
 assert.equal(result.examples.some(row=>row.id==='7'),false);
 assert.match(result.reviewNote,/No es una clasificación de Google/);
 assert.equal(result.limits.recentSample,7);
 assert.equal(result.limits.issueExamples,5);
 assert.equal(result.readOnly,true);
 assert.doesNotMatch(JSON.stringify(result),/secret.jpg|email|seller_id|stripe/);
});
test('overlapping problems remain present in the response and tie ordering is stable',()=>{
 const first=sample(1,{title:'Taza',description:'Muy mal',image_urls:[]});
 const second=sample(2,{image_urls:[]});
 const third=sample(3,{image_urls:[]});
 const source=[first,second,third];
 const original=JSON.parse(JSON.stringify(source));
 const result=report(source);
 assert.equal(result.examples[0].id,'1'); // More issues within photo group first.
 assert.deepEqual(result.examples.slice(1).map(v=>v.id),['2','3']);
 assert.deepEqual(result.examples[0].issues,['titulo_corto','descripcion_breve','sin_fotos_publicas']);
 assert.deepEqual(source,original); // No mutation of imported products.
});
test('100 most-recent public sample bound is preserved; no implication that all ads were scanned',()=>{
 const rows=Array.from({length:115},(_,i)=>sample(i+1,{description:'Breve'}));
 const r=report(rows);
 assert.equal(r.limits.recentSample,100);
 assert.equal(r.limits.issueExamples,100);
 assert.equal(r.examples.length,100);
 assert.match(r.reviewNote,/dentro de los anuncios públicos recientes de la muestra/);
 const code=fs.readFileSync('src/services/marketplace-seo-audit-v32120.js','utf8');
 assert.match(code,/ORDER BY l.updated_at DESC,l.id DESC LIMIT/);
 for(const constraint of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true"])
  assert.ok(audit.sampleSql.includes(constraint));
});
test('mobile UI has real controls, safe DOM rendering and no write API',()=>{
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 for(const id of ['auditExampleFilter','auditShownCount','auditMoreExamples','auditExamples'])assert.ok(html.includes('id="'+id+'"'));
 for(const value of ['todos','fotos','datos','descripcion'])assert.ok(html.includes('value="'+value+'"'));
 assert.match(html,/Mostrar 20 más/);
 assert.match(js,/const PAGE_SIZE=20/);
 assert.match(js,/exampleFilter.addEventListener\('change'/);
 assert.match(js,/moreExamples.addEventListener\('click'/);
 assert.match(js,/codes.includes\('descripcion_breve'\)/);
 assert.match(js,/matches.slice\(0,visibleExamples\)/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|eval\(/);
 assert.doesNotMatch(js,/fetch\([^)]*method:\s*'POST'/s);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/min-height:48px/);
 assert.match(html,/noindex,nofollow/);
});
test('client filtering and paging operate on overlapping issues without stale rows',async()=>{
 class Element{
  constructor(tag='div'){
   this.tag=tag;this.children=[];this.events={};
   this.textContent='';this.hidden=false;this.value='todos';
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(name,callback){this.events[name]=callback;}
 }
 const nodes=new Map();
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,new Element(id));
  return nodes.get(id);
 };
 const input=Array.from({length:46},(_,i)=>({
  id:String(i+1),title:'Product '+i,category:'Tazas',
  url:'/marketplace/p/'+(i+1)+'/producto-'+(i+1),
  issues:i%2===0?['sin_fotos_publicas','descripcion_breve']:['descripcion_breve'],
  reviewGroup:i%2===0?'fotos':'descripcion'
 }));
 // Remote URLs must never become links, even if the API returned them.
 input[0].url='javascript:alert(1)';
 const response={
  ok:true,mode:'preparacion_tecnica',generatedAt:'2026-10-19T15:00:00.000Z',
  limits:{recentSample:46},totals:{publicListings:46,products:46,services:0,properties:0},
  checks:[],informational:[],categories:[],examples:input,
  issueLabels:{sin_fotos_publicas:'Sin fotos',descripcion_breve:'Texto breve'}
 };
 const context={
  document:{getElementById:get,createElement:tag=>new Element(tag)},
  Intl,Date,Number,String,Array,Object,Error,Promise,
  fetch:async()=>({status:200,ok:true,json:async()=>response})
 };
 vm.runInNewContext(fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8'),context);
 for(let i=0;i<8;i++)await Promise.resolve();
 const count=id=>get(id).children.filter(x=>x.className==='audit-example').length;
 assert.equal(count('auditExamples'),20);
 assert.equal(get('auditMoreExamples').hidden,false);
 get('auditMoreExamples').events.click();
 assert.equal(count('auditExamples'),40);
 get('auditExampleFilter').value='fotos';
 get('auditExampleFilter').events.change();
 assert.equal(count('auditExamples'),20);
 assert.match(get('auditShownCount').textContent,/20 de 23/);
 get('auditMoreExamples').events.click();
 assert.equal(count('auditExamples'),23);
 assert.equal(get('auditMoreExamples').hidden,true);
 const firstLink=get('auditExamples').children[0].children[0].children[0];
 assert.equal(firstLink.href,undefined);
 get('auditExampleFilter').value='descripcion';
 get('auditExampleFilter').events.change();
 assert.equal(count('auditExamples'),20);
 assert.match(get('auditShownCount').textContent,/20 de 46/); // Overlapping photo issue included.
 get('auditExampleFilter').value='datos';
 get('auditExampleFilter').events.change();
 assert.equal(count('auditExamples'),0);
 assert.equal(get('auditMoreExamples').hidden,true);
 assert.match(get('auditExamples').children[0].textContent,/No hay avisos/);
});
