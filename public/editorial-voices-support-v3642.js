'use strict';
(()=>{
 const root=document.getElementById('voicesSupportV3642');
 if(!root)return;
 const id=root.dataset.publicationId;
 if(!/^[1-9]\d{0,14}$/.test(String(id||'')))return;
 const count=document.getElementById('voicesSupportCountV3642');
 const button=document.getElementById('voicesSupportActionV3642');
 const login=document.getElementById('voicesSupportLoginV3642');
 const status=document.getElementById('voicesSupportStatusV3642');
 const resource='/api/noticias/redactores/voces/'+encodeURIComponent(id)+'/apoyo';
 let supported=false,busy=false;
 const countLabel=n=>n===1?'1 lector ha marcado este artículo como útil.':n+' lectores han marcado este artículo como útil.';
 const validCount=n=>Number.isSafeInteger(n)&&n>=0;
 function sync(n,own){
  if(!validCount(n))throw new Error('Recuento temporalmente no disponible.');
  count.textContent=countLabel(n);
  if(typeof own==='boolean'){
   supported=own;
   button.dataset.supported=String(own);
   button.textContent=own?'Quitar mi apoyo':'Me ha resultado útil';
  }
 }
 async function read(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...(options.headers||{})}});
  const result=await response.json().catch(()=>({}));
  return {statusCode:response.status,ok:response.ok,result};
 }
 async function init(){
  button.hidden=true;button.disabled=true;login.hidden=true;
  try{
   const total=await read('/noticias/redactores/voces/'+encodeURIComponent(id)+'/apoyos');
   if(!total.ok)throw new Error('No hemos podido consultar los reconocimientos reales.');
   sync(total.result.count);
   const me=await read(resource);
   if(me.statusCode===401){login.hidden=false;status.textContent='Para apoyar un artículo necesitas entrar con tu cuenta de RedLibertad.';return;}
   if(me.statusCode===403){status.textContent='Esta cuenta no tiene acceso a los reconocimientos.';return;}
   if(!me.ok)throw new Error('No se ha podido comprobar tu apoyo. Puedes actualizar esta página.');
   sync(me.result.count,me.result.supported);
   if(me.result.canSupport===false){
    status.textContent='No puedes reconocer tu propio artículo. Los apoyos proceden de otros lectores.';
    return;
   }
   button.hidden=false;button.disabled=false;
   status.textContent='Tu reconocimiento es opcional. Puedes retirarlo cuando quieras.';
  }catch(error){status.textContent=error.message;}
 }
 button.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;button.disabled=true;
  status.textContent='Guardando tu decisión…';
  try{
   const next=!supported;
   const out=await read(resource,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({supported:next})});
   if(!out.ok){
    if(out.statusCode===401){button.hidden=true;login.hidden=false;throw new Error('Inicia sesión para apoyar este artículo.');}
    if(out.statusCode===403){button.hidden=true;throw new Error('No está permitido apoyar tu propio artículo.');}
    if(out.statusCode===404){button.hidden=true;throw new Error('Este artículo ya no admite apoyos públicos.');}
    throw new Error('No hemos podido guardar tu apoyo. Inténtalo de nuevo.');
   }
   sync(out.result.count,out.result.supported);
   status.textContent=out.result.supported?
    'Tu apoyo se ha guardado. Gracias por reconocer el trabajo del autor.':
    'Has retirado tu apoyo. El recuento se ha actualizado.';
  }catch(error){status.textContent=error.message;}
  finally{busy=false;if(!button.hidden)button.disabled=false;}
 });
 void init();
})();
