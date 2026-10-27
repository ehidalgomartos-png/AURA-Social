'use strict';
/* V3.4.1.3 — Explicit, per-account/per-device permission to load Facebook
 * embeds automatically when visible. Default off; no third-party network
 * requests until the viewer has actively enabled the setting. */
(function(global){
  const PREFIX='redlibertad-facebook-auto-v3413:';
  const MAX_AUTO_PER_PAGE=6;
  let viewerId=null;
  let provider=null;
  let observer=null;
  let loadedCount=0;
  const pending=new Set();
  const inserted=new Map();

  function key(id){
    const normalized=String(id||'');
    return /^[1-9][0-9]{0,18}$/.test(normalized)?PREFIX+normalized:null;
  }
  function isEnabled(id=viewerId){
    const name=key(id);
    if(!name)return false;
    try{return global.localStorage?.getItem(name)==='yes';}catch(_){return false;}
  }
  function checkbox(){
    return global.document?.getElementById('facebookAutoEmbedV3413')||null;
  }
  function showStatus(text){
    const target=global.document?.getElementById('facebookAutoEmbedStatusV3413');
    if(target)target.textContent=text;
  }
  function sync(){
    const input=checkbox();
    if(!input)return;
    input.checked=isEnabled();
    input.disabled=!key(viewerId);
  }
  function restore(){
    observer?.disconnect();
    pending.clear();
    observer=null;
    for(const [card,oldMarkup] of inserted){
      if(card.isConnected!==false){
        // The snapshot comes from RedLibertad's escaped template, never from
        // a third-party iframe or arbitrary user-supplied remote markup.
        card.innerHTML=oldMarkup;
        delete card.dataset.facebookAutoLoading;
        delete card.dataset.facebookAutoDone;
      }
    }
    inserted.clear();
    loadedCount=0;
  }
  function setViewer(id,api){
    const next=key(id)?String(id):null;
    if(viewerId!==next)restore();
    viewerId=next;
    if(api?.parse&&api?.activate)provider=api;
    sync();
  }
  function canAutoEmbed(card,api=provider){
    if(!isEnabled()||!api?.parse||!api?.activate)return null;
    if(!card||card.dataset?.socialCard!=='facebook'||card.dataset?.socialKind==='short')return null;
    if(card.dataset.facebookAutoLoading==='1'||card.dataset.facebookAutoDone==='1')return null;
    const button=card.querySelector?.('[data-social-activate]');
    if(!button)return null;
    const info=api.parse(button.dataset.socialUrl);
    if(!info||info.provider!=='facebook'||info.kind==='short'||!api.playerUrl?.(info))return null;
    return {info,button};
  }
  async function loadCard(card){
    if(loadedCount>=MAX_AUTO_PER_PAGE)return false;
    const entry=canAutoEmbed(card);
    if(!entry||entry.button.isConnected===false)return false;
    observer?.unobserve(card);pending.delete(card);
    const markup=card.innerHTML;
    inserted.set(card,markup);
    card.dataset.facebookAutoLoading='1';
    loadedCount++;
    try{
      const success=await provider.activate(entry.info,card);
      if(success){
        card.dataset.facebookAutoDone='1';
        return true;
      }
    }catch(_){}
    if(inserted.has(card)){
      card.innerHTML=markup;
      inserted.delete(card);
      delete card.dataset.facebookAutoLoading;
    }
    loadedCount=Math.max(0,loadedCount-1);
    return false;
  }
  function getObserver(){
    if(observer)return observer;
    if(typeof global.IntersectionObserver!=='function')return null;
    observer=new global.IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        observer?.unobserve(entry.target);
        pending.delete(entry.target);
        if(loadedCount<MAX_AUTO_PER_PAGE)void loadCard(entry.target);
      }
    },{rootMargin:'100px 0px',threshold:0.15});
    return observer;
  }
  function scan(root=global.document){
    if(!isEnabled()||!root||!provider)return;
    const observe=getObserver();
    if(!observe)return; // manual button remains usable in older browsers
    let cards=[];
    if(root.matches?.('[data-social-card="facebook"]'))cards.push(root);
    if(root.querySelectorAll)cards.push(...root.querySelectorAll('[data-social-card="facebook"]'));
    for(const card of cards){
      if(pending.has(card)||inserted.has(card))continue;
      if(!canAutoEmbed(card))continue;
      pending.add(card);
      observe.observe(card);
    }
  }
  function save(enabled){
    const name=key(viewerId);
    if(!name){showStatus('Inicia sesión para guardar la preferencia.');sync();return false;}
    try{
      global.localStorage?.setItem(name,enabled?'yes':'no');
      if(global.localStorage?.getItem(name)!==(enabled?'yes':'no'))throw Error('not_saved');
    }catch(_){
      sync();
      showStatus('No se pudo guardar la preferencia en este navegador.');
      return false;
    }
    if(enabled){
      showStatus('Activado en este dispositivo. Facebook cargará sus publicaciones cuando aparezcan en pantalla.');
      scan();
    }else{
      restore();
      showStatus('Desactivado. Facebook ya no se cargará automáticamente.');
    }
    sync();
    return true;
  }
  global.document?.addEventListener('change',event=>{
    if(event.target?.id!=='facebookAutoEmbedV3413')return;
    save(event.target.checked===true);
  });
  global.RedLibertadFacebookAutoV3413={setViewer,isEnabled,scan,save,restore,canAutoEmbed,loadCard,MAX_AUTO_PER_PAGE};
})(window);
