(()=> {
  function canonicalUrl(){
    return document.querySelector('link[rel="canonical"]')?.href || location.href;
  }
  async function copyText(value){
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(value);
      return true;
    }
    const area=document.createElement('textarea');
    area.value=value;
    area.setAttribute('readonly','');
    area.style.position='fixed';
    area.style.opacity='0';
    document.body.appendChild(area);
    area.select();
    const ok=document.execCommand('copy');
    area.remove();
    return ok;
  }
  function flash(button,text){
    const original=button.dataset.shareOriginal || button.textContent || 'Compartir';
    button.dataset.shareOriginal=original;
    button.textContent=text;
    button.disabled=true;
    setTimeout(()=>{button.textContent=original;button.disabled=false;},1600);
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-public-share]');
    if(!button)return;
    event.preventDefault();
    const url=button.dataset.shareUrl || canonicalUrl();
    const title=button.dataset.shareTitle || document.title;
    const text=button.dataset.shareText || document.querySelector('meta[name="description"]')?.content || '';
    try{
      if(navigator.share){
        await navigator.share({title,text,url});
        return;
      }
      await copyText(url);
      flash(button,'Enlace copiado ✓');
    }catch(error){
      if(error?.name==='AbortError')return;
      try{
        await copyText(url);
        flash(button,'Enlace copiado ✓');
      }catch(_){
        flash(button,'No se pudo copiar');
      }
    }
  });
})();