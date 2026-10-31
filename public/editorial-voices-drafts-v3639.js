'use strict';
(()=>{
 const el=id=>document.getElementById(id);
 const root='/api/noticias/redactores/borradores';
 const state={id:null,revision:null,loading:false,items:[],userId:null};
 const say=(text)=>{el('draftEditorStatusV3639').textContent=text;};
 async function api(path='',options={}){
  const r=await fetch(root+path,{credentials:'same-origin',...options,headers:{'Accept':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
   const errors={authentication_required:'Inicia sesión para escribir en tu cuenta.',invalid_session:'Tu sesión ha caducado. Vuelve a entrar.',solo_adultos_verificados:'Necesitas una cuenta de adulto verificada para escribir.',borrador_no_disponible_o_modificado:'Este borrador ha cambiado o ya no está disponible. Actualiza la lista antes de editar.',borrador_invalido:'Revisa título, contenido y enlaces de fuentes (HTTPS, máximo 8).'};
   const error=new Error(errors[data.error]||'No se pudo completar la operación. Inténtalo de nuevo.');
   error.status=r.status;throw error;
  }
  return data;
 }
 function renderList(){
  const host=el('draftListV3639');host.replaceChildren();
  for(const d of state.items){
   const btn=document.createElement('button');btn.type='button';
   btn.setAttribute('aria-current',String(state.id)===String(d.id)?'true':'false');
   const name=document.createElement('strong');name.textContent=d.title;
   const note=document.createElement('small');note.textContent='Borrador privado · '+({noticia:'Noticia',reportaje:'Reportaje',analisis:'Análisis',opinion:'Opinión'}[d.kind]||'Artículo');
   btn.append(name,note);
   btn.addEventListener('click',()=>openDraft(d));
   host.append(btn);
  }
 }
 function openDraft(d){
  state.id=d.id;state.revision=d.revision;
  el('draftKindV3639').value=d.kind;
  el('draftTitleV3639').value=d.title;
  el('draftBodyV3639').value=d.body;
  el('draftSourcesV3639').value=Array.isArray(d.sources)?d.sources.join('\n'):'';
  el('draftFormTitleV3639').textContent='Editar borrador';
  el('draftDeleteV3639').hidden=false;
  el('editorFormSectionV3639').hidden=false;
  renderList();say('');
  el('editorFormSectionV3639').scrollIntoView({block:'start',behavior:'auto'});
 }
 function newDraft(){
  state.id=null;state.revision=null;
  el('draftFormV3639').reset();
  el('draftFormTitleV3639').textContent='Nuevo borrador';
  el('draftDeleteV3639').hidden=true;
  el('editorFormSectionV3639').hidden=false;
  renderList();say('Escribe lo que tengas: podrás ampliarlo y añadir fuentes antes de enviarlo a revisión en una próxima versión.');
  el('draftTitleV3639').focus({preventScroll:true});
 }
 async function load(){
  const message=el('draftsMessageV3639');
  try{
   const data=await api();
   state.items=Array.isArray(data.items)?data.items:[];
   renderList();
   message.textContent=state.items.length?'Tus borradores solo aparecen al entrar con tu cuenta.':'No tienes borradores todavía. Puedes empezar con tu primera idea.';
   el('draftNewV3639').hidden=false;
   el('draftLoginV3639').hidden=true;
  }catch(error){
   message.textContent=error.message;
   el('draftLoginV3639').hidden=error.status!==401;
   el('draftNewV3639').hidden=true;
   el('editorFormSectionV3639').hidden=true;
  }
 }
 async function save(event){
  event.preventDefault();
  if(state.loading||!el('draftFormV3639').reportValidity())return;
  const sources=el('draftSourcesV3639').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(sources.length>8){say('Añade como máximo ocho enlaces de fuentes.');return;}
  const payload={
   kind:el('draftKindV3639').value,
   title:el('draftTitleV3639').value.trim(),
   body:el('draftBodyV3639').value.trim(),
   sources
  };
  if(!payload.title||!payload.body){say('Escribe un título y al menos una frase del artículo.');return;}
  state.loading=true;el('draftSaveV3639').disabled=true;
  try{
   const id=state.id;
   const data=await api(id?'/'+encodeURIComponent(id):'',{
    method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(id?{...payload,revision:state.revision}:payload)
   });
   state.id=data.draft.id;state.revision=data.draft.revision;
   await load();
   const saved=state.items.find(d=>String(d.id)===String(state.id));
   if(saved)openDraft(saved);
   say('Borrador guardado solo para ti. No se ha publicado ni enviado a revisión.');
  }catch(e){say(e.message);if(e.status===409)await load();}
  finally{state.loading=false;el('draftSaveV3639').disabled=false;}
 }
 async function remove(){
  if(!state.id||state.loading)return;
  if(!window.confirm('¿Eliminar este borrador privado? No se puede deshacer.'))return;
  state.loading=true;el('draftDeleteV3639').disabled=true;
  try{
   await api('/'+encodeURIComponent(state.id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:state.revision})});
   state.id=null;state.revision=null;
   el('editorFormSectionV3639').hidden=true;
   await load();
   el('draftsMessageV3639').textContent='Borrador eliminado. Puedes escribir otro cuando quieras.';
  }catch(e){say(e.message);if(e.status===409)await load();}
  finally{state.loading=false;el('draftDeleteV3639').disabled=false;}
 }
 el('draftNewV3639').addEventListener('click',newDraft);
 el('draftFormV3639').addEventListener('submit',save);
 el('draftDeleteV3639').addEventListener('click',remove);
 void load();
})();
