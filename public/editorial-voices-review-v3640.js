'use strict';
(()=>{
 const root='/api/noticias/redactores/admin';
 const el=id=>document.getElementById(id);
 const status=el('reviewQueueStatusV3640');
 const host=el('reviewQueueV3640');
 const create=(tag,cls,txt)=>{
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(txt!==undefined)n.textContent=String(txt);
  return n;
 };
 const get=async(url,options={})=>{
  const response=await fetch(url,{credentials:'same-origin',...options,headers:{Accept:'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error==='admin_required'?'Solo el equipo administrador puede revisar estos artículos.':data.error==='revision_no_disponible'?'El envío ha cambiado. Actualiza la cola.':'No ha sido posible completar esta operación.');
  return data;
 };
 const labels={noticia:'Noticia',reportaje:'Reportaje',analisis:'Análisis',opinion:'Opinión'};
 function itemCard(article){
  const wrap=create('article','ed-voices-review-item-v3640');
  const title=create('h3',null,article.title);
  const meta=create('p','ed-voices-review-meta-v3640','@'+article.author_username+' · '+(labels[article.kind]||'Artículo')+' · Revisión #'+article.review_revision);
  const body=create('div','ed-voices-review-body-v3640',article.body);
  const sources=create('div','ed-voices-review-sources-v3640');
  sources.append(create('strong',null,'Fuentes aportadas'));
  if(!Array.isArray(article.sources)||!article.sources.length){
   sources.append(create('span',null,'No ha aportado fuentes.'));
  }else for(const src of article.sources){
   let target;
   try{target=new URL(src);if(target.protocol!=='https:')continue;}catch(_){continue;}
   const link=create('a',null,target.href);
   link.href=target.href;link.rel='noopener noreferrer external';link.target='_blank';
   sources.append(link);
  }
  const controls=create('div','ed-voices-review-controls-v3640');
  const label=create('label',null,'Motivo de la decisión (obligatorio para corrección o rechazo)');
  const reason=create('textarea');reason.rows=3;reason.maxLength=600;reason.placeholder='Explica claramente qué debe mejorar el autor, sin incluir información privada.';
  label.append(reason);
  const actions=create('div','ed-voices-review-buttons-v3640');
  const feedback=create('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const decisions=[
   ['approved','Aprobar para futura publicación'],
   ['changes_requested','Solicitar cambios'],
   ['rejected','Rechazar']
  ];
  for(const [decision,caption] of decisions){
   const btn=create('button',null,caption);
   btn.type='button';btn.dataset.decision=decision;
   btn.addEventListener('click',async()=>{
    if((decision!=='approved'&&reason.value.trim().length<15)){feedback.textContent='Explica el motivo con al menos 15 caracteres.';reason.focus();return;}
    if(!window.confirm('¿Confirmar «'+caption+'» para el artículo «'+article.title+'»? Esta decisión no publicará el artículo.'))return;
    actions.querySelectorAll('button').forEach(button=>button.disabled=true);
    feedback.textContent='Guardando la revisión humana…';
    try{
     await get(root+'/envios/'+encodeURIComponent(article.id)+'/revisar',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({revision:article.review_revision,decision,reason:reason.value.trim(),confirmed:true})
     });
     feedback.textContent='Revisión registrada. La decisión no publica el artículo.';
     await load();
    }catch(err){
     feedback.textContent=err.message;
     actions.querySelectorAll('button').forEach(button=>button.disabled=false);
    }
   });
   actions.append(btn);
  }
  controls.append(label,actions,feedback);
  wrap.append(title,meta,body,sources,controls);
  return wrap;
 }
 async function load(){
  const refresh=el('reviewRefreshV3640');
  refresh.disabled=true;
  status.textContent='Cargando artículos pendientes…';
  host.replaceChildren();
  try{
   const data=await get(root+'/pendientes');
   const articles=Array.isArray(data.items)?data.items:[];
   for(const item of articles)host.append(itemCard(item));
   status.textContent=articles.length?
    'Mostrando hasta 30 envíos pendientes, por orden de llegada. Son privados y no se publican al aprobarlos.':
    'No hay artículos pendientes de revisión.';
  }catch(e){status.textContent=e.message;}
  finally{refresh.disabled=false;}
 }
 el('reviewRefreshV3640').addEventListener('click',()=>void load());
 void load();
})();
