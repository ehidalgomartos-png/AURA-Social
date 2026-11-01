'use strict';
// V3.6.58 — Pulso: visor público. Las interacciones sociales y el editor
// permanecen en RedLibertad, sin duplicar usuarios, almacenamiento ni permisos.
(()=>{
 const feed=document.getElementById('pulsoFeed');
 const more=document.getElementById('pulsoMore');
 const status=document.getElementById('pulsoStatus');
 const footer=document.getElementById('pulsoFooter');
 if(!feed||!more||!status||!footer)return;
 const motionOff=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const saveData=window.navigator?.connection?.saveData===true;
 let page=1,loading=false,hasMore=!more.hidden;
 const mode=feed.dataset.pulsoMode==='siguiendo'?'siguiendo':'para-ti';
 const observed=new WeakSet();
 // V3.6.70: un único reproductor activo, sin iniciar otro cuando los avisos
 // de intersección llegan mezclados durante el gesto de deslizar.
 const visibleRatios=new Map();
 let activeVideo=null;
 let resumeWhenVisible=false;

 function pauseAll(except=null){
  feed.querySelectorAll('video.pulso-video').forEach(v=>{
   if(v!==except&&!v.paused)v.pause();
  });
 }
 function make(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=String(text);
  return el;
 }
 function validLink(id){
  const key=String(id||'');
  return /^[1-9][0-9]{0,15}$/.test(key)?'/reel/'+encodeURIComponent(key):null;
 }
 function safeImage(value){
  const s=String(value||'');
  return /^\/(?!\/)(?:uploads|assets|api\/media)\/[a-z0-9_~!$&()*+,;=:@%./-]+$/i.test(s)||
   /^https:\/\/[a-z0-9.-]+(?::443)?\/[a-z0-9_~!$&()*+,;=:@%/?#-]+$/i.test(s)?s:null;
 }
 function cardFor(item){
  const detail=validLink(item?.id),src=safeImage(item?.video);
  if(!detail||!src)return null;
  const card=make('article','pulso-card');
  card.dataset.pulsoItem='';
  card.dataset.reelId=String(item.id);
  const video=make('video','pulso-video');
  video.src=src;video.preload='none';video.muted=true;video.playsInline=true;video.loop=true;video.controls=true;
  const shade=make('div','pulso-shade');shade.setAttribute('aria-hidden','true');
  const info=make('div','pulso-item-info');
  const profile=make('a','pulso-creator');
  profile.href='/perfil/'+encodeURIComponent(String(item.username||''));
  const avatar=safeImage(item.avatar);
  if(avatar){const image=make('img');image.src=avatar;image.alt='';image.loading='lazy';profile.append(image);}
  else {const mark=make('span',null,'◉');mark.setAttribute('aria-hidden','true');profile.append(mark);}
  profile.append(make('span',null,String(item.displayName||item.username||'').slice(0,80)));
  info.append(profile);
  if(item.caption){
   const caption=String(item.caption).slice(0,700);
   const long=caption.length>135;
   const label=make('p','pulso-caption'+(long?' pulso-caption-clamped-v3661':''),caption);
   label.id='pulso-caption-'+String(item.id);
   info.append(label);
   if(long){
    const toggle=make('button','pulso-caption-toggle-v3661','Ver descripción completa');
    toggle.type='button';toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls',label.id);
    toggle.dataset.pulsoCaptionToggle='';
    info.append(toggle);
   }
  }
  const actions=make('div','pulso-actions');
  const likes=make('button','pulso-count pulso-like','♥ ');
  likes.type='button';likes.dataset.pulsoLike=String(item.id);
  likes.setAttribute('aria-pressed','false');
  likes.setAttribute('aria-label','Me gusta: '+String(Number(item.likes)||0));
  likes.append(make('b',null,String(Number(item.likes)||0)));
  const comments=make('button','pulso-comments-open','◌ ');
  comments.type='button';comments.dataset.pulsoComments=String(item.id);
  comments.setAttribute('aria-label','Ver comentarios: '+String(Number(item.comments)||0));
  comments.append(make('b',null,String(Number(item.comments)||0)));
  comments.append(make('small',null,'Comentar'));
  const share=make('button','pulso-share','↗');
  share.type='button';share.dataset.pulsoShare=detail;share.setAttribute('aria-label','Compartir este vídeo');
  share.append(make('small',null,'Compartir'));
  actions.append(likes,comments,share);
  card.append(video,shade,info,actions);
  return card;
 }
 // Elegir por proporción visible evita que dos avisos simultáneos de swipe
 // reproduzcan varios vídeos o hagan retroceder al anterior.
 function syncPlayback(resume=false){
  if(document.visibilityState!=='visible'){pauseAll();return;}
  let winner=null,best=.679;
  for(const [card,ratio] of visibleRatios){
   if(!card.isConnected){visibleRatios.delete(card);continue;}
   const video=card.querySelector('video.pulso-video');
   if(!video||ratio<.68)continue;
   if(ratio>best||(ratio===best&&video===activeVideo)){
    winner=video;best=ratio;
   }
  }
  if(!winner){
   pauseAll();
   activeVideo=null;
   return;
  }
  const changed=winner!==activeVideo;
  activeVideo=winner;
  pauseAll(winner);
  // No reiniciar una pausa manual del mismo vídeo cada vez que el
  // IntersectionObserver emita otro aviso por un desplazamiento pequeño.
  if((changed||resume)&&!motionOff&&!saveData&&winner.paused){
   winner.muted=true;
   try{winner.play()?.catch?.(()=>{});}catch(_){/* Los controles nativos siguen disponibles. */}
  }
 }
 function playback(){
  if(!('IntersectionObserver' in window))return null;
  return new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(entry.isIntersecting&&entry.intersectionRatio>0){
     visibleRatios.set(entry.target,entry.intersectionRatio);
    }else visibleRatios.delete(entry.target);
   }
   syncPlayback();
  },{root:feed,threshold:[0,.68,.9]});
 }
 const observer=playback();
 function observeNew(){
  if(!observer)return;
  feed.querySelectorAll('[data-pulso-item]').forEach(card=>{
   if(observed.has(card))return;
   observed.add(card);observer.observe(card);
  });
 }
 observeNew();
 async function loadMore(){
  if(!hasMore||loading)return;
  loading=true;more.disabled=true;status.textContent='Cargando más vídeos…';
  try{
   const endpoint=mode==='siguiendo'?'/api/pulso/following?page=':'/api/pulso/public?page=';
   const fetchOptions=mode==='siguiendo'?{credentials:'same-origin',cache:'no-store'}:{credentials:'omit',cache:'no-store'};
   const response=await fetch(endpoint+(page+1),fetchOptions);
   if(response.status===401&&mode==='siguiendo'){
    status.textContent='Tu sesión ha caducado. Entra para volver a ver Siguiendo.';
    more.hidden=true;hasMore=false;return;
   }
   if(!response.ok)throw Error('not_available');
   const data=await response.json();
   if(!Array.isArray(data.items)||data.page!==page+1||typeof data.hasMore!=='boolean'||(mode==='siguiendo'&&data.mode!=='siguiendo'))throw Error('invalid_response');
   const fragment=document.createDocumentFragment();
   for(const item of data.items){const card=cardFor(item);if(card)fragment.append(card);}
   feed.insertBefore(fragment,footer);
   page++;hasMore=data.hasMore&&page<20;
   more.hidden=!hasMore;status.textContent=hasMore?'':'Has llegado al final de los vídeos disponibles.';
   observeNew();
  }catch(_){
   status.textContent='No se pudieron cargar más vídeos. Puedes intentarlo otra vez.';
  }finally{loading=false;more.disabled=false;}
 }
 more.addEventListener('click',()=>void loadMore());
 if('IntersectionObserver' in window){
  const loader=new IntersectionObserver(entries=>{
   if(entries.some(entry=>entry.isIntersecting)&&hasMore&&!loading)void loadMore();
  },{root:feed,rootMargin:'0px 0px 110px 0px',threshold:0});
  loader.observe(footer);
 }
 // Una reproducción iniciada por la persona también detiene cualquier otra.
 // "play" no burbujea: el listener debe escuchar en fase de captura.
 feed.addEventListener('play',event=>{
  const video=event.target;
  if(!video?.matches?.('video.pulso-video'))return;
  pauseAll(video);
 },true);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'){
   resumeWhenVisible=resumeWhenVisible||Boolean(activeVideo&&!activeVideo.paused);
   pauseAll();
  }else{
   const resume=resumeWhenVisible;
   resumeWhenVisible=false;
   syncPlayback(resume);
  }
 });
 window.addEventListener('pagehide',()=>{
  resumeWhenVisible=resumeWhenVisible||Boolean(activeVideo&&!activeVideo.paused);
  pauseAll();
  observer?.disconnect();
 });
 // Regresar desde el historial (BFCache) debe reactivar el observador:
 // la página no se carga de nuevo después del evento pagehide.
 window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  feed.querySelectorAll('[data-pulso-item]').forEach(card=>observer?.observe(card));
  const resume=resumeWhenVisible;
  resumeWhenVisible=false;
  syncPlayback(resume);
 });
 feed.addEventListener('click',async event=>{
  const share=event.target.closest('[data-pulso-share]');
  if(!share)return;
  const path=share.dataset.pulsoShare;
  if(!/^\/reel\/[1-9][0-9]{0,15}$/.test(path||''))return;
  const url=location.origin+path;
  try{
   if(navigator.share){await navigator.share({title:'Pulso · RedLibertad',url});return;}
   if(!navigator.clipboard?.writeText)throw Error('no_clipboard');
   await navigator.clipboard.writeText(url);
   status.textContent='Enlace copiado para compartir.';
  }catch(err){
   if(err?.name==='AbortError')return;
   window.prompt('Copia el enlace de Pulso:',url);
  }
 });
})();
