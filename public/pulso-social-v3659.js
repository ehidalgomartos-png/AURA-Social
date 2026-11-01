'use strict';
// V3.6.59 — Socializar desde Pulso usando los endpoints de RedLibertad existentes.
// El estado personal se consulta con sesión; nunca se mezcla con el HTML público.
(()=>{
 const feed=document.getElementById('pulsoFeed');
 const authDialog=document.getElementById('pulsoAuthDialog');
 const commentsDialog=document.getElementById('pulsoCommentsDialog');
 const list=document.getElementById('pulsoCommentsList');
 const form=document.getElementById('pulsoCommentForm');
 const composer=document.getElementById('pulsoCommentBody');
 const commentStatus=document.getElementById('pulsoCommentStatus');
 const notice=document.getElementById('pulsoSocialNotice');
 if(!feed||!authDialog||!commentsDialog||!list||!form||!composer||!commentStatus||!notice)return;
 const states=new Map();
 const inFlight=new Set();
 const pendingIds=new Set();
 let authState='unknown',stateLoading=false,activeCommentId=null,noticeTimer=null,lastFocus=null;
 const validId=value=>/^[1-9][0-9]{0,15}$/.test(String(value||''));
 const allCards=()=>[...feed.querySelectorAll('[data-pulso-item]')];
 const cardId=card=>String(card?.dataset?.reelId||'');
 function message(value){
  notice.textContent=value;
  notice.hidden=false;
  if(noticeTimer)clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>{notice.hidden=true;notice.textContent='';},4600);
 }
 // El mismo aviso accesible de Pulso informa también de enlaces copiados.
 feed.addEventListener('pulso:notice',event=>{
  if(event?.detail?.text==='Enlace copiado. Ya puedes compartirlo.'){
   message('Enlace copiado. Ya puedes compartirlo.');
  }
 });
 function openDialog(dialog){
  lastFocus=document.activeElement;
  feed.querySelectorAll('video.pulso-video').forEach(video=>{if(!video.paused)video.pause();});
  if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
  else dialog.setAttribute('open','');
 }
 function closeDialog(dialog){
  if(typeof dialog.close==='function'&&dialog.open)dialog.close();
  else dialog.removeAttribute('open');
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
 }
 function showAuth(publishing=false){
  const next=publishing?'/app?view=reels&crear=reel':'/pulso';
  for(const link of authDialog.querySelectorAll('a[href]')){
   const isLogin=link.textContent.includes('Ya tengo');
   link.href='/?'+new URLSearchParams({entry:'pulso',next}).toString()+'#'+(isLogin?'acceso':'registro');
  }
  openDialog(authDialog);
 }
 async function json(url,opts={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});
  let data={};
  try{data=await response.json();}catch(_){}
  return {response,data};
 }
 function paint(id){
  const state=states.get(String(id));
  allCards().filter(card=>cardId(card)===String(id)).forEach(card=>{
   const like=card.querySelector('[data-pulso-like]');
   if(like){
    like.setAttribute('aria-pressed',state?.liked?'true':'false');
    like.classList.toggle('is-liked',state?.liked===true);
    like.setAttribute('aria-label',state?.liked?'Quitar Me gusta':'Me gusta');
   }
  });
 }
 function paintGuest(){
  for(const card of allCards())paint(cardId(card));
 }
 async function loadStates(ids){
  const valid=[...new Set(ids.map(String).filter(validId))].filter(id=>!inFlight.has(id));
  if(!valid.length)return;
  for(const id of valid)inFlight.add(id);
  try{
   // Cada consulta cubre como máximo los 12 elementos de una página.
   for(let i=0;i<valid.length;i+=12){
    const batch=valid.slice(i,i+12);
    const {response,data}=await json('/api/pulso/state?ids='+encodeURIComponent(batch.join(',')));
    if(response.status===401){
     authState='guest';states.clear();paintGuest();return;
    }
    if(!response.ok||data.authenticated!==true||!data.states||typeof data.states!=='object')throw Error('unavailable');
    authState='member';
    for(const id of batch){
     const v=data.states[id];
     if(v&&validId(v.authorId)&&typeof v.liked==='boolean'&&typeof v.following==='boolean'&&typeof v.own==='boolean'){
      states.set(id,{authorId:String(v.authorId),liked:v.liked,following:v.following,own:v.own});
     }else states.delete(id);
     paint(id);
    }
   }
  }catch(_){
   if(authState==='unknown')authState='error';
  }finally{
   for(const id of valid)inFlight.delete(id);
  }
 }
 async function checkSession(){
  try{
   const {response,data}=await json('/api/pulso/session');
   if(response.status===401){
    authState='guest';states.clear();paintGuest();return false;
   }
   if(response.ok&&data.authenticated===true){
    authState='member';return true;
   }
  }catch(_){}
  authState='error';return false;
 }
 function queueStates(ids){
  for(const id of ids)if(validId(id))pendingIds.add(String(id));
  if(stateLoading)return;
  stateLoading=true;
  Promise.resolve().then(async()=>{
   const batch=[...pendingIds];
   pendingIds.clear();
   if(authState==='guest'){paintGuest();return;}
   await loadStates(batch);
  }).finally(()=>{
   stateLoading=false;
   if(pendingIds.size)queueStates([]);
  });
 }
 queueStates(allCards().map(cardId));
 if(typeof MutationObserver==='function'){
  new MutationObserver(records=>{
   const ids=[];
   for(const record of records){
    for(const node of record.addedNodes){
     if(node.nodeType!==1)continue;
     if(node.matches?.('[data-pulso-item]'))ids.push(cardId(node));
     node.querySelectorAll?.('[data-pulso-item]').forEach(card=>ids.push(cardId(card)));
    }
   }
   if(ids.length)queueStates(ids);
  }).observe(feed,{childList:true});
 }
 async function allowed(id){
  if(authState==='guest'){showAuth();return false;}
  if(authState!=='member'||!states.has(id)){
   await loadStates([id]);
   if(authState==='guest'){showAuth();return false;}
   if(!states.has(id)){
    message('Este vídeo no permite interactuar ahora. Prueba a actualizar la página.');
    return false;
   }
  }
  return true;
 }
 async function toggleLike(button){
  const id=String(button.dataset.pulsoLike||'');
  if(!validId(id)||button.disabled||!await allowed(id))return;
  const state=states.get(id);
  if(!state)return;
  button.disabled=true;
  try{
   const {response,data}=await json('/api/posts/'+id+'/like',{method:state.liked?'DELETE':'POST'});
   if(response.status===401){authState='guest';showAuth();return;}
   if(!response.ok||typeof data.liked!=='boolean'||!Number.isSafeInteger(Number(data.likeCount)))throw Error('like_failed');
   state.liked=data.liked;
   paint(id);
   for(const card of allCards().filter(c=>cardId(c)===id)){
    const control=card.querySelector('[data-pulso-like]');
    if(control){
     control.querySelector('b').textContent=String(Math.max(0,Number(data.likeCount)));
     control.setAttribute('aria-label',data.liked?'Quitar Me gusta':'Me gusta');
    }
   }
  }catch(_){message('No se pudo actualizar el Me gusta.');}
  finally{button.disabled=false;}
 }
 const safeUsername=value=>/^[\p{L}\p{N}._-]{2,60}$/u.test(String(value||''));
 function el(tag,cls,txt){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(txt!==undefined)node.textContent=String(txt);
  return node;
 }
 function renderComments(comments){
  list.replaceChildren();
  if(!comments.length){list.append(el('p','pulso-comments-empty','Aún no hay comentarios. Sé la primera persona en participar.'));return;}
  const display=comments.slice(-40);
  if(comments.length>40)list.append(el('p','pulso-comments-intro','Se muestran los últimos 40 comentarios disponibles.'));
  for(const comment of display){
   const article=el('article','pulso-comment');
   const user=String(comment.display_name||comment.username||'Usuario').slice(0,80);
   const username=String(comment.username||'');
   if(safeUsername(username)){
    const profile=el('a','pulso-comment-author',user);
    profile.href='/perfil/'+encodeURIComponent(username);
    article.append(profile);
   }else article.append(el('strong','pulso-comment-author',user));
   article.append(el('p',null,String(comment.body||'').slice(0,1000)));
   list.append(article);
  }
 }
 async function loadComments(id){
  list.replaceChildren(el('p','pulso-comments-loading','Cargando comentarios…'));
  try{
   const {response,data}=await json('/api/posts/'+id+'/comments');
   if(activeCommentId!==id)return;
   if(response.status===401){closeDialog(commentsDialog);authState='guest';showAuth();return;}
   if(!response.ok||!Array.isArray(data.comments))throw Error('comments_unavailable');
   renderComments(data.comments);
  }catch(_){
   if(activeCommentId===id)list.replaceChildren(el('p','pulso-comments-error','No se pudieron cargar los comentarios.'));
  }
 }
 async function openComments(id){
  if(!validId(id)||!await allowed(id))return;
  activeCommentId=id;
  commentStatus.textContent='';
  composer.value='';
  openDialog(commentsDialog);
  await loadComments(id);
 }
 feed.addEventListener('click',event=>{
  const like=event.target.closest('[data-pulso-like]');
  if(like){event.preventDefault();void toggleLike(like);return;}
  const comments=event.target.closest('[data-pulso-comments]');
  if(comments){event.preventDefault();void openComments(String(comments.dataset.pulsoComments||''));}
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const id=activeCommentId;
  const body=composer.value.trim();
  if(!validId(id)||!body||body.length>1000){commentStatus.textContent='Escribe un comentario de hasta 1000 caracteres.';return;}
  const button=form.querySelector('[type="submit"]');
  if(button.disabled)return;
  button.disabled=true;
  commentStatus.textContent='Publicando comentario…';
  try{
   const {response}=await json('/api/posts/'+id+'/comments',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})
   });
   if(response.status===401){closeDialog(commentsDialog);authState='guest';showAuth();return;}
   if(!response.ok)throw Error('comment_failed');
   composer.value='';
   commentStatus.textContent='Comentario publicado.';
   for(const card of allCards().filter(c=>cardId(c)===id)){
    const count=card.querySelector('[data-pulso-comments] b');
    if(count)count.textContent=String(Number(count.textContent||0)+1);
   }
   await loadComments(id);
  }catch(_){commentStatus.textContent='No se pudo publicar el comentario. Inténtalo otra vez.';}
  finally{button.disabled=false;}
 });
 document.addEventListener('click',event=>{
  const close=event.target.closest('[data-pulso-close]');
  if(close){
   const dialog=close.closest('dialog');
   if(dialog)closeDialog(dialog);
  }
  const create=event.target.closest('[data-pulso-create]');
  if(!create)return;
  if(authState==='member')return;
  event.preventDefault();
  if(authState==='guest')showAuth(true);
  else void checkSession().then(ok=>{
   if(ok)location.href=create.href;
   else if(authState==='guest')showAuth(true);
   else message('No se pudo comprobar tu sesión. Inténtalo de nuevo.');
  });
 });
 commentsDialog.addEventListener('close',()=>{activeCommentId=null;});
 for(const dialog of [authDialog,commentsDialog]){
  dialog.addEventListener('click',event=>{
   if(event.target===dialog)closeDialog(dialog);
  });
 }
})();
