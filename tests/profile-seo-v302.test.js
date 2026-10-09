'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {publicProfileSeo,cleanText,shorten,safeJsonLd}=require('../src/services/public-profile-seo-v302');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const url='https://redlibertad.com/perfil/nanitaES';
function user(overrides={}){
  return {
    id:100,username:'nanitaES',display_name:'NanitaES',discoverable:true,
    creator_headline:'',bio:'',public_post_count:0,creator_verified:false,
    created_at:'2026-09-01T10:00:00Z',updated_at:'2026-10-08T10:00:00Z',...overrides
  };
}
test('profile without a bio produces specific readable title and snippet',()=>{
  const seo=publicProfileSeo(user(),{url});
  assert.equal(seo.title,'NanitaES | Perfil en RedLibertad');
  assert.match(seo.description,/Conoce a NanitaES/);
  assert.match(seo.description,/perfil público/);
  assert.ok(!seo.description.includes('Crear cuentaEntrar'));
  assert.ok(!seo.description.includes('Libertad de expresión con límites'));
  assert.ok(seo.description.length<=158);
  assert.equal(seo.summary,seo.description);
});
test('public posting count only appears when a public post exists',()=>{
  const yes=publicProfileSeo(user({public_post_count:4}),{url});
  const no=publicProfileSeo(user({public_post_count:0}),{url});
  assert.match(yes.description,/sus publicaciones/);
  assert.doesNotMatch(no.description,/0 publicaciones/);
});
test('creator headline and bio are meaningful and deduplicated',()=>{
  const seo=publicProfileSeo(user({
    username:'celia_arte',display_name:'Celia',
    creator_headline:'Fotografía de naturaleza',bio:'Viajando por el mundo'
  }),{url:'https://redlibertad.com/perfil/celia_arte'});
  assert.equal(seo.title,'Celia (@celia_arte) | Perfil en RedLibertad');
  assert.match(seo.description,/Fotografía de naturaleza/);
  assert.match(seo.description,/Viajando por el mundo/);
  const repeated=publicProfileSeo(user({
    creator_headline:'Arte y música',bio:'Arte y música'
  }),{url});
  assert.equal((repeated.description.match(/Arte y música/g)||[]).length,1);
});
test('text sanitization removes markup and newlines but preserves accents',()=>{
  assert.equal(cleanText('  <b>Fotografía</b>\n\t <i>España</i>  '),'Fotografía España');
  assert.equal(shorten('uno '.repeat(200),65).length<=65,true);
});
test('long user bios fit SERP descriptions without splitting ordinary words',()=>{
  const p=user({bio:'Paisajes y fotografía creativa. '.repeat(25)});
  const s=publicProfileSeo(p,{url});
  assert.ok(s.description.length<=158);
  assert.ok(s.description.endsWith('…'));
  assert.ok(!s.description.includes('\n'));
});
test('separate public profiles produce distinct descriptions',()=>{
  const a=publicProfileSeo(user({username:'alba',display_name:'Alba'}),{url:url.replace('nanitaES','alba')});
  const b=publicProfileSeo(user({username:'ana',display_name:'Ana'}),{url:url.replace('nanitaES','ana')});
  assert.notEqual(a.description,b.description);
  assert.notEqual(a.title,b.title);
});
test('non-discoverable accounts receive no profile rich data or public biographical snippet',()=>{
  const p=publicProfileSeo(user({discoverable:false,bio:'Mi dirección privada ABC123'}),{url});
  assert.equal(p.structuredData,null);
  assert.equal(p.summary,'');
  assert.ok(!p.description.includes('ABC123'));
});
test('structured metadata uses Google ProfilePage and honest Person fields',()=>{
  const p=publicProfileSeo(user({
    display_name:'NanitaES',username:'nanitaES',creator_verified:true,public_post_count:10
  }),{url,avatar:'https://redlibertad.com/uploads/avatar.jpg'});
  const j=p.structuredData;
  assert.equal(j['@context'],'https://schema.org');
  assert.equal(j['@type'],'ProfilePage');
  assert.equal(j.mainEntity['@type'],'Person');
  assert.equal(j.mainEntity.name,'NanitaES');
  assert.equal(j.mainEntity.alternateName,'@nanitaES');
  assert.equal(j.mainEntity.image,'https://redlibertad.com/uploads/avatar.jpg');
  assert.equal(j.dateCreated,'2026-09-01T10:00:00.000Z');
  assert.equal(j.dateModified,'2026-10-08T10:00:00.000Z');
  assert.ok(!Object.hasOwn(j.mainEntity,'sameAs'));
  assert.ok(!Object.hasOwn(j.mainEntity,'credential'));
});
test('structured data does not invent placeholder profile photographs',()=>{
  const j=publicProfileSeo(user(),{url}).structuredData;
  assert.ok(!Object.hasOwn(j.mainEntity,'image'));
});
test('JSON-LD escapes injection attempts and Unicode line separators',()=>{
  const p=publicProfileSeo(user({bio:'Hola </script><script>alert(1)</script> \u2028& hola'}),{url});
  const html=safeJsonLd(p.structuredData);
  assert.ok(!html.includes('</script>'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('\u2028'));
  assert.doesNotThrow(()=>JSON.parse(html));
});
test('public HTML route uses dedicated SEO for title, meta, OG, Twitter and ProfilePage',()=>{
  const s=read('server.js');
  const from=s.indexOf("app.get('/perfil/:username'");
  const to=s.indexOf("app.get('/sitemap-profiles.xml'",from);
  const route=s.slice(from,to);
  assert.ok(from>0&&to>from);
  assert.match(route,/publicProfileSeo\(profile,\{url:publicUrl,avatar:indexable\?avatar:''\}\)/);
  assert.match(route,/safeJsonLd\(seo\.structuredData\)/);
  for(const meta of ['<title>','name="description"','property="og:title"','property="og:description"','name="twitter:title"','name="twitter:description"']){
    assert.ok(route.includes(meta),meta);
  }
  assert.match(route,/profile\.discoverable===true/);
  assert.match(route,/noindex,nofollow/);
  assert.match(route,/rel="canonical"/);
});
test('Google snippets avoid registration CTA, sticky login and legal footer text',()=>{
  const s=read('server.js'),from=s.indexOf("app.get('/perfil/:username'");
  const end=s.indexOf("app.get('/sitemap-profiles.xml'",from),route=s.slice(from,end);
  assert.match(route,/class="public-profile-actions" data-nosnippet/);
  assert.match(route,/<div data-nosnippet>\$\{publicLegalFooterV197\(\)\}<\/div>/);
  assert.match(route,/<div data-nosnippet>\$\{publicEntryBarV192/);
  assert.match(route,/public-profile-summary/);
});
test('private-user exclusion, sensitive post filters and noindex behavior remain',()=>{
  const s=read('server.js'),from=s.indexOf("app.get('/perfil/:username'");
  const end=s.indexOf("app.get('/sitemap-profiles.xml'",from),route=s.slice(from,end);
  assert.match(route,/u\.status='active'/);
  assert.match(route,/u\.is_admin=false/);
  assert.match(route,/p\.moderation_status='published'/);
  assert.match(route,/p\.audience='public'/);
  assert.match(route,/p\.content_level='normal'/);
  assert.match(route,/indexable\?'index,follow,max-image-preview:large':'noindex,nofollow'/);
});
test('release version and CI include profile SEO tests',()=>{
  const pkg=require('../package.json');
  assert.match(pkg.version,/^3\.[0-9]+\.[0-9]+(?:\.[0-9]+)?$/);
  assert.match(read('server.js'),new RegExp("const APP_VERSION='"+pkg.version.replace(/\./g,'\\.')+"'"));
  assert.match(pkg.scripts['test:profile-seo'],/profile-seo-v302/);
  assert.match(read('.github/workflows/validate-js.yml'),/test:profile-seo/);
});
