'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const pages={
 'guia-pedir-ayuda':'public/resuelve-guia-pedir-ayuda-v3627.html',
 'guia-ayudar-personas':'public/resuelve-guia-ayudar-v3627.html'
};
const site='https://redlibertad.com';

function getMeta(html,name){
 const value=html.match(new RegExp('<meta name="'+name+'" content="([^"]+)"'));
 return value?.[1];
}
function getCanonical(html){
 return html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
}
function schemas(html){
 const match=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
 assert.ok(match,'one JSON-LD block');
 return JSON.parse(match[1]);
}
test('V3.6.27: editorial guides have unique specific titles and canonical self links',()=>{
 const titles=new Set();
 const descriptions=new Set();
 for(const [slug,file] of Object.entries(pages)){
  const html=read(file);
  assert.match(html,/<!doctype html>/i);
  assert.match(html,/<html lang="es">/);
  assert.equal(getCanonical(html),site+'/resuelve/'+slug);
  assert.equal(getMeta(html,'robots'),'index,follow,max-image-preview:large');
  assert.match(html,/name="viewport"/);
  assert.match(html,/name="description"/);
  assert.match(html,/property="og:title"/);
  assert.match(html,/property="og:description"/);
  assert.match(html,/property="og:url" content="https:\/\/redlibertad\.com\/resuelve\//);
  assert.match(html,/property="og:image"/);
  assert.match(html,/name="twitter:card" content="summary_large_image"/);
  assert.equal((html.match(/<h1\b/g)||[]).length,1,'one meaningful H1');
  assert.ok((html.match(/<h2\b/g)||[]).length>=5,'practical sections');
  assert.ok(html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').length>2100,'substantial useful content');
  assert.match(html,/href="#main">Saltar al contenido/);
  assert.match(html,/id="main"/);
  assert.match(html,/href="\/resuelve\/como-funciona"/);
  assert.match(html,/href="\/privacy\/"/);
  assert.match(html,/href="\/community-guidelines\/"/);
  assert.match(html,/href="\/resuelve#questions"|href="\/resuelve\?registro=1"/);
  const title=html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description=getMeta(html,'description');
  assert.ok(title&&description);
  assert.ok(title.length>=25&&title.length<=65);
  assert.ok(description.length>=85&&description.length<=165);
  titles.add(title);
  descriptions.add(description);
  const all=schemas(html);
  assert.equal(all.length,2);
  assert.deepEqual(all.map(x=>x['@type']),['WebPage','BreadcrumbList']);
  assert.equal(all[0].url,getCanonical(html));
  assert.equal(all[0].inLanguage,'es-ES');
  assert.equal(all[1].itemListElement.length,2);
  assert.equal(all[1].itemListElement[1].item,getCanonical(html));
  assert.doesNotMatch(html,/aggregateRating|ratingValue|reviewCount|miles de usuarios|caso real (?:de|inventado)/i);
 }
 assert.equal(titles.size,2);
 assert.equal(descriptions.size,2);
});
test('V3.6.27: guides teach practical steps without publishing private user questions',()=>{
 const ask=read(pages['guia-pedir-ayuda']);
 const help=read(pages['guia-ayudar-personas']);
 for(const phrase of ['contraseñas','direcciones','qué has probado','consentimiento','Google'])
  assert.ok(ask.toLowerCase().includes(phrase.toLowerCase()),'ask guide: '+phrase);
 for(const phrase of ['Sin respuestas','experiencia','fuentes oficiales','interés comercial','límites'])
  assert.ok(help.toLowerCase().includes(phrase.toLowerCase()),'help guide: '+phrase);
 assert.match(ask,/href="\/resuelve\/guia-ayudar-personas"/);
 assert.match(help,/href="\/resuelve\/guia-pedir-ayuda"/);
 assert.match(ask,/Ejemplo orientativo/);
 assert.match(help,/Ejemplo orientativo/);
 assert.doesNotMatch(ask+help,/q\.body|author_username|user_id|email\s*de\s*usuario/i);
});
test('V3.6.27: routes are server-rendered static pages before the fallback and preserve public safety',()=>{
 const server=read('server.js');
 const a=server.indexOf("['/resuelve/guia-pedir-ayuda','resuelve-guia-pedir-ayuda-v3627.html']");
 const b=server.indexOf("['/resuelve/guia-ayudar-personas','resuelve-guia-ayudar-v3627.html']");
 assert.ok(a>0&&b>a);
 assert.ok(server.includes("res.setHeader('X-Robots-Tag','index,follow')"));
 assert.match(server,/app\.get\(url,\(_req,res\)=>\{/);
 assert.match(server,/res\.sendFile\(path\.join\(__dirname,'public',file\)\)/);
 assert.ok(a<server.indexOf("app.get('/resuelve/admin'"));
 assert.ok(a<server.indexOf("app.get('/resuelve',"));
 assert.ok(a<server.indexOf("app.get('*',"));
 assert.match(server,/app\.get\('\/resuelve',\(_req,res\)=>\{[\s\S]*?X-Robots-Tag','noindex,follow'/);
 const source=read('src/routes/resuelve-public-seo-v3529.js');
 const service=read('src/services/resuelve-v350.js');
 assert.match(source,/res\.set\('X-Robots-Tag','noindex,nofollow'\)/);
 assert.match(source,/if\(!item\)return res\.status\(404\)/);
 assert.match(service,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(service,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(service,/a\.status='visible'/);
});
test('V3.6.27: sitemap adds only editorial pages and retains consent-controlled dynamic sitemaps',()=>{
 const server=read('server.js');
 const sitemap=server.slice(server.indexOf("app.get('/sitemap-resuelve-presentacion.xml'"),
  server.indexOf("// V3.5.33 — landing de explicación"));
 assert.match(sitemap,/https:\/\/redlibertad\.com\/resuelve\/como-funciona/);
 assert.match(sitemap,/https:\/\/redlibertad\.com\/resuelve\/guia-pedir-ayuda/);
 assert.match(sitemap,/https:\/\/redlibertad\.com\/resuelve\/guia-ayudar-personas/);
 assert.equal((sitemap.match(/<url><loc>/g)||[]).length,3);
 assert.doesNotMatch(sitemap,/\/resuelve\/pregunta\/|\/resuelve\/solucion\/|\/resuelve\/temas\//);
 assert.match(server,/app\.get\('\/sitemap-resuelve\.xml',resuelveSitemapHandler\)/);
 assert.match(server,/app\.get\('\/sitemap-resuelve-temas\.xml',topicsSitemapHandler\)/);
 assert.match(server,/Sitemap: \${origin}\/sitemap-resuelve-presentacion\.xml/);
});
test('V3.6.27: guides have crawlable, contextual, mobile-accessible internal links',()=>{
 const about=read('public/resuelve-como-funciona-v3533.html');
 const home=read('public/resuelve.html');
 const aboutCss=read('public/resuelve-como-funciona-v3533.css');
 const homeCss=read('public/resuelve-v350.css');
 for(const slug of Object.keys(pages)){
  assert.ok(about.includes('href="/resuelve/'+slug+'"'));
  assert.ok(home.includes('href="/resuelve/'+slug+'"'));
 }
 assert.equal((about.match(/RESUELVE_PUBLIC_TOPICS_V3619/g)||[]).length,1,'existing dynamic topic links intact');
 assert.match(about,/id="publicGuidesTitleV3627"/);
 assert.match(home,/class="resuelve-guide-shortcuts-v3627"/);
 const ab=aboutCss.slice(aboutCss.indexOf('/* V3.6.27'));
 assert.match(ab,/@media\(max-width:720px\)/);
 assert.match(ab,/:focus-visible/);
 assert.match(ab,/min-height:44px/);
 const hb=homeCss.slice(homeCss.indexOf('/* V3.6.27 — enlaces editoriales'),homeCss.indexOf('/* V3.6.23'));
 assert.match(hb,/@media\(max-width:650px\)/);
 assert.match(hb,/min-height:46px/);
 assert.match(hb,/:focus-visible/);
 const guideCss=read('public/resuelve-guias-v3627.css');
 assert.match(guideCss,/@media\(max-width:720px\)/);
 assert.match(guideCss,/min-height:46px/);
 assert.match(guideCss,/:focus-visible/);
 assert.doesNotMatch(ab+hb+guideCss,/outline:none|position:fixed|display:none|scroll-snap-type/i);
});
