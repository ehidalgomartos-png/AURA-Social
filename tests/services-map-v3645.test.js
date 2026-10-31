'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const express=require('express');
const {groups,allServices,renderMap,esc}=require('../src/services/services-map-v3645');
const {router}=require('../src/routes/services-map-v3645');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const known={
 resuelve:'/resuelve',ayudar:'/resuelve#questions',soluciones:'/resuelve#solutions',
 noticias:'/noticias',voces:'/noticias/redactores',articulos:'/noticias/redactores/voces',guias:'/guias',
 marketplace:'/marketplace/explorar',comparador:'/comparar',tiendas:'/comparar/comercios/tiendas',
 personas:'/perfiles',comunidades:'/comunidades',publicaciones:'/publicaciones',reels:'/reels',
 eventos:'/eventos',buscar:'/buscar',cuenta:'/app'
};
test('V3.6.45: cuatro áreas, enlaces reales y cero datos especulativos',()=>{
 assert.deepEqual(groups.map(g=>g.id),['ayuda','informacion','comercio','comunidad']);
 const services=allServices();
 assert.equal(services.length,17);
 assert.equal(new Set(services.map(x=>x.id)).size,17);
 for(const s of services){
  assert.equal(s.href,known[s.id],s.id+' must use a real first-party path');
  assert.match(s.href,/^\/(?!\/)[A-Za-z0-9/#-]+$/);
  assert.ok(s.title&&s.description&&s.tag&&s.keywords);
 }
 const html=renderMap();
 assert.match(html,/id="sm-title">Todo RedLibertad/);
 assert.match(html,/id="sm-search" type="search"/);
 assert.match(html,/Mostrando 17 servicios y accesos/);
 assert.match(html,/data-map-section="ayuda"/);
 assert.match(html,/data-map-section="informacion"/);
 assert.match(html,/data-map-section="comercio"/);
 assert.match(html,/data-map-section="comunidad"/);
 assert.equal((html.match(/data-service-id="/g)||[]).length,17);
 assert.match(html,/href="\/resuelve"/);
 assert.match(html,/href="\/comparar"/);
 assert.match(html,/href="\/noticias\/redactores"/);
 assert.match(html,/href="\/comunidades"/);
 assert.doesNotMatch(html,/\b\d+ usuarios conectados|testimonios inventados|nuevas notificaciones/);
 assert.equal(esc('<script>foo&"\'</script>'),'&lt;script&gt;foo&amp;&quot;&#39;&lt;/script&gt;');
});
test('V3.6.45: HTML SEO, navegación y accesibilidad sin depender del navegador',()=>{
 const html=renderMap();
 assert.match(html,/lang="es"/);
 assert.match(html,/meta name="description"/);
 assert.match(html,/meta name="robots" content="index,follow/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad\.com\/explorar"/);
 assert.match(html,/property="og:title"/);
 assert.match(html,/href="#sm-main">Saltar al contenido/);
 assert.match(html,/aria-labelledby="sm-catalog-title"/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.match(html,/id="sm-no-results"[^>]*hidden/);
 assert.match(html,/link rel="stylesheet" href="\/services-map-v3645.css/);
 assert.match(html,/script defer src="\/services-map-v3645.js/);
 assert.match(html,/href="\/privacy\//);
 assert.match(html,/href="\/terms\//);
 assert.ok(html.indexOf('id="sm-main"')>0);
 assert.doesNotMatch(html,/onerror=|onclick=|onload=|<iframe|<form/);
});
test('V3.6.45: ruta pública /explorar y alias canónico /servicios',async()=>{
 const app=express();app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const page=await fetch(url+'/explorar');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-type'),/text\/html/);
  const body=await page.text();
  assert.match(body,/Explora RedLibertad/);
  assert.match(body,/href="\/marketplace\/explorar"/);
  const alias=await fetch(url+'/servicios',{redirect:'manual'});
  assert.equal(alias.status,301);
  assert.equal(alias.headers.get('location'),'/explorar');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('V3.6.45: búsqueda en cliente admite tildes y no envía consultas',()=>{
 const script=read('public/services-map-v3645.js');
 const input={value:'',listeners:{},focused:false,
  addEventListener(type,cb){this.listeners[type]=cb;},
  focus(){this.focused=true;}
 };
 const status={textContent:''};
 const empty={hidden:true};
 const reset={listeners:{},addEventListener(type,cb){this.listeners[type]=cb;}};
 const sections=groups.map(g=>{
  const cards=g.services.map(s=>({
   hidden:false,dataset:{serviceId:s.id,search:[s.title,s.description,s.tag,s.keywords].join(' ')}
  }));
  return{hidden:false,dataset:{mapSection:g.id},querySelectorAll:()=>cards,cards};
 });
 const elements={'sm-search':input,'sm-search-status':status,'sm-no-results':empty,'sm-clear':reset};
 const document={getElementById:id=>elements[id],querySelectorAll:selector=>selector==='[data-map-section]'?sections:[]};
 vm.runInNewContext(script,{document,Number,String,Array}, {timeout:2000});
 assert.match(status.textContent,/17 servicios/);
 input.value='notícias';input.listeners.input();
 assert.ok(sections.some(g=>g.cards.some(c=>c.dataset.serviceId==='noticias'&&!c.hidden)));
 assert.ok(sections.some(g=>g.hidden));
 input.value='Comparar';input.listeners.input();
 const compare=sections.flatMap(g=>g.cards).filter(c=>!c.hidden);
 assert.ok(compare.some(c=>c.dataset.serviceId==='comparador'));
 assert.ok(compare.every(c=>!c.hidden));
 input.value='algo que no está';input.listeners.input();
 assert.equal(empty.hidden,false);
 assert.equal(status.textContent,'No hay servicios que coincidan con tu búsqueda.');
 reset.listeners.click();
 assert.equal(input.value,'');
 assert.equal(input.focused,true);
 assert.equal(empty.hidden,true);
 assert.match(status.textContent,/17 servicios/);
 assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|\.innerHTML\s*=/);
});
test('V3.6.45: integración en Home, app y sitemap; móvil sin barra adicional',()=>{
 const server=read('server.js'),app=read('public/app.html'),home=read('public/index.html');
 const css=read('public/services-map-v3645.css');
 const entry=read('public/services-map-entry-v3645.css');
 assert.match(server,/app\.use\(servicesMapV3645\)/);
 assert.match(server,/Allow: \/explorar/);
 assert.match(server,/escapeHtml\(origin\+'\/explorar'\)/);
 assert.match(server,/services-map-v3645/);
 assert.match(app,/services-map-side-link-v3645" href="\/explorar"/);
 assert.match(app,/services-map-explore-entry-v3645/);
 assert.match(home,/href="\/explorar">Ver todos los servicios/);
 assert.match(css,/@media\(max-width:1050px\)/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:355px\)/);
 assert.match(css,/max-width:600px[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/position:fixed|pointer-events:none|outline:none/);
 assert.match(entry,/@media\(max-width:650px\)/);
});
