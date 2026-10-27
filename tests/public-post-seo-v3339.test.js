'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {publicPostSeo}=require('../src/services/public-post-seo-v3339');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const post=(overrides={})=>({id:39,username:'alba',display_name:'Alba',caption:'Mis ideas sobre la fotografía',...overrides});

test('public text post receives a descriptive, escaped-at-render title and social snippet',()=>{
  const meta=publicPostSeo(post(),{indexable:true});
  assert.match(meta.title,/Mis ideas sobre la fotografía/);
  assert.match(meta.title,/Alba/);
  assert.match(meta.title,/RedLibertad/);
  assert.match(meta.description,/Publicado por Alba/);
  assert.ok(meta.title.length<=88);
  assert.ok(meta.description.length<=158);
  assert.doesNotMatch(meta.title,/Mira mi post/);
});

test('photo-only public posts use an honest and individually identifiable fallback',()=>{
  const first=publicPostSeo(post({caption:'',id:39}),{indexable:true});
  const second=publicPostSeo(post({caption:null,id:40}),{indexable:true});
  assert.match(first.title,/Publicación #39/);
  assert.notEqual(first.title,second.title);
  assert.match(first.description,/Alba/);
});

test('long multiline HTML and Unicode captions cannot inject new tags into metadata',()=>{
  const meta=publicPostSeo(post({caption:'  <script>alert("x")</script> Fotografía\n en España '.repeat(30)}),{indexable:true});
  assert.ok(!meta.title.includes('<'));
  assert.ok(!meta.description.includes('<'));
  assert.ok(meta.title.length<=88);
  assert.ok(meta.description.length<=158);
  assert.doesNotMatch(meta.description,/\n/);
});

test('sensitive, hidden-author or admin posts cannot leak captions or names into previews',()=>{
  for(const item of [
    post({caption:'DATO_SENSIBLE_123'}),
    post({display_name:'NOMBRE_OCULTO_123',caption:'DATO_SENSIBLE_123'})
  ]){
    const meta=publicPostSeo(item,{indexable:false});
    assert.equal(meta.title,'Publicación en RedLibertad');
    assert.doesNotMatch(JSON.stringify(meta),/DATO_SENSIBLE_123|NOMBRE_OCULTO_123/);
  }
});

test('public route reuses one indexability decision across robots, preview and sitemap',()=>{
  const source=read('server.js');
  const begin=source.indexOf("app.get('/p/:id'");
  const end=source.indexOf('let publicProfileSeoV177Ready',begin);
  assert.ok(begin>=0&&end>begin);
  const route=source.slice(begin,end);
  assert.match(route,/p\.moderation_status='published' AND p\.audience='public' AND u\.status='active'/);
  assert.match(route,/post\.content_level==='normal' && post\.discoverable===true && post\.is_admin===false/);
  assert.match(route,/publicPostSeo\(post,\{indexable\}\)/);
  assert.match(route,/indexable\?'index,follow,max-image-preview:large':'noindex,nofollow'/);
  assert.match(route,/setHeader\('X-Robots-Tag','noindex,nofollow'\)/);
  assert.match(route,/rel="canonical"/);
  assert.match(route,/property="og:title"/);
  assert.match(route,/name="twitter:description"/);
  assert.match(route,/data-public-share/);
  assert.match(route,/https:\/\/wa\.me\/\?text=/);
  const sitemap=source.slice(source.indexOf("app.get('/sitemap.xml'"));
  for(const condition of ["p.moderation_status='published'","p.audience='public'","p.content_level='normal'","u.status='active'","u.is_admin=false","u.discoverable=true"])assert.ok(sitemap.includes(condition),condition);
});

test('profile share and private profile noindex still work; no private paths exposed in sitemap',()=>{
  const source=read('server.js');
  const profile=source.slice(source.indexOf("app.get('/perfil/:username'"),source.indexOf("app.get('/sitemap-profiles.xml'"));
  assert.match(profile,/data-public-share/);
  assert.match(profile,/https:\/\/wa\.me\/\?text=/);
  assert.match(profile,/indexable\?'index,follow,max-image-preview:large':'noindex,nofollow'/);
  assert.match(profile,/setHeader\('X-Robots-Tag','noindex,nofollow'\)/);
  const sitemap=source.slice(source.indexOf("app.get('/sitemap-profiles.xml'"),source.indexOf("app.get('/perfiles'"));
  assert.match(sitemap,/discoverable=true/);
  assert.match(sitemap,/is_admin=false/);
});

test('CI runs the public SEO regression tests',()=>{
  const workflow=read('.github/workflows/validate-js.yml');
  assert.match(workflow,/public-post-seo-v3339\.test\.js/);
});
