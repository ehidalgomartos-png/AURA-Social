'use strict';
// Resuelve V3.5.0: DOM seguro (textContent), sin inyectar HTML de usuarios.
(()=>{
 const el=id=>document.getElementById(id);
 const create=(tag,cls,text)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);return n;
 };
 const append=(parent,...children)=>{parent.append(...children);return parent;};
 const categories={consejo:'Necesito consejo',busco:'Busco orientación',ayuda:'Necesito ayuda',experiencia:'Experiencias'};
 const state={user:null,filter:'open',category:'',search:'',professionalOnly:false,helpTopics:[],next:null,question:null,loading:false,solutionNext:null,solutionLoading:false,solutionCategory:'',solutionSearch:'',reviewNext:null,reviewLoading:false,reportNext:null,reportLoading:false,impactLoading:false};
 const message=(text)=>{el('banner').textContent=text;};
 async function request(url,options){
  const response=await fetch(url,{credentials:'same-origin',...options,headers:{'Accept':'application/json',...(options?.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(response.status===401?'Entra en tu cuenta para participar.':
   response.status===403?'No tienes permiso para realizar esta acción.':
   response.status===429?'Has hecho demasiadas solicitudes. Inténtalo más tarde.':
   data.error==='peticion_no_disponible'?'Esta petición ya no acepta respuestas.':
   data.error==='aviso_no_disponible_o_ya_enviado'?'Este aviso ya se ha enviado o la respuesta no está disponible.':
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
    chip(categories[q.category]||'Petición'),
    ...(q.professional_help_requested?[chip('Orientación profesional solicitada')]:[]),
    ...(q.my_answer_id?[chip(q.my_answer_selected?'✓ Tu ayuda fue elegida':'Has aportado una respuesta',q.my_answer_selected)]:[])),
   heading,create('p',null,q.body),
   meta(create('span',null,'@'+q.author_username),
    create('span',null,date(q.created_at)),
    create('span',null,(Number(q.answer_count)||0)+' respuestas')),
   button('Ver petición',()=>openDetail(q.id)),
   questionShareControl(q,true)
  );
  return article;
 }
// V3.5.16 — intereses privados, sin perfiles públicos ni mensajes automáticos.
 async function loadMyHelpStats(){
  const panel=el('myHelpDashboard');
  if(!state.user||!['mine','contributed'].includes(state.filter)){panel.hidden=true;return;}
  panel.hidden=false;
  const status=el('myHelpStatus'),metrics=el('myHelpMetrics');
  status.textContent='Consultando tus ayudas…';metrics.replaceChildren();
  try{
   const data=await request('/api/resuelve/my-activity');
   if(!['mine','contributed'].includes(state.filter))return;
   const fields=[
    ['open_questions','Tus peticiones abiertas'],
    ['questions_with_answers','Tus peticiones con respuestas'],
    ['resolved_questions','Tus problemas resueltos'],
    ['contributed_questions','Peticiones a las que has ayudado']
   ];
   for(const [key,label] of fields){
    const value=Number(data.stats?.[key]);
    if(!Number.isSafeInteger(value)||value<0)throw Error('No se pudo consultar el resumen.');
    const item=create('article','my-help-metric');
    item.append(create('strong',null,value.toLocaleString('es-ES')),create('span',null,label));
    metrics.append(item);
   }
   status.textContent='Datos privados de tu actividad real. Se actualizan al volver a abrir esta sección.';
  }catch(error){status.textContent=error.message;}
 }
 function renderHelpTopicSelection(){
  for(const input of el('helpTopicsForm').querySelectorAll('input[name="helpTopic"]'))
   input.checked=state.helpTopics.includes(input.value);
 }
 async function loadHelpAlerts(){
  const toggle=el('helpAlertsToggle'),status=el('helpAlertsStatus');
  toggle.disabled=true;status.textContent='Comprobando tu preferencia…';
  try{
   const result=await request('/api/resuelve/help-alerts/preference');
   toggle.checked=result.enabled===true;toggle.disabled=false;
   status.textContent=toggle.checked?
    'Recibirás como máximo un aviso al día de nuevos temas que hayas elegido.':
    'Los avisos están desactivados. Puedes seguir ayudando sin recibir notificaciones.';
  }catch(error){toggle.disabled=true;status.textContent=error.message;}
 }
 async function loadHelpTopics(){
  const result=await request('/api/resuelve/help-topics');
  state.helpTopics=Array.isArray(result.categories)?result.categories:[];
  renderHelpTopicSelection();
  await loadHelpAlerts();
 }
 async function saveHelpTopics(categories){
  const response=await write('/api/resuelve/help-topics',{categories});
  state.helpTopics=response.categories;
  renderHelpTopicSelection();
  el('helpTopicsStatus').textContent=categories.length
   ?'Temas guardados. Aquí encontrarás peticiones abiertas en las que puedes ayudar.'
   :'Temas desactivados. Puedes volver a elegirlos cuando quieras.';
  await loadList();
 }
 async function loadList(more=false){
  if(state.loading)return;
  state.loading=true;
  const list=el('questionList'),status=el('listStatus'),btn=el('moreButton');
  btn.hidden=true;
  if(!more){list.replaceChildren();status.textContent='Cargando peticiones…';}
  try{
   const params=new URLSearchParams();
   if(!['mine','help','contributed'].includes(state.filter)){
    params.set('estado',state.filter);
    if(state.category)params.set('categoria',state.category);
    if(state.search)params.set('q',state.search);
    if(state.professionalOnly)params.set('profesional','si');
   }
   if(more&&state.next)params.set('antes',state.next);
   const endpoint=state.filter==='mine'?'/api/resuelve/questions/mine':
    state.filter==='contributed'?'/api/resuelve/questions/answered-by-me':
    state.filter==='help'?'/api/resuelve/questions/for-me':'/api/resuelve/questions';
   const data=await request(endpoint+'?'+params.toString());
   for(const q of data.items)list.append(card(q));
   state.next=data.next;
   btn.hidden=!state.next;
   status.textContent=list.childElementCount?'':(
    state.filter==='mine'?'Todavía no has publicado ninguna petición.':
    state.filter==='contributed'?'Todavía no has respondido a ninguna petición. Puedes empezar por «Puedo ayudar».':
    state.filter==='help'?(state.helpTopics.length?'No hay peticiones abiertas de tus temas por ahora.':'Elige los temas en los que quieres ayudar para descubrir peticiones.') :
    'Aún no hay peticiones en esta sección. Puedes ser la primera persona en participar.');
  }catch(err){status.textContent=err.message;}
  finally{state.loading=false;}
 }
// V3.5.7 — mostrar exclusivamente soluciones aprobadas por revisión editorial.
 function solutionCard(q){
  const article=create('article','question-card solution-card');
  const heading=create('h3');
  const link=create('a',null,q.title);
  link.href='/resuelve?id='+encodeURIComponent(q.id);
  heading.append(link);
  const content=create('p','solution-excerpt',q.solution);
  article.append(meta(chip('Solución revisada',true),chip(categories[q.category]||'Petición')),
   heading,content,
   meta(create('span',null,'Petición de @'+q.author_username),create('span',null,date(q.solved_at))),
   button('Leer solución completa',()=>openDetail(q.id))
  );
  return article;
 }
 async function loadSolutions(more=false){
  if(state.solutionLoading)return;
  state.solutionLoading=true;
  const list=el('solutionList'),status=el('solutionStatus'),btn=el('moreSolutions');
  btn.hidden=true;
  if(!more){list.replaceChildren();status.textContent='Cargando soluciones…';}
  try{
   const params=new URLSearchParams();
   if(state.solutionCategory)params.set('categoria',state.solutionCategory);
   if(state.solutionSearch)params.set('q',state.solutionSearch);
   if(more&&state.solutionNext)params.set('antes',state.solutionNext);
   const data=await request('/api/resuelve/solutions?'+params.toString());
   for(const q of data.items)list.append(solutionCard(q));
   state.solutionNext=data.next;
   btn.hidden=!state.solutionNext;
   status.textContent=list.childElementCount?'':(state.solutionSearch||state.solutionCategory?'No hay soluciones revisadas que coincidan con estos filtros. Prueba con otra categoría o búsqueda.':'Aún no hay soluciones revisadas. Iremos incorporándolas cuando existan respuestas útiles.');
  }catch(err){status.textContent=err.message;}
  finally{state.solutionLoading=false;}
 }
// V3.5.8: cola editorial disponible solo en sesiones de administración.
 // V3.5.18 — cifras verificables en servidor, visibles solo para administración.
// V3.5.14: avisos discretos sobre respuestas, sin sanción automática.
 function answerReportControl(answer){
  const details=create('details','answer-report');
  const heading=create('summary',null,'Informar de un problema con esta respuesta');
  const explanation=create('p','muted','El aviso es privado y no oculta la respuesta. Un administrador revisará el contexto.');
  const label=create('label',null,'Motivo del aviso');
  const select=create('select');
  const reasons=[
   ['', 'Selecciona un motivo'],
   ['publicidad_encubierta','Publicidad encubierta'],
   ['cualificacion_falsa','Posible cualificación engañosa'],
   ['datos_personales','Datos personales'],
   ['consejo_peligroso','Consejo potencialmente peligroso'],
   ['otro','Otro problema']
  ];
  for(const [value,caption] of reasons){
   const opt=create('option',null,caption);opt.value=value;select.append(opt);
  }
  label.append(select);
  const send=button('Enviar aviso para revisión',async()=>{
   if(!select.value){message('Selecciona el motivo del aviso.');return;}
   send.disabled=true;
   try{
    await write('/api/resuelve/answers/'+encodeURIComponent(answer.id)+'/report',{reason:select.value});
    details.replaceChildren(create('p','muted','Aviso enviado para revisión. Gracias por cuidar la comunidad.'));
    message('Tu aviso se ha enviado para revisión privada.');
    // Los avisos se revisan desde /resuelve/admin.
   }catch(err){send.disabled=false;message(err.message);}
  },'secondary');
  details.append(heading,explanation,label,send);
  return details;
 }
 function displayDetail(open){
  el('detailPanel').hidden=!open;
  el('questions').hidden=open;
  el('solutions').hidden=open;
  el('askPanel').hidden=true;
 }
 async function openDetail(id,push=true){
  if(!/^[1-9]\d{0,15}$/.test(String(id)))return;
  displayDetail(true);el('questionDetail').textContent='Cargando petición…';
  el('answerList').replaceChildren();el('answerForm').hidden=true;
  el('resuelveExtras').replaceChildren();
  if(push)history.pushState({id},'', '/resuelve?id='+encodeURIComponent(id));
  try{
   const data=await request('/api/resuelve/questions/'+encodeURIComponent(id));
   state.question=data.question;
   renderDetail(data);
   el('detailPanel').scrollIntoView({block:'start',behavior:'auto'});
  }catch(err){el('questionDetail').textContent=err.message;}
 }

 // V3.5.17.1 — cada petición pública puede enviarse voluntariamente a un conocido.
 // Solo se comparte el título y un enlace directo, nunca respuestas o datos privados.
 function questionShareControl(q,compact=false){
  const wrap=create('section','question-share'+(compact?' question-share-compact':''));
  const toggle=button('Enviar esta pregunta',()=>{
   const open=options.hidden;
   options.hidden=!open;
   toggle.setAttribute('aria-expanded',open?'true':'false');
  },'secondary question-share-toggle');
  toggle.setAttribute('aria-expanded','false');
  const options=create('div','question-share-options');options.hidden=true;
  const status=create('p','muted question-share-status');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const questionUrl=new URL('/resuelve?id='+encodeURIComponent(q.id),location.origin).href;
  const title=String(q.title||'Petición en Resuelve').slice(0,125);
  const text='¿Puedes ayudar con esta pregunta en RedLibertad Resuelve?\n'+title+'\n'+questionUrl;
  const hint=create('p','muted','Elige a quién se la envías. Podrá leerla sin cuenta; para responder necesitará registrarse. No se envía nada automáticamente.');
  const preview=create('p','question-share-preview','Pregunta: '+title);
  const methods=create('div','question-share-methods');
  function link(label,href,external=false){
   const a=create('a','secondary',label);a.href=href;
   if(external){a.target='_blank';a.rel='noopener noreferrer';}
   methods.append(a);
  }
  link('WhatsApp','https://api.whatsapp.com/send?text='+encodeURIComponent(text),true);
  link('Telegram','https://t.me/share/url?'+new URLSearchParams({url:questionUrl,text:'¿Puedes ayudar con esta pregunta? '+title}),true);
  link('Correo electrónico','mailto:?'+new URLSearchParams({
   subject:'¿Puedes ayudar con esta pregunta?',body:text
  }).toString().replace(/\+/g,'%20'));
  link('SMS','sms:?body='+encodeURIComponent(text));
  const native=button('Compartir desde mi móvil',async()=>{
   try{await navigator.share({title,text:'¿Puedes ayudar con esta pregunta?',url:questionUrl});}
   catch(err){if(err.name!=='AbortError')status.textContent='No se pudo abrir el menú de compartir. Prueba otro canal o copia el enlace.';}
  },'secondary');
  native.hidden=typeof navigator.share!=='function';
  const copy=button('Copiar enlace',async()=>{
   try{
    if(!navigator.clipboard||!window.isSecureContext)throw Error('clipboard_unavailable');
    await navigator.clipboard.writeText(questionUrl);
    status.textContent='Enlace directo copiado. Puedes enviarlo a quien quieras.';
   }catch(_){window.prompt('Copia este enlace para enviarlo a quien quieras:',questionUrl);}
  },'secondary');
  methods.append(native,copy);
  options.append(hint,preview,methods,status);
  wrap.append(toggle,options);
  return wrap;
 }
 function connectedActions(q){
  const wrap=create('section','resuelve-related');
  wrap.append(create('h3',null,'Difunde esta petición para recibir más ayuda'),
   create('p','muted','Si conoces a alguien que pueda orientar, envíale la pregunta directamente. Siempre decides con quién compartirla.'),
   questionShareControl(q));
  const links=create('div','resuelve-related-actions');
  const communities=create('a','secondary','Explorar comunidades');
  communities.href='/comunidades';
  links.append(communities);
  wrap.append(links);
  if(q.category==='busco'){
   const extra=create('details','resuelve-market-optional');
   extra.append(create('summary',null,'Si estás buscando un producto: ver otras opciones (opcional)'));
   const explanation=create('p','muted','La ayuda no depende de ninguna compra. Consulta anuncios solo si te resultan útiles.');
   const market=create('a',null,'Explorar anuncios de Marketplace');
   market.href='/marketplace/explorar';
   extra.append(explanation,market);wrap.append(extra);
  }
  return wrap;
 }

 // V3.5.17: invitar sin crear cuentas o enviar mensajes automáticamente.
 function bindHelpInvitation(){
  const url=new URL('/resuelve',location.origin).href;
  const text='En RedLibertad Resuelve compartimos consejos y experiencias para ayudar a otras personas. Puedes leer peticiones o aportar lo que sabes, sin necesidad de comprar nada.';
  el('inviteWhatsApp').href='https://api.whatsapp.com/send?'+new URLSearchParams({text:text+' '+url});
  el('inviteTelegram').href='https://t.me/share/url?'+new URLSearchParams({url,text});
  el('inviteEmail').href='mailto:?'+new URLSearchParams({subject:'¿Te animas a ayudar en Resuelve?',body:text+'\n\n'+url}).toString().replace(/\+/g,'%20');
  const options=el('inviteHelpOptions'),toggle=el('inviteHelpToggle'),status=el('inviteHelpStatus');
  toggle.addEventListener('click',()=>{
   options.hidden=!options.hidden;
   toggle.setAttribute('aria-expanded',options.hidden?'false':'true');
  });
  const native=el('inviteNativeShare');
  native.hidden=typeof navigator.share!=='function';
  native.addEventListener('click',async()=>{
   try{await navigator.share({title:'Ayuda a otras personas en Resuelve',text,url});}
   catch(err){if(err.name!=='AbortError')status.textContent='No se pudo abrir el menú para compartir. Puedes copiar el enlace.';}
  });
  el('inviteCopyLink').addEventListener('click',async()=>{
   try{
    if(!navigator.clipboard||!window.isSecureContext)throw Error('clipboard_unavailable');
    await navigator.clipboard.writeText(url);
    status.textContent='Enlace de Resuelve copiado. Puedes enviarlo a quien quieras.';
   }catch(_){window.prompt('Copia este enlace para compartir Resuelve:',url);}
  });
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
 function answerContent(body,professionalRole,selfProfessionalRole,commercialInterest){
  const wrap=create('div','answer-content');
  function appendSelfDisclosure(){
   if(typeof selfProfessionalRole!=='string'||!selfProfessionalRole.trim())return;
   const note=create('aside','resuelve-professional-disclosure');
   note.append(create('strong',null,'Experiencia profesional declarada por esta persona:'),
    create('span',null,' '+selfProfessionalRole));
   note.append(create('p','muted','Identidad profesional y cualificación no verificadas por RedLibertad.'));
   if(commercialInterest===true)
    note.append(create('p','resuelve-commercial-note','Esta persona declara un posible interés económico en la solución.'));
   else
    note.append(create('p','muted','Esta persona declara que no tiene interés comercial en esta recomendación.'));
   wrap.append(note);
  }
  function appendProfessionalAdvice(){
   if(typeof professionalRole!=='string'||!professionalRole.trim())return;
   const advice=create('aside','professional-advice');
   advice.append(create('strong',null,'Puede convenir consultar a un profesional:'),
    create('span',null,' '+professionalRole),
    create('p','muted','Sugerencia de otro usuario; no supone acreditación ni recomendación de un proveedor concreto.'));
   wrap.append(advice);
  }
  const match=String(body||'').match(/^(.*?)\s+Anuncio recomendado: (https:\/\/\S+)$/);
  if(!match){wrap.append(create('p',null,body));appendSelfDisclosure();appendProfessionalAdvice();return wrap;}
  const safe=validatedMarketplaceUrl(match[2]);
  if(!safe){wrap.append(create('p',null,body));appendSelfDisclosure();appendProfessionalAdvice();return wrap;}
  if(match[1])wrap.append(create('p',null,match[1]));
  appendSelfDisclosure();
  appendProfessionalAdvice();
  const extra=create('details','answer-related-link');
  extra.append(create('summary',null,'Ver enlace de Marketplace compartido (opcional)'));
  const a=create('a',null,'Consultar este anuncio, si te interesa');
  a.href=safe;a.rel='noopener noreferrer';
  extra.append(a);wrap.append(extra);
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
// V3.5.10: revisión humana explícita; ninguna casilla está marcada por defecto.
 function editorialReviewControls(q,reviewed){
  const panel=create('section','editorial-review');
  panel.append(create('h3',null,'Revisión humana de la solución'));
  if(q.library_opt_out){
   panel.append(create('p','muted','El autor ha excluido esta petición de la biblioteca.'));
   return panel;
  }
  if(reviewed){
   panel.append(create('p','muted','Esta solución ya está publicada en la biblioteca tras revisión.'));
   panel.append(button('Retirar solución de la biblioteca',async()=>{
    if(!confirm('¿Retirar esta solución de la biblioteca?'))return;
    try{
     await write('/api/resuelve/admin/solutions/'+q.id+'/revoke',{});
     message('Solución retirada de la biblioteca.');
     await openDetail(q.id,false);await loadSolutions();
    }catch(error){message(error.message);}
   },'secondary'));
   return panel;
  }
  panel.append(create('p','muted','Revisa la respuesta completa. Se priorizan explicaciones y experiencias, nunca una venta como única solución.'));
  const checklist=create('div','editorial-review-checklist');
  const fields=[
   ['qualityReviewed','Aporta pasos, experiencia o consejos útiles por sí mismos, sin depender de una compra.'],
   ['privacyReviewed','No contiene datos personales, contactos privados ni información sensible que no deba destacarse.'],
   ['nonCommercialReviewed','No es publicidad encubierta, una oferta ni una promoción engañosa.']
  ];
  const checks=[];
  const submit=button('Publicar en biblioteca',async()=>{
   if(!checks.every(c=>c.checked))return;
   if(!confirm('¿Publicar esta solución útil y revisada en la biblioteca pública?'))return;
   submit.disabled=true;
   try{
    await write('/api/resuelve/admin/solutions/'+q.id+'/approve',
     {qualityReviewed:true,privacyReviewed:true,nonCommercialReviewed:true});
    message('Solución aprobada tras revisión humana.');
    await openDetail(q.id,false);await loadSolutions();
   }catch(error){message(error.message);submit.disabled=false;}
  },'primary');
  submit.disabled=true;
  for(const [key,text] of fields){
   const label=create('label','editorial-review-item');
   const input=create('input');input.type='checkbox';input.name=key;
   input.addEventListener('change',()=>{submit.disabled=!checks.every(c=>c.checked);});
   checks.push(input);label.append(input,create('span',null,text));checklist.append(label);
  }
  panel.append(checklist,submit);
  return panel;
 }
 function renderDetail(data){
  const q=data.question,host=el('questionDetail'),list=el('answerList');
  host.replaceChildren();list.replaceChildren();
  const solved=q.status==='resolved';
  host.append(meta(chip(solved?'Solución encontrada':'Por resolver',solved),
   chip(categories[q.category]||'Petición'),
   ...(q.professional_help_requested?[chip('Pide orientación profesional')]:[])),
   create('h2','',q.title),meta(create('span',null,'Publicado por @'+q.author_username),
    create('span',null,date(q.created_at))),
   create('p','detail-body',q.body));
  if(q.professional_help_requested)host.append(create('p','muted','Esta persona solicita orientación sobre qué profesional podría ayudarla. No es una petición de presupuesto ni implica contratar a nadie.'));
  const mine=state.user&&String(state.user.id)===String(q.author_id);
  const reviewed=solved && q.accepted_answer_id!=null && q.library_approved_answer_id!=null && String(q.library_approved_answer_id)===String(q.accepted_answer_id);
  if(state.user && mine && solved && !q.library_opt_out){
   host.append(button('Excluir mi petición de la biblioteca',async()=>{
    if(!confirm('¿Excluir esta petición de la biblioteca de forma permanente? Seguirá visible como petición normal.'))return;
    try{
     await write('/api/resuelve/questions/'+q.id+'/library/opt-out',{});
     message('Petición excluida de la biblioteca.');await openDetail(q.id,false);await loadSolutions();
    }catch(error){message(error.message);}
   }));
  }
  if(solved&&q.thanked_at)host.append(create('p','resuelve-thanks-note','El autor de la petición ha dado las gracias por la ayuda recibida.'));
  if(mine&&solved){
   const block=create('section','resuelve-resolved-share');
   block.append(create('h3',null,'¡Problema resuelto!'),
    create('p','muted','Puedes agradecer la ayuda o contar en RedLibertad que has encontrado una solución. Tú decides qué publicar; no se compartirá ninguna respuesta ajena automáticamente.'));
   const actions=create('div','resuelve-resolved-actions');
   if(!q.thanked_at)actions.append(button('Dar las gracias',async()=>{
    if(!confirm('¿Quieres agradecer la ayuda recibida en esta petición?'))return;
    try{
     await write('/api/resuelve/questions/'+q.id+'/thank',{});
     message('Gracias por reconocer la ayuda de la comunidad.');
     await openDetail(q.id,false);
    }catch(err){message(err.message);}
   },'secondary'));
   actions.append(button('Publícalo en RedLibertad',()=>{
    location.assign('/app?view=feed&compartirResuelve='+encodeURIComponent(q.id));
   },'primary'));
   block.append(actions);host.append(block);
  }
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
   item.id='resuelve-answer-'+a.id;
   item.append(create('header','', '@'+a.author_username+' · '+date(a.created_at)),
    answerContent(a.body,a.professional_role,a.self_professional_role,a.self_commercial_interest));
   const actions=create('div','answer-actions');
   if(accepted)actions.append(chip('✓ Solución elegida',true));
   if(state.user && String(state.user.id)!==String(a.author_id))actions.append(answerReportControl(a));
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
  if(!state.user&&!solved){
   list.append(create('p','muted','Puedes responder creando tu cuenta aquí mismo, sin abandonar Resuelve. La misma cuenta sirve para todo RedLibertad.'));
   const actions=create('div','resuelve-guest-actions');
   actions.append(button('Crear cuenta para ayudar',()=>openAuth('register'),'secondary'),
    button('Ya tengo cuenta',()=>openAuth('login'),'secondary'));
   list.append(actions);
  }
  else if(mine&&!solved)list.append(create('p','muted','Puedes marcar la respuesta que te haya ayudado.'));
  else if(solved)list.append(create('p','muted','Esta petición está resuelta. Su autor puede reabrirla si necesita más ayuda.'));
  const extras=el('resuelveExtras');extras.replaceChildren();
  extras.append(connectedActions(q));
  if(state.user)extras.append(communitySharePanel(q));
  if((state.user?.is_admin||state.user?.isAdmin)&&solved)
   extras.append(editorialReviewControls(q,reviewed));
 }
 function goList(){
  state.question=null;
  history.pushState({},'', '/resuelve');
  displayDetail(false);loadList();
 }
// V3.5.15: registro único en la misma pantalla. Sin credenciales guardadas en JS.
 function setAuthMode(mode){
  const signup=mode!=='login';
  el('resuelveRegisterForm').hidden=!signup;
  el('resuelveLoginForm').hidden=signup;
  el('resuelveAuthRegisterTab').setAttribute('aria-pressed',signup?'true':'false');
  el('resuelveAuthLoginTab').setAttribute('aria-pressed',signup?'false':'true');
  el('resuelveAuthTitle').textContent=signup?'Únete a Resuelve':'Entra en Resuelve';
  el('resuelveAuthStatus').textContent='';
 }
 function openAuth(mode='register'){
  if(state.user)return;
  setAuthMode(mode);
  el('resuelveAuthPanel').hidden=false;
  el('resuelveAuthPanel').scrollIntoView({block:'start',behavior:'smooth'});
  (mode==='login'?el('resuelveLoginEmail'):el('resuelveSignupName')).focus({preventScroll:true});
 }
 function renderSession(){
  const guest=!state.user;
  el('joinResuelveButton').hidden=!guest;
  el('loginResuelveButton').hidden=!guest;
  el('askButton').hidden=guest;
  el('heroActions').classList.toggle('is-authenticated',!guest);
  el('resuelveAuthPanel').hidden=!guest;
  if(guest)el('resuelveAuthPanel').hidden=true;
  document.querySelector('[data-filter="mine"]').hidden=guest;
  document.querySelector('[data-filter="contributed"]').hidden=guest;
  el('myHelpDashboard').hidden=guest||!['mine','contributed'].includes(state.filter);
  document.querySelector('[data-filter="help"]').hidden=guest;
  document.querySelector('.filters').classList.toggle('with-help',!guest);
  const isAdmin=!!(state.user?.is_admin||state.user?.isAdmin);
  el('resuelveAdminEntry').hidden=!isAdmin;
  el('resuelveReplyEmailSettings').hidden=guest;
  return isAdmin;
 }
 function authError(error,status){
  if(status===409||error==='account_exists')return 'Ya existe una cuenta con ese correo o nombre de usuario. Puedes entrar desde aquí.';
  if(error==='adult_only')return 'Para registrarte en RedLibertad debes tener 18 años o más.';
  if(error==='invalid_birth_date')return 'Comprueba la fecha de nacimiento.';
  if(error==='invalid_data')return 'Revisa los datos, la contraseña y la aceptación de las condiciones.';
  if(error==='invalid_credentials')return 'Correo o contraseña incorrectos.';
  if(error==='account_suspended'||error==='account_banned'||error==='account_unavailable')return 'Esta cuenta no puede acceder. Consulta con soporte.';
  if(status===429)return 'Demasiados intentos. Prueba de nuevo más tarde.';
  return 'No se ha podido completar el acceso. Comprueba tu conexión e inténtalo otra vez.';
 }
 async function authSubmit(endpoint,payload){
  const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const err=new Error(authError(data.error,response.status));err.code=data.error;throw err;}
  return data;
 }
 async function finishAuth(){
  // La cookie HttpOnly la emite la misma API de RedLibertad: ninguna sesión duplicada.
  const me=await request('/api/auth/me');
  if(!me?.user)throw new Error('Cuenta creada, pero aún no se pudo confirmar la sesión. Puedes entrar con tus datos.');
  state.user=me.user;
  el('resuelveRegisterForm').reset();
  el('resuelveLoginForm').reset();
  renderSession();
  await loadReplyEmailPreference();
  if(state.question)await openDetail(state.question.id,false);
  else await loadList();
 }
 async function loadReplyEmailPreference(){
  if(!state.user)return;
  const toggle=el('resuelveReplyEmailToggle'),status=el('resuelveReplyEmailStatus');
  toggle.disabled=true;status.textContent='Cargando tus preferencias…';
  try{
   const data=await request('/api/resuelve/reply-email/preference');
   toggle.checked=data.enabled===true;
   toggle.disabled=data.available!==true;
   status.textContent=data.available?
    'Solo se envían recordatorios de respuestas nuevas si has dado permiso y has verificado tu correo.':
    'Los avisos dentro de la web están disponibles. El envío opcional de correos aún no está habilitado.';
  }catch(error){toggle.disabled=true;status.textContent=error.message;}
 }
 function bindReplyEmailPreferences(){
  const toggle=el('resuelveReplyEmailToggle');
  toggle.addEventListener('change',async()=>{
   toggle.disabled=true;el('resuelveReplyEmailStatus').textContent='Guardando tu preferencia…';
   try{await write('/api/resuelve/reply-email/preference',{enabled:toggle.checked});}
   catch(error){el('resuelveReplyEmailStatus').textContent=error.message;}
   await loadReplyEmailPreference();
  });
 }
 function bindResuelveAuth(){
  el('joinResuelveButton').addEventListener('click',()=>openAuth('register'));
  el('loginResuelveButton').addEventListener('click',()=>openAuth('login'));
  el('resuelveAuthRegisterTab').addEventListener('click',()=>setAuthMode('register'));
  el('resuelveAuthLoginTab').addEventListener('click',()=>setAuthMode('login'));
  el('closeResuelveAuth').addEventListener('click',()=>{el('resuelveAuthPanel').hidden=true;});
  const dob=el('resuelveSignupBirthDate');
  const now=new Date(),cutoff=new Date(Date.UTC(now.getUTCFullYear()-18,now.getUTCMonth(),now.getUTCDate()));
  dob.max=cutoff.toISOString().slice(0,10);
  el('resuelveRegisterForm').addEventListener('submit',async(event)=>{
   event.preventDefault();
   const form=event.currentTarget,submit=form.querySelector('[type="submit"]');
   if(submit.disabled||!form.reportValidity())return;
   if(!el('resuelveSignupTerms').checked){el('resuelveAuthStatus').textContent='Debes aceptar las condiciones para crear la cuenta.';return;}
   submit.disabled=true;
   const status=el('resuelveAuthStatus');
   status.textContent='Creando tu cuenta…';
   try{
    const v=Object.fromEntries(new FormData(form).entries());
    const data=await authSubmit('/api/auth/register',{
     email:String(v.email||'').trim(),username:String(v.username||'').trim(),
     displayName:String(v.displayName||'').trim(),password:v.password,
     birthDate:v.birthDate,acceptTerms:true,
     entryType:'resuelve',entryKey:'resuelve',entryPath:'/resuelve'
    });
    await finishAuth();
    message(data.verificationEmailSent?'Cuenta creada. Revisa tu correo para verificarla. Ya puedes participar en Resuelve y utilizar tu cuenta en RedLibertad.':
     'Cuenta creada y sesión iniciada. Puedes participar aquí y entrar en RedLibertad con la misma cuenta. Si no recibes el email de verificación, podrás solicitar otro.');
    status.textContent='';
   }catch(err){status.textContent=err.message;}
   finally{submit.disabled=false;}
  });
  el('resuelveLoginForm').addEventListener('submit',async(event)=>{
   event.preventDefault();
   const form=event.currentTarget,submit=form.querySelector('[type="submit"]');
   if(submit.disabled||!form.reportValidity())return;
   submit.disabled=true;
   const status=el('resuelveAuthStatus');status.textContent='Entrando…';
   try{
    const v=Object.fromEntries(new FormData(form).entries());
    await authSubmit('/api/auth/login',{email:String(v.email||'').trim(),password:v.password});
    await finishAuth();
    message('Ya has iniciado sesión. Puedes participar en Resuelve y en RedLibertad con la misma cuenta.');
   }catch(err){status.textContent=err.message;}
   finally{submit.disabled=false;}
  });
 }
 async function init(){
  try{const me=await request('/api/auth/me');state.user=me.user;}
  catch(_){state.user=null;}
  bindResuelveAuth();
  bindReplyEmailPreferences();
  bindHelpInvitation();
  const isAdmin=renderSession();
  if(state.user)await loadReplyEmailPreference();
  // La portada es pública: invitamos a registrarse solo cuando la persona decide participar.
  el('askButton').addEventListener('click',()=>{
   el('askPanel').hidden=false;
   el('askPanel').scrollIntoView({block:'start',behavior:'smooth'});
   el('askTitleInput').focus({preventScroll:true});
  });
  el('closeAsk').addEventListener('click',()=>{el('askPanel').hidden=true;});
  el('backButton').addEventListener('click',goList);
  for(const btn of document.querySelectorAll('[data-filter]')){
   btn.addEventListener('click',async()=>{
    state.filter=btn.dataset.filter;
    el('questionSearchForm').hidden=['mine','help','contributed'].includes(state.filter);
    el('helpTopicsPanel').hidden=state.filter!=='help';
    for(const t of document.querySelectorAll('[data-filter]')){
     const active=t===btn;t.classList.toggle('active',active);t.setAttribute('aria-pressed',active?'true':'false');
    }
    if(state.filter==='help'){
     try{await loadHelpTopics();}catch(err){el('helpTopicsStatus').textContent=err.message;return;}
    }
    await Promise.all([loadList(),loadMyHelpStats()]);
   });
  }
  el('helpAlertsToggle').addEventListener('change',async()=>{
   if(!state.user)return;
   const toggle=el('helpAlertsToggle'),status=el('helpAlertsStatus');
   toggle.disabled=true;status.textContent='Guardando tu preferencia…';
   try{
    await write('/api/resuelve/help-alerts/preference',{enabled:toggle.checked});
   }catch(error){status.textContent=error.message;}
   await loadHelpAlerts();
  });
  el('helpTopicsForm').addEventListener('submit',async(event)=>{
   event.preventDefault();
   if(!state.user)return openAuth('login');
   const values=[...el('helpTopicsForm').querySelectorAll('input[name="helpTopic"]:checked')]
    .map(input=>input.value);
   const submit=el('helpTopicsForm').querySelector('[type="submit"]');
   submit.disabled=true;
   try{await saveHelpTopics(values);}
   catch(err){el('helpTopicsStatus').textContent=err.message;}
   finally{submit.disabled=false;}
  });
  el('clearHelpTopics').addEventListener('click',async()=>{
   if(!state.user)return;
   const button=el('clearHelpTopics');button.disabled=true;
   try{await saveHelpTopics([]);}
   catch(err){el('helpTopicsStatus').textContent=err.message;}
   finally{button.disabled=false;}
  });
  // V3.5.15.2: controles avanzados plegados, accesibles y sin perder filtros aplicados.
  function setQuestionAdvancedFilters(open){
   el('questionAdvancedFilters').hidden=!open;
   el('questionMoreFiltersToggle').setAttribute('aria-expanded',open?'true':'false');
  }
  function updateQuestionFilterCount(){
   const count=Number(Boolean(state.category))+Number(state.professionalOnly);
   const label=count?'Más filtros ('+count+')':'Más filtros';
   el('questionMoreFiltersToggle').textContent=label;
   el('questionMoreFiltersToggle').setAttribute('aria-label',
    count?'Más filtros, '+count+' filtro'+(count===1?' activo':'s activos'):'Más filtros');
  }
  el('questionMoreFiltersToggle').addEventListener('click',()=>{
   setQuestionAdvancedFilters(el('questionAdvancedFilters').hidden);
  });
  el('questionSearchForm').addEventListener('submit',event=>{
   event.preventDefault();
   const term=el('questionSearch').value.trim();
   if(term.length===1){message('Escribe al menos dos caracteres para buscar.');return;}
   state.search=term;
   state.category=el('questionCategoryFilter').value;
   state.professionalOnly=el('questionProfessionalFilter').checked;
   updateQuestionFilterCount();
   setQuestionAdvancedFilters(false);
   loadList();
  });
  el('questionSearchClear').addEventListener('click',()=>{
   el('questionSearchForm').reset();state.search='';state.category='';state.professionalOnly=false;
   updateQuestionFilterCount();
   setQuestionAdvancedFilters(false);
   message('Filtros eliminados.');loadList();
  });
  el('moreButton').addEventListener('click',()=>loadList(true));
  el('solutionFilterForm').addEventListener('submit',event=>{
   event.preventDefault();
   const search=el('solutionSearch').value.trim();
   if(search.length===1){message('Escribe al menos dos caracteres para buscar soluciones.');return;}
   state.solutionSearch=search;
   state.solutionCategory=el('solutionCategory').value;
   loadSolutions();
  });
  el('clearSolutionFilters').addEventListener('click',()=>{
   el('solutionFilterForm').reset();
   state.solutionSearch='';
   state.solutionCategory='';
   loadSolutions();
  });
  el('moreSolutions').addEventListener('click',()=>loadSolutions(true));
  el('askForm').addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');
   if(submit.disabled)return;submit.disabled=true;
   try{
    const data=Object.fromEntries(new FormData(form).entries());
    data.professionalHelpRequested=el('askProfessionalHelp').checked;
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
    const professionalRole=el('answerProfessionalRole').value.trim();
    if(professionalRole.length>70)throw new Error('Indica una profesión en menos de 70 caracteres.');
    const selfProfessionalRole=el('answerSelfProfessionalRole').value.trim();
    const commercialInterest=el('answerCommercialInterest').value;
    if(selfProfessionalRole&&!['yes','no'].includes(commercialInterest))
     throw new Error('Si indicas tu oficio, señala si tienes interés comercial.');
    if(!selfProfessionalRole&&commercialInterest)
     throw new Error('Indica el oficio o elimina la selección de interés comercial.');
    if(selfProfessionalRole&&raw.length<60)
     throw new Error('Explica tu consejo profesional con al menos 60 caracteres útiles.');
    await write('/api/resuelve/questions/'+state.question.id+'/answers',
     {body,professionalRole,selfProfessionalRole,commercialInterest});
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
  await loadSolutions();
 }
 init().catch(()=>message('No se pudo iniciar Resuelve. Inténtalo de nuevo.'));
})();
