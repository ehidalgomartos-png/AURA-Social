'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/social.js');
const a=source.indexOf('// V3.3.15: Only YouTube');
const z=source.indexOf('function mediaHTML(',a);
assert.ok(a>=0 && z>a);
const events={};
const sandbox={URL,document:{addEventListener:(name,fn)=>{events[name]=fn;},createElement:()=>({})}};
vm.runInNewContext(source.slice(a,z)+'\nthis.id=youtubeVideoIdV3315;this.preview=youtubePostPreviewV3315;',sandbox);
const id=sandbox.id,preview=sandbox.preview;
const video='dQw4w9WgXcQ';

test('recognizes standard, short, shorts and live secure YouTube links',()=>{
 for(const url of [
   'https://www.youtube.com/watch?v='+video,
   'https://youtu.be/'+video+'?si=abc',
   'https://m.youtube.com/shorts/'+video,
   'https://www.youtube.com/live/'+video,
   'https://www.youtube-nocookie.com/embed/'+video
 ])assert.equal(id('Mira este vídeo '+url),video);
});

test('rejects forged, insecure, malformed and private endpoints',()=>{
 for(const url of [
   'http://youtube.com/watch?v='+video,
   'https://youtube.com.evil.test/watch?v='+video,
   'https://evil.test/youtu.be/'+video,
   'https://youtube.com@evil.test/watch?v='+video,
   'https://youtube.com/watch?v=123',
   'https://youtube.com/watch?v='+video+'bad',
   'https://youtube.com:444/watch?v='+video,
   'https://youtu.be/../../'+video
 ])assert.equal(id(url),null,url);
});

test('gated, reel and uploaded media posts are never embedded',()=>{
 const post={caption:'https://youtu.be/'+video};
 assert.match(preview(post),/data-youtube-activate/);
 assert.doesNotMatch(preview(post),/iframe|<img|https:\/\/i\.ytimg\.com/);
 assert.equal(preview({...post,gated:true}),'');
 assert.equal(preview({...post,post_kind:'reel'}),'');
 assert.equal(preview(post,true),'');
});

test('click to load only the whitelisted privacy-enhanced iframe',()=>{
 let output=null;
 const root={replaceChildren:node=>{output=node;}};
 const button={dataset:{youtubeActivate:video},closest:s=>s==='[data-youtube-player]'?root:null};
 assert.equal(typeof events.click,'function');
 events.click({target:{closest:s=>s==='[data-youtube-activate]'?button:null}});
 assert.match(output.src,new RegExp('^https://www\\.youtube-nocookie\\.com/embed/'+video));
 assert.match(output.allow,/autoplay/);
 assert.equal(output.allowFullscreen,true);
 output=null;
 button.dataset.youtubeActivate='bad';
 events.click({target:{closest:s=>s==='[data-youtube-activate]'?button:null}});
 assert.equal(output,null);
});

test('post template renders link preview, current caption remains escaped, composer explains functionality',()=>{
 const html=read('public/app.html');
 const css=read('public/social.css');
 assert.match(source,/youtubePostPreviewV3315\(p,!!media\)/);
 assert.match(source,/captionHTML\(p.caption\)/);
 assert.match(html,/composer-youtube-hint-v3315/);
 assert.match(html,/youtube=3\.3\.15/);
 assert.match(css,/\.post-youtube-v3315 iframe/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/youtube-post-v3315\.test\.js/);
});
