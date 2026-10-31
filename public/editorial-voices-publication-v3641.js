'use strict';
(()=>{
 const root='/api/noticias/redactores/admin',byId=id=>document.getElementById(id);
 const approved=byId('approvedQueueV3641'),live=byId('liveQueueV3641');
 const node=(tag,className,value)=>{
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(value!==undefined)el.textContent=String(value);
  return el;
 };
 const api=async(path,options={})=>{
  const response=await fetch(root+path,{credentials:'same-origin',...options,headers:{Accept:'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error({
   revision_o_autorizacion_invalida:'El artículo ha cambiado, no está autorizado para publicarse o su autor ha desactivado la cuenta.',
   publicacion_ya_existente_o_retirada:'Este artículo ya se había publicado o retirado.',
   publicacion_ya_retirada_o_no_disponible:'Esta publicación ya no está visible.'
  }[data.error]||'No se pudo completar la acción. Actualiza el panel e inténtalo de nuevo.');
  return data;
 };
 const info=(title,value)=>{
  const p=node('p','ed-voices-review-meta-v3640');p.append(node('strong',null,title+': '),node('span',null,value));return p;
 };
 function makeApproved(item){
  const box=node('article','ed-voices-review-item-v3640');
  box.append(node('h3',null,item.title),info('Autor','@'+item.author_username),
   info('Tipo',item.kind),info('Revisión',item.review_revision),
   node('p','ed-voices-review-body-v3640',item.body));
  const sources=node('div','ed-voices-review-sources-v3640');
  sources.append(node('strong',null,'Fuentes revisadas'));
  for(const raw of Array.isArray(item.sources)?item.sources:[]){
   try{
    const target=new URL(raw);
    if(target.protocol!=='https:')continue;
    const a=node('a',null,target.href);a.href=target.href;a.target='_blank';a.rel='noopener noreferrer nofollow';
    sources.append(a);
   }catch(_){}
  }
  box.append(sources);
  const form=node('div','voices-publish-control-v3641');
  const label=node('label');
  const check=node('input');check.type='checkbox';
  label.append(check,node('span',null,'He comprobado las fuentes, los derechos, el consentimiento del autor y que el texto puede hacerse público bajo su nombre de usuario.'));
  const submit=node('button',null,'Publicar artículo revisado');submit.type='button';
  const status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  submit.addEventListener('click',async()=>{
   if(!check.checked){status.textContent='Marca primero la revisión de derechos y fuentes.';return;}
   if(!window.confirm('¿PUBLICAR «'+item.title+'» para todos los visitantes? El texto y el nombre de usuario serán públicos e indexables.'))return;
   submit.disabled=true;status.textContent='Registrando publicación…';
   try{
    const result=await api('/envios/'+encodeURIComponent(item.id)+'/publicar',{
     method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      revision:item.review_revision,rightsChecked:true,confirmed:true
     })
    });
    status.textContent='Artículo publicado. Enlace: '+result.url;
    await refresh();
   }catch(error){status.textContent=error.message;submit.disabled=false;}
  });
  form.append(label,submit,status);box.append(form);
  return box;
 }
 function makeLive(item){
  const box=node('article','ed-voices-review-item-v3640');
  const link=node('a',null,'Ver artículo público');
  link.href='/noticias/redactores/voces/'+encodeURIComponent(item.id);
  box.append(node('h3',null,item.title),info('Autor','@'+item.author_username),link);
  const form=node('div','voices-publish-control-v3641');
  const label=node('label',null,'Motivo de retirada (mínimo 15 caracteres)');
  const reason=node('textarea');reason.rows=3;reason.maxLength=600;reason.placeholder='Anota el motivo de la retirada para la auditoría editorial.';
  const submit=node('button','voices-withdraw-v3641','Retirar artículo público');submit.type='button';
  const status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  submit.addEventListener('click',async()=>{
   if(reason.value.trim().length<15){status.textContent='Explica el motivo con al menos 15 caracteres.';reason.focus();return;}
   if(!window.confirm('¿RETIRAR definitivamente el artículo «'+item.title+'» de la vista pública?'))return;
   submit.disabled=true;status.textContent='Retirando…';
   try{
    await api('/publicaciones/'+encodeURIComponent(item.id)+'/retirar',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({reason:reason.value.trim(),confirmed:true})
    });
    status.textContent='Retirado del listado y de la vista pública.';
    await refresh();
   }catch(error){status.textContent=error.message;submit.disabled=false;}
  });
  form.append(label,reason,submit,status);box.append(form);
  return box;
 }
 async function refresh(){
  const btn=byId('publicationRefreshV3641');
  btn.disabled=true;
  byId('approvedStatusV3641').textContent='Consultando artículos aprobados…';
  byId('liveStatusV3641').textContent='Consultando artículos públicos…';
  approved.replaceChildren();live.replaceChildren();
  try{
   const [a,b]=await Promise.all([api('/aprobados'),api('/publicados')]);
   const ready=Array.isArray(a.items)?a.items:[],published=Array.isArray(b.items)?b.items:[];
   for(const item of ready)approved.append(makeApproved(item));
   for(const item of published)live.append(makeLive(item));
   byId('approvedStatusV3641').textContent=ready.length?
    'Artículos aprobados y autorizados que aún requieren publicación manual: '+ready.length+'.':
    'No hay artículos autorizados pendientes de publicación.';
   byId('liveStatusV3641').textContent=published.length?
    'Artículos actualmente públicos: '+published.length+'.':
    'Todavía no hay artículos publicados.';
  }catch(error){
   byId('approvedStatusV3641').textContent=error.message;
   byId('liveStatusV3641').textContent='No se puede confirmar el estado de las publicaciones.';
  }finally{btn.disabled=false;}
 }
 byId('publicationRefreshV3641').addEventListener('click',()=>void refresh());
 void refresh();
})();
