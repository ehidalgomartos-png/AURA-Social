'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {createYouTubePreviewRouter,safeId}=require('../src/routes/youtube-preview-v33161');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const sample='XBzna6QVKRg';
const src=read('public/social.js');
function response({ok=true,contentType='image/jpeg',body='',headers={}}={}){
  return {ok,headers:{get:name=> name==='content-type'?contentType:(headers[name]||null)},
    text:async()=>body,arrayBuffer:async()=>Buffer.from(body)};
}
async function withServer(upstream,work){
  const router=createYouTubePreviewRouter({fetchFn:upstream});
  const app=express();app.use('/api/youtube',router);
  const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});
  try{await work('http://127.0.0.1:'+server.address().port);}
  finally{await new Promise(resolve=>server.close(resolve));}
}

test('strict 11-character YouTube IDs and no user-defined URLs',async()=>{
 assert.equal(safeId(sample),true);
 for(const bad of ['invalid','..',sample+'extra','http://example.com',sample+'.jpg'])assert.equal(safeId(bad),false);
 const requests=[];
 await withServer(async url=>{requests.push(url);return response({body:JSON.stringify({title:'Example'})});},async origin=>{
   const bad=await fetch(origin+'/api/youtube/preview/invalid');
   assert.equal(bad.status,400);
   const ok=await fetch(origin+'/api/youtube/preview/'+sample);
   assert.equal(ok.status,200);
   const info=await ok.json();
   assert.equal(info.title,'Example');
   assert.equal(info.thumbnailUrl,'/api/youtube/thumbnail/'+sample);
 });
 assert.equal(requests.length,1);
 assert.match(requests[0],/^https:\/\/www\.youtube\.com\/oembed\?/);
 assert.ok(requests[0].includes('format=json')&&requests[0].includes(sample));
});

test('title comes from YouTube official oEmbed, fallback is safe and escaped by frontend',async()=>{
 await withServer(async()=>response({body:JSON.stringify({title:'Crea tu primer vídeo — música',author_name:'Creador'})}),
 async origin=>{
   const a=await (await fetch(origin+'/api/youtube/preview/'+sample)).json();
   const b=await (await fetch(origin+'/api/youtube/preview/'+sample)).json();
   assert.equal(a.title,'Crea tu primer vídeo — música');
   assert.equal(a.author,'Creador');
   assert.deepEqual(a,b);
 });
 await withServer(async()=>{throw Error('unavailable');},async origin=>{
   const d=await (await fetch(origin+'/api/youtube/preview/'+sample)).json();
   assert.equal(d.title,'Vídeo de YouTube');
   assert.equal(d.available,false);
 });
 assert.match(src,/title\.textContent=data\?\.title\|\|'Vídeo de YouTube'/);
});

test('thumbnail is proxied from fixed YouTube domain, bytes validated and cached',async()=>{
 const seen=[],jpg=Buffer.from([0xff,0xd8,0xff,0xd9]);
 await withServer(async url=>{seen.push(url);return response({body:jpg});},async origin=>{
   for(let i=0;i<2;i++){
     const r=await fetch(origin+'/api/youtube/thumbnail/'+sample);
     assert.equal(r.status,200);
     assert.match(r.headers.get('content-type'),/image\/jpeg/);
     assert.deepEqual(Buffer.from(await r.arrayBuffer()),jpg);
   }
 });
 assert.deepEqual(seen,['https://i.ytimg.com/vi/'+sample+'/hqdefault.jpg']);
 await withServer(async()=>response({contentType:'text/html',body:'not an image'}),async origin=>{
   assert.equal((await fetch(origin+'/api/youtube/thumbnail/'+sample)).status,404);
 });
});

test('composer displays preview before posting, hides when adding media or switching Reel',()=>{
 const html=read('public/app.html'),css=read('public/social.css');
 assert.match(html,/id="youtubeComposerPreviewV33161"/);
 assert.match(html,/youtube-preview=3\.3\.16\.1/);
 assert.match(css,/\.youtube-rich-v33161 \.youtube-thumb-v33161/);
 assert.match(css,/\.youtube-rich-v33161 \.youtube-info-v33161 b/);
 assert.match(src,/updateComposerYoutubeV33161\(\)/);
 assert.match(src,/const hasFile=Boolean\(\$\('#mediaFile'\)\?\.files\?\.length\)/);
 assert.match(src,/kind==='post'&&!hasFile\?youtubeVideoIdV3315\(caption\):null/);
 assert.match(src,/hydrateYoutubeCardsV33161\(root\)/);
 assert.match(src,/bindPostActions\(root\) \{\s*hydrateYoutubeCardsV33161\(root\)/);
});

test('link-only caption suppressed visually but stored as authored, no automatic YouTube iframe',()=>{
 assert.match(src,/const visibleCaption=linkOnlyCaption\?'':p\.caption/);
 assert.match(src,/captionHTML\(visibleCaption\)/);
 assert.match(src,/style="background-image:url\(\/api\/youtube\/thumbnail\//);
 assert.match(src,/data-youtube-video-title/);
 assert.match(src,/youtubePostPreviewV3315\(p,!!media\)/);
 assert.match(src,/if\(post\.gated\|\|hasMedia\|\|post\.post_kind==='reel'\)return ''/);
 assert.match(src,/new URL\(raw\.replace/);
 assert.match(src,/root\.replaceChildren\(frame\)/);
 assert.doesNotMatch(src.slice(src.indexOf('function youtubePostPreviewV3315'),src.indexOf('const youtubeMetadataPromisesV33161')),/<iframe/);
 assert.match(read('server.js'),/createYouTubePreviewRouter/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/youtube-rich-preview-v33161\.test\.js/);
});
