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
 const state={impactBusy:false,solutionsBusy:false,reportsBusy:false,solutionsCursor:null,reportsCursor:null};
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
    item.remove();el('libraryReviewStatus').textContent='Solución aprobada tras revisión humana.';
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
  if(!more){list.replaceChildren();state.solutionsCursor=null;status.textContent='Cargando soluciones pendientes…';}
  try{
   const cursor=more&&state.solutionsCursor?'?antes='+encodeURIComponent(state.solutionsCursor):'';
   const data=await api('/api/resuelve/admin/solutions/pending'+cursor);
   for(const q of data.items||[])if(validId(q.id))list.append(solutionCard(q));
   state.solutionsCursor=data.next;
   moreButton.hidden=!state.solutionsCursor;
   status.textContent=list.childElementCount?'':'No hay soluciones pendientes de revisión.';
  }catch(err){status.textContent=err.message;}finally{state.solutionsBusy=false;refresh.disabled=false;}
 }
 const reasons={
  publicidad_encubierta:'Publicidad encubierta',cualificacion_falsa:'Posible cualificación engañosa',
  datos_personales:'Datos personales',consejo_peligroso:'Consejo potencialmente peligroso',otro:'Otro problema'
 };
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
  actions.append(action('Desestimar aviso',async()=>{
   if(!confirm('¿Has revisado el contexto y quieres desestimar este aviso?'))return;
   try{
    await write('/api/resuelve/admin/reports/'+encodeURIComponent(report.id)+'/dismiss',{});
    item.remove();el('adminReportsStatus').textContent='Aviso desestimado tras revisión.';
   }catch(err){el('adminReportsStatus').textContent=err.message;}
  }));
  actions.append(action('Ocultar respuesta',async()=>{
   if(!confirm('¿Has revisado el contenido? Esta acción ocultará la respuesta y cerrará sus avisos pendientes.'))return;
   try{
    await write('/api/resuelve/admin/answer/'+encodeURIComponent(report.answer_id)+'/hide',{});
    el('adminReportsStatus').textContent='Respuesta ocultada por moderación.';
    await reports();await impact();
   }catch(err){el('adminReportsStatus').textContent=err.message;}
  },'admin-danger'));
  item.append(actions);return item;
 }
 async function reports(more=false){
  if(state.reportsBusy)return;
  state.reportsBusy=true;
  const status=el('adminReportsStatus'),list=el('adminReportsList');
  const moreButton=el('moreAdminReports'),refresh=el('refreshAdminReports');
  moreButton.hidden=true;refresh.disabled=true;
  if(!more){list.replaceChildren();state.reportsCursor=null;status.textContent='Comprobando avisos pendientes…';}
  try{
   const cursor=more&&state.reportsCursor?'?antes='+encodeURIComponent(state.reportsCursor):'';
   const data=await api('/api/resuelve/admin/reports/pending'+cursor);
   for(const report of data.items||[])if(validId(report.id)&&validId(report.answer_id))list.append(reportCard(report));
   state.reportsCursor=data.next;moreButton.hidden=!state.reportsCursor;
   status.textContent=list.childElementCount?'':'No hay avisos pendientes.';
  }catch(err){status.textContent=err.message;}finally{state.reportsBusy=false;refresh.disabled=false;}
 }
 async function init(){
  try{
   const me=await api('/api/auth/me');
   if(!me.user?.is_admin&&!me.user?.isAdmin)throw Error('Esta sección está reservada a administración.');
   el('resuelveAdminAccess').hidden=true;
   el('resuelveAdminContent').hidden=false;
   el('refreshAdminImpact').addEventListener('click',impact);
   el('refreshLibraryReview').addEventListener('click',()=>solutions());
   el('refreshAdminReports').addEventListener('click',()=>reports());
   el('moreLibraryReview').addEventListener('click',()=>solutions(true));
   el('moreAdminReports').addEventListener('click',()=>reports(true));
   // Cargar de forma independiente para que un error no impida acceder a otros paneles.
   await Promise.all([impact(),solutions(),reports()]);
  }catch(err){
   el('resuelveAdminAccess').textContent=err.message+
    ' Puedes volver a Resuelve para iniciar sesión con tu cuenta administradora.';
  }
 }
 init();
})();
