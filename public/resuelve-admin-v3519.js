'use strict';
// V3.5.19 — administración de Resuelve; todas las acciones requieren API y sesión admin.
(()=>{
 const el=id=>document.getElementById(id);
 const node=(tag,cls,text)=>{
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);
  return n;
 };
 const validId=value=>/^[1-9]\d{0,15}$/.test(String(value||''));
 const state={impactBusy:false,solutionsBusy:false,reportsBusy:false,solutionsCursor:null,reportsCursor:null,solutionsLoaded:false,reportsLoaded:false,solutionsError:false,reportsError:false};
 function updateWork(){
  const counts=[
   ['adminWorkSolutions','libraryReviewList',state.solutionsLoaded,state.solutionsError,state.solutionsCursor],
   ['adminWorkReports','adminReportsList',state.reportsLoaded,state.reportsError,state.reportsCursor]
  ];
  for(const [id,listId,loaded,error,next] of counts){
   el(id).textContent=error?'Error':loaded?(el(listId).childElementCount+(next?'+':'')):'—';
  }
  el('adminWorkStatus').textContent=state.solutionsError||state.reportsError?
   'Alguna cola no se ha podido consultar. Vuelve a actualizar.':
   !state.solutionsLoaded||!state.reportsLoaded?'Consultando revisiones…':
   state.solutionsCursor||state.reportsCursor?
    'Hay más páginas por consultar. Las cifras muestran solo lo cargado.':
    'Cifras de las páginas consultadas; actualizar para comprobar nuevas entradas.';
 }
 async function api(url,options={}){
  const response=await fetch(url,{...options,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(response.status===401?'Tu sesión ha caducado. Entra de nuevo en RedLibertad.':
   response.status===403?'Esta cuenta no tiene permiso de administración.':
   response.status===409?'Este contenido ya no está disponible para esta acción. Actualiza el listado.':
   'No se pudo completar la solicitud. Vuelve a intentarlo.');
  return body;
 }
 const write=(url,payload)=>api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const questionLink=id=>{
  const a=node('a','admin-question-link','Abrir petición y revisar contexto');
  if(validId(id)){a.href='/resuelve?id='+encodeURIComponent(id);a.target='_blank';a.rel='noopener noreferrer';}
  return a;
 };
 const action=(label,callback,cls='secondary')=>{
  const b=node('button',cls,label);b.type='button';b.addEventListener('click',callback);return b;
 };
 async function impact(){
  if(state.impactBusy)return;
  state.impactBusy=true;
  const status=el('adminImpactStatus'),refresh=el('refreshAdminImpact'),grid=el('adminImpactMetrics');
  refresh.disabled=true;status.textContent='Consultando actividad real…';
  try{
   const data=await api('/api/resuelve/admin/impact');
   const definitions=[
    ['public_questions','Peticiones públicas'],['open_questions','Pendientes de resolver'],
    ['open_without_answers','Abiertas sin respuestas visibles'],
    ['questions_with_answers','Peticiones con respuestas'],['resolved_questions','Problemas resueltos'],
    ['unique_helpers','Personas que han respondido'],['thanked_resolutions','Soluciones agradecidas'],
    ['questions_30d','Peticiones · últimos 30 días'],['resolved_30d','Resueltas · últimos 30 días']
   ];
   const cards=definitions.map(([key,label])=>{
    const number=Number(data.metrics?.[key]);
    if(!Number.isSafeInteger(number)||number<0)throw Error('Métricas incompletas');
    const tile=node('article','resuelve-impact-tile');
    tile.append(node('strong',null,number.toLocaleString('es-ES')),node('span',null,label));
    return tile;
   });
   grid.replaceChildren(...cards);
   const updated=new Date(data.asOf);
   status.textContent='Actualizado: '+(Number.isNaN(updated.getTime())?'ahora':updated.toLocaleString('es-ES'));
  }catch(err){status.textContent=err.message;}finally{state.impactBusy=false;refresh.disabled=false;}
 }
 // V3.5.37 — tendencia real solo para administración; jamás cifras estimadas.
 async function activity7d(){
  const button=el('refreshActivity7d'),tbody=el('activity7dRows'),status=el('activity7dStatus');
  if(button.disabled)return;
  button.disabled=true;status.textContent='Consultando la actividad diaria…';
  try{
   const data=await api('/api/resuelve/admin/activity-7d');
   if(!Array.isArray(data.days)||data.days.length!==7)throw Error('Datos diarios incompletos.');
   const rows=data.days.map(day=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day.day||'')))throw Error('Fecha inválida.');
    const tr=node('tr');
    tr.append(node('th',null,day.day));
    for(const key of ['questions','answers','resolutions']){
     const value=Number(day[key]);
     if(!Number.isSafeInteger(value)||value<0)throw Error('Cifras diarias inválidas.');
     tr.append(node('td',null,value.toLocaleString('es-ES')));
    }
    return tr;
   });
   tbody.replaceChildren(...rows);
   status.textContent='Datos agregados de los 7 últimos días según el calendario del servidor, sin información personal.';
  }catch(err){status.textContent=err.message;}
  finally{button.disabled=false;}
 }
 // V3.6.28 — cifras SEO internas: no se interpreta como indexación de Google.
 async function seoDiagnostics(){
  const button=el('refreshAdminSeo');
  if(button.disabled)return;
  const status=el('adminSeoStatus'),grid=el('adminSeoMetrics'),topicsHost=el('adminSeoTopics');
  button.disabled=true;
  status.textContent='Consultando soluciones consentidas y calidad editorial…';
  try{
   const data=await api('/api/resuelve/admin/seo-diagnostics');
   const counters=[
    ['consentedResolved','Resueltas con autorización SEO vigente'],
    ['eligibleSolutions','Soluciones aptas para ficha pública'],
    ['awaitingEditorial','Con respuesta visible pendientes de revisión'],
    ['shortContent','Revisadas, pero sin contenido suficiente'],
    ['unavailableAnswer','Sin respuesta aceptada y visible disponible'],
    ['withoutTopic','Soluciones aptas sin un tema reconocido'],
    ['readyTopics','Temas aptos para sitemap']
   ];
   const readCount=value=>{
    const number=Number(value);
    if(!Number.isSafeInteger(number)||number<0)throw Error('El diagnóstico contiene cifras inválidas.');
    return number;
   };
   const metrics=Object.fromEntries(counters.map(([key])=>[key,readCount(data.metrics?.[key])]));
   if(data.requirements?.googleIndexingVerified!==false||
    data.requirements?.topicMinimum!==3||
    data.requirements?.solutionsSitemapLimit!==2000||
    typeof data.metrics?.sitemapLimitReached!=='boolean')
    throw Error('No se ha podido validar el diagnóstico recibido.');
   const topicNames={
    hogar:'Hogar',tecnologia:'Tecnología',tramites:'Trámites',
    estudios:'Estudios','vida-cotidiana':'Vida cotidiana'
   };
   if(!Array.isArray(data.topics)||data.topics.length!==Object.keys(topicNames).length)
    throw Error('Falta el detalle de temas.');
   const seen=new Set(),topicCards=[];
   for(const entry of data.topics){
    if(!Object.prototype.hasOwnProperty.call(topicNames,entry.slug)||seen.has(entry.slug))
     throw Error('Tema SEO desconocido.');
    seen.add(entry.slug);
    const count=readCount(entry.eligible),missing=readCount(entry.missing);
    const ready=count>=3;
    if(entry.ready!==ready||missing!==Math.max(0,3-count))
     throw Error('El tema contiene cifras contradictorias.');
    const card=node('article','resuelve-seo-topic-card-v3628');
    const caption=node('strong',null,topicNames[entry.slug]);
    const amount=node('span',null,count+' solución'+(count===1?'':'es')+' apta'+(count===1?'':'s'));
    const explanation=node('small',null,ready?'Cumple el mínimo para la página temática':
     count?'Faltan '+missing+' solución'+(missing===1?'':'es')+' apta'+(missing===1?'':'s'):
     'Todavía no tiene soluciones aptas para la página temática');
    card.append(caption,amount,explanation);
    topicCards.push(card);
   }
   if(metrics.readyTopics!==data.topics.filter(x=>x.ready===true).length)
    throw Error('El número de temas listos no coincide.');
   const tiles=counters.map(([key,label])=>{
    const tile=node('article','resuelve-impact-tile');
    tile.append(node('strong',null,metrics[key].toLocaleString('es-ES')),node('span',null,label));
    return tile;
   });
   grid.replaceChildren(...tiles);
   topicsHost.replaceChildren(...topicCards);
   const when=new Date(data.asOf);
   const asOf=Number.isNaN(when.getTime())?'Actualizado ahora.':
    'Actualizado: '+when.toLocaleString('es-ES')+'.';
   status.textContent=asOf+
    ' Estos valores indican requisitos internos, no páginas indexadas por Google.'+
    (data.metrics.sitemapLimitReached?
     ' Atención: hay más de 2.000 soluciones aptas y el sitemap actual tiene un límite de 2.000. Revisar su ampliación.':'');
  }catch(error){
   grid.replaceChildren();topicsHost.replaceChildren();
   status.textContent=error.message;
  }finally{button.disabled=false;}
 }
 // V3.6.29 — comprobación manual same-origin; no consulta el índice de Google.
 async function seoProductionCheck(){
  const button=el('checkAdminSeoProduction'),status=el('adminSeoProductionStatus');
  const results=el('adminSeoProductionResults');
  if(button.disabled)return;
  button.disabled=true;
  results.replaceChildren();
  const reportPanel=el('adminSeoProductionExport');
  const reportInput=el('adminSeoProductionReport');
  if(reportPanel)reportPanel.hidden=true;
  if(reportInput)reportInput.value='';
  const copyStatus=el('adminSeoProductionCopyStatus');
  if(copyStatus)copyStatus.textContent='';
  const checks=window.ResuelveSeoLiveChecks;
  if(!checks||!Array.isArray(checks.TARGETS)){
   status.textContent='No se ha cargado el comprobador. Actualiza esta página.';
   button.disabled=false;return;
  }
  const started=new Date();
  status.textContent='Iniciando revisión de '+checks.TARGETS.length+' direcciones públicas…';
  const counts={ok:0,warning:0,error:0};
  const collected=[];
  const reportHelper=window.ResuelveSeoReport;
  try{
   for(const target of checks.TARGETS){
    status.textContent='Comprobando '+(counts.ok+counts.warning+counts.error+1)+
     '/'+checks.TARGETS.length+': '+target.label+'…';
    const result=await checks.checkTarget(target);
    const state=['ok','warning','error'].includes(result.status)?result.status:'error';
    counts[state]++;
    collected.push({...result,path:target.path});
    const item=node('article','resuelve-seo-checked-v3629 status-'+state);
    const title=node('div','resuelve-seo-checked-header-v3629');
    const link=node('a',null,result.label);
    link.href=target.path;
    link.target='_blank';link.rel='noopener noreferrer';
    const label=node('strong',null,state==='ok'?'Correcta':state==='warning'?'Revisar':'Error técnico');
    title.append(link,label);
    const http=node('p','muted','HTTP '+(result.httpStatus??'sin respuesta')+' · '+
     (result.details||'Sin detalle'));
    item.append(title,http);
    const messages=[
     ...(Array.isArray(result.issues)?result.issues:[]),
     ...(Array.isArray(result.warnings)?result.warnings:[])
    ];
    if(messages.length){
     const list=node('ul','resuelve-seo-checked-messages-v3629');
     for(const message of messages.slice(0,6))list.append(node('li',null,String(message).slice(0,190)));
     item.append(list);
    }
    if(reportHelper?.recommendation)
     item.append(node('p','resuelve-seo-guidance-v3630','Siguiente paso: '+reportHelper.recommendation(target,result)));
    results.append(item);
   }
   if(reportPanel&&reportInput&&reportHelper?.makeReport){
    reportInput.value=reportHelper.makeReport(collected,checks.TARGETS,started);
    reportPanel.hidden=false;
   }
   status.textContent='Revisión terminada: '+counts.ok+' correctas, '+counts.warning+
    ' para revisar y '+counts.error+' con errores. Comprobadas desde este navegador a las '+
    started.toLocaleString('es-ES')+'. No indica indexación en Google.';
  }catch(_){
   status.textContent='La revisión se ha interrumpido. Vuelve a ejecutarla desde Administración.';
  }finally{button.disabled=false;}
 }
 async function copySeoProductionReport(){
  const input=el('adminSeoProductionReport');
  const status=el('adminSeoProductionCopyStatus');
  if(!input||!status||!input.value)return;
  try{
   await navigator.clipboard.writeText(input.value);
   status.textContent='Informe técnico copiado. Puedes compartirlo para revisar las incidencias.';
  }catch(_){
   input.focus();input.select();
   status.textContent='Selecciona el informe y copia con Ctrl+C (o Copiar en tu móvil).';
  }
 }
 const requirements=[
  ['qualityReviewed','La solución aporta una explicación útil sin necesidad de comprar o contratar nada.'],
  ['privacyReviewed','He comprobado que no contiene información personal que deba quedar expuesta.'],
  ['nonCommercialReviewed','He comprobado que no hay publicidad encubierta ni recomendaciones engañosas.']
 ];
 function solutionCard(q){
  const item=node('article','review-item admin-review-card');
  item.append(node('h3',null,q.title),node('p','muted',q.solution));
  const top=node('div','review-item-actions');
  top.append(questionLink(q.id));item.append(top);
  const details=node('details','admin-review-checklist');
  details.append(node('summary',null,'Revisar y aprobar solución'));
  const intro=node('p','muted','Lee la petición completa y la respuesta antes de confirmar las tres comprobaciones. La aprobación hará visible la solución en la biblioteca.');
  details.append(intro);
  const checks=[];
  const approve=action('Aprobar solución',async()=>{
   if(!checks.every(check=>check.checked))return;
   if(!confirm('¿Has revisado el contenido y quieres aprobarlo para la biblioteca pública?'))return;
   approve.disabled=true;
   try{
    await write('/api/resuelve/admin/solutions/'+encodeURIComponent(q.id)+'/approve',
     {qualityReviewed:true,privacyReviewed:true,nonCommercialReviewed:true});
    item.remove();updateWork();el('libraryReviewStatus').textContent='Solución aprobada tras revisión humana.';
    await impact();
   }catch(err){el('libraryReviewStatus').textContent=err.message;approve.disabled=false;}
  });
  approve.disabled=true;
  for(const [key,label] of requirements){
   const line=node('label','admin-review-option'),input=node('input');
   input.type='checkbox';input.name=key;input.checked=false;
   input.addEventListener('change',()=>{approve.disabled=!checks.every(c=>c.checked);});
   line.append(input,node('span',null,label));checks.push(input);details.append(line);
  }
  details.append(approve);item.append(details);return item;
 }
 async function solutions(more=false){
  if(state.solutionsBusy)return;
  state.solutionsBusy=true;
  const status=el('libraryReviewStatus'),list=el('libraryReviewList');
  const moreButton=el('moreLibraryReview'),refresh=el('refreshLibraryReview');
  moreButton.hidden=true;refresh.disabled=true;
  if(!more){list.replaceChildren();state.solutionsCursor=null;state.solutionsLoaded=false;status.textContent='Cargando soluciones pendientes…';}state.solutionsError=false;updateWork();
  try{
   const cursor=more&&state.solutionsCursor?'?antes='+encodeURIComponent(state.solutionsCursor):'';
   const data=await api('/api/resuelve/admin/solutions/pending'+cursor);
   for(const q of data.items||[])if(validId(q.id))list.append(solutionCard(q));
   state.solutionsCursor=data.next;state.solutionsLoaded=true;
   moreButton.hidden=!state.solutionsCursor;
   status.textContent=list.childElementCount?'':'No hay soluciones pendientes de revisión.';
  }catch(err){state.solutionsError=true;status.textContent=err.message;}finally{state.solutionsBusy=false;refresh.disabled=false;updateWork();}
 }
 const reasons={
  publicidad_encubierta:'Publicidad encubierta',cualificacion_falsa:'Posible cualificación engañosa',
  datos_personales:'Datos personales',consejo_peligroso:'Consejo potencialmente peligroso',otro:'Otro problema'
 };
 async function trustSummary(){
  const button=el('refreshAdminTrust'),status=el('adminTrustStatus'),grid=el('adminTrustMetrics');
  if(button.disabled)return;
  button.disabled=true;status.textContent='Consultando motivos de revisión…';
  try{
   const data=await api('/api/resuelve/admin/trust-summary');
   const definitions=[
    ['publicidad_encubierta','Posible publicidad encubierta'],
    ['cualificacion_falsa','Posible cualificación engañosa'],
    ['datos_personales','Posibles datos personales'],
    ['consejo_peligroso','Posible consejo peligroso'],
    ['otro','Otros avisos']
   ];
   const cards=definitions.map(([key,label])=>{
    const count=Number(data.pendingByReason?.[key]);
    if(!Number.isSafeInteger(count)||count<0)throw Error('Resumen incompleto');
    const card=node('article','resuelve-impact-tile');
    card.append(node('strong',null,count.toLocaleString('es-ES')),node('span',null,label));
    return card;
   });
   grid.replaceChildren(...cards);
   const total=Number(data.totalPending);
   status.textContent=Number.isSafeInteger(total)&&total>=0?
    total+' avisos pendientes para revisión humana. No se aplica ninguna sanción automática.':
    'Resumen recibido con datos incompletos.';
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
 }
 function reportCard(report){
  const item=node('article','review-item admin-review-card');
  item.append(node('h3',null,report.title),
   node('p','muted','Motivo: '+(reasons[report.reason]||'Otro problema')),
   node('p',null,report.body));
  if(report.self_professional_role)item.append(node('p','muted',
   'Profesión declarada: '+report.self_professional_role+
   (report.self_commercial_interest?' · Indica interés económico':' · Declara no tener interés económico')));
  const actions=node('div','review-item-actions');
  actions.append(questionLink(report.question_id));
  const dismiss=action('Desestimar aviso',async()=>{
   if(!confirm('¿Has revisado el contexto y quieres desestimar este aviso?'))return;
   dismiss.disabled=true;hide.disabled=true;
   try{
    await write('/api/resuelve/admin/reports/'+encodeURIComponent(report.id)+'/dismiss',{});
    item.remove();updateWork();el('adminReportsStatus').textContent='Aviso desestimado tras revisión.';
    await trustSummary();
   }catch(err){el('adminReportsStatus').textContent=err.message;dismiss.disabled=false;hide.disabled=false;}
  });
  const hide=action('Ocultar respuesta',async()=>{
   if(!confirm('¿Has revisado el contenido? Esta acción ocultará la respuesta y cerrará sus avisos pendientes.'))return;
   dismiss.disabled=true;hide.disabled=true;
   try{
    await write('/api/resuelve/admin/answer/'+encodeURIComponent(report.answer_id)+'/hide',{});
    el('adminReportsStatus').textContent='Respuesta ocultada por moderación.';
    await Promise.all([reports(),impact(),trustSummary()]);
   }catch(err){el('adminReportsStatus').textContent=err.message;dismiss.disabled=false;hide.disabled=false;}
  },'admin-danger');
  actions.append(dismiss,hide);
  item.append(actions);return item;
 }
 async function reports(more=false){
  if(state.reportsBusy)return;
  state.reportsBusy=true;
  const status=el('adminReportsStatus'),list=el('adminReportsList');
  const moreButton=el('moreAdminReports'),refresh=el('refreshAdminReports');
  moreButton.hidden=true;refresh.disabled=true;
  if(!more){list.replaceChildren();state.reportsCursor=null;state.reportsLoaded=false;status.textContent='Comprobando avisos pendientes…';}state.reportsError=false;updateWork();
  try{
   const cursor=more&&state.reportsCursor?'?antes='+encodeURIComponent(state.reportsCursor):'';
   const data=await api('/api/resuelve/admin/reports/pending'+cursor);
   for(const report of data.items||[])if(validId(report.id)&&validId(report.answer_id))list.append(reportCard(report));
   state.reportsCursor=data.next;state.reportsLoaded=true;moreButton.hidden=!state.reportsCursor;
   status.textContent=list.childElementCount?'':'No hay avisos pendientes.';
  }catch(err){state.reportsError=true;status.textContent=err.message;}finally{state.reportsBusy=false;refresh.disabled=false;updateWork();}
 }
 async function init(){
  try{
   const me=await api('/api/auth/me');
   if(!me.user?.is_admin&&!me.user?.isAdmin)throw Error('Esta sección está reservada a administración.');
   el('resuelveAdminAccess').hidden=true;
   el('resuelveAdminContent').hidden=false;
   el('refreshAdminImpact').addEventListener('click',impact);
   el('refreshAdminSeo').addEventListener('click',seoDiagnostics);
   el('checkAdminSeoProduction').addEventListener('click',seoProductionCheck);
   el('copyAdminSeoProductionReport').addEventListener('click',copySeoProductionReport);
   el('refreshActivity7d').addEventListener('click',activity7d);
   el('refreshAdminWork').addEventListener('click',async()=>{await Promise.all([solutions(),reports()]);});
   el('refreshLibraryReview').addEventListener('click',()=>solutions());
   el('refreshAdminReports').addEventListener('click',()=>reports());
   el('refreshAdminTrust').addEventListener('click',trustSummary);
   el('moreLibraryReview').addEventListener('click',()=>solutions(true));
   el('moreAdminReports').addEventListener('click',()=>reports(true));
   // Cargar de forma independiente para que un error no impida acceder a otros paneles.
   void seoDiagnostics();
   await Promise.all([impact(),solutions(),reports(),trustSummary(),activity7d()]);
  }catch(err){
   el('resuelveAdminAccess').textContent=err.message+
    ' Puedes volver a Resuelve para iniciar sesión con tu cuenta administradora.';
  }
 }
 init();
})();
