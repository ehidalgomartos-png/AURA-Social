'use strict';
const $=selector=>document.querySelector(selector);
const TYPE_NAMES={post:'Publicación',reel:'Reel',comment:'Comentario',story:'Story',registration:'Nuevo perfil visible'};
const METRIC_LABELS=[
 ['registrations','Registros'],['posts','Publicaciones'],['reels','Reels'],['stories','Stories'],
 ['comments','Comentarios'],['messages','Mensajes privados · solo número'],
 ['conversations','Conversaciones con actividad · solo número'],['follows','Seguimientos'],
 ['likes','Me gusta'],['reports','Denuncias recibidas'],
 ['open_reports','Denuncias abiertas · total actual'],['active_members','Cuentas activas · total actual']
];
const SERVICE_METRIC_LABELS_V3652=[
 ['resuelve_open','Peticiones abiertas · total actual'],
 ['resuelve_unanswered','Sin respuestas visibles · total actual'],
 ['resuelve_replies_period','Respuestas visibles · en el período'],
 ['voices_published','Artículos públicos · total actual'],
 ['voices_published_period','Nuevos artículos · en el período']
];
let currentPage=0,hasMore=false,loadingId=0,autoTimer=null;
function el(tag,className='',text=''){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=String(text);
 return node;
}
function validId(value){return /^[1-9][0-9]{0,17}$/.test(String(value||''));}
function activityUrl(item){
 if((item.kind==='post'||item.kind==='reel'||item.kind==='comment')&&validId(item.postId))
   return '/p/'+encodeURIComponent(item.postId);
 if(item.kind==='story'&&validId(item.eventId))
   return '/app?story='+encodeURIComponent(item.eventId);
 if(item.kind==='registration'&&/^[A-Za-z0-9_.-]{2,40}$/.test(String(item.username||'')))
   return '/perfil/'+encodeURIComponent(item.username);
 return null;
}
function renderMetrics(metrics={}){
 const root=$('#activityStats');
 const nodes=METRIC_LABELS.map(([key,label])=>{
   const card=el('div','activity-stat'+(['messages','conversations'].includes(key)?' important':'')+(key==='open_reports'&&Number(metrics[key])>0?' alert':''));
   const n=Number(metrics[key]);
   const number=el('strong','',Number.isFinite(n)&&n>=0?n.toLocaleString('es-ES'):'—');
   card.append(number,el('span','',label));
   return card;
 });
 root.replaceChildren(...nodes);
}
// V3.6.52 — cifras agregadas; null/ausencia se muestra como «no disponible», nunca cero.
function renderServiceStatsV3652(metrics={}){
 const cards=SERVICE_METRIC_LABELS_V3652.map(([key,label])=>{
   const card=el('div','activity-stat');
   const raw=metrics[key];
   const number=raw===null||raw===undefined?null:Number(raw);
   const valid=number!==null&&Number.isSafeInteger(number)&&number>=0;
   card.append(el('strong','',valid?number.toLocaleString('es-ES'):'—'),el('span','',label));
   return card;
 });
 $('#serviceStatsV3652').replaceChildren(...cards);
}
async function refreshServiceStatsV3652(days,requestId){
 const status=$('#serviceStatusV3652');
 status.classList.remove('error');
 status.textContent='Consultando las cifras de Resuelve y Voces…';
 try{
   const response=await fetch('/api/admin/activity/services-summary?days='+encodeURIComponent(days),{
     credentials:'same-origin',cache:'no-store'
   });
   if(!response.ok)throw Error('service_summary_unavailable');
   const data=await response.json();
   if(requestId!==loadingId)return;
   if(data.ok!==true||!data.metrics||typeof data.metrics!=='object')throw Error('invalid_service_summary');
   renderServiceStatsV3652(data.metrics);
   const missing=SERVICE_METRIC_LABELS_V3652.some(([key])=>data.metrics[key]===null||data.metrics[key]===undefined);
   status.textContent=missing?'Algunas cifras aún no están disponibles; no se han sustituido por ceros.':
     'Resumen agregado actualizado para el período seleccionado.';
 }catch(_){
   if(requestId!==loadingId)return;
   renderServiceStatsV3652({});
   status.classList.add('error');
   status.textContent='Cifras de servicios temporalmente no disponibles.';
 }
}
function formatDate(value){
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'—':date.toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'});
}
function renderFeed(items=[]){
 const root=$('#activityFeed');
 if(!items.length){
   root.replaceChildren(el('p','activity-empty','No hay movimientos públicos visibles para estos filtros.'));
   return;
 }
 const nodes=items.map(item=>{
   const article=el('article','activity-event');
   const left=el('div','activity-event-copy');
   const head=el('div','activity-event-head');
   head.append(el('span','activity-event-type',TYPE_NAMES[item.kind]||'Actividad'));
   head.append(el('b','activity-event-name','@'+String(item.username||'usuario')));
   left.append(head);
   if(item.excerpt)left.append(el('p','',String(item.excerpt).slice(0,180)));
   const right=el('div','activity-event-side');
   const time=el('time','',formatDate(item.occurredAt));
   time.dateTime=String(item.occurredAt||'');
   right.append(time);
   const url=activityUrl(item);
   if(url){
     const a=el('a','','Ver '+(item.kind==='registration'?'perfil':item.kind==='comment'?'publicación':'contenido'));
     a.href=url;
     right.append(a);
   }
   article.append(left,right);
   return article;
 });
 root.replaceChildren(...nodes);
}
async function refreshActivity(){
 const request=++loadingId;
 const days=$('#activityDays').value,type=$('#activityType').value;
 void refreshServiceStatsV3652(days,request);
 const params=new URLSearchParams({days,type,page:String(currentPage)});
 const status=$('#activityStatus');
 status.classList.remove('error');
 status.textContent='Actualizando actividad…';
 $('#activityRefresh').disabled=true;
 try{
   const response=await fetch('/api/admin/activity?'+params.toString(),{credentials:'same-origin',cache:'no-store'});
   if(response.status===401){location.assign('/?login=1');return;}
   if(response.status===403){location.assign('/app?admin=denied');return;}
   if(!response.ok)throw Error('activity_unavailable');
   const data=await response.json();
   if(request!==loadingId)return;
   if(data.ok!==true||!Array.isArray(data.items))throw Error('invalid_activity_response');
   renderMetrics(data.metrics);
   renderFeed(data.items);
   hasMore=data.hasMore===true;
   $('#activityPrev').disabled=currentPage===0;
   $('#activityNext').disabled=!hasMore;
   $('#activityPage').textContent='Página '+(currentPage+1);
   $('#activityUpdated').textContent='Actualizado: '+formatDate(data.updatedAt);
   status.textContent='Actualizado correctamente · '+data.items.length+' movimientos visibles en esta página.';
 }catch(_){
   if(request!==loadingId)return;
   status.classList.add('error');
   status.textContent='No se pudo cargar la actividad. Puedes volver a intentarlo sin perder los filtros.';
 }finally{
   if(request===loadingId)$('#activityRefresh').disabled=false;
 }
}
function changeFilter(){
 currentPage=0;hasMore=false;
 $('#activityPrev').disabled=true;$('#activityNext').disabled=true;
 void refreshActivity();
}
function manageAutoRefresh(){
 if(autoTimer){clearInterval(autoTimer);autoTimer=null;}
 if($('#activityAuto').checked){
   autoTimer=setInterval(()=>{
     if(!document.hidden&&navigator.onLine!==false&&$('#activityRefresh').disabled!==true)
       void refreshActivity();
   },60000);
 }
}
$('#activityDays').addEventListener('change',changeFilter);
$('#activityType').addEventListener('change',changeFilter);
$('#activityRefresh').addEventListener('click',()=>void refreshActivity());
$('#activityPrev').addEventListener('click',()=>{
 if(currentPage>0){currentPage--;void refreshActivity();}
});
$('#activityNext').addEventListener('click',()=>{
 if(hasMore&&currentPage<20){currentPage++;void refreshActivity();}
});
$('#activityAuto').addEventListener('change',manageAutoRefresh);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&$('#activityAuto').checked&&!$('#activityRefresh').disabled)void refreshActivity();
});
manageAutoRefresh();
void refreshActivity();
