'use strict';
const byId=id=>document.getElementById(id);
function element(tag,text,className){
 const el=document.createElement(tag);
 if(text!==undefined)el.textContent=String(text??'');
 if(className)el.className=className;
 return el;
}
function renderStore(store){
 const box=element('article',undefined,'store');
 box.append(element('strong',store.name||'Tienda'));
 box.append(element('p',(store.platform||'Otra plataforma')+' · '+(store.store_url||'')));
 const label={approved:'Aprobada',pending:'Pendiente de revisión',draft:'Borrador',suspended:'Suspendida'}[store.status]||'Sin confirmar';
 box.append(element('p','Estado: '+label));
 return box;
}
function renderPlan(plan){
 const box=element('article',undefined,'plan'),description=element('div',undefined,'label');
 description.append(element('strong',plan.name));
 const info=plan.code==='particular'?'Publicaciones particulares sin cuota.':
  plan.code==='professional'?'Productos uno a uno; una tienda propuesta, sin importación masiva.':
  'Publicación individual y lotes CSV; sincronización automática y hasta tres tiendas propuestas.';
 description.append(element('p',info));
 if(!plan.available)description.append(element('small','Próximamente · no contratable'));
 box.append(description);
 const approved=plan.pricingState==='approved';
 const value=approved&&plan.monthlyPriceCents!==null?Number(plan.monthlyPriceCents):null;
 const euro=value===null?'Por definir':value===0?'Gratis':(value/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'})+'/mes';
 box.append(element('b',euro));
 return box;
}
async function load(){
 const notice=byId('notice');
 try{
  const response=await fetch('/api/marketplace/subscriptions/mine',{credentials:'same-origin',headers:{'Accept':'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error(response.status===401?'Inicia sesión para consultar tus tiendas.':'No se pudo consultar tu información.');
  const data=await response.json();
  if(!data.ok)throw new Error('No se pudieron cargar tus datos.');
  const titles={particular:'Particular',professional:'Profesional',professional_plus:'Profesional Plus'};
  const states={free:'Gratuita',pilot:'Piloto sin cuota',trialing:'En prueba',active:'Activa',past_due:'Pago pendiente',canceled:'Cancelada',expired:'Caducada',grace:'Período de gracia',awaiting_review:'Vencida · pendiente de revisión'};
  byId('currentPlan').textContent=titles[data.account.planCode]||'Modalidad sin definir';
  byId('currentState').textContent=states[data.account.status]||'Estado pendiente';
  byId('currentDetail').textContent=data.account.grandfathered?
   'Tu tienda aprobada conserva su funcionamiento actual. No se ha activado ninguna cuota ni fecha de vencimiento.':
   data.account.status==='free'?'Puedes seguir utilizando el Marketplace como particular sin pagar ninguna cuota.':
   data.account.status==='pilot'?'Tu tienda continúa en piloto sin cuota y sin vencimiento obligatorio.':
   'Este estado es informativo. Los cobros y las limitaciones por plan siguen desactivados.';
  if(data.account.periodEndsAt){
   const dt=new Date(data.account.periodEndsAt);
   if(!Number.isNaN(dt.getTime())){byId('endDate').hidden=false;byId('endDate').textContent='Fin de periodo registrado: '+dt.toLocaleDateString('es-ES');}
  }
  if(data.account.graceUntil){
   const dt=new Date(data.account.graceUntil);
   if(!Number.isNaN(dt.getTime())){byId('graceDate').hidden=false;byId('graceDate').textContent='Período de gracia hasta: '+dt.toLocaleDateString('es-ES');}
  }
  const stores=byId('stores');
  stores.replaceChildren(...(data.stores||[]).map(renderStore));
  if(!(data.stores||[]).length)stores.append(element('p','Todavía no tienes una tienda profesional vinculada.','muted'));
  const plans=byId('plans');
  plans.replaceChildren(...(data.plans||[]).map(renderPlan));
  if(data.isAdmin){
   byId('adminArea').hidden=false;
   const overview=await fetch('/api/marketplace/subscriptions/admin/overview',{credentials:'same-origin',cache:'no-store'});
   if(overview.ok){
    const out=await overview.json(),list=byId('adminItems');
    const stateLabel={pilot:'Piloto',free:'Gratuita',trialing:'Prueba',active:'Activa',past_due:'Pendiente',canceled:'Cancelada',expired:'Caducada'};
    list.replaceChildren(...(out.items||[]).map(item=>{
     const row=element('article',undefined,'admin-seller');
     row.append(element('strong','@'+item.username));
     row.append(element('p',(stateLabel[item.status]||item.status)+' · '+item.stores+' tienda(s)'));
     return row;
    }));
    if(!(out.items||[]).length)list.append(element('p','Sin comercios profesionales.','muted'));
   }else byId('adminItems').textContent='No se pudo cargar la vista administrativa.';
  }
  notice.textContent='';
  byId('content').hidden=false;
 }catch(error){notice.textContent=error.message||'No se pudo cargar el panel.';}
}
load();
