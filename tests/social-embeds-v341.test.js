'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social-embeds-v341.js');
const sandbox={window:{},URL};
vm.runInNewContext(source,sandbox);
const {parse,playerUrl,activate}=sandbox.window.RedLibertadSocialEmbedsV341;
const expected=[
 ['https://www.facebook.com/newsroom/posts/pfbid0A39d4Zxp9VD7j/','facebook','post'],
 ['https://www.facebook.com/reel/783920193845112','facebook','reel'],
 ['https://www.facebook.com/share/r/AJ39dkD2PZ/','facebook','short'],
 ['https://www.instagram.com/p/DZp12Xe3F84/?igsh=a','instagram','p'],
 ['https://instagram.com/reel/DPg847SLu2a/','instagram','reel'],
 ['https://x.com/creador/status/2012389214431261234?s=20','x','status'],
 ['https://twitter.com/persona/status/1999231287345807321','x','status'],
 ['https://www.tiktok.com/@usuario/video/7483917201198731264?_r=1','tiktok','video'],
 ['https://www.tiktok.com/@usuario/photo/7483917201198731264','tiktok','photo'],
 ['https://vm.tiktok.com/ZMab12345/?_r=1','tiktok','short'],
 ['https://vt.tiktok.com/ZSabc1234/','tiktok','short'],
 ['https://www.tiktok.com/t/ZTabc12345/','tiktok','short']
];
test('recognizes real public post, reel, photo and short-share URL formats',()=>{
 for(const [raw,provider,kind] of expected){
   const found=parse('Mira esto '+raw);
   assert.ok(found,'No detectado: '+raw);
   assert.equal(found.provider,provider);
   assert.equal(found.kind,kind);
   assert.match(found.url,/^https:\/\//);
   assert.ok(found.providerName);
   assert.ok(found.label.length>12);
   assert.ok(!found.url.includes('?'),'Tracking parameters must not be copied');
 }
});
test('refuses HTTP, host spoofing, ports, credentials, traversal, private and unrelated URLs',()=>{
 const bad=[
 'http://www.instagram.com/p/DZp12Xe3F84/',
 'https://instagram.com.evil.test/p/DZp12Xe3F84/',
 'https://www.facebook.com.evil.test/reel/783920193845112',
 'https://www.instagram.com@evil.test/p/DZp12Xe3F84/',
 'https://www.instagram.com:8443/p/DZp12Xe3F84/',
 'https://www.instagram.com/p/%2e%2e/DZp12Xe3F84/',
 'https://x.com/usuario/status/20123892/../../admin',
 'https://vm.tiktok.com/../ZAbcde123/',
 'https://www.facebook.com/groups/privada/',
 'https://instagram.com/stories/persona/12345678',
 'https://www.instagram.com/userprofile/',
 'https://x.com/usuario',
 'https://evil.test/?next=https://www.instagram.com/p/DZp12Xe3F84/',
 'https://www.tiktok.com/@usuario/live',
 'https://www.tiktok.com/@usuario',
 'javascript:alert(1)',
 '//www.facebook.com/reel/783920193845112'
 ];
 for(const raw of bad)assert.equal(parse(raw),null,raw);
});
test('supports just one safe URL inside captions and preserves authored user text',()=>{
 const plain='Estamos comentando https://x.com/ana/status/123456789012345678 y unas ideas';
 const result=parse(plain);
 assert.equal(result.provider,'x');
 assert.equal(result.url,'https://x.com/ana/status/123456789012345678');
 assert.equal(parse('sin enlace'),null);
 assert.equal(parse('https://youtu.be/dQw4w9WgXcQ'),null);
 assert.ok(!source.includes('fetch('),'No server-side scraping or automatic preview requests');
});
test('player URLs are provider-owned, conservative, and never user-chosen hosts',()=>{
 const tt=parse('https://www.tiktok.com/@alba/video/7483917201198731264');
 assert.equal(playerUrl(tt),'https://www.tiktok.com/player/v1/7483917201198731264?autoplay=0&music_info=1&description=1');
 const fb=parse('https://www.facebook.com/reel/783920193845112');
 assert.match(playerUrl(fb),/^https:\/\/www\.facebook\.com\/plugins\/video\.php\?/);
 assert.equal(playerUrl(parse('https://x.com/ana/status/123456789012345678')),null);
 assert.equal(playerUrl(parse('https://www.instagram.com/p/DZp12Xe3F84')),null);
 assert.equal(playerUrl(parse('https://vm.tiktok.com/ZMabc1234/')),null);
 assert.equal(playerUrl(parse('https://www.facebook.com/share/r/AJ39dkD2PZ/')),null);
 assert.equal(playerUrl({...tt,url:'https://evil.test'}),null);
});
function node(type){
 return {type,children:[],dataset:{},replaceChildren(...items){this.children=[...items]},appendChild(item){this.children.push(item);return item}};
}
function fakeDoc(){
 const head=node('head');
 return {head,createElement:type=>node(type)};
}
test('TikTok and Facebook iframe only created AFTER explicit activation, retaining an original link',async()=>{
 for(const address of ['https://www.tiktok.com/@alba/video/7483917201198731264','https://www.facebook.com/reel/783920193845112']){
   const doc=fakeDoc(),root=node('root'),p=parse(address);
   assert.equal(root.children.length,0);
   assert.equal(await activate(p,root,doc,{}),true);
   const [area,foot]=root.children;
   const frame=area.children[0];
   assert.equal(frame.type,'iframe');
   assert.equal(frame.src,playerUrl(p));
   assert.equal(frame.loading,'lazy');
   assert.equal(frame.allowFullscreen,true);
   assert.equal(foot.children[0].href,p.url);
   assert.match(foot.children[0].rel,/noopener/);
   assert.equal(doc.head.children.length,0);
 }
});
test('shared short links stay navigable without inventing playable IDs or following redirects',async()=>{
 const doc=fakeDoc(),root=node('root'),p=parse('https://vm.tiktok.com/ZMabc1234/');
 assert.equal(await activate(p,root,doc,{}),false);
 assert.equal(root.children[0].children[0].type,'p');
 assert.match(root.children[0].children[0].textContent,/enlace abre/);
 assert.equal(doc.head.children.length,0);
});
test('X and Instagram official widget scripts load only after click and are whitelisted',async()=>{
 for(const [url,kind] of [
   ['https://x.com/alba/status/123456789012345678','x'],
   ['https://www.instagram.com/p/DZp12Xe3F84','instagram']
 ]){
  const doc=fakeDoc(),root=node('root'),p=parse(url);
  let called=0;
  const env=kind==='x'
    ?{twttr:{widgets:{createTweet:async()=>{called++;return node('tweet')}}}}
    :{instgrm:{Embeds:{process:()=>{called++}}}};
  const running=activate(p,root,doc,env);
  const script=doc.head.children[0];
  assert.equal(script.type,'script');
  assert.match(script.src,kind==='x'?/^https:\/\/platform\.x\.com\/widgets\.js$/:/^https:\/\/www\.instagram\.com\/embed\.js$/);
  script.onload();
  assert.equal(await running,true);
  assert.equal(called,1);
  assert.equal(root.children[1].children[0].href,p.url);
 }
});
test('feed, composer, script order, service worker and CSP all integrate without extra third-party loading',()=>{
 const social=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css'),server=read('server.js'),sw=read('public/sw.js');
 assert.match(social,/socialPostPreviewV341\(p,!!media\)/);
 assert.match(social,/if\(post\.gated\|\|hasMedia\|\|post\.post_kind==='reel'\)return ''/);
 assert.match(social,/data-social-activate/);
 assert.match(social,/RedLibertadSocialEmbedsV341\.activate\(info,root\)/);
 assert.match(social,/updateComposerSocialV341\(\)/);
 assert.match(social,/const textOnly = !media&&!youtubeId&&!socialLink/);
 assert.match(html,/id="socialComposerPreviewV341"/);
 assert.ok(html.indexOf('/social-embeds-v341.js')<html.indexOf('/social.js?v='));
 assert.match(html,/Facebook, Instagram, TikTok o X/);
 assert.match(css,/\.post-social-v341/);
 assert.match(css,/min-height:44px/);
 assert.ok(sw.includes("'/social-embeds-v341.js'"));
 assert.match(server,/https:\/\/www\.facebook\.com/);
 assert.match(server,/https:\/\/www\.tiktok\.com/);
 assert.match(server,/https:\/\/platform\.x\.com\/widgets\.js/);
 assert.match(server,/https:\/\/www\.instagram\.com\/embed\.js/);
 assert.match(read('.github/workflows/validate-js.yml'),/social-embeds-v341\.test\.js/);
});
