'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validPublicPostId,publicPostPreview}=require('../src/services/public-post-privacy-v3340');
const {publicPostSeo}=require('../src/services/public-post-seo-v3339');
const read=path=>fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8');
const post=(extra={})=>({id:42,username:'ana',display_name:'Ana',caption:'Contenido publicado',content_level:'normal',discoverable:true,is_admin:false,...extra});

test('public post ID validation rejects malformed values and bigint overflow before SQL',()=>{
  for(const value of ['0','-1','01','1.2','12abc','12%20OR','9223372036854775808','999999999999999999999','',null,undefined,'\/12',12]){
    assert.equal(validPublicPostId(value),false,String(value));
  }
  for(const value of ['1','42','9223372036854775807']){
    assert.equal(validPublicPostId(value),true,value);
  }
});

test('normal public content keeps a readable body and remains indexable',()=>{
  const flags=publicPostPreview(post());
  assert.equal(flags.showContent,true);
  assert.equal(flags.indexable,true);
  assert.equal(flags.safeCaption,'Contenido publicado');
  assert.match(publicPostSeo(post(),{indexable:flags.indexable}).title,/Contenido publicado/);
});

test('sensitive content has no public caption even if the author is discoverable',()=>{
  for(const level of ['sensitive','explicit','restricted',null,'']){
    const item=post({caption:'SECRETO 839',content_level:level});
    const flags=publicPostPreview(item);
    assert.equal(flags.showContent,false);
    assert.equal(flags.indexable,false);
    assert.equal(flags.safeCaption,'');
    assert.doesNotMatch(JSON.stringify(publicPostSeo(item,{indexable:flags.indexable})),/SECRETO 839/);
  }
});

test('admin or undiscoverable author cannot be indexed even if audience is public',()=>{
  for(const overrides of [{is_admin:true},{discoverable:false}]){
    const flags=publicPostPreview(post(overrides));
    assert.equal(flags.indexable,false);
  }
});

test('public route validates before database access, protects captions, locks restricted text, and keeps noindex',()=>{
  const s=read('server.js');
  const begin=s.indexOf("app.get('/p/:id'");
  const end=s.indexOf('let publicProfileSeoV177Ready',begin);
  assert.ok(begin>=0&&end>begin);
  const route=s.slice(begin,end);
  const validation=route.indexOf('validPublicPostId(req.params.id)');
  const bootstrap=route.indexOf('await ensurePublicPostAudienceV18()');
  assert.ok(validation>=0&&bootstrap>validation);
  assert.match(route,/publicPostPreview\(post\)/);
  assert.match(route,/publicPostSeo\(post,\{indexable\}\)/);
  assert.match(route,/const textOnly=!post\.media_url && Boolean\(String\(safeCaption\|\|''\)\.trim\(\)\)/);
  assert.match(route,/const caption=!textOnly&&safeCaption\?/);
  assert.match(route,/const media=!showContent/);
  assert.match(route,/class="shared-lock"/);
  assert.match(route,/indexable\?'index,follow,max-image-preview:large':'noindex,nofollow'/);
  assert.match(route,/setHeader\('Cache-Control','private, no-store'\)/);
  assert.match(route,/setHeader\('X-Robots-Tag','noindex,nofollow'\)/);
});

test('existing author and content privacy restrictions remain in live public and sitemap SQL',()=>{
  const s=read('server.js');
  const route=s.slice(s.indexOf("app.get('/p/:id'"),s.indexOf('let publicProfileSeoV177Ready'));
  for(const rule of ["p.moderation_status='published'","p.audience='public'","u.status='active'"])
    assert.ok(route.includes(rule),rule);
  const sitemap=s.slice(s.indexOf("app.get('/sitemap.xml'"));
  for(const rule of ["p.moderation_status='published'","p.audience='public'","p.content_level='normal'","u.status='active'","u.is_admin=false","u.discoverable=true"])
    assert.ok(sitemap.includes(rule),rule);
});

test('CI has a dedicated V3.3.40 regression step',()=>{
  assert.match(read('.github/workflows/validate-js.yml'),/public-post-privacy-v3340\.test\.js/);
});
