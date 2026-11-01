'use strict';
// V3.6.64 — Navegación de Pulso y precarga limitada.
// No genera reproducciones ni eventos sociales ficticios.
(()=>{
 const feed=document.getElementById('pulsoFeed');
 const previous=document.getElementById('pulsoPreviousV3664');
 const next=document.getElementById('pulsoNextV3664');
 const counter=document.getElementById('pulsoNavStatusV3664');
 const more=document.getElementById('pulsoMore');
 if(!feed||!previous||!next||!counter)return;

 const saveData=window.navigator?.connection?.saveData===true;
 const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const cards=()=>Array.from(feed.querySelectorAll('[data-pulso-item]'));
 const known=new WeakSet();
 const visible=new Map();
 let active=null;
 let pendingAdvance=null;
 const smooth=reducedMotion?'auto':'smooth';

 function preloadNear(index,items){
  const foreground=document.visibilityState==='visible';
  items.forEach((card,i)=>{
   const video=card.querySelector('video.pulso-video');
   if(!video)return;
   // Nunca más del vídeo activo y sus vecinos próximos con metadatos.
   const near=!saveData&&foreground&&Math.abs(index-i)<=1;
   const target=near?'metadata':'none';
   if(video.preload!==target)video.preload=target;
  });
 }
 function activate(card){
  const items=cards();
  const index=items.indexOf(card);
  if(index<0||!items.length)return;
  if(active!==card){
   active?.removeAttribute('data-pulso-active-v3664');
   active=card;
   active.setAttribute('data-pulso-active-v3664','');
  }
  counter.textContent='Vídeo '+(index+1)+' de '+items.length+' cargados';
  previous.disabled=index===0;
  const atEnd=index===items.length-1;
  next.disabled=atEnd&&(!more||more.hidden);
  next.setAttribute('aria-label',atEnd&&!next.disabled?'Cargar y ver más vídeos':'Siguiente vídeo');
  preloadNear(index,items);
 }
 function goTo(index){
  const items=cards();
  const card=items[index];
  if(!card)return false;
  // El scroll se realiza únicamente dentro del visor, con snap.
  card.scrollIntoView({behavior:smooth,block:'start',inline:'nearest'});
  activate(card);
  return true;
 }
 function navigate(direction){
  const items=cards();
  if(!items.length)return;
  const index=Math.max(0,items.indexOf(active));
  const target=index+direction;
  if(target>=0&&target<items.length){goTo(target);return;}
  if(direction>0&&target>=items.length&&more&&!more.hidden&&!more.disabled){
   pendingAdvance=items.length;
   more.click(); // Reutiliza el paginador existente; no dispara consultas paralelas.
  }
 }
 previous.addEventListener('click',()=>navigate(-1));
 next.addEventListener('click',()=>navigate(1));
 feed.addEventListener('keydown',event=>{
  if(event.target!==feed||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(event.key==='ArrowDown'||event.key==='PageDown'){
   event.preventDefault();navigate(1);
  }else if(event.key==='ArrowUp'||event.key==='PageUp'){
   event.preventDefault();navigate(-1);
  }else if(event.key==='Home'){
   event.preventDefault();goTo(0);
  }
 });
 function pickFromVisible(){
  let best=null,ratio=0;
  for(const [card,value] of visible){
   if(!card.isConnected){visible.delete(card);continue;}
   if(value>ratio){best=card;ratio=value;}
  }
  if(best)activate(best);
 }
 let watcher=null;
 if('IntersectionObserver' in window){
  watcher=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(entry.isIntersecting&&entry.intersectionRatio>0){
     visible.set(entry.target,entry.intersectionRatio);
    }else visible.delete(entry.target);
   }
   pickFromVisible();
  },{root:feed,threshold:[0,.25,.5,.75,.95]});
 }
 function observeCards(){
  for(const card of cards()){
   if(known.has(card))continue;
   known.add(card);
   watcher?.observe(card);
  }
  if(!active&&cards().length)activate(cards()[0]);
 }
 observeCards();
 if(typeof MutationObserver==='function'){
  new MutationObserver(records=>{
   if(!records.some(r=>r.addedNodes.length))return;
   observeCards();
   if(pendingAdvance!==null&&cards().length>pendingAdvance){
    const at=pendingAdvance;
    pendingAdvance=null;
    goTo(at);
   }else if(active)activate(active);
  }).observe(feed,{childList:true});
 }
 // Degradación accesible en navegadores sin IntersectionObserver.
 if(!watcher){
  let scheduled=false;
  feed.addEventListener('scroll',()=>{
   if(scheduled)return;
   scheduled=true;
   requestAnimationFrame(()=>{
    scheduled=false;
    const box=feed.getBoundingClientRect(),middle=(box.top+box.bottom)/2;
    let found=null,distance=Infinity;
    for(const card of cards()){
     const rect=card.getBoundingClientRect();
     const delta=Math.abs((rect.top+rect.bottom)/2-middle);
     if(delta<distance){distance=delta;found=card;}
    }
    if(found)activate(found);
   });
  },{passive:true});
 }
 // Fallos de reproducción: ofrecer el enlace real al Reel, sin ocultar el vídeo.
 feed.addEventListener('error',event=>{
  const video=event.target;
  if(!video?.matches?.('video.pulso-video'))return;
  const card=video.closest('[data-pulso-item]');
  if(!card||card.querySelector('.pulso-error-v3664'))return;
  const alert=document.createElement('div');
  alert.className='pulso-error-v3664';
  alert.setAttribute('role','alert');
  const text=document.createElement('p');
  text.textContent='No se pudo reproducir este vídeo aquí.';
  alert.append(text);
  const detail=card.querySelector('a.pulso-detail');
  const href=detail?.getAttribute('href')||'';
  if(/^\/reel\/[1-9][0-9]{0,15}$/.test(href)){
   const link=document.createElement('a');
   link.href=href;
   link.textContent='Abrir la publicación';
   alert.append(link);
  }
  card.append(alert);
 },true);
 document.addEventListener('visibilitychange',()=>{
  if(active)activate(active);
 });
 window.addEventListener('pagehide',()=>watcher?.disconnect());
})();
