'use strict';
// V3.6.12 — prioridades verificables y de solo lectura, nunca sanciones automáticas.
(()=>{
 const el=id=>document.getElementById(id);
 let busy=false;
 function validCount(value){
  const n=Number(value);
  if(value===null||value===undefined||value===''||!Number.isSafeInteger(n)||n<0)
   throw Error('invalid_count');
  return n;
 }
 async function read(url){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('unavailable');
  return response.json();
 }
 function technical(data){
  if(data?.ok!==true||data.scope!=='current_instance_signals')
   throw Error('invalid_alert_summary');
  const m=data.metrics||{};
  const open=validCount(m.open_alerts);
  const critical=validCount(m.critical_active);
  const monitoring=validCount(m.monitoring_alerts);
  if(critical>open)throw Error('invalid_alert_relationship');
  el('priorityTechCountV3612').textContent=open.toLocaleString('es-ES');
  el('priorityTechCardV3612').className='admin-priority-card-v3612'+
    (critical>0?' is-attention-v3612':'');
  el('priorityTechStatusV3612').textContent=
   open===0&&monitoring===0?'Sin alertas abiertas ni en seguimiento en esta instancia.':
   'Críticas activas: '+critical+' · En seguimiento: '+monitoring+'.';
 }
 function resuelve(data){
  if(data?.ok!==true)throw Error('invalid_trust_summary');
  const pending=validCount(data.totalPending);
  el('priorityHelpCountV3612').textContent=pending.toLocaleString('es-ES');
  el('priorityHelpCardV3612').className='admin-priority-card-v3612'+
    (pending>0?' is-attention-v3612':'');
  el('priorityHelpStatusV3612').textContent=pending===0?
   'Sin avisos pendientes de revisión en Resuelve.':
   'Avisos pendientes de revisión humana. Ninguna denuncia demuestra por sí sola una infracción.';
 }
 async function refresh(){
  if(busy)return;
  busy=true;
  const btn=el('priorityRefreshV3612');
  btn.disabled=true;
  el('priorityGlobalStatusV3612').textContent='Consultando prioridades…';
  for(const id of ['priorityTechCountV3612','priorityHelpCountV3612'])el(id).textContent='—';
  const results=await Promise.allSettled([
   read('/api/admin/ops/alerts/summary'),
   read('/api/resuelve/admin/trust-summary')
  ]);
  let success=0;
  const destinations=[
   [results[0],technical,'priorityTechStatusV3612','priorityTechCardV3612'],
   [results[1],resuelve,'priorityHelpStatusV3612','priorityHelpCardV3612']
  ];
  for(const [result,render,statusId,cardId] of destinations){
   try{
    if(result.status!=='fulfilled')throw Error('unavailable');
    render(result.value);
    success++;
   }catch(_error){
    el(statusId).textContent='No disponible. Vuelve a consultar antes de tomar decisiones.';
    el(cardId).className='admin-priority-card-v3612';
   }
  }
  el('priorityGlobalStatusV3612').textContent=success===2?
   'Datos revisados. Toda acción sobre alertas o denuncias sigue siendo manual.':
   'Resumen parcial: algunos servicios no están disponibles. No se estiman cifras.';
  btn.disabled=false;
  busy=false;
 }
 el('priorityRefreshV3612').addEventListener('click',()=>void refresh());
 void refresh();
})();
