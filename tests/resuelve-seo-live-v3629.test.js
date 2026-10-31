'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const check=require('../public/resuelve-seo-live-v3629.js');
const BASE='https://redlibertad.com';

class Parser{
 parseFromString(input,type){
  if(type==='text/html'){
   const meta=(selector)=>{
    const field=selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
    const re=field?new RegExp('<meta[^>]*'+field[1]+'="'+field[2]+'"[^>]*>','i'):
     /<link[^>]*rel="canonical"[^>]*>/i;
    const tag=input.match(re)?.[0]||'';
    return tag?{getAttribute:key=>tag.match(new RegExp(key+'="([^"]*)"','i'))?.[1]||null}:null;
   };
   return {title:input.match(/<title>([^<]*)<\/title>/i)?.[1]||'',
    head:{querySelector:meta},
    querySelector:s=>s==='main h1'&&/<main[\s>][\s\S]*?<h1\b/i.test(input)?{}:null,
    documentElement:{getAttribute:()=>input.match(/<html[^>]*lang="([^"]*)"/i)?.[1]||''}};
  }
  const xml=/^<\?xml[^>]*\?>\s*<urlset\b[\s\S]*<\/urlset>\s*$/i.test(input);
  const urls=[...input.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map(m=>({
   getElementsByTagName:n=>n==='loc'?[{textContent:m[1].match(/<loc>([\s\S]*?)<\/loc>/)?.[1]||''}]:[]
  }));
  return {documentElement:{localName:xml?'urlset':'html'},
   getElementsByTagName:name=>name==='parsererror'?(xml?[]:[{}]):name==='url'?urls:[]};
 }
}
function page(path){
 return '<!doctype html><html lang="es"><head><title>Guía clara de participación en Resuelve</title>'+
  '<meta name="description" content="Guía práctica y sencilla para orientar a las personas sobre cómo compartir sus conocimientos en Resuelve.">'+
  '<meta name="robots" content="index,follow">'+
  '<meta property="og:url" content="'+BASE+path+'">'+
  '<link rel="canonical" href="'+BASE+path+'"></head>'+
  '<body><main><h1>Cómo participar</h1></main></body></html>';
}
function sitemap(urls){
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
  urls.map(url=>'<url><loc>'+url+'</loc></url>').join('')+'</urlset>';
}
const clocks={after:()=>123,clear:()=>{}};
function response(text,type,status=200){
 return {status,type:'basic',headers:{get:key=>key==='content-type'?type:null},text:async()=>text};
}

test('V3.6.29: only the six fixed public paths may be audited',async()=>{
 assert.deepEqual(check.TARGETS.map(t=>t.path),[
  '/resuelve/como-funciona','/resuelve/guia-pedir-ayuda','/resuelve/guia-ayudar-personas',
  '/sitemap-resuelve.xml','/sitemap-resuelve-temas.xml','/sitemap-resuelve-presentacion.xml'
 ]);
 await assert.rejects(()=>check.checkTarget({path:'/api/auth/me',type:'html'}),/ruta_fuera_de_la_lista/);
 assert.equal(check.allowedLocation('solutions',BASE+'/resuelve/solucion/18'),true);
 assert.equal(check.allowedLocation('solutions',BASE+'/resuelve/solucion/18?preview=1'),false);
 assert.equal(check.allowedLocation('solutions','https://other.example/resuelve/solucion/18'),false);
 assert.equal(check.allowedLocation('topics',BASE+'/resuelve/temas/hogar'),true);
 assert.equal(check.allowedLocation('topics',BASE+'/resuelve/temas/no-valid'),false);
 assert.equal(check.allowedLocation('editorial',BASE+'/resuelve/guia-pedir-ayuda'),true);
 assert.equal(check.allowedLocation('editorial',BASE+'/resuelve/admin'),false);
});
test('V3.6.29: the three existing static guide pages have sound technical SEO',()=>{
 const files=[
  ['public/resuelve-como-funciona-v3533.html','/resuelve/como-funciona'],
  ['public/resuelve-guia-pedir-ayuda-v3627.html','/resuelve/guia-pedir-ayuda'],
  ['public/resuelve-guia-ayudar-v3627.html','/resuelve/guia-ayudar-personas']
 ];
 for(const [file,url] of files){
  const result=check.inspectHtml(read(file),{path:url},{Parser});
  assert.equal(result.status,'ok',file+' '+result.issues.join('; '));
  assert.ok(result.details.length>=12);
 }
 const target={path:'/resuelve/guia-pedir-ayuda'};
 const blocked=check.inspectHtml(page(target.path).replace('index,follow','noindex,nofollow'),target,{Parser});
 assert.equal(blocked.status,'error');
 assert.ok(blocked.issues.some(s=>s.includes('noindex')));
 const wrong=check.inspectHtml(page(target.path).replace('href="'+BASE+target.path+'"','href="https://elsewhere.example/"'),target,{Parser});
 assert.equal(wrong.status,'error');
 assert.ok(wrong.issues.some(s=>s.includes('Canonical')));
 const header=check.inspectHtml(page(target.path),target,{Parser,headerRobots:'noindex'});
 assert.equal(header.status,'error');
});
test('V3.6.29: sitemaps accept only safe paths; empty dynamic sitemaps are not fake failures',()=>{
 const editorial=check.inspectSitemap(sitemap(check.GUIDE_PATHS.map(p=>BASE+p)),
  check.TARGETS[5],{Parser});
 assert.equal(editorial.status,'ok');
 assert.equal(editorial.entries,3);
 assert.equal(check.inspectSitemap('<html>error</html>',check.TARGETS[5],{Parser}).status,'error');
 assert.equal(check.inspectSitemap(sitemap([BASE+check.GUIDE_PATHS[0]]),check.TARGETS[5],{Parser}).status,'error');
 const bad=check.inspectSitemap(sitemap([BASE+'/resuelve/admin']),check.TARGETS[3],{Parser});
 assert.equal(bad.status,'error');
 const empty=check.inspectSitemap(sitemap([]),check.TARGETS[4],{Parser});
 assert.equal(empty.status,'warning');
 assert.equal(empty.entries,0);
 assert.match(empty.warnings.join(' '),/todavía no hay fichas aptas/);
});
test('V3.6.29: browser check is read-only GET with no redirects or cross-site requests',async()=>{
 const target=check.TARGETS[0];
 const calls=[];
 const success=await check.checkTarget(target,{Parser,timers:clocks,
  fetchImpl:async(path,opts)=>{
   calls.push({path,opts});
   return response(page(path),'text/html; charset=utf-8');
  }});
 assert.equal(success.status,'ok');
 assert.equal(success.httpStatus,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,target.path);
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(calls[0].opts.credentials,'same-origin');
 assert.equal(calls[0].opts.cache,'no-store');
 assert.equal(calls[0].opts.redirect,'manual');
 assert.ok(calls[0].opts.signal);
 const redirect=await check.checkTarget(target,{Parser,timers:clocks,fetchImpl:async()=>response('','text/html',302)});
 assert.equal(redirect.status,'error');
 assert.equal(redirect.httpStatus,302);
 const notFound=await check.checkTarget(target,{Parser,timers:clocks,fetchImpl:async()=>response('','text/html',404)});
 assert.equal(notFound.status,'error');
 const badType=await check.checkTarget(target,{Parser,timers:clocks,fetchImpl:async()=>response(sitemap([]),'application/xml')});
 assert.equal(badType.status,'error');
 const network=await check.checkTarget(target,{Parser,timers:clocks,fetchImpl:async()=>{throw Error('network error');}});
 assert.equal(network.status,'error');
 assert.equal(network.httpStatus,null);
 const oversized=await check.checkTarget(target,{Parser,timers:clocks,fetchImpl:async()=>response('X'.repeat(1500001),'text/html')});
 assert.equal(oversized.status,'error');
});
test('V3.6.29: manual control remains admin-only and does not auto-run',()=>{
 const html=read('src/views/resuelve-admin-v3519.html');
 const client=read('public/resuelve-admin-v3519.js');
 const helper=read('public/resuelve-seo-live-v3629.js');
 const css=read('public/resuelve-admin-v3519.css');
 const server=read('server.js');
 assert.match(server,/app\.get\('\/resuelve\/admin',requireAdmin/);
 assert.match(html,/id="resuelveAdminContent" hidden/);
 assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.match(html,/src="\/resuelve-seo-live-v3629.js" defer/);
 for(const id of ['checkAdminSeoProduction','adminSeoProductionStatus','adminSeoProductionResults','adminSeoProductionTitle'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(client,/el\('checkAdminSeoProduction'\)\.addEventListener\('click',seoProductionCheck\)/);
 assert.doesNotMatch(client,/void seoProductionCheck\(\)|await seoProductionCheck\(\)/);
 assert.match(client,/api\('\/api\/auth\/me'\)/);
 assert.match(client,/if\(!me.user\?\.is_admin&&!me.user\?\.isAdmin\)/);
 assert.match(helper,/credentials:'same-origin'/);
 assert.match(helper,/redirect:'manual'/);
 assert.doesNotMatch(helper,/search\.google\.com|googleapis\.com|Bing|http\.request/);
 assert.doesNotMatch(client+helper,/\.innerHTML\s*=/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/\.resuelve-seo-production-v3629 a:focus-visible/);
 assert.match(css,/min-height:46px/);
 assert.doesNotMatch(css.slice(css.indexOf('/* V3.6.29'),css.indexOf('/* V3.6.30')),/display:none|position:fixed/);
 assert.doesNotThrow(()=>new Function(client));
 assert.doesNotThrow(()=>new Function(helper));
});
test('V3.6.29: admin shows factual statuses and never labels pages as Google indexed',async()=>{
 const js=read('public/resuelve-admin-v3519.js');
 const start=js.indexOf(' async function seoProductionCheck(){');
 const end=js.indexOf(' const requirements=[',start);
 assert.ok(start>0&&end>start);
 const elements={checkAdminSeoProduction:{disabled:false},
  adminSeoProductionStatus:{textContent:''},
  adminSeoProductionResults:{children:[],replaceChildren(...v){this.children=v;},append(x){this.children.push(x);}}};
 const node=(tag,cls,value)=>({tag,cls,textContent:value===undefined?'':String(value),
  children:[],append(...xs){this.children.push(...xs);}});
 const targets=check.TARGETS.slice(0,3);
 let calls=0;
 const checks={TARGETS:targets,checkTarget:async target=>{
  calls++;return {label:target.label,httpStatus:200,details:'HTML',
   status:calls===1?'ok':calls===2?'warning':'error',
   warnings:calls===2?['Revisar descripción.']:[],
   issues:calls===3?['Canonical incorrecto.']:[]};
 }};
 const context=vm.createContext({el:id=>elements[id],node,window:{ResuelveSeoLiveChecks:checks},Date});
 vm.runInContext(js.slice(start,end)+';globalThis.runAudit=seoProductionCheck;',context);
 await context.runAudit();
 assert.equal(calls,3);
 assert.equal(elements.adminSeoProductionResults.children.length,3);
 assert.match(elements.adminSeoProductionStatus.textContent,/1 correctas, 1 para revisar y 1 con errores/);
 assert.match(elements.adminSeoProductionStatus.textContent,/No indica indexación en Google/);
 assert.equal(elements.adminSeoProductionResults.children[2].children[0].children[1].textContent,'Error técnico');
 assert.equal(elements.checkAdminSeoProduction.disabled,false);
});
