'use strict';
const $=id=>document.getElementById(id);
const labels={professional:'Profesional',professional_plus:'Profesional Plus'};
const stateLabels={created:'Sesión creada',completed:'Checkout completado',expired:'Caducada'};
function elem(tag,message,className){const e=document.createElement(tag);if(message!==undefined)e.textContent=String(message??'');if(className)e.className=className;return e;}
function when(date){const d=new Date(date);return Number.isFinite(d.getTime())?d.toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'}):'Sin fecha';}
async function api(path,options={}){
 const r=await fetch('/api/marketplace/subscriptions/admin/stripe-test/'+path,{
  credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},
  ...options
 });
 let data={};try{data=await r.json();}catch(_){}
 if(!r.ok)throw Error(data.error||'No se ha podido completar la operación.');
 return data;
}
function fill(data){
 const on=data.sandboxConfigured===true;
 $('status').hidden=false;$('actions').hidden=!on;$('history').hidden=!on;
 $('statusDetail').textContent=on?'Preparado para pruebas exclusivamente con claves de test.':'Pendiente de configurar el laboratorio de pruebas.';
 $('productionNote').textContent='Cobros reales: desactivados. Restricciones del Marketplace: desactivadas.';
 $('notice').textContent=on?'Modo de pruebas disponible':'El laboratorio está cerrado hasta que el administrador configure las variables TEST en Coolify.';
 const canceled=data.subscription?.stripe_status==='canceled';
 $('checkout').disabled=false;$('portal').hidden=!data.subscription||canceled;
 $('sync').hidden=!data.subscription;
 const select=$('testPlan'),previous=select.value;
 select.replaceChildren(...(data.plans||[]).map(plan=>{
  const option=elem('option',labels[plan.code]||plan.code);
  option.value=plan.code;option.disabled=!plan.configured;return option;
 }));
 const first=(data.plans||[]).find(p=>p.configured);
 const retained=(data.plans||[]).find(p=>p.configured&&p.code===previous);
 if(retained||first)select.value=(retained||first).code;
 $('checkout').disabled=(!!data.subscription&&!canceled)||!first;
 $('checkout').textContent=canceled?'Nueva simulación Stripe TEST ↗':'Abrir Stripe Checkout de prueba ↗';
 const current=$('current');current.replaceChildren();
 if(data.subscription){
  current.append(elem('p','Plan: '+(labels[data.subscription.plan_code]||data.subscription.plan_code)));
  current.append(elem('p','Estado de Stripe TEST: '+data.subscription.stripe_status));
  if(canceled){
   current.append(elem('p','Suscripción TEST cancelada definitivamente. Puedes iniciar otra simulación sin modificar la anterior.'));
  }else{
   if(data.subscription.period_ends_at)current.append(elem('p','Período hasta: '+when(data.subscription.period_ends_at)));
   const scheduled=data.subscription.cancel_at_period_end===true;
   const end=data.subscription.cancel_at||data.subscription.period_ends_at;
   current.append(elem('p',scheduled?'Cancelación de test programada'+(end?' para '+when(end):''):'Sin cancelación de test programada'));
  }
 }else current.append(elem('p','Todavía no hay suscripción de prueba para esta cuenta.','muted'));
 const archived=$('archives');archived.replaceChildren(...(data.history||[]).map(x=>elem('div',
  (labels[x.plan_code]||x.plan_code)+' · '+x.stripe_status+' · Archivada '+when(x.archived_at),'entry')));
 if(!(data.history||[]).length)archived.append(elem('p','Sin simulaciones anteriores archivadas.','muted'));
 const attempts=$('checkouts');attempts.replaceChildren(...(data.checkouts||[]).map(x=>elem('div',
  (labels[x.plan_code]||x.plan_code)+' · '+(stateLabels[x.status]||x.status)+' · '+when(x.created_at),'entry')));
 if(!(data.checkouts||[]).length)attempts.append(elem('p','Sin intentos todavía.','muted'));
 const events=$('events');events.replaceChildren(...(data.events||[]).map(x=>elem('div',
  x.event_type+' · '+(x.applied?'Procesado':'Sin cambios')+' · '+when(x.created_at),'entry')));
 if(!(data.events||[]).length)events.append(elem('p','Aún no hay webhooks verificados.','muted'));
}
async function load(){
 try{fill(await api('status'));}
 catch(error){$('notice').className='bad';$('notice').textContent=error.message;}
}
async function submit(path,body){
 const feedback=$('actionResult'),button=$(path==='checkout'?'checkout':'portal');
 if(!window.confirm('Vas a abrir Stripe en modo de pruebas. No utilices una tarjeta real ni confundas esta operación con un alta comercial. ¿Continuar?'))return;
 button.disabled=true;feedback.textContent='Preparando entorno de pruebas…';feedback.className='';
 try{
  const data=await api(path,{method:'POST',body:JSON.stringify(body)});
  if(!/^https:\/\//.test(data.url||''))throw Error('Stripe no devolvió una URL segura.');
  const url=new URL(data.url);
  if(url.hostname!==(path==='checkout'?'checkout.stripe.com':'billing.stripe.com'))throw Error('Destino no autorizado.');
  feedback.textContent='Abriendo Stripe TEST…';
  window.location.assign(data.url);
 }catch(error){feedback.textContent=error.message;feedback.className='bad';button.disabled=false;}
}
$('checkout').addEventListener('click',()=>submit('checkout',{planCode:$('testPlan').value}));
$('portal').addEventListener('click',()=>submit('portal',{}));
$('sync').addEventListener('click',async()=>{
 const button=$('sync'),msg=$('actionResult');button.disabled=true;msg.className='';msg.textContent='Consultando el estado actual en Stripe TEST…';
 try{
  await api('sync',{method:'POST',body:JSON.stringify({})});
  await load();msg.textContent='Estado actualizado desde Stripe TEST. No se han modificado las suscripciones comerciales.';
 }catch(error){msg.className='bad';msg.textContent=error.message==='stripe_test_sync_conflict'?
  'Stripe TEST ha cambiado durante la consulta o la suscripción ya está cancelada. Actualiza el panel y vuelve a comprobar el estado; no se han sobrescrito los cambios.':error.message;}
 finally{button.disabled=false;}
});
load();
