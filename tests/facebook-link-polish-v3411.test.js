'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');
const parseJs=read('public/social-embeds-v341.js');
const context={window:{},URL};
vm.runInNewContext(parseJs,context);
const marker=source.indexOf('function socialPostPreviewV341(');
const end=source.indexOf('function mediaHTML(',marker);
assert.ok(marker>0&&end>marker);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const social={window:context.window,youtubeVideoIdV3315:()=>null,esc};
vm.runInNewContext(source.slice(marker,end)+'\nthis.preview=socialPostPreviewV341;',social);
const preview=social.preview;
const fbPost={caption:'https://www.facebook.com/mipagina/posts/pfbid012345abcde'};
const fbShare={caption:'https://www.facebook.com/share/p/AbCdEf12345/'};

test('Facebook canonical URLs have branded compact preview and opt-in embedded action',()=>{
 const html=preview(fbPost);
 assert.match(html,/post-social-polish-v3411/);
 assert.match(html,/data-social-card="facebook"/);
 assert.match(html,/social-link-icon-v3411[^>]*>f</);
 assert.match(html,/Publicación compartida/);
 assert.match(html,/Ver publicación aquí/);
 assert.match(html,/Abrir en Facebook/);
 assert.doesNotMatch(html,/<iframe|<img|facebook\.com\/plugins\/post\.php/);
});
test('Facebook shared short links never offer non-working embedded preview',()=>{
 const html=preview(fbShare);
 assert.match(html,/data-social-kind="short"/);
 assert.match(html,/Abrir en Facebook/);
 assert.match(html,/No admite vista integrada/);
 assert.doesNotMatch(html,/data-social-activate|Ver publicación aquí/);
 assert.doesNotMatch(html,/<iframe/);
});
test('Facebook reel remains distinct, privacy and existing YouTube exclusion preserved',()=>{
 const reel=preview({caption:'https://www.facebook.com/reel/783920193845112'});
 assert.match(reel,/Reel compartido/);
 assert.equal(preview({...fbPost,gated:true}),'');
 assert.equal(preview({...fbPost,post_kind:'reel'}),'');
 assert.equal(preview(fbPost,true),'');
});
test('other networks keep their links and player only after a click',()=>{
 for(const caption of [
  'https://www.instagram.com/p/DZp12Xe3F84/',
  'https://x.com/persona/status/1999231287345807321',
  'https://www.tiktok.com/@usuario/video/7483917201198731264'
 ]){
  const html=preview({caption});
  assert.match(html,/data-social-activate/);
  assert.match(html,/Abrir en/);
  assert.doesNotMatch(html,/<iframe/);
 }
});
test('asset busting, mobile layout, original links and CI preserve browser rollout',()=>{
 const html=read('public/app.html'),css=read('public/social.css'),ci=read('.github/workflows/validate-js.yml');
 assert.match(html,/social-card=3\.4\.1\.7/);
 assert.match(html,/social-embeds=3\.4\.1\.2/);
 assert.match(css,/\.social-link-icon-v3411/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/flex:1 1 150px/);
 assert.match(source,/noopener noreferrer nofollow ugc/);
 assert.match(source,/socialPostPreviewV341\(p,!!media\)/);
 assert.match(ci,/facebook-link-polish-v3411\.test\.js/);
});
