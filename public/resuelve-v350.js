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
 const state={user:null,filter:'open',category:'',search:'',professionalOnly:false,next:null,question:null,loading:false,solutionNext:null,solutionLoading:false,solutionCategory:'',solutionSearch:'',reviewNext:null,reviewLoading:false,reportNext:null,reportLoading:false};
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
    ...(q.professional_help_requested?[chip('Orientación profesional solicitada')]:[])),
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
    if(state.professionalOnly)params.set('profesional','si');
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
 async function loadReviewQueue(more=false){
  if(!(state.user?.is_admin||state.user?.isAdmin)||state.reviewLoading)return;
  state.reviewLoading=true;
  const list=el('libraryReviewList'),status=el('libraryReviewStatus'),btn=el('moreLibraryReview');
  btn.hidden=true;
  if(!more){list.replaceChildren();status.textContent='Cargando pendientes de revisión…';}
  try{
   const url='/api/resuelve/admin/solutions/pending'+
    (more&&state.reviewNext?'?antes='+encodeURIComponent(state.reviewNext):'');
   const data=await request(url);
   for(const q of data.items){
    const item=create('article','review-item');
    const title=create('h3',null,q.title);
    const body=create('p','muted',q.solution);
    const actions=create('div','review-item-actions');
    actions.append(chip(categories[q.category]||'Petición'),
      button('Revisar petición',()=>openDetail(q.id),'secondary'));
    item.append(title,body,actions);list.append(item);
   }
   state.reviewNext=data.next;
   btn.hidden=!state.reviewNext;
   status.textContent=list.childElementCount?'':'No hay soluciones pendientes que cumplan los requisitos mínimos.';
  }catch(err){status.textContent=err.message;}
  finally{state.reviewLoading=false;}
 }
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
    if(state.user?.is_admin||state.user?.isAdmin)await loadAnswerReports();
   }catch(err){send.disabled=false;message(err.message);}
  },'secondary');
  details.append(heading,explanation,label,send);
  return details;
 }
 async function loadAnswerReports(more=false){
  if(!(state.user?.is_admin||state.user?.isAdmin)||state.reportLoading)return;
  state.reportLoading=true;
  const list=el('adminReportsList'),status=el('adminReportsStatus'),moreButton=el('moreAdminReports');
  moreButton.hidden=true;
  if(!more){list.replaceChildren();status.textContent='Comprobando avisos pendientes…';}
  try{
   const url='/api/resuelve/admin/reports/pending'+
    (more&&state.reportNext?'?antes='+encodeURIComponent(state.reportNext):'');
   const data=await request(url);
   const names={
    publicidad_encubierta:'Publicidad encubierta',
    cualificacion_falsa:'Posible cualificación engañosa',
    datos_personales:'Datos personales',
    consejo_peligroso:'Consejo potencialmente peligroso',
    otro:'Otro problema'
   };
   for(const report of data.items){
    const item=create('article','review-item');
    item.append(create('h3',null,report.title),
      create('p','muted','Motivo: '+(names[report.reason]||'Aviso de revisión')),
      create('p',null,report.body));
    if(report.self_professional_role)
     item.append(create('p','muted','Experiencia declarada: '+report.self_professional_role+
      (report.self_commercial_interest?' · Posible interés económico declarado':' · Sin interés económico declarado')));
    const actions=create('div','review-item-actions');
    actions.append(button('Abrir respuesta',async()=>{
     await openDetail(report.question_id);
     const target=document.getElementById('resuelve-answer-'+report.answer_id);
     if(target)target.scrollIntoView({block:'center',behavior:'smooth'});
    },'secondary'));
    actions.append(button('Desestimar aviso',async()=>{
     if(!confirm('¿Has revisado el contexto y quieres desestimar este aviso?'))return;
     try{
      await write('/api/resuelve/admin/reports/'+encodeURIComponent(report.id)+'/dismiss',{});
      message('Aviso desestimado tras revisión.');
      await loadAnswerReports();
     }catch(err){message(err.message);}
    },'secondary'));
    item.append(actions);list.append(item);
   }
   state.reportNext=data.next;
   moreButton.hidden=!state.reportNext;
   status.textContent=list.childElementCount?'':'No hay avisos pendientes.';
  }catch(err){status.textContent=err.message;}
  finally{state.reportLoading=false;}
 }
 function displayDetail(open){
  el('detailPanel').hidden=!open;
  el('questions').hidden=open;
  el('solutions').hidden=open;
  if(state.user?.is_admin||state.user?.isAdmin){
   el('libraryReviewPanel').hidden=open;
   el('adminReportsPanel').hidden=open;
  }
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

 function connectedActions(q){
  const wrap=create('section','resuelve-related');
  const title=create('h3',null,'Difunde esta petición para recibir más ayuda');
  const info=create('p','muted','Compartir una pregunta puede acercarla a quien sabe responder. No se publicará nada sin tu permiso.');
  const links=create('div','resuelve-related-actions');
  function action(label,href){
   const a=create('a','secondary',label);a.href=href;links.append(a);
  }
  action('Explorar comunidades','/comunidades');
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
  links.append(share);wrap.append(title,info,links);
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
     await openDetail(q.id,false);await loadSolutions();await loadReviewQueue();
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
    await openDetail(q.id,false);await loadSolutions();await loadReviewQueue();
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
    try{await write('/api/resuelve/admin/answer/'+a.id+'/hide',{});message('Respuesta oculta.');await openDetail(q.id,false);await loadAnswerReports();}
    catch(e){message(e.message);}
   }));
   item.append(actions);list.append(item);
  }
  const form=el('answerForm');
  form.hidden=!(state.user&&!mine&&!solved);
  if(!state.user&&!solved)list.append(create('p','muted','Entra en tu cuenta de RedLibertad para responder. La lectura es pública.'));
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
 async function init(){
  try{const me=await request('/api/auth/me');state.user=me.user;}
  catch(_){state.user=null;}
  el('askButton').hidden=!state.user;
  document.querySelector('[data-filter="mine"]').hidden=!state.user;
  const isAdmin=!!(state.user?.is_admin||state.user?.isAdmin);
  el('libraryReviewPanel').hidden=!isAdmin;
  el('adminReportsPanel').hidden=!isAdmin;
  if(isAdmin){await loadReviewQueue();await loadAnswerReports();}
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
   state.professionalOnly=el('questionProfessionalFilter').checked;
   loadList();
  });
  el('questionSearchClear').addEventListener('click',()=>{
   el('questionSearchForm').reset();state.search='';state.category='';state.professionalOnly=false;
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
  el('moreLibraryReview').addEventListener('click',()=>loadReviewQueue(true));
  el('moreAdminReports').addEventListener('click',()=>loadAnswerReports(true));
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
