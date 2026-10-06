(()=>{
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let taskStatus='open';
let taskPriority='all';
let taskSearch='';
let taskSearchTimer=null;
let crmPriority='all';
let crmSearch='';
let crmSearchTimer=null;

async function opsApi(url,options={}){
  const response=await fetch(url,options);
  let data={};
  try{data=await response.json();}catch(_){}
  return {response,data};
}
function notify(message){
  const toast=q('#toast');
  if(toast){
    toast.textContent=message;
    toast.classList.remove('hidden');
    setTimeout(()=>toast.classList.add('hidden'),2400);
  }
}
function localDateTimeIso(value){
  if(!value)return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
function metric(label,value){
  return `<div class="creator-ops-metric"><b>${esc(value)}</b><small>${esc(label)}</small></div>`;
}
function taskDueLabel(task){
  if(!task.due_at)return 'Sin fecha';
  const date=new Date(task.due_at);
  if(!Number.isFinite(date.getTime()))return 'Sin fecha';
  return date.toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
function taskCard(task){
  const overdue=task.status==='open' && task.due_at && new Date(task.due_at).getTime()<Date.now();
  const completed=task.status==='completed';
  return `<article class="creator-task-card ${task.priority==='high'?'high':''} ${overdue?'overdue':''} ${completed?'completed':''}" data-task-id="${task.id}">
    <div>
      <h4>${esc(task.title)}</h4>
      ${task.note?`<p>${esc(task.note)}</p>`:''}
      <div class="creator-task-meta">
        <span>${task.priority==='high'?'Prioridad alta':'Prioridad normal'}</span>
        <span class="${overdue?'danger':''}">${completed?'Completada '+taskDueLabel({due_at:task.completed_at}):taskDueLabel(task)}</span>
        ${task.related_display_name?`<span>Persona: ${esc(task.related_display_name)}</span>`:''}
        ${task.post_id?`<span>Post #${esc(task.post_id)}</span>`:''}
      </div>
    </div>
    <div class="creator-task-actions">
      ${completed
        ? `<button type="button" data-task-action="reopen">Reabrir</button>`
        : `<select data-task-reschedule aria-label="Reprogramar">
             <option value="">Reprogramar…</option>
             <option value="hour">+1 hora</option>
             <option value="tomorrow">Mañana 09:00</option>
             <option value="week">+7 días</option>
             <option value="none">Sin fecha</option>
           </select>
           <button type="button" data-task-action="toggle-priority">${task.priority==='high'?'Prioridad normal':'Prioridad alta'}</button>
           <button type="button" data-task-action="complete">Completar</button>`}
    </div>
  </article>`;
}
function taskPreset(value){
  const d=new Date();
  if(value==='hour')d.setTime(d.getTime()+60*60*1000);
  else if(value==='tomorrow'){d.setDate(d.getDate()+1);d.setHours(9,0,0,0);}
  else if(value==='week')d.setDate(d.getDate()+7);
  else if(value==='none')return null;
  else return undefined;
  return d.toISOString();
}
async function loadTasks(){
  const root=q('#creatorTaskList');
  if(!root)return;
  root.innerHTML='<div class="creator-ops-empty">Cargando tareas…</div>';
  const params=new URLSearchParams({status:taskStatus,priority:taskPriority,q:taskSearch});
  const {response,data}=await opsApi('/api/creator/tasks?'+params.toString());
  if(response.status===403){
    q('#creatorTasksSection')?.classList.add('hidden');
    return;
  }
  if(!response.ok){
    root.innerHTML='<div class="creator-ops-empty">No se pudieron cargar las tareas.</div>';
    return;
  }
  const s=data.summary||{};
  const summary=q('#creatorTasksSummary');
  if(summary)summary.innerHTML=[
    metric('Pendientes',s.open||0),
    metric('Prioridad alta',s.high||0),
    metric('Vencidas',s.overdue||0),
    metric('Completadas · 30 días',s.completed_30d||0)
  ].join('');
  qa('[data-task-status]').forEach(button=>button.classList.toggle('active',button.dataset.taskStatus===taskStatus));
  root.innerHTML=(data.tasks||[]).length?(data.tasks||[]).map(taskCard).join(''):'<div class="creator-ops-empty">No hay tareas en este filtro.</div>';
}
q('#creatorTaskForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const fd=new FormData(form);
  const payload={
    title:String(fd.get('title')||'').trim(),
    note:String(fd.get('note')||'').trim(),
    priority:String(fd.get('priority')||'normal'),
    dueAt:localDateTimeIso(String(fd.get('dueAt')||''))
  };
  const {response}=await opsApi('/api/creator/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok){notify('No se pudo crear la tarea');return;}
  form.reset();
  notify('Tarea creada');
  await loadTasks();
});
qa('[data-task-status]').forEach(button=>button.addEventListener('click',async()=>{
  taskStatus=button.dataset.taskStatus||'open';
  await loadTasks();
}));
q('#creatorTaskPriority')?.addEventListener('change',async event=>{
  taskPriority=event.currentTarget.value||'all';
  await loadTasks();
});
q('#creatorTaskSearch')?.addEventListener('input',event=>{
  taskSearch=String(event.currentTarget.value||'').trim();
  clearTimeout(taskSearchTimer);
  taskSearchTimer=setTimeout(loadTasks,260);
});
q('#creatorTaskList')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-task-action]');
  if(!button)return;
  const card=button.closest('[data-task-id]');
  if(!card)return;
  const id=card.dataset.taskId;
  const action=button.dataset.taskAction;
  let payload={};
  if(action==='complete')payload={status:'completed'};
  if(action==='reopen')payload={status:'open'};
  if(action==='toggle-priority')payload={priority:button.textContent.includes('normal')?'normal':'high'};
  button.disabled=true;
  const {response}=await opsApi('/api/creator/tasks/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok){button.disabled=false;notify('No se pudo actualizar la tarea');return;}
  notify(action==='complete'?'Tarea completada':action==='reopen'?'Tarea reabierta':'Prioridad actualizada');
  await loadTasks();
});
q('#creatorTaskList')?.addEventListener('change',async event=>{
  const select=event.target.closest('[data-task-reschedule]');
  if(!select||!select.value)return;
  const card=select.closest('[data-task-id]');
  const dueAt=taskPreset(select.value);
  select.disabled=true;
  const {response}=await opsApi('/api/creator/tasks/'+encodeURIComponent(card.dataset.taskId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({dueAt})});
  if(!response.ok){select.disabled=false;select.value='';notify('No se pudo reprogramar');return;}
  notify('Tarea reprogramada');
  await loadTasks();
});
function crmAvatar(contact){
  if(contact.avatar_url)return `<img class="creator-crm-avatar" src="${esc(contact.avatar_url)}" alt="">`;
  const initial=String(contact.display_name||contact.username||'?').trim().charAt(0).toUpperCase();
  return `<span class="creator-crm-avatar creator-crm-avatar-fallback">${esc(initial)}</span>`;
}
function crmCard(contact){
  const labels=Array.isArray(contact.labels)?contact.labels:[];
  const last=contact.last_interaction_at?new Date(contact.last_interaction_at):null;
  const lastLabel=last&&Number.isFinite(last.getTime())?last.toLocaleDateString('es-ES',{day:'2-digit',month:'short'}):'Sin actividad reciente';
  return `<article class="creator-crm-card ${contact.priority==='high'?'high':''}" data-crm-id="${contact.id}" data-crm-user="${esc(contact.username)}">
    <div class="creator-crm-head">
      ${crmAvatar(contact)}
      <div>
        <b>${esc(contact.display_name||contact.username)} ${contact.creator_verified?'✓':''}</b>
        <small>@${esc(contact.username)} · ${contact.is_follower?'Seguidor':'Participante'}${contact.is_vip?' · VIP':''}</small>
      </div>
      <button type="button" data-crm-create-task>+ Tarea</button>
    </div>
    <div class="creator-crm-signals">
      <span>${Number(contact.interaction_count_30d||0)} interacciones · 30d</span>
      <span>${esc(lastLabel)}</span>
      <span>${Number(contact.open_task_count||0)} tareas abiertas</span>
    </div>
    <div class="creator-crm-editor">
      <select data-crm-field="priority" aria-label="Prioridad CRM">
        <option value="normal" ${contact.priority==='normal'?'selected':''}>Prioridad normal</option>
        <option value="high" ${contact.priority==='high'?'selected':''}>Prioridad alta</option>
      </select>
      <input data-crm-field="labels" maxlength="320" value="${esc(labels.join(', '))}" placeholder="Etiquetas separadas por comas">
      <textarea data-crm-field="note" maxlength="1000" placeholder="Nota privada…">${esc(contact.private_note||'')}</textarea>
      <button type="button" class="primary-soft" data-crm-save>Guardar ficha</button>
    </div>
  </article>`;
}
async function loadCrm(){
  const root=q('#creatorCrmList');
  if(!root)return;
  root.innerHTML='<div class="creator-ops-empty">Cargando relaciones…</div>';
  const params=new URLSearchParams({priority:crmPriority,q:crmSearch});
  const {response,data}=await opsApi('/api/creator/contacts?'+params.toString());
  if(response.status===403){q('#creatorCrmSection')?.classList.add('hidden');return;}
  if(!response.ok){root.innerHTML='<div class="creator-ops-empty">No se pudo cargar el CRM.</div>';return;}
  const s=data.summary||{};
  const summary=q('#creatorCrmSummary');
  if(summary)summary.innerHTML=[
    metric('Personas',s.total||0),
    metric('Seguidores',s.followers||0),
    metric('VIP',s.vip||0),
    metric('Prioridad alta',s.high_priority||0)
  ].join('');
  qa('[data-crm-priority]').forEach(button=>button.classList.toggle('active',button.dataset.crmPriority===crmPriority));
  root.innerHTML=(data.contacts||[]).length?(data.contacts||[]).map(crmCard).join(''):'<div class="creator-ops-empty">No hay personas en este filtro.</div>';
}
qa('[data-crm-priority]').forEach(button=>button.addEventListener('click',async()=>{
  crmPriority=button.dataset.crmPriority||'all';
  await loadCrm();
}));
q('#creatorCrmSearch')?.addEventListener('input',event=>{
  crmSearch=String(event.currentTarget.value||'').trim();
  clearTimeout(crmSearchTimer);
  crmSearchTimer=setTimeout(loadCrm,260);
});
q('#creatorCrmList')?.addEventListener('click',async event=>{
  const card=event.target.closest('[data-crm-id]');
  if(!card)return;
  const id=card.dataset.crmId;
  if(event.target.closest('[data-crm-save]')){
    const labels=String(q('[data-crm-field="labels"]',card)?.value||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,10);
    const payload={
      priority:q('[data-crm-field="priority"]',card)?.value||'normal',
      privateNote:String(q('[data-crm-field="note"]',card)?.value||'').trim(),
      labels
    };
    const button=event.target.closest('[data-crm-save]');
    button.disabled=true;
    const {response}=await opsApi('/api/creator/contacts/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!response.ok){button.disabled=false;notify('No se pudo guardar la ficha');return;}
    notify('Ficha privada guardada');
    await loadCrm();
    return;
  }
  if(event.target.closest('[data-crm-create-task]')){
    const username=card.dataset.crmUser||'persona';
    const button=event.target.closest('[data-crm-create-task]');
    button.disabled=true;
    const {response}=await opsApi('/api/creator/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      title:'Seguimiento con @'+username,
      note:'Creada desde Creator CRM',
      priority:'normal',
      dueAt:null,
      relatedUserId:id
    })});
    if(!response.ok){button.disabled=false;notify('No se pudo crear la tarea');return;}
    notify('Tarea relacionada creada');
    await Promise.all([loadCrm(),loadTasks()]);
  }
});

function segmentCard(segment,automatic=false){
  return `<article class="creator-segment-card" data-segment-id="${automatic?'':segment.id}" data-segment-key="${automatic?esc(segment.key):''}">
    <div>
      <b>${esc(segment.name)}</b>
      <small>${esc(segment.description||'Segmento manual privado')}</small>
    </div>
    <strong>${Number(segment.member_count||0)}</strong>
    <div class="creator-segment-actions">
      <button type="button" data-segment-view>Ver miembros</button>
      ${automatic?'':`<button type="button" class="danger-soft" data-segment-delete>Eliminar</button>`}
    </div>
    ${automatic?'':`<form data-segment-add class="creator-segment-add"><input name="username" maxlength="30" placeholder="@usuario" required><button type="submit">Añadir</button></form>`}
  </article>`;
}
async function loadSegments(){
  const auto=q('#creatorAutomaticSegments');
  const custom=q('#creatorCustomSegments');
  if(!auto||!custom)return;
  const {response,data}=await opsApi('/api/creator/segments');
  if(response.status===403){q('#creatorSegmentsSection')?.classList.add('hidden');return;}
  if(!response.ok){auto.innerHTML='<div class="creator-ops-empty">No se pudieron cargar los segmentos.</div>';return;}
  auto.innerHTML=(data.automatic||[]).map(x=>segmentCard(x,true)).join('');
  custom.innerHTML=(data.custom||[]).length?(data.custom||[]).map(x=>segmentCard(x,false)).join(''):'<div class="creator-ops-empty">Aún no has creado segmentos manuales.</div>';
}
function segmentMemberRow(member,segmentId=null){
  return `<div class="creator-segment-member">
    ${crmAvatar(member)}
    <span><b>${esc(member.display_name||member.username)}</b><small>@${esc(member.username)}</small></span>
    ${segmentId?`<button type="button" data-segment-remove-user="${member.id}" data-segment-remove-from="${segmentId}">Quitar</button>`:''}
  </div>`;
}
async function showSegmentMembers(card){
  const panel=q('#creatorSegmentMembers');
  if(!panel)return;
  const key=card.dataset.segmentKey;
  const id=card.dataset.segmentId;
  const url=key?'/api/creator/segments/auto/'+encodeURIComponent(key)+'/members':'/api/creator/segments/'+encodeURIComponent(id)+'/members';
  panel.classList.remove('hidden');
  panel.innerHTML='<div class="creator-ops-empty">Cargando miembros…</div>';
  const {response,data}=await opsApi(url);
  if(!response.ok){panel.innerHTML='<div class="creator-ops-empty">No se pudieron cargar los miembros.</div>';return;}
  const members=data.members||[];
  panel.innerHTML=`<div class="creator-segment-members-head"><b>${esc(data.segment?.name||card.querySelector('b')?.textContent||'Segmento')}</b><button type="button" data-segment-close>×</button></div>
    ${members.length?members.map(member=>segmentMemberRow(member,key?null:id)).join(''):'<div class="creator-ops-empty">Este segmento está vacío.</div>'}`;
}
q('#creatorSegmentForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const name=String(new FormData(form).get('name')||'').trim();
  const {response}=await opsApi('/api/creator/segments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  if(!response.ok){notify('No se pudo crear el segmento');return;}
  form.reset();notify('Segmento creado');await loadSegments();
});
q('#creatorSegmentsSection')?.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-segment-add]');
  if(!form)return;
  event.preventDefault();
  const card=form.closest('[data-segment-id]');
  const username=String(new FormData(form).get('username')||'').trim();
  const {response}=await opsApi('/api/creator/segments/'+encodeURIComponent(card.dataset.segmentId)+'/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})});
  if(!response.ok){notify('No se pudo añadir a esa persona');return;}
  form.reset();notify('Persona añadida al segmento');await loadSegments();await showSegmentMembers(card);
});
q('#creatorSegmentsSection')?.addEventListener('click',async event=>{
  const card=event.target.closest('.creator-segment-card');
  if(event.target.closest('[data-segment-view]')&&card){await showSegmentMembers(card);return;}
  if(event.target.closest('[data-segment-delete]')&&card){
    if(!confirm('¿Eliminar este segmento manual?'))return;
    const {response}=await opsApi('/api/creator/segments/'+encodeURIComponent(card.dataset.segmentId),{method:'DELETE'});
    if(!response.ok){notify('No se pudo eliminar el segmento');return;}
    q('#creatorSegmentMembers')?.classList.add('hidden');notify('Segmento eliminado');await loadSegments();
  }
});
q('#creatorSegmentMembers')?.addEventListener('click',async event=>{
  if(event.target.closest('[data-segment-close]')){q('#creatorSegmentMembers')?.classList.add('hidden');return;}
  const remove=event.target.closest('[data-segment-remove-user]');
  if(!remove)return;
  const {response}=await opsApi('/api/creator/segments/'+encodeURIComponent(remove.dataset.segmentRemoveFrom)+'/members/'+encodeURIComponent(remove.dataset.segmentRemoveUser),{method:'DELETE'});
  if(!response.ok){notify('No se pudo quitar del segmento');return;}
  remove.closest('.creator-segment-member')?.remove();notify('Persona quitada del segmento');await loadSegments();
});

function communicationStatusLabel(status){
  return ({draft:'Borrador',scheduled:'Programado',sending:'Enviando',sent:'Enviado',cancelled:'Cancelado'})[status]||status;
}
function communicationAudienceLabel(item){
  if(item.audience_type==='all')return 'Todos';
  if(item.audience_type==='vip')return 'VIP';
  if(item.audience_type==='segment')return item.segment_name||'Segmento manual';
  return ({recent_followers:'Seguidores recientes',active_30d:'Más activos · 30 días',inactive_30d:'Sin interacción · 30 días',high_priority:'Prioridad alta CRM'})[item.audience_type]||item.audience_type;
}
function communicationCard(item){
  const when=item.sent_at||item.scheduled_for||item.updated_at;
  const whenLabel=when?new Date(when).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  const editable=['draft','scheduled'].includes(item.status);
  return `<article class="creator-communication-card" data-communication-id="${item.id}">
    <div class="creator-communication-head">
      <span class="creator-communication-state ${esc(item.status)}">${esc(communicationStatusLabel(item.status))}</span>
      <small>${esc(communicationAudienceLabel(item))} · ${esc(whenLabel)}</small>
    </div>
    <p>${esc(item.body)}</p>
    <div class="creator-communication-foot">
      <span>${item.status==='sent'?Number(item.recipient_count||0)+' destinatarios':'Privado hasta el envío'}</span>
      ${editable?`<div><button type="button" data-communication-send>Enviar ahora</button><button type="button" data-communication-cancel>Cancelar</button></div>`:''}
    </div>
  </article>`;
}
async function loadCommunicationAudiences(){
  const select=q('#creatorCommunicationAudience');
  if(!select)return;
  const current=select.value;
  qa('option[data-manual-segment]',select).forEach(option=>option.remove());
  const {response,data}=await opsApi('/api/creator/segments');
  if(response.ok){
    (data.custom||[]).forEach(segment=>{
      const option=document.createElement('option');
      option.value='segment:'+segment.id;
      option.dataset.manualSegment='1';
      option.textContent='Segmento: '+segment.name;
      select.appendChild(option);
    });
  }
  if(qa('option',select).some(option=>option.value===current))select.value=current;
}
async function loadCommunications(){
  const root=q('#creatorCommunicationHistory');
  if(!root)return;
  await loadCommunicationAudiences();
  root.innerHTML='<div class="creator-ops-empty">Cargando comunicaciones…</div>';
  const {response,data}=await opsApi('/api/creator/communications');
  if(response.status===403){q('#creatorCommunicationsSection')?.classList.add('hidden');return;}
  if(!response.ok){root.innerHTML='<div class="creator-ops-empty">No se pudo cargar el centro de comunicaciones.</div>';return;}
  const next=data.nextSendAt?new Date(data.nextSendAt):null;
  const hint=q('#creatorCommunicationHint');
  if(hint)hint.textContent=next&&next.getTime()>Date.now()
    ? 'Próximo envío disponible: '+next.toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
    : 'Puedes enviar ahora. Los envíos mantienen una ventana anti-spam de 24 horas.';
  root.innerHTML=(data.communications||[]).length?(data.communications||[]).map(communicationCard).join(''):'<div class="creator-ops-empty">Todavía no hay comunicaciones nuevas.</div>';
}
q('#creatorCommunicationMode')?.addEventListener('change',event=>{
  const schedule=q('#creatorCommunicationSchedule');
  if(schedule)schedule.disabled=event.currentTarget.value!=='schedule';
});
q('#creatorCommunicationForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const fd=new FormData(form);
  let audienceType=String(fd.get('audienceType')||'all');
  let segmentId=null;
  if(audienceType.startsWith('segment:')){segmentId=audienceType.split(':')[1];audienceType='segment';}
  const mode=String(fd.get('mode')||'draft');
  const payload={
    body:String(fd.get('body')||'').trim(),
    audienceType,segmentId,mode,
    scheduledFor:mode==='schedule'?localDateTimeIso(String(fd.get('scheduledFor')||'')):null
  };
  const {response,data}=await opsApi('/api/creator/communications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok){
    if(response.status===429&&data.nextSendAt){
      notify('Envío disponible '+new Date(data.nextSendAt).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}));
    }else notify('No se pudo guardar o enviar la comunicación');
    return;
  }
  form.reset();
  q('#creatorCommunicationSchedule').disabled=true;
  notify(mode==='send'?'Comunicación enviada':mode==='schedule'?'Comunicación programada':'Borrador guardado');
  await loadCommunications();
});
q('#creatorCommunicationHistory')?.addEventListener('click',async event=>{
  const card=event.target.closest('[data-communication-id]');
  if(!card)return;
  const id=card.dataset.communicationId;
  if(event.target.closest('[data-communication-send]')){
    const {response,data}=await opsApi('/api/creator/communications/'+encodeURIComponent(id)+'/send',{method:'POST'});
    if(!response.ok){
      if(response.status===429&&data.nextSendAt)notify('Todavía no puedes enviar: '+new Date(data.nextSendAt).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}));
      else notify('No se pudo enviar');
      return;
    }
    notify('Comunicación enviada');await loadCommunications();return;
  }
  if(event.target.closest('[data-communication-cancel]')){
    const {response}=await opsApi('/api/creator/communications/'+encodeURIComponent(id)+'/cancel',{method:'POST'});
    if(!response.ok){notify('No se pudo cancelar');return;}
    notify('Comunicación cancelada');await loadCommunications();
  }
});

document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>Promise.all([loadTasks(),loadCrm(),loadSegments(),loadCommunications()]),150));
window.RedLibertadCreatorOps={loadTasks,loadCrm,loadSegments,loadCommunications,opsApi,notify,esc,metric};
})();