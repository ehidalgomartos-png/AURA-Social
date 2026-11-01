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
 const connectionV3675=window.navigator?.connection;
 const slowNetworkV3675=()=>connectionV3675?.saveData===true||
  /^(?:slow-2g|2g)$/.test(String(connectionV3675?.effectiveType||''));

 let page=1,loading=false,hasMore=!more.hidden;
 const mode=feed.dataset.pulsoMode==='siguiendo'?'siguiendo':'para-ti';
 const observed=new WeakSet();
 // V3.6.70: un único reproductor activo, sin iniciar otro cuando los avisos
 // de intersección llegan mezclados durante el gesto de deslizar.
 const visibleRatios=new Map();
 const sharePendingV3671=new WeakSet();
 // V3.6.76: identificar intentos de autoplay aún pendientes.
 // Un play tardío de un Reel ya descartado nunca debe pausar el vídeo actual.
 const autoplayRequestsV3676=new WeakSet();
 let activeVideo=null;
 let resumeWhenVisible=false;
 // V3.6.78: restaurar solo el vídeo que estaba reproduciéndose.
 let resumeVideoV3678=null;
 let restoringV3678=false;
 // V3.6.77: aviso transitorio solo ante una espera REAL de reproducción.
 // Nunca recargamos el archivo ni disparamos reintentos de red automáticos.
 let bufferingVideoV3677=null;
 let bufferingTimerV3677=null;
 let bufferingMessageV3677=null;
 function bufferingTextV3678(){
  return window.navigator?.onLine===false?
   'Sin conexión. Esperando a que vuelva Internet…':'Cargando vídeo…';
 }
 function updateBufferingTextV3678(){
  if(bufferingMessageV3677)bufferingMessageV3677.textContent=bufferingTextV3678();
 }
 // Los eventos de red solo actualizan el aviso: nunca recargan ni dan play().
 window.addEventListener?.('offline',updateBufferingTextV3678);
 window.addEventListener?.('online',updateBufferingTextV3678);
 function clearBufferingV3677(){
  if(bufferingTimerV3677!==null&&typeof clearTimeout==='function')clearTimeout(bufferingTimerV3677);
  bufferingTimerV3677=null;
  bufferingMessageV3677?.remove?.();
  bufferingMessageV3677=null;
  bufferingVideoV3677=null;
 }
 function scheduleBufferingV3677(video){
  if(video!==activeVideo||document.visibilityState!=='visible'||video.paused)return;
  if(bufferingVideoV3677===video)return; // Un único aviso y temporizador por espera.
  clearBufferingV3677();
  bufferingVideoV3677=video;
  if(typeof setTimeout!=='function')return;
  bufferingTimerV3677=setTimeout(()=>{
   bufferingTimerV3677=null;
   if(bufferingVideoV3677!==video||activeVideo!==video||
    document.visibilityState!=='visible'||video.paused)return;
   const card=video.closest?.('[data-pulso-item]');
   if(!card?.isConnected||card.querySelector?.('.pulso-error-v3664'))return;
   const notice=make('p','pulso-buffering-v3677',bufferingTextV3678());
   notice.setAttribute('role','status');
   card.append(notice);
   bufferingMessageV3677=notice;
  },1600);
 }

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
  if(document.visibilityState!=='visible'){
   clearBufferingV3677();
   if(activeVideo&&!activeVideo.paused)pauseAll();
   return;
  }
  let winner=null,best=.679;
  for(const [card,ratio] of visibleRatios){
   if(!card.isConnected){visibleRatios.delete(card);continue;}
   // V3.6.80: durante sesiones largas, la mayoría de tarjetas
   // están apenas visibles; evitar consultar vídeo si no opta a reproducir.
   if(ratio<.68)continue;
   const video=card.querySelector('video.pulso-video');
   if(!video)continue;
   if(ratio>best||(ratio===best&&video===activeVideo)){
    winner=video;best=ratio;
   }
  }
  if(!winner){
   clearBufferingV3677();
   // Entre dos vídeos no hay que escanear toda la galería en cada aviso
   // si ya se había detenido el reproductor anterior.
   if(activeVideo)pauseAll();
   activeVideo=null;
   return;
  }
  const changed=winner!==activeVideo;
  if(changed)clearBufferingV3677();
  activeVideo=winner;
  // V3.6.72: solo recorrer los vídeos al cambiar de Reel.
  // Si la persona reproduce otro manualmente, el listener 'play' ya pausa el resto.
  if(changed)pauseAll(winner);
  // No reiniciar una pausa manual del mismo vídeo cada vez que el
  // IntersectionObserver emita otro aviso por un desplazamiento pequeño.
  // El retorno del móvil nunca activa otro Reel que estuviera pausado.
  const mayStartV3678=restoringV3678?
   (resume&&winner===resumeVideoV3678):changed||resume;
  if(mayStartV3678&&!motionOff&&!saveData&&!slowNetworkV3675()&&winner.paused){
   winner.muted=true;
   autoplayRequestsV3676.add(winner);
   try{
    const start=winner.play();
    if(start&&typeof start.then==='function'){
     start.then(()=>{
      // El sistema puede confirmar play() después de varios swipes.
      // Nunca permitir que esa respuesta reactive un vídeo fuera de pantalla.
      if(activeVideo!==winner||document.visibilityState!=='visible'){
       if(!winner.paused)winner.pause();
      }
     },()=>{}).then(()=>autoplayRequestsV3676.delete(winner));
    }else autoplayRequestsV3676.delete(winner);
   }catch(_){
    autoplayRequestsV3676.delete(winner);
    /* Los controles nativos siguen disponibles. */
   }
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
 // V3.6.73: los errores se recuperan manualmente; no repetir
 // solicitudes al servidor cuando un observador se activa varias veces.
 let autoBlockedV3673=false;
 let footerInsideV3673=false;
 // V3.6.74: una carga antigua no puede alterar el feed tras ocultar/restaurar.
 let requestEpochV3674=0;
 let requestControllerV3674=null;
 let loaderObserverV3674=null;
 async function loadMore({manual=false}={}){
  if(!hasMore||loading||(!manual&&autoBlockedV3673))return;
  if(!manual&&document.visibilityState!=='visible')return;
  loading=true;more.disabled=true;status.textContent='Cargando más vídeos…';
  const thisRequestV3674=++requestEpochV3674;
  const controllerV3674=typeof AbortController==='function'?new AbortController():null;
  requestControllerV3674=controllerV3674;
  let timerV3674=null;
  let result='error',added=0;
  try{
   const endpoint=mode==='siguiendo'?'/api/pulso/following?page=':'/api/pulso/public?page=';
   const fetchOptions=mode==='siguiendo'?{credentials:'same-origin',cache:'no-store'}:{credentials:'omit',cache:'no-store'};
   if(controllerV3674)fetchOptions.signal=controllerV3674.signal;
   // Tiempo máximo total de red + JSON: una respuesta colgada no bloquea el visor.
   const requestV3674=(async()=>{
    const response=await fetch(endpoint+(page+1),fetchOptions);
    return {response,data:response.ok?await response.json():null};
   })();
   const deadlineV3674=typeof setTimeout==='function'?new Promise((_,reject)=>{
    timerV3674=setTimeout(()=>{
     controllerV3674?.abort();
     reject(new Error('pulso_load_timeout'));
    },15000);
   }):null;
   const {response,data}=await (deadlineV3674?Promise.race([requestV3674,deadlineV3674]):requestV3674);
   if(thisRequestV3674!==requestEpochV3674)return;
   if(response.status===401&&mode==='siguiendo'){
    status.textContent='Tu sesión ha caducado. Entra para volver a ver Siguiendo.';
    more.hidden=true;hasMore=false;result='unauthorized';return;
   }
   if(!response.ok)throw Error('not_available');
   if(!Array.isArray(data.items)||data.page!==page+1||typeof data.hasMore!=='boolean'||(mode==='siguiendo'&&data.mode!=='siguiendo'))throw Error('invalid_response');
   const seen=new Set([...feed.querySelectorAll('[data-pulso-item]')].map(card=>String(card.dataset.reelId||'')));
   const fragment=document.createDocumentFragment();
   for(const item of data.items){
    const id=String(item?.id||'');
    if(seen.has(id))continue;
    const card=cardFor(item);
    if(!card)continue;
    seen.add(id);fragment.append(card);added++;
   }
   if(added)feed.insertBefore(fragment,footer);
   page++;
   hasMore=data.hasMore&&page<20;
   more.hidden=!hasMore;
   // Una página vacía o duplicada no debe generar bucles automáticos.
   autoBlockedV3673=added===0&&hasMore;
   status.textContent=!hasMore?'Has llegado al final de los vídeos disponibles.':
    autoBlockedV3673?'No hay vídeos nuevos en este bloque. Pulsa «Ver más vídeos» para continuar.':'';
   result=added?'added':hasMore?'empty':'done';
   if(added)observeNew();
  }catch(_){
   if(thisRequestV3674!==requestEpochV3674)return;
   autoBlockedV3673=true;
   more.hidden=false;
   status.textContent='No se pudieron cargar más vídeos. Pulsa «Ver más vídeos» para reintentar.';
  }finally{
   if(timerV3674!==null&&typeof clearTimeout==='function')clearTimeout(timerV3674);
   if(thisRequestV3674!==requestEpochV3674)return;
   requestControllerV3674=null;
   loading=false;more.disabled=false;
   // La navegación del escritorio debe dejar de esperar a páginas fallidas.
   if(typeof CustomEvent==='function'){
    feed.dispatchEvent(new CustomEvent('pulso:page-result',{detail:{result,added}}));
   }
  }
 }
 more.addEventListener('click',()=>void loadMore({manual:true}));
 if('IntersectionObserver' in window){
  loaderObserverV3674=new IntersectionObserver(entries=>{
   const relevant=entries.filter(entry=>entry.target===footer);
   if(!relevant.length)return;
   // Si el observador notificó mientras la pestaña estaba oculta,
   // la entrada volverá a comprobarse cuando el usuario regrese.
   if(document.visibilityState!=='visible'){footerInsideV3673=false;return;}
   const inside=relevant.some(entry=>entry.isIntersecting&&entry.intersectionRatio>0);
   const entered=inside&&!footerInsideV3673;
   footerInsideV3673=inside;
   if(entered&&hasMore&&!loading&&!autoBlockedV3673)void loadMore();
  },{root:feed,rootMargin:'0px 0px 110px 0px',threshold:0});
  loaderObserverV3674.observe(footer);
 }
 function suspendPaginationV3674(){
  footerInsideV3673=false;
  if(!loading)return;
  // Invalidar la respuesta ANTES del abort: un fetch tardío nunca añade Reels.
  requestEpochV3674++;
  requestControllerV3674?.abort();
  requestControllerV3674=null;
  loading=false;more.disabled=false;
  status.textContent='Carga pausada. Puedes continuar al volver a Pulso.';
  if(typeof CustomEvent==='function'){
   feed.dispatchEvent(new CustomEvent('pulso:page-result',{detail:{result:'paused',added:0}}));
  }
 }
 function resumePaginationV3674(){
  if(document.visibilityState!=='visible'||!hasMore||autoBlockedV3673||!loaderObserverV3674)return;
  footerInsideV3673=false;
  loaderObserverV3674.unobserve?.(footer);
  loaderObserverV3674.observe(footer);
 }
 document.addEventListener?.('visibilitychange',()=>{
  if(document.visibilityState!=='visible')suspendPaginationV3674();
  else resumePaginationV3674();
 });
 window.addEventListener?.('pagehide',()=>{
  suspendPaginationV3674();
  loaderObserverV3674?.disconnect();
 });
 window.addEventListener?.('pageshow',event=>{
  if(event.persisted)resumePaginationV3674();
 });
 // Una reproducción iniciada por la persona también detiene cualquier otra.
 // "play" no burbujea: el listener debe escuchar en fase de captura.
 feed.addEventListener('play',event=>{
  const video=event.target;
  if(!video?.matches?.('video.pulso-video'))return;
  if(autoplayRequestsV3676.has(video)){
   autoplayRequestsV3676.delete(video);
   if(video!==activeVideo||document.visibilityState!=='visible'){
    video.pause();
    return;
   }
  }
  // No se permite reproducción en segundo plano, ni siquiera desde controles.
  if(document.visibilityState!=='visible'){
   video.pause();
   return;
  }
  // El usuario puede iniciar otro vídeo manualmente; debe detener los demás.
  // V3.6.80: el autoplay ya pausó los anteriores al cambiar de Reel.
  // Su evento 'play' no necesita repetir un escaneo completo del feed.
  const changedV3680=video!==activeVideo;
  if(changedV3680)clearBufferingV3677();
  activeVideo=video;
  if(changedV3680)pauseAll(video);
 },true);
 // El aviso aparece solo si sigue cargando después de 1,6 s.
 // 'waiting' y 'stalled' pueden repetirse durante una sola interrupción.
 for(const name of ['waiting','stalled']){
  feed.addEventListener(name,event=>{
   const video=event.target;
   if(video?.matches?.('video.pulso-video'))scheduleBufferingV3677(video);
  },true);
 }
 // Al reanudarse, pausar, terminar o fallar se retira el aviso.
 for(const name of ['playing','canplay','pause','ended','error']){
  feed.addEventListener(name,event=>{
   if(event.target===bufferingVideoV3677)clearBufferingV3677();
  },true);
 }
 // Al salir, recordar la intención de reproducción, no solo un booleano.
 function rememberPlaybackV3678(){
  if(activeVideo&&!activeVideo.paused){
   resumeWhenVisible=true;
   resumeVideoV3678=activeVideo;
  }
 }
 function restorePlaybackV3678(){
  // V3.6.79: pageshow y resume pueden llegar ANTES de que la pestaña
  // vuelva a ser visible. Conservar la intención hasta visibilitychange.
  if(document.visibilityState!=='visible')return;
  const resume=resumeWhenVisible;
  resumeWhenVisible=false;
  restoringV3678=true;
  try{syncPlayback(resume);}
  finally{
   restoringV3678=false;
   resumeVideoV3678=null;
  }
 }
 function suspendPlaybackV3679(){
  clearBufferingV3677();
  rememberPlaybackV3678();
  pauseAll();
 }
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')suspendPlaybackV3679();
  else restorePlaybackV3678();
 });
 // Chrome puede congelar pestañas móviles sin navegar al historial.
 // Se conservan los mismos límites de autoplay y pausas manuales.
 document.addEventListener('freeze',suspendPlaybackV3679);
 document.addEventListener('resume',restorePlaybackV3678);
 window.addEventListener('pagehide',()=>{
  suspendPlaybackV3679();
  observer?.disconnect();
 });
 // Regresar desde el historial (BFCache) debe reactivar el observador:
 // la página no se carga de nuevo después del evento pagehide.
 window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  feed.querySelectorAll('[data-pulso-item]').forEach(card=>observer?.observe(card));
  restorePlaybackV3678();
 });
 feed.addEventListener('click',async event=>{
  const share=event.target.closest?.('[data-pulso-share]');
  if(!share||sharePendingV3671.has(share))return;
  const path=share.dataset.pulsoShare;
  if(!/^\/reel\/[1-9][0-9]{0,15}$/.test(path||''))return;
  const url=location.origin+path;
  sharePendingV3671.add(share);
  share.disabled=true;
  try{
   if(navigator.share){
    try{
     await navigator.share({title:'Pulso · RedLibertad',url});
     return;
    }catch(err){
     if(err?.name==='AbortError')return; // Cancelar no es un error.
    }
   }
   // En ordenador, o si el menú nativo falla, copiar sin inventar enlaces.
   if(navigator.clipboard?.writeText){
    try{
     await navigator.clipboard.writeText(url);
     status.textContent='Enlace copiado para compartir.';
     if(typeof CustomEvent==='function'){
      feed.dispatchEvent(new CustomEvent('pulso:notice',{
       detail:{text:'Enlace copiado. Ya puedes compartirlo.'}
      }));
     }
     return;
    }catch(_){/* Copiado bloqueado: ofrecer selección manual. */}
   }
   window.prompt('Copia el enlace de Pulso:',url);
  }finally{
   share.disabled=false;
   sharePendingV3671.delete(share);
  }
 });
})();
