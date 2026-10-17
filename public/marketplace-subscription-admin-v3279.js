'use strict';
const $=id=>document.getElementById(id);
const labels={free:'Gratis',pilot:'Piloto sin cuota',trialing:'En prueba',active:'Activa (registro)',grace:'En período de gracia',awaiting_review:'Vencida · pendiente de revisión',past_due:'Pago pendiente',canceled:'Cancelada',expired:'Finalizada'};
const actions={start_trial:'Iniciar prueba sin cuota',renew_trial:'Renovar prueba',schedule_cancel:'Programar cancelación',undo_cancel:'Retirar cancelación',grant_grace:'Conceder gracia',close_period:'Cerrar período vencido',restore_pilot:'Restaurar piloto gratuito'};
const errors={approved_store_required:'Se requiere una tienda aprobada.',confirm_pilot_change_required:'Debes confirmar expresamente el cambio de estado del piloto.',period_end_out_of_range:'El final debe ser futuro, inferior a un año y posterior al período actual.',trial_required:'Solo se puede renovar una prueba.',active_trial_required:'La cancelación requiere una prueba vigente.',ended_trial_required:'Esta acción requiere un período vencido.',grace_still_active:'La gracia sigue vigente.',grace_already_active:'Ya existe una gracia activa.',no_scheduled_cancellation:'No hay cancelación programada.',invalid_transition:'Cambio no permitido.',external_billing_managed:'La suscripción está gestionada por un proveedor de pago.',origin_not_allowed:'Operación bloqueada por seguridad. Recarga la página.',invalid_period_end:'Introduce una fecha válida.'};
let items=[];
function el(tag,value,cls){const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value??'');if(cls)e.className=cls;return e;}
function dateLabel(v){if(!v)return 'Sin fecha';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha';}
function field(where,title,input){const l=el('label',title,'field');l.append(input);where.append(l);return l;}
async function api(url,options={}){const resp=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});let data={};try{data=await resp.json();}catch{}if(!resp.ok)throw Error(errors[data.error]||data.error||'Error al consultar los datos.');return data;}
function possible(item){
 const s=item.account.recordedStatus,approved=item.approvedCount>0;
 if(!s)return approved?['start_trial','restore_pilot']:[];
 if(s==='pilot')return ['start_trial','restore_pilot'];
 if(s==='trialing'){
  const ops=['renew_trial',item.account.cancelAtPeriodEnd?'undo_cancel':'schedule_cancel'];
  if(item.account.status==='awaiting_review')ops.push('grant_grace','close_period');
  if(approved)ops.push('restore_pilot');
  return ops;
 }
 return approved?['restore_pilot','start_trial']:[];
}
function seller(item){
 const box=el('article',undefined,'seller'),head=el('div',undefined,'seller-head'),info=el('div');
 info.append(el('h3','@'+item.username));
 info.append(el('p',item.storeCount+' tienda(s), '+item.approvedCount+' aprobada(s)','meta'));
 head.append(info,el('span',labels[item.account.status]||item.account.status,'pill'));box.append(head);
 if(item.account.periodEndsAt)box.append(el('p','Final: '+dateLabel(item.account.periodEndsAt),'meta'));
 if(item.account.graceUntil)box.append(el('p','Gracia hasta: '+dateLabel(item.account.graceUntil),'meta'));
 if(item.account.cancelAtPeriodEnd)box.append(el('p','Cancelación programada al finalizar.','meta'));
 const buttons=el('div',undefined,'row'),open=el('button','Gestionar','secondary'),historyBtn=el('button','Historial','secondary');
 open.type='button';historyBtn.type='button';buttons.append(open,historyBtn);box.append(buttons);
 const form=el('form',undefined,'actions');form.hidden=true;box.append(form);
 const allowed=possible(item);
 if(!allowed.length){open.disabled=true;form.append(el('p','No hay operaciones disponibles.'));}
 else {
  const select=el('select');select.required=true;select.setAttribute('aria-label','Operación');
  allowed.forEach(a=>{const o=el('option',actions[a]);o.value=a;select.append(o);});
  field(form,'Acción',select);
  const end=el('input');end.type='datetime-local';const endWrap=field(form,'Nueva fecha de finalización',end);
  const grace=el('input');grace.type='number';grace.min='1';grace.max='30';grace.value='7';const graceWrap=field(form,'Días de gracia (1–30)',grace);
  form.append(el('p','Operación administrativa: no se cobra ni se desactiva el Marketplace.','meta'));
  const feedback=el('p','');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');form.append(feedback);
  const submit=el('button','Confirmar cambio');submit.type='submit';form.append(submit);
  const sync=()=>{endWrap.hidden=!['start_trial','renew_trial'].includes(select.value);graceWrap.hidden=select.value!=='grant_grace';};
  select.addEventListener('change',sync);sync();
  form.addEventListener('submit',async ev=>{
   ev.preventDefault();const action=select.value,body={action};
   if(['start_trial','renew_trial'].includes(action)){
    if(!end.value||Number.isNaN(new Date(end.value).getTime())){feedback.textContent='Indica una fecha válida.';return;}
    body.periodEndAt=new Date(end.value).toISOString();
   }
   if(action==='grant_grace')body.graceDays=Number(grace.value);
   if(['start_trial','restore_pilot'].includes(action))body.confirmPilotChange=true;
   if(!window.confirm('¿Confirmas «'+actions[action]+'» para @'+item.username+'? Esta operación no cobra cuotas ni desactiva anuncios y quedará registrada.'))return;
   submit.disabled=true;feedback.classList.remove('error');feedback.textContent='Guardando…';
   try{await api('/api/marketplace/subscriptions/admin/lifecycle/'+encodeURIComponent(item.sellerId)+'/action',{method:'POST',body:JSON.stringify(body)});await load();$('message').textContent='Cambio guardado y auditado correctamente.';}
   catch(e){feedback.classList.add('error');feedback.textContent=e.message;}
   finally{submit.disabled=false;}
  });
 }
 open.addEventListener('click',()=>{form.hidden=!form.hidden;open.textContent=form.hidden?'Gestionar':'Cerrar';});
 const log=el('div',undefined,'history');log.hidden=true;box.append(log);
 historyBtn.addEventListener('click',async()=>{
  if(!log.hidden){log.hidden=true;return;}
  log.hidden=false;log.textContent='Cargando historial…';
  try{const data=await api('/api/marketplace/subscriptions/admin/lifecycle/'+encodeURIComponent(item.sellerId)+'/history');
   log.replaceChildren(...(data.events||[]).map(event=>el('div',dateLabel(event.created_at)+' · '+(actions[event.event_type]||event.event_type)+' · '+(event.actor_username||'Administrador'),'event')));
   if(!(data.events||[]).length)log.append(el('p','Sin cambios registrados.','meta'));
  }catch(e){log.textContent=e.message;}
 });
 return box;
}
function paint(){
 const q=$('search').value.trim().toLocaleLowerCase('es'),filtered=items.filter(x=>String(x.username||'').toLocaleLowerCase('es').includes(q));
 $('sellers').replaceChildren(...filtered.map(seller));$('message').textContent=filtered.length+' vendedor(es).';
}
async function load(){
 $('message').classList.remove('error');$('message').textContent='Cargando vendedores…';
 try{const data=await api('/api/marketplace/subscriptions/admin/lifecycle');items=data.items||[];paint();}
 catch(e){$('message').classList.add('error');$('message').textContent=e.message;}
}
$('reload').addEventListener('click',load);$('search').addEventListener('input',paint);load();
