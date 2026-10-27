'use strict';
/* V3.4.1 — Recognize public social-post URLs without remote scraping.
 * External scripts/iframes are created only after a deliberate viewer click.
 */
(function(global){
  const SCRIPT_SOURCES={
    instagram:'https://www.instagram.com/embed.js',
    x:'https://platform.x.com/widgets.js'
  };
  const scriptLoads=new Map();
  const PROVIDERS={
    instagram:'Instagram',facebook:'Facebook',x:'X',tiktok:'TikTok'
  };

  function parse(caption=''){
    const urls=String(caption||'').match(/https?:\/\/[^\s<>"']+/gi)||[];
    for(let raw of urls){
      raw=raw.replace(/[.,!?;:)\]}]+$/g,'');
      // Reject credentials, ports, lookalike hosts and noncanonical paths,
      // including encoded traversal/separators before URL normalizes them.
      if(/\\|\/\.{1,2}\/|%2e|%2f|%5c/i.test(raw))continue;
      let u;
      try{u=new URL(raw);}catch(_){continue;}
      if(u.protocol!=='https:'||u.username||u.password||u.port)continue;
      const h=u.hostname.toLowerCase(),p=u.pathname;
      let match=null,provider='',label='',url='',id='',kind='';
      if(['instagram.com','www.instagram.com','m.instagram.com'].includes(h)){
        match=/^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,40})\/?$/.exec(p);
        if(!match)continue;
        provider='instagram';kind=match[1];id=match[2];
        label=kind==='reel'?'Reel de Instagram':'Publicación de Instagram';
        url='https://www.instagram.com/'+kind+'/'+id+'/';
      }else if(['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(h)){
        match=/^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{8,22})\/?$/.exec(p);
        if(!match)continue;
        provider='x';kind='status';id=match[2];
        label='Publicación de @'+match[1]+' en X';
        url='https://x.com/'+match[1]+'/status/'+id;
      }else if(['tiktok.com','www.tiktok.com','m.tiktok.com'].includes(h)){
        match=/^\/@([A-Za-z0-9._]{2,30})\/(video|photo)\/([0-9]{10,22})\/?$/.exec(p);
        if(!match)continue;
        provider='tiktok';kind=match[2];id=match[3];
        label=(kind==='photo'?'Fotografías':'Vídeo')+' de @'+match[1]+' en TikTok';
        url='https://www.tiktok.com/@'+match[1]+'/'+kind+'/'+id;
      }else if(['facebook.com','www.facebook.com','m.facebook.com'].includes(h)){
        match=/^\/([A-Za-z0-9._-]{2,80})\/posts\/([A-Za-z0-9_-]{6,110})\/?$/.exec(p);
        if(match){
          provider='facebook';kind='post';id=match[2];
          label='Publicación de Facebook';
          url='https://www.facebook.com/'+match[1]+'/posts/'+id+'/';
        }else{
          match=/^\/reel\/([0-9]{8,22})\/?$/.exec(p);
          if(!match)continue;
          provider='facebook';kind='reel';id=match[1];
          label='Reel de Facebook';
          url='https://www.facebook.com/reel/'+id+'/';
        }
      }else continue;
      return {provider,providerName:PROVIDERS[provider],label,url,id,kind};
    }
    return null;
  }

  function playerUrl(info){
    if(!info||!PROVIDERS[info.provider])return null;
    const safe=parse(info.url);
    if(!safe||safe.url!==info.url||safe.provider!==info.provider)return null;
    if(safe.provider==='tiktok'){
      return 'https://www.tiktok.com/player/v1/'+safe.id+'?autoplay=0&music_info=1&description=1';
    }
    if(safe.provider==='facebook'){
      const plugin=safe.kind==='reel'?'video.php':'post.php';
      return 'https://www.facebook.com/plugins/'+plugin+'?href='+
        encodeURIComponent(safe.url)+'&show_text=true&width=500';
    }
    return null;
  }

  function loadScript(kind,doc){
    if(scriptLoads.has(kind))return scriptLoads.get(kind);
    if(!SCRIPT_SOURCES[kind])return Promise.reject(Error('unsupported_embed'));
    const promise=new Promise((resolve,reject)=>{
      const script=doc.createElement('script');
      script.src=SCRIPT_SOURCES[kind];
      script.async=true;
      script.onload=()=>resolve();
      script.onerror=()=>reject(Error('external_embed_unavailable'));
      doc.head.appendChild(script);
    }).catch(error=>{scriptLoads.delete(kind);throw error;});
    scriptLoads.set(kind,promise);
    return promise;
  }

  function safeLink(doc,info,text='Abrir publicación original'){
    const link=doc.createElement('a');
    link.href=info.url;
    link.target='_blank';
    link.rel='noopener noreferrer nofollow ugc';
    link.textContent=text;
    return link;
  }

  async function activate(info,root,doc=document,env=global){
    const safe=info&&parse(info.url);
    if(!safe||safe.provider!==info.provider||safe.url!==info.url||!root)return false;
    const open=safeLink(doc,safe);
    const area=doc.createElement('div');
    area.className='social-embed-active-v341';
    const foot=doc.createElement('div');
    foot.className='social-embed-fallback-v341';
    foot.appendChild(open);
    root.replaceChildren(area,foot);
    const directPlayer=playerUrl(safe);
    if(directPlayer){
      const frame=doc.createElement('iframe');
      frame.src=directPlayer;
      frame.loading='lazy';
      frame.title='Contenido de '+safe.providerName;
      frame.referrerPolicy='strict-origin-when-cross-origin';
      frame.allow='fullscreen; encrypted-media; picture-in-picture; web-share';
      frame.allowFullscreen=true;
      area.appendChild(frame);
      return true;
    }
    const status=doc.createElement('p');
    status.textContent='Cargando contenido desde '+safe.providerName+'…';
    area.appendChild(status);
    try{
      if(safe.provider==='instagram'){
        await loadScript('instagram',doc);
        if(!env.instgrm?.Embeds?.process)throw Error('instagram_unavailable');
        area.replaceChildren();
        const quote=doc.createElement('blockquote');
        quote.className='instagram-media';
        quote.dataset.instgrmPermalink=safe.url;
        quote.appendChild(safeLink(doc,safe));
        area.appendChild(quote);
        env.instgrm.Embeds.process();
        return true;
      }
      if(safe.provider==='x'){
        await loadScript('x',doc);
        if(!env.twttr?.widgets?.createTweet)throw Error('x_unavailable');
        area.replaceChildren();
        const holder=doc.createElement('div');
        area.appendChild(holder);
        const result=await env.twttr.widgets.createTweet(safe.id,holder,{dnt:true,conversation:'none'});
        if(!result)throw Error('x_not_public');
        return true;
      }
    }catch(_){
      area.replaceChildren();
      const unavailable=doc.createElement('p');
      unavailable.textContent='No se puede mostrar aquí. Puedes abrir el contenido original.';
      area.appendChild(unavailable);
    }
    return false;
  }

  global.RedLibertadSocialEmbedsV341={parse,playerUrl,activate};
})(window);
