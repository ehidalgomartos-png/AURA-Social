'use strict';
// V3.2.76: links are rendered from saved captions; no database migration.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/social.js','utf8');
const read=path=>fs.readFileSync(path,'utf8');
const start=source.indexOf("function esc(s = '') {");
const end=source.indexOf('const mentionAutocompleteTimers',start);
assert.ok(start>=0 && end>start);
const context={URL};
vm.runInNewContext(source.slice(start,end)+'\nthis.render=captionHTML;',context);
const render=text=>context.render(text);

test('Marketplace links become accessible internal links in previously saved captions',()=>{
 const html=render('Mira este anuncio\nhttps://redlibertad.com/marketplace/p/77');
 assert.match(html,/Mira este anuncio<br>/);
 assert.match(html,/<a class="caption-marketplace-link-v3271" href="\/marketplace\/p\/77">Ver anuncio en Marketplace/);
 assert.doesNotMatch(html,/https:\/\/redlibertad.com\/marketplace\/p\/77/);
 assert.ok(source.includes('captionHTML(p.caption)'));
});
test('Marketplace slugs, punctuation, and multiple links retain readable layout',()=>{
 const html=render('Armario: https://redlibertad.com/marketplace/p/77/armario-turin. y https://example.com/?a=1&b=2!');
 assert.match(html,/href="\/marketplace\/p\/77\/armario-turin"/);
 assert.match(html,/>↗<\/span><\/a>\. y /);
 assert.match(html,/href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
 assert.match(html,/>https:\/\/example\.com\/\?a=1&amp;b=2<\/a>!/);
});
test('unrelated web URLs open safely and preserve ordinary text',()=>{
 const html=render('Lee https://example.org/a y sigue');
 assert.match(html,/class="caption-web-link-v3271"/);
 assert.match(html,/target="_blank" rel="noopener noreferrer nofollow ugc"/);
 assert.match(html,/Lee <a/);
 assert.match(html,/<\/a> y sigue/);
});
test('mentions and hashtags keep original handlers alongside links',()=>{
 const html=render('@muebleselchollazo #Muebles https://redlibertad.com/marketplace/p/77');
 assert.match(html,/class="mention-link" data-profile="muebleselchollazo"/);
 assert.match(html,/class="hashtag-link" data-hashtag="Muebles"/);
 assert.match(html,/class="caption-marketplace-link-v3271"/);
});
test('untrusted HTML, unsafe schemes, and lookalike hosts do not inject links',()=>{
 const html=render('<img src=x onerror=alert(1)> javascript:alert(1) https://redlibertad.com.evil.invalid/marketplace/p/77');
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/javascript:alert\(1\)/);
 assert.doesNotMatch(html,/href="javascript:/);
 assert.doesNotMatch(html,/class="caption-marketplace-link-v3271"/);
 assert.match(html,/class="caption-web-link-v3271"/);
});
test('unsafe URL credentials remain literal, not clickable',()=>{
 const html=render('https://user:pass@redlibertad.com/marketplace/p/77');
 assert.doesNotMatch(html,/<a /);
});
test('mobile styles, versioned resources, and no-auto-publish safeguards remain',()=>{
 const css=read('public/social.css');
 assert.match(css,/\.caption-marketplace-link-v3271:focus-visible/);
 assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.caption-marketplace-link-v3271\{min-height:40px/);
 assert.match(read('public/app.html'),/social\.js\?v=3\.2\.76/);
 assert.match(read('public/app.html'),/social\.css\?v=3\.2\.76/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.76');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.76'/);
 assert.ok(source.includes('async function prepareMarketplaceCommunityShareV3269'));
 assert.ok(source.includes("await api('/api/posts'"));
});
