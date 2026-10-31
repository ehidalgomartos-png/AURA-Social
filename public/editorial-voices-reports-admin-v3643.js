'use strict';
(()=>{
 const byId=id=>document.getElementById(id);
 const root=byId('voicesReportsListV3643'),feedback=byId('voicesReportsStatusV3643');
 if(!root)return;
 const refreshButton=byId('voicesReportsRefreshV3643');
 const make=(tag,text,className)=>{
  const el=document.createElement(tag);
  if(text!==undefined&&text!==null)el.textContent=String(text);
  if(className)el.className=className;
  return el;
 };
 const labels={
  inexactitud:'Posible información incorrecta',
  sin_fuentes:'Fuentes insuficientes',
  plagio:'Posible copia sin autorización',
  privacidad:'Privacidad o datos personales',
  otro:'Otro problema'
 };
 const endpoint='/api/noticias/redactores/admin/denuncias';
 async function json(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json',...(options.headers||{})},...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(response.status===403?'Solo administradores autorizados pueden revisar avisos.':'No se pudo completar esta operación. Actualiza y vuelve a intentarlo.');
  return data;
 }
 function card(report){
  const article=make('article',null,'voices-reports-admin-item-v3643');
  article.append(make('h3',report.title),
   make('p',(labels[report.reason]||'Aviso')+' · '+(report.withdrawn?'Artículo retirado':'Artículo disponible')),
   make('p',report.details));
  const link=make('a','Abrir artículo, si está disponible');
  link.href='/noticias/redactores/voces/'+encodeURIComponent(report.publication_id);
  article.append(link);
  const label=make('label','Resultado de la revisión (mínimo 15 caracteres)');
  const note=make('textarea');note.rows=3;note.maxLength=600;
  note.placeholder='Explica la actuación editorial y, cuando corresponda, retira el artículo desde publicación controlada.';
  label.append(note);
  const actions=make('div',null,'voices-reports-admin-actions-v3643');
  const status=make('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  for(const [decision,caption] of [['reviewed','Marcar como revisado'],['dismissed','Descartar aviso']]){
   const button=make('button',caption);button.type='button';
   button.addEventListener('click',async()=>{
    if(note.value.trim().length<15){status.textContent='Explica la decisión con al menos 15 caracteres.';note.focus();return;}
    if(!window.confirm('¿'+caption+'? Esta decisión no retira el artículo; usa el panel de publicaciones si es necesario.'))return;
    for(const b of actions.querySelectorAll('button'))b.disabled=true;
    status.textContent='Registrando decisión…';
    try{
     await json(endpoint+'/'+encodeURIComponent(report.id)+'/revisar',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({decision,note:note.value.trim(),confirmed:true})
     });
     await load();
    }catch(error){status.textContent=error.message;for(const b of actions.querySelectorAll('button'))b.disabled=false;}
   });
   actions.append(button);
  }
  article.append(label,actions,status);
  return article;
 }
 async function load(){
  refreshButton.disabled=true;root.replaceChildren();
  feedback.textContent='Consultando avisos de artículos…';
  try{
   const data=await json(endpoint);
   const items=Array.isArray(data.items)?data.items:[];
   for(const item of items)root.append(card(item));
   feedback.textContent=items.length?
    'Mostrando hasta 40 avisos pendientes, ordenados por fecha. Ningún aviso retira un artículo automáticamente.':
    'No hay avisos de artículos pendientes de revisión.';
  }catch(error){feedback.textContent=error.message;}
  finally{refreshButton.disabled=false;}
 }
 refreshButton.addEventListener('click',()=>void load());
 void load();
})();
