'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const live=require('../public/resuelve-seo-live-v3629.js');
const report=require('../public/resuelve-seo-report-v3630.js');
const timers={after:()=>99,clear:()=>{}};
function response(body,opts={}){
 const headers=opts.headers||{};
 return {status:opts.status??200,type:'basic',redirected:opts.redirected??false,
  url:opts.url??'',
  headers:{get:name=>headers[name]??(name==='content-type'?'application/xml':null)},
  text:async()=>body};
}
const goodXml='<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
class XmlParser{
 parseFromString(input){
  return {documentElement:{localName:'urlset'},
   getElementsByTagName:key=>key==='parsererror'?[]:key==='url'?[]:[]};
 }
}
test('V3.6.30: X-Robots-Tag noindex is a real sitemap error',async()=>{
 const r=await live.checkTarget(live.TARGETS[3],{Parser:XmlParser,timers,
  fetchImpl:async()=>response(goodXml,{headers:{'x-robots-tag':'noindex, nofollow'}})});
 assert.equal(r.status,'error');
 assert.match(r.issues.join(' '),/X-Robots-Tag/);
 assert.equal(r.httpStatus,200);
 const safe=await live.checkTarget(live.TARGETS[3],{Parser:XmlParser,timers,
  fetchImpl:async()=>response(goodXml)});
 assert.equal(safe.status,'warning'); // vacío legítimo
});
test('V3.6.30: redirect and final URL drift cannot be presented as successful SEO',async()=>{
 const route=live.TARGETS[3];
 for(const options of [
  {redirected:true,url:'https://redlibertad.com/sitemap-resuelve.xml'},
  {url:'https://redlibertad.com/resuelve/admin'},
  {url:'https://other.example/sitemap-resuelve.xml'}
 ]){
  const r=await live.checkTarget(route,{Parser:XmlParser,timers,
   fetchImpl:async()=>response(goodXml,options)});
  assert.equal(r.status,'error');
  assert.equal(r.httpStatus,200);
 }
 const valid=await live.checkTarget(route,{Parser:XmlParser,timers,
  fetchImpl:async()=>response(goodXml,{url:'https://redlibertad.com/sitemap-resuelve.xml'})});
 assert.equal(valid.status,'warning');
});
test('V3.6.30: only canonical allowed target metadata is used',async()=>{
 const r=await live.checkTarget({...live.TARGETS[3],label:'Datos privados',kind:'editorial'},
  {Parser:XmlParser,timers,fetchImpl:async()=>response(goodXml)});
 assert.equal(r.label,'Sitemap de soluciones');
 assert.equal(r.status,'warning');
});
test('V3.6.30: report covers fixed public paths only, statuses, remediation and no claims of indexing',()=>{
 const targets=live.TARGETS;
 const data=[
  {path:targets[0].path,label:'a secret',status:'error',httpStatus:404,
   details:'secret@example.com',issues:['No devuelve HTTP 200.'],warnings:[]},
  {path:targets[3].path,status:'warning',httpStatus:200,issues:[],
   warnings:['Sitemap válido pero vacío.']},
  {path:'/api/auth/me',status:'ok',httpStatus:200,details:'password',issues:['private'],warnings:[]}
 ];
 const text=report.makeReport(data,targets,new Date('2026-10-31T00:00:00Z'));
 assert.match(text,/NO confirma rastreo ni indexación/);
 assert.match(text,/HTTP: 404/);
 assert.match(text,/Revisar la ruta en el servidor/);
 assert.match(text,/Sin fichas aptas todavía/);
 assert.match(text,/resuelve\/como-funciona/);
 assert.doesNotMatch(text,/secret@example.com|password|\/api\/auth\/me|Datos privados/);
 assert.equal(text.split('\n').filter(x=>x.startsWith('[')).length,6);
 assert.ok(text.length<=7000);
 assert.equal(report.recommendation(targets[0],{status:'ok'}),'Sin incidencias técnicas detectadas en esta URL.');
});
test('V3.6.30: report remains admin-only, manual, mobile-friendly, selectable and safe',()=>{
 const html=read('src/views/resuelve-admin-v3519.html');
 const js=read('public/resuelve-admin-v3519.js');
 const css=read('public/resuelve-admin-v3519.css');
 const helper=read('public/resuelve-seo-report-v3630.js');
 const server=read('server.js');
 assert.match(server,/app\.get\('\/resuelve\/admin',requireAdmin/);
 assert.match(html,/id="resuelveAdminContent" hidden/);
 assert.match(html,/resuelve-seo-report-v3630\.js" defer/);
 assert.match(html,/id="adminSeoProductionExport" class="[^"]+" hidden/);
 assert.match(html,/id="adminSeoProductionReport" readonly/);
 assert.match(html,/id="copyAdminSeoProductionReport"/);
 assert.match(js,/el\('copyAdminSeoProductionReport'\)\.addEventListener\('click',copySeoProductionReport\)/);
 assert.match(js,/reportPanel\.hidden=false/);
 assert.match(js,/await navigator\.clipboard\.writeText/);
 assert.match(js,/input\.focus\(\);input\.select\(\)/);
 assert.match(js,/reportInput\.value=''/);
 assert.doesNotMatch(js+helper,/\.innerHTML\s*=/);
 assert.doesNotMatch(js.slice(js.indexOf('async function seoProductionCheck'),js.indexOf('const requirements=[')),/search\.google\.com|googleapis\.com|INSERT INTO|DELETE FROM/);
 assert.match(css,/\.resuelve-seo-export-v3630\[hidden\]\{display:none\}/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/min-height:46px/);
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotThrow(()=>new Function(helper));
});
