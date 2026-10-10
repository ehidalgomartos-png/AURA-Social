'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {page}=require('../src/routes/editorial-publication-v323');
const communityRouter=require('../src/public-community-seo-v180');

test('noticia móvil muestra cuatro destinos distintos y barra superior apunta a Mi perfil',()=>{
 const html=page({title:'Noticia',description:'Resumen',pathname:'/noticias/p/19',body:'<p>Contenido</p>'});
 const nav=html.match(/<nav class="ed-mobile-nav"[^>]*>([\s\S]*?)<\/nav>/);
 assert.ok(nav);
 for(const label of ['Inicio','Noticias','Comunidades','Explorar']){
  assert.ok(nav[1].includes('<small>'+label+'</small>'),label);
 }
 assert.ok(!nav[1].includes('<small>Mi inicio</small>'));
 assert.match(html,/data-ed-logged-label="Mi perfil"/);
 assert.match(html,/data-ed-route="communities" data-ed-news-return="\/noticias\/p\/19"/);
 assert.match(html,/href="\/comunidades\?volver=%2Fnoticias%2Fp%2F19"/);
 assert.match(html,/editorial-session-v3212\.js\?v=3\.2\.14/);
 assert.match(html,/rel="canonical"/);
});

function fakeLink(route='',returnTo=''){
 const attrs={};
 return {
  dataset:route?{edRoute:route,edNewsReturn:returnTo}:{edLoggedLabel:'Mi perfil'},
  href:route==='communities'?'/comunidades?volver=%2Fnoticias%2Fp%2F19':'/app',
  textContent:'Entrar',
  querySelector(){return null;},
  setAttribute(name,value){attrs[name]=value;},
  attrs
 };
}
async function simulateSession(ok){
 const top=fakeLink();
 const community=fakeLink('communities','/noticias/p/19');
 const explore=fakeLink('explore');
 const js=read('public/editorial-session-v3212.js');
 vm.runInNewContext(js,{
  document:{querySelectorAll(selector){return selector==='[data-ed-auth-link]'?[top]:[community,explore];}},
  window:{addEventListener(){}},
  fetch:async()=>({ok})
 },{filename:'editorial-session-v3212.js'});
 await new Promise(resolve=>setImmediate(resolve));
 return {top,community,explore};
}
test('usuarios con sesión: perfil y comunidades internos, Explorador interno y vuelta a la noticia',async()=>{
 const {top,community,explore}=await simulateSession(true);
 assert.equal(top.href,'/app?view=profile');
 assert.equal(top.textContent,'Mi perfil');
 assert.equal(community.href,'/app?view=communities&volver=%2Fnoticias%2Fp%2F19');
 assert.equal(explore.href,'/app?view=explore');
 assert.equal(top.attrs['aria-label'],'Ir a mi perfil de RedLibertad');
});
test('visitantes: Entrar, comunidades públicas con botón de regreso y descubrir público',async()=>{
 const {top,community,explore}=await simulateSession(false);
 assert.equal(top.href,'/app');
 assert.equal(top.textContent,'Entrar');
 assert.equal(community.href,'/comunidades?volver=%2Fnoticias%2Fp%2F19');
 assert.equal(explore.href,'/descubrir');
});
test('la app acepta comunidades en la navegación profunda y conserva un enlace de retorno seguro',()=>{
 const js=read('public/social.js');
 const html=read('public/app.html'),css=read('public/social.css');
 assert.match(js,/\['feed','explore','communities','reels','messages','notifications','profile'\]\.includes\(view\)/);
 assert.match(js,/editorialCommunityReturn/);
 assert.match(js,/editorialReturn\.hidden=view!=='communities'\|\|!safe/);
 assert.match(html,/id="editorialCommunityReturn"/);
 assert.match(html,/social\.js\?v=3\.2\.24\.3/);
 assert.match(css,/\.editorial-community-return\[hidden\]\{display:none!important\}/);
});
test('el regreso del directorio público acepta solo URLs internas de Noticias',()=>{
 const validate=communityRouter.editorialReturnPath;
 assert.equal(typeof validate,'function');
 for(const good of ['/noticias','/noticias/p/19','/noticias/perfil/redlibertad-tecnologia']){
   assert.equal(validate({query:{volver:good}}),good);
 }
 for(const bad of ['https://example.com','//evil.com','/%2fevil.com','/admin','/app','/noticias/../../../admin',
  '/noticias/p/0','/noticias/p/12<script>','/noticias/p/123456789012345678','/noticias?next=https://evil.com']){
   assert.equal(validate({query:{volver:bad}}),null,bad);
 }
 const src=read('src/public-community-seo-v180.js');
 assert.match(src,/communityReturnNav\(req\)\+body/);
 assert.match(src,/Volver a la noticia/);
 assert.match(src,/name="volver"/);
 assert.match(src,/keepEditorialBack\(pathFor\(c\)\)/);
 assert.match(src,/keepEditorialBack\(prev\)/);
 assert.match(src,/keepEditorialBack\(next\)/);
});
test('la corrección es solo navegación; no cambia RSS, publicación humana ni autenticación',()=>{
 assert.match(read('server.js'),/const APP_VERSION='3\.2\.24\.3'/);
 assert.match(read('package.json'),/"version": "3\.2\.24\+polish\.3"/);
 const publishing=read('src/routes/editorial-publication-v323.js');
 assert.match(publishing,/editorial_quality_clearance_required/);
 assert.match(publishing,/admin\.post\('\/publish\/:candidateId'/);
 assert.match(read('src/services/editorial-v320.js'),/CHECK\(NOT auto_publish_enabled\)/);
});
