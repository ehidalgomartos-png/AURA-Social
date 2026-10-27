'use strict';
/* V3.4.1.5: enlarge photos that are already visible to this viewer.
 * Never fetch media from new APIs or bypass existing permission gates. */
(function(global){
  const doc=global.document;
  if(!doc)return;
  const TRIGGER='[data-photo-v3415]';
  let previousFocus=null;

  function elements(){
    return {
      modal:doc.getElementById('photoViewerModalV3415'),
      image:doc.getElementById('photoViewerImageV3415'),
      title:doc.getElementById('photoViewerTitleV3415'),
      close:doc.getElementById('photoViewerCloseV3415')
    };
  }
  function readablePhoto(trigger){
    if(!trigger||!['post','avatar','cover'].includes(trigger.dataset?.photoV3415))return null;
    const type=trigger.dataset.photoV3415;
    // The post/image must already be visible and permitted in the DOM.
    const image=type==='cover'?null:trigger.querySelector('img');
    const raw=type==='cover'?trigger.dataset.photoUrlV3415:(image?.currentSrc||image?.src);
    if(!raw)return null;
    let link;
    try{link=new URL(raw,global.location.href)}catch(_){return null}
    if(!['https:','http:'].includes(link.protocol))return null;
    if(link.protocol==='http:'&&global.location.protocol==='https:')return null;
    return {
      src:link.href,
      title:type==='cover'?'Fotografía de portada':type==='avatar'?'Fotografía de perfil':'Fotografía de la publicación',
      alt:image?.alt||'Fotografía ampliada'
    };
  }
  function open(trigger){
    const picture=readablePhoto(trigger),{modal,image,title,close}=elements();
    if(!picture||!modal||!image||!title||!close)return false;
    previousFocus=doc.activeElement;
    image.src=picture.src;
    image.alt=picture.alt;
    title.textContent=picture.title;
    modal.classList.remove('hidden');
    close.focus();
    return true;
  }
  function close(){
    const {modal,image}=elements();
    if(!modal||!image||modal.classList.contains('hidden'))return;
    modal.classList.add('hidden');
    image.removeAttribute('src');
    image.alt='';
    if(previousFocus?.isConnected)previousFocus.focus();
    previousFocus=null;
  }

  doc.addEventListener('click',event=>{
    if(event.target?.closest?.('#photoViewerCloseV3415')){close();return}
    const {modal}=elements();
    if(event.target===modal){close();return}
    const trigger=event.target?.closest?.(TRIGGER);
    if(!trigger||modal?.contains(trigger))return;
    if(event.target?.closest?.('a,button,input,textarea,select') && event.target!==trigger)return;
    open(trigger);
  });
  doc.addEventListener('keydown',event=>{
    const {modal}=elements();
    if(event.key==='Escape'&&modal&&!modal.classList.contains('hidden')){
      event.preventDefault();close();return;
    }
    if(event.key!=='Enter'&&event.key!==' ')return;
    const trigger=event.target?.closest?.(TRIGGER);
    if(!trigger||event.target!==trigger)return;
    event.preventDefault();
    open(trigger);
  });
  global.RedLibertadPhotoViewerV3415={open,close,readablePhoto};
})(window);
