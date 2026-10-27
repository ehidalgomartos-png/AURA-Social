'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');

const VALID_ID=/^[A-Za-z0-9_-]{11}$/;
const CACHE_MS=6*60*60*1000;
const IMAGE_MAX_BYTES=650*1024;
function safeId(value){return typeof value==='string'&&VALID_ID.test(value);}
function createYouTubePreviewRouter({fetchFn=global.fetch,clock=()=>Date.now()}={}){
  const router=express.Router();
  const metadataCache=new Map(),imageCache=new Map();
  const limit=rateLimit({windowMs:60*1000,max:80,standardHeaders:'draft-7',legacyHeaders:false});
  router.use(limit);
  function retain(map,key,val,max){if(map.size>=max)map.delete(map.keys().next().value);map.set(key,val);}
  async function metadata(id){
    const cached=metadataCache.get(id);
    if(cached&&cached.expires>clock())return cached.data;
    // Fixed, trusted YouTube endpoint; never fetch a URL supplied by the client.
    const upstream='https://www.youtube.com/oembed?format=json&url='+
      encodeURIComponent('https://www.youtube.com/watch?v='+id);
    let title='Vídeo de YouTube',author='';
    let success=false;
    try{
      const response=await fetchFn(upstream,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(4500),
        headers:{'Accept':'application/json'}
      });
      const size=Number(response.headers?.get('content-length')||0);
      if(response.ok&&size<=32*1024){
        const body=await response.text();
        if(body.length<=32*1024){
          const data=JSON.parse(body);
          if(typeof data.title==='string'&&data.title.trim()){
            title=data.title.trim().slice(0,180);
            author=typeof data.author_name==='string'?data.author_name.trim().slice(0,90):'';
            success=true;
          }
        }
      }
    }catch(_){/* The YouTube page or metadata may be private or unavailable. */}
    const data={ok:true,id,title,author,thumbnailUrl:'/api/youtube/thumbnail/'+id,available:success};
    retain(metadataCache,id,{data,expires:clock()+(success?CACHE_MS:15*60*1000)},240);
    return data;
  }
  router.get('/preview/:id',async(req,res)=>{
    if(!safeId(req.params.id))return res.status(400).json({error:'invalid_youtube_id'});
    res.set('Cache-Control','public, max-age=120');
    res.json(await metadata(req.params.id));
  });
  router.get('/thumbnail/:id',async(req,res)=>{
    const id=req.params.id;
    if(!safeId(id))return res.status(400).end();
    const cached=imageCache.get(id);
    if(cached&&cached.expires>clock()){
      res.set('Content-Type',cached.type);
      res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=86400');
      return res.end(cached.data);
    }
    try{
      // The VPS fetches a known YouTube image host; visitors never contact it until playback.
      const response=await fetchFn('https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',{
        redirect:'error',signal:AbortSignal.timeout(4500),headers:{Accept:'image/jpeg'}
      });
      const type=String(response.headers?.get('content-type')||'').toLowerCase().split(';')[0];
      const bytes=Number(response.headers?.get('content-length')||0);
      if(!response.ok||type!=='image/jpeg'||bytes>IMAGE_MAX_BYTES)return res.status(404).end();
      const data=Buffer.from(await response.arrayBuffer());
      if(!data.length||data.length>IMAGE_MAX_BYTES)return res.status(404).end();
      retain(imageCache,id,{data,type:'image/jpeg',expires:clock()+CACHE_MS},40);
      res.set('Content-Type','image/jpeg');
      res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=86400');
      return res.end(data);
    }catch(_){return res.status(404).end();}
  });
  return router;
}
module.exports={createYouTubePreviewRouter,safeId};
