'use strict';
(()=>{
  // V3.2.24 — reviewed, real news interspersed into the real people's feed.
  // Only Para ti / Nuevo; never VIP / Following / Close. No artificial posts.
  const root=document.getElementById('editorialHomeBlock');
  const list=document.getElementById('editorialHomeItems');
  const feed=document.getElementById('feed');
  const planner=window.RedLibertadNewsMixV3224;
  if(!root||!list||!feed||!planner)return;
  root.classList.add('hidden');
  root.hidden=true; // The former separate 3-card block is retired.
  let requestId=0,newsItems=[];
  const storageKey='redlibertad-home-news-seen-v3224';
  const make=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=String(text);
    return node;
  };
  const seenIds=()=>{
    try{
      const raw=JSON.parse(sessionStorage.getItem(storageKey)||'[]');
      return Array.isArray(raw)?raw.filter(x=>/^[1-9][0-9]{0,14}$/.test(String(x))).slice(-100):[];
    }catch(_){return [];}
  };
  const storeSeen=ids=>{
    try{sessionStorage.setItem(storageKey,JSON.stringify([...new Set(ids.map(String))].slice(-100)));}
    catch(_){/* private browsing: keep a RAM fallback below */}
  };
  let seenMemory=seenIds();
  const modeNow=()=>document.querySelector('#feedView [data-mode].active')?.dataset.mode||'';
  const localImage=url=>/^\/uploads\/editorial\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(String(url||''));

  function newsCard(item){
    const id=String(item.id);
    const url='/noticias/p/'+encodeURIComponent(id);
    const card=make('article','editorial-home-card editorial-feed-card-v3224');
    card.dataset.editorialNewsId=id;
    card.setAttribute('aria-label','Noticia revisada de '+String(item.profile_name||'RedLibertad Noticias'));
    const header=make('div','editorial-home-profile');
    const avatar=make('span','editorial-home-avatar');
    const logo=document.createElement('img');
    logo.src='/assets/logo-mark.svg';logo.alt='';logo.loading='lazy';logo.width=26;logo.height=26;
    avatar.append(logo);
    const profile=make('div','editorial-home-profile-copy');
    const name=make('b','',item.profile_name||'RedLibertad Noticias');
    const meta=make('small','',String(item.category||'Actualidad')+' · Fuente identificada');
    profile.append(name,meta);
    const badge=make('span','editorial-home-badge','NOTICIA');
    header.append(avatar,profile,badge);
    const heading=make('h3','editorial-home-title');
    heading.textContent=String(item.title||'');
    const headline=document.createElement('a');headline.href=url;headline.className='editorial-home-headline';
    headline.append(heading);
    const summary=make('p','editorial-home-summary',String(item.summary||'').slice(0,200));
    const source=make('small','editorial-home-source','Fuente original: '+String(item.source_name||'Medio identificado'));
    const footer=make('div','editorial-home-engagement');
    const likes=make('span','',String(Math.max(0,Number(item.like_count)||0))+' Me gusta');
    const comments=make('span','',String(Math.max(0,Number(item.comment_count)||0))+' comentarios');
    const go=document.createElement('a');go.href=url;go.className='editorial-home-open';
    go.textContent='Ver noticia y conversar →';
    footer.append(likes,comments,go);
    const photo=localImage(item.image_url)?make('figure','editorial-home-photo'):null;
    if(photo){
      const pic=make('img','');pic.src=item.image_url;
      pic.alt=String(item.image_alt||item.title||'Fotografía de noticia revisada');
      pic.loading='lazy';pic.decoding='async';
      const credit=make('figcaption','',String(item.image_credit||'Crédito fotográfico'));
      photo.append(pic,credit);
    }
    card.append(header,headline);
    if(photo)card.append(photo);
    card.append(summary,source,footer);
    return card;
  }
  function place(mode=modeNow()){
    if(!planner.allowedMode(mode)||feed.getAttribute('aria-busy')==='true')return;
    // Never reorder, replace or duplicate personal posts; insert news between them.
    const posts=[...feed.children].filter(node=>node.classList.contains('post'));
    if(posts.length<2)return;
    if(feed.querySelector('[data-editorial-news-id]'))return; // already mixed this load
    seenMemory=[...new Set([...seenMemory,...seenIds()])];
    let available=planner.unseenNews(newsItems,seenMemory);
    // Previously displayed stories must not permanently empty the news feed.
    // Restart the rotation only after every currently published article was
    // already displayed. The planner still inserts each article at most once
    // in this feed render; unreviewed articles never enter this collection.
    if(!available.length && newsItems.length){
      const nextCycle=planner.unseenNews(newsItems,[]);
      if(nextCycle.length){
        seenMemory=[];
        storeSeen([]);
        available=nextCycle;
      }
    }
    const insertAt=planner.slots(posts.length,available.length,3);
    for(let i=0;i<insertAt.length;i++){
      const item=available[i],card=newsCard(item);
      posts[insertAt[i]-1].after(card);
      seenMemory.push(String(item.id));
    }
    if(insertAt.length)storeSeen(seenMemory);
  }
  const open=async()=>{
    const current=++requestId;
    try{
      const response=await fetch('/api/editorial-social/discover',{
        credentials:'same-origin',cache:'no-store'
      });
      if(!response.ok)throw Error('editorial_discovery_unavailable');
      const d=await response.json();
      if(current!==requestId)return;
      newsItems=Array.isArray(d.items)?d.items:[];
      list.replaceChildren(); // legacy content cannot duplicate the feed
      place();
    }catch(_){if(current===requestId)newsItems=[];}
  };
  document.addEventListener('redlibertad:feed-updated',event=>{
    // Event emitted *after* the latest posts have been rendered.
    place(event.detail?.mode||modeNow());
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)open();});
  open();
})();
