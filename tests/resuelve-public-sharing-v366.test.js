'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {shareableResuelveUrl,renderPublicShareLinks}=
 require('../src/services/resuelve-share-page-v366');
const {renderApprovedSolution}=require('../src/routes/resuelve-public-seo-v3529');
const {renderTopicPage}=require('../src/routes/resuelve-topics-v3531');

test('V3.6.6: only canonical public approved solution and approved topic URL shapes can be shared',()=>{
 assert.equal(shareableResuelveUrl('https://redlibertad.com/resuelve/solucion/123'),true);
 assert.equal(shareableResuelveUrl('https://redlibertad.com/resuelve/temas/vida-cotidiana'),true);
 for(const url of [
  'https://evil.example/resuelve/solucion/123',
  'javascript:alert(1)','http://redlibertad.com/resuelve/solucion/123',
  'https://redlibertad.com/resuelve/pregunta/123',
  'https://redlibertad.com/resuelve/solucion/../private',
  'https://redlibertad.com/resuelve/solucion/123?q=private',
  'https://redlibertad.com/resuelve/temas/inventado',
  'https://redlibertad.com/resuelve/temas/hogar#private'
 ])assert.equal(shareableResuelveUrl(url),false,url);
 assert.equal(renderPublicShareLinks('javascript:alert(1)'), '');
});

test('V3.6.6: voluntary channels encode only the page URL and nonpersonal generic wording',()=>{
 const html=renderPublicShareLinks('https://redlibertad.com/resuelve/solucion/123');
 for(const channel of ['WhatsApp','Facebook','Telegram','Correo electrónico','Copiar enlace'])
  assert.ok(html.includes(channel),channel);
 assert.match(html,/href="https:\/\/api\.whatsapp\.com\/send\?text=/);
 assert.match(html,/href="https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
 assert.match(html,/href="https:\/\/t\.me\/share\/url\?/);
 assert.match(html,/href="mailto:\?subject=/);
 assert.match(html,/rel="noopener noreferrer"/);
 assert.match(html,/data-resuelve-copy/);
 assert.match(html,/data-resuelve-native hidden/);
 assert.match(html,/No se enviará nada automáticamente/);
 assert.doesNotMatch(html,/author_id|correo del autor|datos privados|INSERT|POST/);
});

test('V3.6.6: approved solution includes sharing but no unreviewed question preview does',()=>{
 const html=renderApprovedSolution({
  id:'123',title:'Orientación <script>alert(1)</script>',topic:'hogar',
  category:'ayuda',solution:'Una respuesta aprobada para publicación en Resuelve.'
 },{topicCount:3,related:[]});
 assert.match(html,/aria-label="Compartir esta solución revisada"/);
 assert.match(html,/data-resuelve-share-url="https:\/\/redlibertad\.com\/resuelve\/solucion\/123"/);
 assert.match(html,/src="\/resuelve-public-share-v366.js" defer/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 const preview=read('src/routes/resuelve-public-seo-v3529.js');
 const renderPreview=preview.slice(preview.indexOf('function renderQuestionSharePreview('),preview.indexOf("router.get('/pregunta/:id'"));
 assert.doesNotMatch(renderPreview,/renderPublicShareLinks|resuelve-public-share-v366/);
});

test('V3.6.6: sharing a topic appears only if it has at least 3 approved public solutions',()=>{
 const item={id:'8',title:'Un consejo',solution:'Texto real autorizado'};
 const one=renderTopicPage('hogar',[item],1,{hogar:1});
 assert.match(one,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(one,/aria-label="Compartir este tema"/);
 const many=renderTopicPage('hogar',[item,{...item,id:'9'},{...item,id:'10'}],3,{hogar:3});
 assert.match(many,/name="robots" content="index,follow"/);
 assert.match(many,/aria-label="Compartir este tema"/);
 assert.match(many,/data-resuelve-share-url="https:\/\/redlibertad\.com\/resuelve\/temas\/hogar"/);
 const source=read('src/routes/resuelve-topics-v3531.js');
 assert.match(source,/\(indexable\?renderPublicShareLinks\(canonical,'tema'\):''\)/);
 assert.match(source,/q\.topic|topics\.publishedTopic\(topic\)/);
});

test('V3.6.6: native sharing and copy have user interaction only and accessible feedback',()=>{
 const js=read('public/resuelve-public-share-v366.js');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/addEventListener\('click',async\(\)=>/);
 assert.match(js,/navigator\.clipboard\.writeText\(url\)/);
 assert.match(js,/navigator\.share\(\{title:/);
 assert.match(js,/error\?\.name!=='AbortError'/);
 assert.doesNotMatch(js,/fetch\(|sendBeacon|XMLHttpRequest|setInterval|localStorage|innerHTML/);
 const css=read('public/resuelve-v350.css');
 assert.match(css,/\.resuelve-public-share-actions/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/:focus-visible/);
});