(()=>{
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let taskStatus='open';
let taskPriority='all';
let taskSearch='';
let taskSearchTimer=null;

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
document.addEventListener('DOMContentLoaded',()=>setTimeout(loadTasks,150));
window.RedLibertadCreatorOps={loadTasks,opsApi,notify,esc,metric};
})();