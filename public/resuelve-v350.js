'use strict';
// Resuelve V3.5.0: DOM seguro (textContent), sin inyectar HTML de usuarios.
(()=>{
 const el=id=>document.getElementById(id);
 const create=(tag,cls,text)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);return n;
 };
 const append=(parent,...children)=>{parent.append(...children);return parent;};
 const categories={consejo:'Necesito consejo',busco:'Estoy buscando algo',ayuda:'Necesito ayuda',experiencia:'Experiencias'};
 const state={user:null,filter:'open',category:'',search:'',next:null,question:null,loading:false};
 const message=(text)=>{el('banner').textContent=text;};
 async function request(url,options){
  const response=await fetch(url,{credentials:'same-origin',...options,headers:{'Accept':'application/json',...(options?.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(response.status===401?'Entra en tu cuenta para participar.':
   response.status===403?'No tienes permiso para realizar esta acción.':
   response.status===429?'Has hecho demasiadas solicitudes. Inténtalo más tarde.':
   data.error==='peticion_no_disponible'?'Esta petición ya no acepta respuestas.':
   'No se pudo completar la operación. Vuelve a intentarlo.');
  return data;
 }
 async function write(url,payload){
  return request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 }
 function date(v){try{return new Date(v).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});}catch(_){return '';}}
 function chip(text,solved){return create('span','chip'+(solved?' solved':''),text);}
 function meta(...nodes){return append(create('div','card-meta'),...nodes);}
 function button(text,callback,cls='plain'){
  const b=create('button',cls,text);b.type='button';b.addEventListener('click',callback);return b;
 }
 function card(q){
  const article=create('article','question-card');
  const heading=create('h3',null,q.title);
  const headingLink=create('a',null,q.title);
  headingLink.href='/resuelve?id='+encodeURIComponent(q.id);
  heading.textContent='';heading.append(headingLink);
  article.append(
   meta(chip(q.status==='resolved'?'Resuelta':'Por resolver',q.status==='resolved'),
    chip(categories[q.category]||'Petición')),
   heading,create('p',null,q.body),
   meta(create('span',null,'@'+q.author_username),
    create('span',null,date(q.created_at)),
    create('span',null,(Number(q.answer_count)||0)+' respuestas')),
   button('Ver petición',()=>openDetail(q.id))
  );
  return article;
 }
 async function loadList(more=false){
  if(state.loading)return;
  state.loading=true;
  const list=el('questionList'),status=el('listStatus'),btn=el('moreButton');
  btn.hidden=true;
  if(!more){list.replaceChildren();status.textContent='Cargando peticiones…';}
  try{
   const params=new URLSearchParams();
   if(state.filter!=='mine'){
    params.set('estado',state.filter);
    if(state.category)params.set('categoria',state.category);
    if(state.search)params.set('q',state.search);
   }
   if(more&&state.next)params.set('antes',state.next);
   const url=(state.filter==='mine'?'/api/resuelve/questions/mine':'/api/resuelve/questions')+'?'+params.toString();
   const data=await request(url);
   for(const q of data.items)list.append(card(q));
   state.next=data.next;
   btn.hidden=!state.next;
   status.textContent=list.childElementCount?'':(state.filter==='mine'?'Todavía no has publicado ninguna petición.':'Aún no hay peticiones en esta sección. Puedes ser la primera persona en participar.');
  }catch(err){status.textContent=err.message;}
  finally{state.loading=false;}
 }
 function displayDetail(open){
  el('detailPanel').hidden=!open;
  el('questions').hidden=open;
  el('askPanel').hidden=true;
 }
 async function openDetail(id,push=true){
  if(!/^[1-9]\d{0,15}$/.test(String(id)))return;
  displayDetail(true);el('questionDetail').textContent='Cargando petición…';
  el('answerList').replaceChildren();el('answerForm').hidden=true;
  if(push)history.pushState({id},'', '/resuelve?id='+encodeURIComponent(id));
  try{
   const data=await request('/api/resuelve/questions/'+encodeURIComponent(id));
   state.question=data.question;
   renderDetail(data);
   el('detailPanel').scrollIntoView({block:'start',behavior:'auto'});
  }catch(err){el('questionDetail').textContent=err.message;}
 }

 function connectedActions(q){
  const wrap=create('section','resuelve-related');
  const title=create('h3',null,'Conecta esta petición con RedLibertad');
  const info=create('p','muted','Encuentra opciones en Marketplace, conversa en comunidades o comparte esta petición. No se publicará nada automáticamente.');
  const links=create('div','resuelve-related-actions');
  function action(label,href){
   const a=create('a','secondary',label);a.href=href;links.append(a);
  }
  action('Explorar Marketplace','/marketplace/explorar');
  action('Ver comunidades','/comunidades');
  const share=button('Compartir petición',async()=>{
   const url=new URL('/resuelve?id='+encodeURIComponent(q.id),location.origin).href;
   try{
    if(navigator.share){await navigator.share({title:q.title,url});return;}
    if(navigator.clipboard&&window.isSecureContext){
     await navigator.clipboard.writeText(url);message('Enlace copiado. Compártelo donde quieras.');return;
    }
   }catch(e){if(e.name==='AbortError')return;}
   window.prompt('Copia el enlace de la petición:',url);
  },'secondary');
  links.append(share);wrap.append(title,info,links);return wrap;
 }

 // V3.5.2: solo enlaces del Marketplace propio, aportados voluntariamente.
 function validatedMarketplaceUrl(value){
  if(!value||typeof value!=='string')return null;
  try{
   const url=new URL(value.trim());
   if(url.username||url.password||url.protocol!=='https:')return null;
   if(url.origin!==location.origin&&url.origin!=='https://redlibertad.com')return null;
   if(!/^\/marketplace(?:\/|$)/.test(url.pathname))return null;
   if(url.href.length>500)return null;
   return url.href;
  }catch(_){return null;}
 }
 function answerContent(body){
  const wrap=create('div','answer-content');
  const match=String(body||'').match(/^(.*?)\s+Anuncio recomendado: (https:\/\/\S+)$/);
  if(!match){wrap.append(create('p',null,body));return wrap;}
  const safe=validatedMarketplaceUrl(match[2]);
  if(!safe){wrap.append(create('p',null,body));return wrap;}
  if(match[1])wrap.append(create('p',null,match[1]));
  const a=create('a','marketplace-recommendation','Ver anuncio recomendado en Marketplace');
  a.href=safe;a.rel='noopener noreferrer';wrap.append(a);
  return wrap;
 }

 // V3.5.3: compartir manualmente en una comunidad de la que se es miembro.
 function communitySharePanel(q){
  const section=create('section','resuelve-community-share');
  const toggle=button('Compartir en una comunidad',()=>{form.hidden=!form.hidden;if(!form.hidden)load();},'secondary');
  const form=create('form','resuelve-community-form');form.hidden=true;
  const label=create('label',null,'Elige una comunidad');
  const select=create('select');select.required=true;
  label.append(select);
  const noteLabel=create('label',null,'Mensaje adicional (opcional)');
  const note=create('textarea');note.rows=3;note.maxLength=300;
  note.placeholder='Explica por qué esta petición puede interesar a la comunidad.';
  noteLabel.append(note);
  const preview=create('p','muted','Se compartirá el título y el enlace público de esta petición.');
  const status=create('p','muted');status.setAttribute('role','status');
  const submit=create('button','primary','Publicar en la comunidad');
  submit.type='submit';
  form.append(label,noteLabel,preview,status,submit);
  section.append(toggle,form);
  let members=null;
  async function load(){
   if(members)return;
   select.replaceChildren();status.textContent='Cargando tus comunidades…';
   try{
    const data=await request('/api/communities?scope=joined');
    members=(Array.isArray(data.communities)?data.communities:[]).filter(c=>c.is_member && /^[1-9]\\d{0,15}$/.test(String(c.id)));
    select.append(create('option',null,'Selecciona una comunidad'));
    select.firstChild.value='';
    for(const c of members){
     const option=create('option',null,c.name+(c.privacy==='private'?' · privada':''));
     option.value=String(c.id);select.append(option);
    }
    submit.disabled=members.length===0;
    status.textContent=members.length?'Elige el destino. Solo se publicará al confirmar.':'Todavía no perteneces a ninguna comunidad. Puedes unirte desde Comunidades.';
    if(!members.length){
     const a=create('a',null,'Explorar comunidades');a.href='/comunidades';form.insertBefore(a,submit);
    }
   }catch(error){status.textContent=error.message;}
  }
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(submit.disabled)return;
   const id=String(select.value||'');
   if(!members?.some(c=>String(c.id)===id)){status.textContent='Selecciona una comunidad válida.';return;}
   const url=new URL('/resuelve?id='+encodeURIComponent(q.id),location.origin).href;
   const text='Petición en RedLibertad Resuelve: '+q.title+'\\n'+url+
    (note.value.trim()?'\\n'+note.value.trim():'');
   if(text.length>2200){status.textContent='El texto es demasiado largo.';return;}
   if(!confirm('¿Quieres publicar esta petición en la comunidad seleccionada?'))return;
   submit.disabled=true;status.textContent='Publicando…';
   try{
    await request('/api/communities/'+encodeURIComponent(id)+'/posts',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({body:text,contentLevel:'normal'})
    });
    status.textContent='Publicación enviada a la comunidad. Puedes verla desde Comunidades.';
    form.reset();form.hidden=true;submit.disabled=false;
    message('Petición compartida en la comunidad seleccionada.');
   }catch(error){status.textContent=error.message;submit.disabled=false;}
  });
  return section;
 }
 function renderDetail(data){
  const q=data.question,host=el('questionDetail'),list=el('answerList');
  host.replaceChildren();list.replaceChildren();
  const solved=q.status==='resolved';
  host.append(meta(chip(solved?'Solución encontrada':'Por resolver',solved),
   chip(categories[q.category]||'Petición')),
   create('h2','',q.title),meta(create('span',null,'Publicado por @'+q.author_username),
    create('span',null,date(q.created_at))),
   create('p','detail-body',q.body));
  host.append(connectedActions(q));
  if(state.user)host.append(communitySharePanel(q));
  const mine=state.user&&String(state.user.id)===String(q.author_id);
  if(mine&&solved)host.append(button('Reabrir mi petición',async()=>{
   if(!confirm('¿Quieres volver a aceptar respuestas?'))return;
   try{await write('/api/resuelve/questions/'+q.id+'/reopen',{});message('Petición reabierta.');await openDetail(q.id,false);}
   catch(e){message(e.message);}
  }));
  if(state.user?.is_admin||state.user?.isAdmin)host.append(button('Ocultar petición',async()=>{
   if(!confirm('¿Ocultar esta petición para todos?'))return;
   try{await write('/api/resuelve/admin/question/'+q.id+'/hide',{});message('Petición ocultada.');goList();}
   catch(e){message(e.message);}
  }));
  const h=create('h3','',solved?'Respuestas y solución':'Respuestas de la comunidad');
  list.append(h);
  if(!data.answers.length)list.append(create('p','muted','Todavía no hay respuestas. La primera recomendación puede ayudar mucho.'));
  for(const a of data.answers){
   const accepted=String(a.id)===String(q.accepted_answer_id);
   const item=create('article','answer'+(accepted?' accepted':''));
   item.append(create('header','', '@'+a.author_username+' · '+date(a.created_at)),
    answerContent(a.body));
   const actions=create('div','answer-actions');
   if(accepted)actions.append(chip('✓ Solución elegida',true));
   if(mine&&!solved)actions.append(button('Marcar como solución',async()=>{
    if(!confirm('¿Esta respuesta resolvió tu petición?'))return;
    try{await write('/api/resuelve/questions/'+q.id+'/solve',{answerId:a.id});message('Has marcado una solución. ¡Gracias por compartirla!');await openDetail(q.id,false);}
    catch(e){message(e.message);}
   }));
   if(state.user?.is_admin||state.user?.isAdmin)actions.append(button('Ocultar respuesta',async()=>{
    if(!confirm('¿Ocultar esta respuesta?'))return;
    try{await write('/api/resuelve/admin/answer/'+a.id+'/hide',{});message('Respuesta oculta.');await openDetail(q.id,false);}
    catch(e){message(e.message);}
   }));
   item.append(actions);list.append(item);
  }
  const form=el('answerForm');
  form.hidden=!(state.user&&!mine&&!solved);
  if(!state.user&&!solved)list.append(create('p','muted','Entra en tu cuenta de RedLibertad para responder. La lectura es pública.'));
  else if(mine&&!solved)list.append(create('p','muted','Puedes marcar la respuesta que te haya ayudado.'));
  else if(solved)list.append(create('p','muted','Esta petición está resuelta. Su autor puede reabrirla si necesita más ayuda.'));
 }
 function goList(){
  state.question=null;
  history.pushState({},'', '/resuelve');
  displayDetail(false);loadList();
 }
 async function init(){
  try{const me=await request('/api/auth/me');state.user=me.user;}
  catch(_){state.user=null;}
  el('askButton').hidden=!state.user;
  document.querySelector('[data-filter="mine"]').hidden=!state.user;
  if(!state.user)message('Puedes leer las peticiones sin entrar. Para publicar o responder, inicia sesión en RedLibertad.');
  el('askButton').addEventListener('click',()=>{
   el('askPanel').hidden=false;el('askTitleInput').focus();
  });
  el('closeAsk').addEventListener('click',()=>{el('askPanel').hidden=true;});
  el('backButton').addEventListener('click',goList);
  for(const btn of document.querySelectorAll('[data-filter]')){
   btn.addEventListener('click',()=>{
    state.filter=btn.dataset.filter;
    el('questionSearchForm').hidden=state.filter==='mine';
    for(const t of document.querySelectorAll('[data-filter]')){
     const active=t===btn;t.classList.toggle('active',active);t.setAttribute('aria-pressed',active?'true':'false');
    }
    loadList();
   });
  }
  el('questionSearchForm').addEventListener('submit',event=>{
   event.preventDefault();
   const term=el('questionSearch').value.trim();
   if(term.length===1){message('Escribe al menos dos caracteres para buscar.');return;}
   state.search=term;
   state.category=el('questionCategoryFilter').value;
   loadList();
  });
  el('questionSearchClear').addEventListener('click',()=>{
   el('questionSearchForm').reset();state.search='';state.category='';
   message('Filtros eliminados.');loadList();
  });
  el('moreButton').addEventListener('click',()=>loadList(true));
  el('askForm').addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');
   if(submit.disabled)return;submit.disabled=true;
   try{
    const data=Object.fromEntries(new FormData(form).entries());
    const created=await write('/api/resuelve/questions',data);
    form.reset();message('Tu petición se ha publicado.');await openDetail(created.id);
   }catch(err){message(err.message);}
   finally{submit.disabled=false;}
  });
  el('answerForm').addEventListener('submit',async event=>{
   event.preventDefault();if(!state.question)return;
   const form=event.currentTarget,submit=form.querySelector('[type=submit]');
   if(submit.disabled)return;submit.disabled=true;
   try{
    const raw=el('answerBody').value.trim();
    const listing=el('answerListingUrl').value.trim();
    const safe=listing?validatedMarketplaceUrl(listing):null;
    if(listing&&!safe)throw new Error('Pega un enlace HTTPS válido de un anuncio de RedLibertad Marketplace.');
    const body=raw+(safe?' Anuncio recomendado: '+safe:'');
    if(body.length>1500)throw new Error('La respuesta con el enlace supera los 1500 caracteres.');
    await write('/api/resuelve/questions/'+state.question.id+'/answers',{body});
    form.reset();message('Respuesta publicada. Gracias por ayudar.');await openDetail(state.question.id,false);
   }catch(err){message(err.message);}
   finally{submit.disabled=false;}
  });
  window.addEventListener('popstate',()=>{
   const id=new URLSearchParams(location.search).get('id');
   if(id)openDetail(id,false);else{displayDetail(false);loadList();}
  });
  const start=new URLSearchParams(location.search).get('id');
  if(start)await openDetail(start,false);else await loadList();
 }
 init().catch(()=>message('No se pudo iniciar Resuelve. Inténtalo de nuevo.'));
})();
