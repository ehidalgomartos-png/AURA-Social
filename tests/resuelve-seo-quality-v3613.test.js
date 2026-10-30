'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {renderApprovedSolution}=require('../src/routes/resuelve-public-seo-v3529');
const {renderTopicPage,xmlTopicsSitemap}=require('../src/routes/resuelve-topics-v3531');
const {TOPICS}=require('../src/services/resuelve-topics-v3531');
function tag(html,name){
 const m=html.match(new RegExp('<meta name="'+name+'" content="([^"]*)"'));
 return m?.[1]??null;
}
function schemas(html){
 return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map(m=>JSON.parse(m[1]));
}

test('V3.6.13: portada de Resuelve explica ayuda real y publica datos estructurados honestos',()=>{
 const html=read('public/resuelve-como-funciona-v3533.html');
 const title=html.match(/<title>([^<]+)<\/title>/)?.[1];
 assert.ok(title.startsWith('Cómo funciona Resuelve'));
 assert.ok(title.length<70);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.match(html,/<h1 id="aboutTitle">Pide ayuda, encuentra respuestas y comparte experiencias/);
 assert.match(html,/Sin presión para comprar, contratar o vender/);
 assert.match(html,/Para aparecer en buscadores requiere, además, tu autorización/);
 assert.match(html,/href="\/resuelve\?registro=1"/);
 assert.match(html,/href="\/resuelve#questions"/);
 assert.equal(tag(html,'robots'),'index,follow,max-image-preview:large');
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/resuelve\/como-funciona"/);
 const pages=schemas(html);
 assert.equal(pages.length,1);
 assert.equal(pages[0]['@type'],'WebPage');
 assert.equal(pages[0].url,'https://redlibertad.com/resuelve/como-funciona');
 assert.equal(pages[0].isPartOf.name,'RedLibertad');
 assert.ok(!html.includes('name="keywords"'));
 assert.doesNotMatch(html,/aggregateRating|ratingValue|fake reviews|miles de usuarios|FAQPage/);
});

test('V3.6.13: solución extensa conserva título original, HTML seguro y metadatos breves',()=>{
 const fullTitle='¿Cómo puedo organizar una copia de seguridad de mis documentos importantes y revisar los archivos sin perder mis fotos antiguas?';
 const answer='Primero conviene preparar una copia de los archivos y después revisar las carpetas con calma. '.repeat(6);
 const page=renderApprovedSolution({
  id:'123',title:fullTitle,solution:answer,category:'consejo',topic:'hogar'
 },{topicCount:3,related:[{id:'124',title:'Otra solución real'}]});
 const title=page.match(/<title>([^<]+)<\/title>/)?.[1];
 assert.ok(title.length<=70,title);
 assert.match(title,/\| Resuelve$/);
 assert.ok(page.includes('<h1>'+fullTitle.slice(0,125)+'</h1>'));
 const description=tag(page,'description');
 assert.ok(description.length>=80&&description.length<=160,description);
 assert.doesNotMatch(description,/miles de usuarios|compra ya/i);
 assert.match(page,/rel="canonical" href="https:\/\/redlibertad.com\/resuelve\/solucion\/123"/);
 assert.equal(tag(page,'robots'),'index,follow');
 assert.equal(tag(page,'twitter:card'),'summary_large_image');
 assert.match(page,/meta name="twitter:title"/);
 assert.match(page,/meta name="twitter:description"/);
 assert.match(page,/meta property="og:image"/);
 assert.match(page,/href="\/resuelve\/temas\/hogar"/);
 assert.match(page,/href="\/resuelve\/solucion\/124"/);
 const all=schemas(page);
 assert.deepEqual(all.map(x=>x['@type']),['Article','BreadcrumbList']);
 assert.equal(all[0].headline,fullTitle.slice(0,125));
 assert.equal(all[0].mainEntityOfPage,'https://redlibertad.com/resuelve/solucion/123');
 assert.equal(all[1].itemListElement.length,3);
 assert.doesNotMatch(page,/aggregateRating|ratingValue|reviewCount/);
});

test('V3.6.13: metadatos de solución escapan caracteres y evitan HTML ejecutable',()=>{
 const page=renderApprovedSolution({
  id:'9',title:'Consejo </script><script>alert(1)</script>',
  solution:'Sin vender productos: <img src=x onerror=alert(1)> y experiencias compartidas de verdad.',
  category:'ayuda'
 });
 assert.doesNotMatch(page,/<script>alert\(1\)<\/script>|<img src=x onerror=/);
 assert.match(page,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(page,/\\u003c\/script>/);
 assert.throws(()=>renderApprovedSolution({id:'../3'}),/invalid_id/);
});

test('V3.6.13: temas solo obtienen breadcrumbs e indexación si tienen suficientes soluciones aprobadas',()=>{
 const item={id:'19',title:'Consejo útil',solution:'Información revisada con autorización real.'};
 const thin=renderTopicPage('hogar',[item],1,{hogar:1,tecnologia:0});
 assert.equal(tag(thin,'robots'),'noindex,follow');
 assert.equal(schemas(thin).length,0);
 assert.doesNotMatch(thin,/aria-label="Compartir este tema"/);
 const populated=renderTopicPage('hogar',[item,{...item,id:'20'},{...item,id:'21'}],3,
  {hogar:3,tecnologia:3,'vida-cotidiana':0});
 assert.equal(tag(populated,'robots'),'index,follow');
 assert.match(populated,/<h1>Consejos y soluciones: Hogar<\/h1>/);
 assert.equal(tag(populated,'twitter:card'),'summary_large_image');
 assert.match(populated,/property="og:image"/);
 const blocks=schemas(populated);
 assert.deepEqual(blocks.map(x=>x['@type']),['CollectionPage','BreadcrumbList']);
 assert.equal(blocks[1].itemListElement[1].item,'https://redlibertad.com/resuelve/temas/hogar');
 assert.match(populated,/href="\/resuelve\/temas\/tecnologia"/);
 assert.doesNotMatch(populated,/href="\/resuelve\/temas\/vida-cotidiana"/);
 const xml=xmlTopicsSitemap({hogar:3,tecnologia:2,'vida-cotidiana':0});
 assert.match(xml,/\/resuelve\/temas\/hogar/);
 assert.doesNotMatch(xml,/\/resuelve\/temas\/tecnologia/);
 assert.deepEqual(Object.keys(TOPICS),['hogar','tecnologia','tramites','estudios','vida-cotidiana']);
});

test('V3.6.13: ninguna mejora evita consentimiento, aprobación o bloqueo por opt-out',()=>{
 const service=read('src/services/resuelve-v350.js');
 const sql=service.slice(service.indexOf('async function publicSeoSolution('),
  service.indexOf('async function sitemapSeoSolutions('));
 assert.match(sql,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(sql,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(sql,/a\.status='visible'/);
 assert.match(sql,/author\.status='active'/);
 assert.match(sql,/respondent\.status='active'/);
 assert.doesNotMatch(sql,/email|password|reporter_id|DELETE|UPDATE|INSERT/);
 const route=read('src/routes/resuelve-public-seo-v3529.js');
 assert.match(route,/res\.set\('X-Robots-Tag','noindex,nofollow'\)/);
 assert.match(route,/if\(!item\)return res\.status\(404\)/);
 assert.match(route,/res\.set\('X-Robots-Tag','index,follow'\)/);
 assert.match(route,/res\.set\('Cache-Control','no-store'\)/);
});
