'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {normalizeProfileWebsiteV33241:normalize}=require('../public/profile-website-v33241');
const source=read('public/social.js'),routes=read('src/routes/profiles.js'),html=read('public/app.html');
test('automatically prepends https to a domain without protocol (existing and new)',()=>{
  assert.equal(normalize('lucianthornveil.com'),'https://lucianthornveil.com/');
  assert.equal(normalize(' www.ejemplo.es/blog?tema=red '),'https://www.ejemplo.es/blog?tema=red');
  assert.equal(normalize('EXAMPLE.COM'),'https://example.com/');
  assert.equal(normalize('example.com:8443/hola'),'https://example.com:8443/hola');
  assert.equal(normalize(''), '');
  assert.equal(normalize('    '), '');
  assert.equal(normalize('https://example.com/posts'),'https://example.com/posts');
  assert.equal(normalize('http://example.com/'),'http://example.com/');
});
test('unsafe schemes, relative URLs, userinfo and malformed host are rejected',()=>{
  for(const url of [
   'javascript:alert(1)','data:text/html;base64,AAA','mailto:a@example.com',
   'ftp://example.com','//example.com','/example.com','http:example.com',
   'example','https://','https://user:secret@example.com',
   'https://example.com@evil.net','https://example..com',
   'https://-example.com','https://example.com" onmouseover="bad',
   'https://example.com\\evil','example.com\n/redirect','example.com space'
  ])assert.equal(normalize(url),null,url);
});
test('browser and Node use the same trusted URL parser',()=>{
  const window={},ctx={window,URL,String,Number,module:undefined};
  vm.runInNewContext(read('public/profile-website-v33241.js'),ctx);
  assert.equal(window.normalizeProfileWebsiteV33241('lucianthornveil.com'),'https://lucianthornveil.com/');
  assert.equal(window.normalizeProfileWebsiteV33241('javascript:alert(1)'),null);
});
function link(value){
  const a=source.indexOf('function profileWebsiteLinkV33241('),b=source.indexOf('async function loadProfile(',a);
  assert.ok(a>=0&&b>a);
  const window={normalizeProfileWebsiteV33241:normalize};
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ctx={window,String,esc:escape};
  vm.runInNewContext(source.slice(a,b)+'\nthis.link=profileWebsiteLinkV33241;',ctx);
  return ctx.link(value);
}
test('already stored bare website in both profile screens becomes external https link',()=>{
  const fragment=link('lucianthornveil.com');
  assert.match(fragment,/href="https:\/\/lucianthornveil\.com\/"/);
  assert.match(fragment,/>lucianthornveil\.com<\/a>/);
  assert.match(fragment,/target="_blank" rel="noopener noreferrer"/);
  assert.equal(link('javascript:alert(1)'),'');
  assert.equal(link(''), '');
  assert.match(source,/const web=profileWebsiteLinkV33241\(me\.website_url\)/);
  assert.match(source,/const website=profileWebsiteLinkV33241\(profile\.website_url\)/);
});
test('saving canonicalizes on client before upload, validates again on server, still supports clearing',()=>{
  assert.match(source,/websiteUrl=window\.normalizeProfileWebsiteV33241\?\.\(fd\.get\('websiteUrl'\)\)/);
  assert.match(source,/websiteUrl===null \|\| websiteUrl===undefined/);
  assert.match(source,/websiteUrl,\s*interests/);
  assert.match(routes,/websiteUrl=d\.websiteUrl===undefined/);
  assert.match(routes,/normalizeProfileWebsiteV33241\(d\.websiteUrl\)/);
  assert.match(routes,/error:'invalid_website_url'/);
  assert.match(routes,/websiteUrl\?\?u\.website_url/);
  assert.match(routes,/router\.patch\('\/me\/profile',requireAuth/);
});
test('new helper loads before social, is cached by PWA and CI validates it',()=>{
  assert.match(html,/name="websiteUrl"[^>]*placeholder="tuweb.com o https:\/\/tuweb.com"/);
  assert.equal((html.match(/profile-website-v33241\.js\?v=3\.3\.24\.1/g)||[]).length,1);
  assert.ok(html.indexOf('profile-website-v33241.js')<html.indexOf('social.js?v='));
  assert.match(html,/social\.js\?[^"]*webfix=3\.3\.24\.1/);
  assert.match(read('public/sw.js'),/\/profile-website-v33241\.js/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/profile-website-v33241\.test\.js/);
});
