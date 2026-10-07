const $ = s => document.querySelector(s);
let reportCache = [];
let userCache = [];
let incidentCache = [];
let supportAdminCache = [];
let releaseControlState={features:[],cohorts:[],assignments:[],audit:[]};

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let data = {};
  try { data = await response.json(); } catch {}

  if (response.status === 401) {
    location.href = '/?login=1';
    throw new Error('unauthorized');
  }
  if (response.status === 403 && data.error === 'admin_required') {
    location.href = '/app?admin=denied';
    throw new Error('admin_required');
  }
  return { r: response, d: data };
}

function esc(s = '') {
  return String(s).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

function timeLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-ES');
}

function compact(value = 0) {
  const n = Number(value || 0);
  return n > 999 ? (n / 1000).toFixed(n > 9999 ? 0 : 1) + 'k' : String(n);
}

function statusLabel(status) {
  return ({ active:'Activa', suspended:'Suspendida', banned:'Bloqueada' })[status] || status;
}

function setAdminNotice(text, isError = false) {
  let box = document.getElementById('adminNotice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'adminNotice';
    box.className = 'admin-notice';
    document.body.appendChild(box);
  }
  box.classList.toggle('error', isError);
  box.textContent = text;
  box.hidden = false;
  clearTimeout(setAdminNotice._timer);
  setAdminNotice._timer = setTimeout(() => { box.hidden = true; }, 3000);
}

async function metrics() {
  const { r, d } = await api('/api/admin/dashboard');
  if (!r.ok) return;
  const items = [
    ['Usuarios', d.users],
    ['Activos', d.activeUsers],
    ['Suspendidos', d.suspendedUsers],
    ['Bloqueados', d.bannedUsers],
    ['Publicaciones', d.posts],
    ['Denuncias abiertas', d.openReports],
    ['Críticas', d.criticalReports],
    ['Verificados', d.verifiedCreators],
    ['Verificaciones pendientes', d.pendingVerifications],
    ['Avisos · 30 días', d.warnings30d]
  ];
  $('#metrics').innerHTML = items.map(([label,value]) =>
    `<div class="metric"><b>${compact(value)}</b><span>${esc(label)}</span></div>`
  ).join('');
}

function incidentStatusLabel(status){
  return ({open:'Abierta',monitoring:'En seguimiento',resolved:'Resuelta'})[status] || status;
}

function renderIncidents(){
  const root=$('#incidentList');
  if(!root)return;
  root.innerHTML=incidentCache.length
    ? incidentCache.map(item=>`<article class="incident-card ${esc(item.severity)} ${item.status==='resolved'?'resolved':''}">
        <div class="incident-card-head">
          <div><b>#${item.id} · ${esc(item.title)}</b><small>${timeLabel(item.created_at)} · por @${esc(item.created_by_username||'admin')}</small></div>
          <span class="incident-state ${esc(item.status)}">${esc(incidentStatusLabel(item.status))} · ${esc(item.severity)}</span>
        </div>
        ${item.note ? `<p>${esc(item.note)}</p>` : ''}
        <span class="incident-card-meta">Última actualización ${timeLabel(item.updated_at)}${item.updated_by_username ? ' · @'+esc(item.updated_by_username) : ''}</span>
        <div class="actions">
          ${item.status!=='monitoring' && item.status!=='resolved' ? `<button class="soft" data-admin-action="incident-status" data-id="${item.id}" data-status="monitoring">Seguir</button>` : ''}
          ${item.status!=='resolved' ? `<button class="alt" data-admin-action="incident-status" data-id="${item.id}" data-status="resolved">Resolver</button>` : `<button class="soft" data-admin-action="incident-status" data-id="${item.id}" data-status="open">Reabrir</button>`}
          <button data-admin-action="incident-note" data-id="${item.id}">Editar nota</button>
        </div>
      </article>`).join('')
    : '<div class="empty-admin">No hay incidencias operativas registradas.</div>';
}

async function seoHealth(){
  const metricsRoot=$('#seoHealthMetrics');
  const sitemapRoot=$('#seoSitemapList');
  const ruleRoot=$('#seoRuleList');
  const warningRoot=$('#seoHealthWarnings');
  const noteRoot=$('#seoHealthNote');

  if(metricsRoot)metricsRoot.innerHTML='<div class="empty-admin">Comprobando SEO...</div>';
  if(sitemapRoot)sitemapRoot.innerHTML='';
  if(ruleRoot)ruleRoot.innerHTML='';
  if(warningRoot)warningRoot.innerHTML='';

  const {r,d}=await api('/api/admin/seo-health');
  if(!r.ok){
    if(metricsRoot)metricsRoot.innerHTML='<div class="empty-admin">No se pudo comprobar el estado SEO.</div>';
    return;
  }

  const c=d.counts||{};
  const cards=[
    ['URLs indexables',Number(d.totalIndexable||0)],
    ['Perfiles',Number(c.profiles||0)],
    ['Publicaciones',Number(c.posts||0)],
    ['Reels',Number(c.reels||0)],
    ['Comunidades',Number(c.communities||0)],
    ['Eventos',Number(c.events||0)]
  ];
  if(metricsRoot){
    metricsRoot.innerHTML=cards.map(([label,value])=>'<div class="beta-metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join('');
  }

  const sitemaps=Array.isArray(d.sitemaps)?d.sitemaps:[];
  if(sitemapRoot){
    sitemapRoot.innerHTML=sitemaps.map(item=>
      '<article class="seo-sitemap-card"><div><b>'+esc(item.label)+'</b><small>'+esc(item.path)+'</small></div><div class="seo-sitemap-side"><span class="state '+(item.status==='ok'?'':'warning-state')+'">'+(item.status==='ok'?'Activo':'Vacío')+'</span><b>'+Number(item.count||0)+'</b><a href="'+esc(item.path)+'" target="_blank" rel="noopener">Abrir ↗</a></div></article>'
    ).join('') || '<div class="empty-admin">Sin sitemaps.</div>';
  }

  const crawl=d.crawl||{},p=d.protected||{};
  const rules=[
    ['Reels con canonical único',crawl.legacyReelPostRedirect301&&crawl.mainSitemapExcludesReels],
    ['Stories fuera del índice',crawl.storiesIndexed===false],
    ['Búsquedas con consulta fuera del índice',crawl.searchQueriesIndexed===false],
    ['Eventos de admin excluidos',crawl.adminEventsExcluded===true],
    ['Contenido sensible protegido',true],
    ['Audiencias privadas protegidas',true]
  ];
  if(ruleRoot){
    ruleRoot.innerHTML=rules.map(([label,ok])=>
      '<article class="seo-rule-card"><span class="seo-rule-icon">'+(ok?'✓':'!')+'</span><span>'+esc(label)+'</span></article>'
    ).join('')+
      '<div class="seo-protected-summary"><small>Protegidos actualmente</small><b>'+Number(p.sensitivePublic||0)+' sensibles · '+Number(p.privateAudience||0)+' privados · '+Number(p.hiddenAuthorPosts||0)+' de autores ocultos · '+Number(p.adminEventsSuppressed||0)+' eventos admin</b></div>';
  }

  const warnings=Array.isArray(d.warnings)?d.warnings:[];
  if(warningRoot){
    warningRoot.innerHTML=warnings.length
      ? warnings.map(item=>'<div class="seo-warning '+(item.level==='warning'?'warning':'info')+'"><b>'+(item.level==='warning'?'Atención':'Info')+'</b><span>'+esc(item.text||'')+'</span></div>').join('')
      : '<div class="seo-warning ok"><b>Correcto</b><span>No hay alertas internas de rastreo.</span></div>';
  }

  if(noteRoot){
    noteRoot.textContent='Estimación interna generada '+timeLabel(d.generatedAt)+'. '+String(d.searchConsole?.note||'')+' Sitemap recomendado en Search Console: '+String(d.searchConsole?.recommendedSitemap||'/sitemap-index.xml')+'.';
  }
}

function growthSourceTypeLabel(type){
  return ({
    profile:'Perfil',
    post:'Publicación',
    community:'Comunidad',
    event:'Evento',
    reel:'Reel',
    topic:'Tema',
    story:'Historia'
  })[type] || type || 'Origen';
}

function growthSourceLabel(item){
  const type=growthSourceTypeLabel(item?.sourceType);
  const key=String(item?.sourceKey||'');
  if(item?.sourceType==='profile')return '@'+key;
  if(item?.sourceType==='topic')return 'Tema · '+key;
  return type+' #'+key;
}

async function growthAttribution(){
  const days=String($('#growthAttributionDays')?.value||'30')==='7'?'7':'30';
  const metricsRoot=$('#growthAttributionMetrics');
  const typeRoot=$('#growthAttributionTypes');
  const sourceRoot=$('#growthAttributionSources');
  const dailyRoot=$('#growthAttributionDaily');
  const coverageRoot=$('#growthAttributionCoverage');

  if(metricsRoot)metricsRoot.innerHTML='<div class="empty-admin">Cargando atribución...</div>';
  if(typeRoot)typeRoot.innerHTML='';
  if(sourceRoot)sourceRoot.innerHTML='';
  if(dailyRoot)dailyRoot.innerHTML='';

  const {r,d}=await api('/api/admin/growth-attribution?days='+encodeURIComponent(days));
  if(!r.ok){
    if(metricsRoot)metricsRoot.innerHTML='<div class="empty-admin">No se pudo cargar la atribución de altas.</div>';
    return;
  }

  const m=d.metrics||{};
  const cards=[
    ['Altas · '+d.windowDays+' días',m.newUsers],
    ['Con origen público',m.attributedSignups],
    ['Atribución',Number(m.attributionRate||0)+'%'],
    ['Atribuidas activadas',m.activatedAttributed],
    ['Activación atribuida',Number(m.activationRate||0)+'%'],
    ['Con invitación',m.invitedSignups]
  ];
  if(metricsRoot){
    metricsRoot.innerHTML=cards.map(([label,value])=>'<div class="beta-metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join('');
  }

  const byType=Array.isArray(d.byType)?d.byType:[];
  if(typeRoot){
    typeRoot.innerHTML=byType.length
      ? byType.map(item=>{
          const signups=Number(item.signups||0);
          const activated=Number(item.activated||0);
          const rate=signups?Math.round((activated/signups)*100):0;
          return '<article class="growth-type-card"><div><b>'+esc(growthSourceTypeLabel(item.sourceType))+'</b><small>'+signups+' altas · '+activated+' activadas</small></div><span>'+rate+'%</span></article>';
        }).join('')
      : '<div class="empty-admin">Todavía no hay altas atribuidas en este periodo.</div>';
  }

  const topSources=Array.isArray(d.topSources)?d.topSources:[];
  if(sourceRoot){
    sourceRoot.innerHTML=topSources.length
      ? topSources.map(item=>{
          const signups=Number(item.signups||0);
          const activated=Number(item.activated||0);
          const rate=signups?Math.round((activated/signups)*100):0;
          const path=String(item.sourcePath||'');
          return '<article class="growth-source-card"><div><span class="growth-source-type">'+esc(growthSourceTypeLabel(item.sourceType))+'</span><b>'+esc(growthSourceLabel(item))+'</b><small>'+signups+' altas · '+activated+' activadas · '+rate+'% activación</small></div>'+(path.startsWith('/')?'<a href="'+esc(path)+'" target="_blank" rel="noopener">Abrir origen ↗</a>':'')+'</article>';
        }).join('')
      : '<div class="empty-admin">Aún no hay orígenes suficientes para ordenar.</div>';
  }

  const daily=Array.isArray(d.daily)?d.daily:[];
  if(dailyRoot){
    const max=Math.max(1,...daily.map(item=>Number(item.signups||0)));
    dailyRoot.innerHTML=daily.map(item=>{
      const n=Number(item.signups||0);
      const date=new Date(item.day);
      const label=Number.isNaN(date.getTime())?String(item.day||''):date.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'});
      const height=n?Math.max(8,Math.round((n/max)*100)):4;
      return '<div class="growth-day" title="'+esc(label+' · '+n+' altas')+'"><b style="height:'+height+'%"></b><span>'+esc(label)+'</span><small>'+n+'</small></div>';
    }).join('');
  }

  if(coverageRoot){
    const started=d.coverage?.firstAttributionAt?timeLabel(d.coverage.firstAttributionAt):'sin altas atribuidas todavía';
    coverageRoot.textContent='Cobertura desde '+started+'. No es retroactiva. “Con invitación” puede solaparse con “Con origen público”. Sin tracking externo ni datos personales en este panel.';
  }
}

async function betaOps(){
  const metricsRoot=$('#betaOpsMetrics');
  const healthRoot=$('#betaHealth');
  if(metricsRoot)metricsRoot.innerHTML='<div class="empty-admin">Cargando señales beta...</div>';

  const [ops,health,ready]=await Promise.all([
    api('/api/admin/beta-ops'),
    api('/api/health'),
    api('/api/ready')
  ]);

  if(!ops.r.ok){
    if(metricsRoot)metricsRoot.innerHTML='<div class="empty-admin">No se pudieron cargar las métricas beta.</div>';
    return;
  }

  const m=ops.d.metrics || {};
  const cards=[
    ['Altas · 24 h',m.newUsers24h],
    ['Altas · 7 días',m.newUsers7d],
    ['Activados · 7 días',m.activatedUsers7d],
    ['Activación · 7 días',`${Number(m.activationRate7d||0)}%`],
    ['Usuarios sociales · 7 días',m.activeSocialUsers7d],
    ['Posts · 24 h',m.posts24h],
    ['Mensajes · 24 h',m.messages24h],
    ['Nuevos follows · 24 h',m.follows24h],
    ['Denuncias · 24 h',m.reports24h],
    ['Incidencias abiertas',m.openIncidents],
    ['Incidencias críticas',m.criticalIncidents]
  ];
  if(metricsRoot){
    metricsRoot.innerHTML=cards.map(([label,value])=>`<div class="beta-metric"><b>${typeof value==='number'?compact(value):esc(value)}</b><span>${esc(label)}</span></div>`).join('');
  }

  incidentCache=Array.isArray(ops.d.incidents)?ops.d.incidents:[];
  renderIncidents();

  if(healthRoot){
    const configOk=health.r.ok && health.d.configuration?.criticalReady===true;
    const readyOk=ready.r.ok && ready.d.database==='ready';
    healthRoot.innerHTML=`
      <span class="beta-health-chip ${readyOk?'':'danger'}">Base de datos · ${readyOk?'lista':'revisar'}</span>
      <span class="beta-health-chip ${configOk?'':'warning'}">Configuración · ${configOk?'correcta':'con avisos'}</span>
      <span class="beta-health-chip">Versión · ${esc(health.d.version||'—')}</span>
      <span class="beta-health-chip">Uptime · ${compact(Math.floor(Number(health.d.uptimeSeconds||0)/60))} min</span>
    `;
  }

  const privacy=$('#betaPrivacyNote');
  if(privacy){
    privacy.textContent='Métricas agregadas a partir de actividad necesaria para el producto. Sin tracking externo y sin analizar el contenido de los mensajes.';
  }
}

async function updateIncident(id,payload,button){
  if(button)button.disabled=true;
  try{
    const {r,d}=await api('/api/admin/incidents/'+encodeURIComponent(id),{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!r.ok){
      setAdminNotice('No se pudo actualizar la incidencia.',true);
      return;
    }
    setAdminNotice('Incidencia actualizada.');
    await betaOps();
  }finally{
    if(button&&button.isConnected)button.disabled=false;
  }
}




function releaseAuditActionLabel(action){
  return ({
    cohort_create:'Cohorte creada',
    cohort_update:'Cohorte actualizada',
    member_add:'Miembro añadido',
    member_remove:'Miembro retirado',
    feature_create:'Función creada',
    feature_update:'Función actualizada',
    cohort_assign:'Cohorte asignada',
    cohort_remove:'Cohorte retirada',
    rollback:'Rollback aplicado',
    rollout_wave:'Ola de despliegue actualizada',
    rollout_freeze:'Expansión congelada/reanudada'
  })[action] || action;
}

function releaseAuditSummary(item){
  const before=item.before_state||null;
  const after=item.after_state||null;
  if(!before||!after)return 'Configuración inicial registrada.';
  if(item.target_type==='feature'){
    const changes=[];
    if(before.enabled!==after.enabled)changes.push(after.enabled?'reactivada':'apagada');
    if(before.default_enabled!==after.default_enabled)changes.push(after.default_enabled?'activada para todos':'limitada a cohortes');
    if(Number(before.rollout_percentage||0)!==Number(after.rollout_percentage||0))changes.push('ola '+Number(before.rollout_percentage||0)+'% → '+Number(after.rollout_percentage||0)+'%');
    if(before.rollout_stage!==after.rollout_stage)changes.push('fase '+String(before.rollout_stage||'cohorts')+' → '+String(after.rollout_stage||'cohorts'));
    if(before.rollout_frozen!==after.rollout_frozen)changes.push(after.rollout_frozen?'expansión congelada':'expansión reanudada');
    const beforeCount=Array.isArray(before.cohorts)?before.cohorts.length:0;
    const afterCount=Array.isArray(after.cohorts)?after.cohorts.length:0;
    if(beforeCount!==afterCount)changes.push('cohortes '+beforeCount+' → '+afterCount);
    return changes.length?changes.join(' · '):'Configuración de función modificada.';
  }
  const changes=[];
  if(before.enabled!==after.enabled)changes.push(after.enabled?'cohorte reanudada':'cohorte pausada');
  const beforeMembers=Array.isArray(before.members)?before.members.length:0;
  const afterMembers=Array.isArray(after.members)?after.members.length:0;
  if(beforeMembers!==afterMembers)changes.push('miembros '+beforeMembers+' → '+afterMembers);
  if(before.name!==after.name)changes.push('nombre actualizado');
  return changes.length?changes.join(' · '):'Configuración de cohorte modificada.';
}

function renderReleaseAudit(){
  const root=$('#releaseAuditList');
  if(!root)return;
  const entries=Array.isArray(releaseControlState.audit)?releaseControlState.audit:[];
  root.innerHTML=entries.length
    ? entries.map(item=>`<article class="release-audit-card ${item.rolled_back_at?'rolled-back':''}">
        <div class="release-audit-main">
          <div>
            <b>#${item.id} · ${esc(releaseAuditActionLabel(item.action))}</b>
            <small>${esc(item.target_type==='feature'?'Función':'Cohorte')} · ${esc(item.target_key)} · ${timeLabel(item.created_at)}</small>
          </div>
          <span class="release-audit-actor">@${esc(item.actor_username||'admin')}</span>
        </div>
        <p>${esc(releaseAuditSummary(item))}</p>
        <div class="release-audit-meta">
          ${item.request_id?`<span>Ref. ${esc(String(item.request_id).slice(0,24))}</span>`:''}
          ${item.rollback_of?`<span>Rollback de #${item.rollback_of}</span>`:''}
          ${item.rolled_back_at?`<span>Restaurado ${timeLabel(item.rolled_back_at)}${item.rolled_back_by_username?' por @'+esc(item.rolled_back_by_username):''}</span>`:''}
        </div>
        ${item.canRollback?`<div class="actions"><button class="alt" data-admin-action="release-rollback" data-id="${item.id}">Restaurar estado anterior</button></div>`:''}
      </article>`).join('')
    : '<div class="empty-admin">Todavía no hay cambios auditados en release control.</div>';
}

async function rollbackReleaseAudit(id,button){
  if(!window.confirm('¿Restaurar el estado anterior de este cambio? Solo se aplicará si no hay cambios posteriores que entren en conflicto.'))return;
  if(button)button.disabled=true;
  try{
    const {r,d}=await api('/api/release/admin/audit/'+encodeURIComponent(id)+'/rollback',{method:'POST'});
    if(!r.ok){
      if(d.error==='rollback_conflict')setAdminNotice('Rollback bloqueado: la configuración cambió después. Revisa el historial antes de restaurar.',true);
      else if(d.error==='already_rolled_back')setAdminNotice('Ese cambio ya fue restaurado.',true);
      else if(d.error==='rollback_not_supported')setAdminNotice('Ese cambio no tiene un estado anterior restaurable.',true);
      else setAdminNotice('No se pudo aplicar el rollback.',true);
      return;
    }
    setAdminNotice('Estado anterior restaurado.');
    await releaseControl();
  }finally{
    if(button&&button.isConnected)button.disabled=false;
  }
}


function rolloutStageLabel(stage){
  return ({cohorts:'Solo cohortes',pilot:'Piloto',expanded:'Beta ampliada',graduated:'Graduada'})[stage] || stage || 'Solo cohortes';
}

function rolloutSelection(feature){
  const pct=Number(feature.rollout_percentage||0);
  if(pct>=100)return '100';
  if(pct>=75)return '75';
  if(pct>=50)return '50';
  if(pct>=25)return '25';
  if(pct>=10)return '10';
  if(pct>=5)return '5';
  return '0';
}

async function updateFeatureRollout(key,payload,button){
  if(button)button.disabled=true;
  try{
    const {r,d}=await api('/api/release/admin/features/'+encodeURIComponent(key)+'/rollout',{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!r.ok){
      if(d.error==='rollout_frozen')setAdminNotice('La expansión está congelada. Reanúdala antes de cambiar de ola.',true);
      else setAdminNotice('No se pudo actualizar la ola de despliegue.',true);
      return;
    }
    setAdminNotice('Ola de despliegue actualizada.');
    await releaseControl();
  }finally{
    if(button&&button.isConnected)button.disabled=false;
  }
}

function releaseBool(value){ return value===true || value==='true'; }

function renderReleaseControl(){
  const cohortRoot=$('#cohortList');
  const featureRoot=$('#featureList');
  if(!cohortRoot||!featureRoot)return;

  const cohorts=Array.isArray(releaseControlState.cohorts)?releaseControlState.cohorts:[];
  const features=Array.isArray(releaseControlState.features)?releaseControlState.features:[];
  const assignments=Array.isArray(releaseControlState.assignments)?releaseControlState.assignments:[];

  cohortRoot.innerHTML=cohorts.length
    ? cohorts.map(cohort=>`<article class="release-card ${cohort.enabled?'':'paused'}">
        <div class="release-card-head">
          <div><b>${esc(cohort.name)}</b><small>${esc(cohort.cohort_key)} · ${Number(cohort.member_count||0)} miembros</small></div>
          <span class="release-state ${cohort.enabled?'':'paused'}">${cohort.enabled?'Activa':'Pausada'}</span>
        </div>
        ${cohort.description?`<p>${esc(cohort.description)}</p>`:''}
        <div class="release-inline">
          <input data-release-member-input="${cohort.id}" placeholder="@usuario">
          <button class="soft" data-admin-action="release-add-member" data-id="${cohort.id}">Añadir</button>
          <button class="${cohort.enabled?'alt':'soft'}" data-admin-action="release-toggle-cohort" data-id="${cohort.id}" data-enabled="${cohort.enabled?'1':'0'}">${cohort.enabled?'Pausar':'Reanudar'}</button>
        </div>
        <div class="release-members">${(cohort.members||[]).map(member=>`<span class="release-pill">@${esc(member.username)} <button aria-label="Quitar de cohorte" data-admin-action="release-remove-member" data-id="${cohort.id}" data-user-id="${member.user_id}">×</button></span>`).join('')}</div>
      </article>`).join('')
    : '<div class="empty-admin">Aún no hay cohortes beta.</div>';

  featureRoot.innerHTML=features.length
    ? features.map(feature=>{
        const assigned=assignments.filter(item=>item.feature_key===feature.feature_key);
        const percentage=Number(feature.rollout_percentage||0);
        const stage=feature.rollout_stage|| (feature.default_enabled?'graduated':'cohorts');
        const mode=!feature.enabled
          ? 'Apagada'
          : feature.rollout_frozen
            ? 'Congelada · '+rolloutStageLabel(stage)+(percentage?' '+percentage+'%':'')
            : rolloutStageLabel(stage)+(percentage?' · '+percentage+'%':'');
        const selected=rolloutSelection(feature);
        return `<article class="release-card ${feature.enabled?'':'paused'} ${feature.rollout_frozen?'rollout-frozen':''}">
          <div class="release-card-head">
            <div><b>${esc(feature.name)}</b><small>${esc(feature.feature_key)}</small></div>
            <span class="release-state ${!feature.enabled?'paused':feature.rollout_frozen?'frozen':stage==='graduated'?'':'cohorts'}">${esc(mode)}</span>
          </div>
          ${feature.description?`<p>${esc(feature.description)}</p>`:''}
          ${feature.rollout_note?`<div class="rollout-note"><b>Criterio / nota</b><span>${esc(feature.rollout_note)}</span></div>`:''}
          <div class="actions">
            <button class="${feature.enabled?'alt':'soft'}" data-admin-action="release-toggle-feature" data-key="${esc(feature.feature_key)}" data-enabled="${feature.enabled?'1':'0'}">${feature.enabled?'Kill switch':'Reactivar'}</button>
            <button class="soft" data-admin-action="release-toggle-freeze" data-key="${esc(feature.feature_key)}" data-frozen="${feature.rollout_frozen?'1':'0'}">${feature.rollout_frozen?'Reanudar expansión':'Congelar expansión'}</button>
          </div>
          <div class="rollout-wave-row">
            <select data-release-wave-select="${esc(feature.feature_key)}" ${feature.rollout_frozen?'disabled':''}>
              <option value="0" ${selected==='0'?'selected':''}>Solo cohortes</option>
              <option value="5" ${selected==='5'?'selected':''}>Piloto · 5%</option>
              <option value="10" ${selected==='10'?'selected':''}>Piloto · 10%</option>
              <option value="25" ${selected==='25'?'selected':''}>Beta ampliada · 25%</option>
              <option value="50" ${selected==='50'?'selected':''}>Beta ampliada · 50%</option>
              <option value="75" ${selected==='75'?'selected':''}>Beta ampliada · 75%</option>
              <option value="100" ${selected==='100'?'selected':''}>Graduar · 100%</option>
            </select>
            <button class="primary" data-admin-action="release-apply-wave" data-key="${esc(feature.feature_key)}" ${feature.rollout_frozen?'disabled':''}>Aplicar ola</button>
          </div>
          <div class="release-inline">
            <select data-release-cohort-select="${esc(feature.feature_key)}">
              <option value="">Añadir cohorte…</option>
              ${cohorts.filter(cohort=>!assigned.some(item=>String(item.cohort_id)===String(cohort.id))).map(cohort=>`<option value="${cohort.id}">${esc(cohort.name)}</option>`).join('')}
            </select>
            <button class="soft" data-admin-action="release-assign-cohort" data-key="${esc(feature.feature_key)}">Asignar</button>
          </div>
          <div class="release-assignments">${assigned.map(item=>`<span class="release-pill">${esc(item.cohort_name)} <button aria-label="Quitar cohorte" data-admin-action="release-remove-cohort" data-key="${esc(feature.feature_key)}" data-id="${item.cohort_id}">×</button></span>`).join('')}</div>
        </article>`;
      }).join('')
    : '<div class="empty-admin">No hay funciones registradas.</div>';
  renderReleaseAudit();
}

async function releaseControl(){
  const cohortRoot=$('#cohortList'),featureRoot=$('#featureList');
  if(cohortRoot)cohortRoot.innerHTML='<div class="empty-admin">Cargando cohortes...</div>';
  if(featureRoot)featureRoot.innerHTML='<div class="empty-admin">Cargando funciones...</div>';
  const {r,d}=await api('/api/release/admin');
  if(!r.ok){
    if(cohortRoot)cohortRoot.innerHTML='<div class="empty-admin">No se pudo cargar release control.</div>';
    if(featureRoot)featureRoot.innerHTML='';
    return;
  }
  releaseControlState={
    features:Array.isArray(d.features)?d.features:[],
    cohorts:Array.isArray(d.cohorts)?d.cohorts:[],
    assignments:Array.isArray(d.assignments)?d.assignments:[],
    audit:Array.isArray(d.audit)?d.audit:[]
  };
  renderReleaseControl();
}

async function releasePatchFeature(key,payload,button){
  if(button)button.disabled=true;
  try{
    const {r}=await api('/api/release/admin/features/'+encodeURIComponent(key),{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    if(!r.ok)return setAdminNotice('No se pudo actualizar la función.',true);
    await releaseControl();
  }finally{if(button&&button.isConnected)button.disabled=false;}
}

async function releasePatchCohort(id,payload,button){
  if(button)button.disabled=true;
  try{
    const {r}=await api('/api/release/admin/cohorts/'+encodeURIComponent(id),{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    if(!r.ok)return setAdminNotice('No se pudo actualizar la cohorte.',true);
    await releaseControl();
  }finally{if(button&&button.isConnected)button.disabled=false;}
}

function supportAdminTypeLabel(type){
  return ({bug:'Problema',suggestion:'Sugerencia',question:'Duda'})[type] || type;
}
function supportAdminStatusLabel(status){
  return ({new:'Recibido',reviewing:'En revisión',resolved:'Resuelto'})[status] || status;
}

function renderSupportAdmin(){
  const root=$('#supportAdminList');
  if(!root)return;
  root.innerHTML=supportAdminCache.length
    ? supportAdminCache.map(item=>{
        const context=item.context&&typeof item.context==='object'?item.context:{};
        const contextBits=[
          context.currentView ? 'Sección: '+context.currentView : '',
          context.viewportClass ? 'Pantalla: '+context.viewportClass : '',
          context.online===true ? 'Online' : context.online===false ? 'Offline' : '',
          context.appVersion ? 'Versión '+context.appVersion : '',
          item.request_id ? 'Ref. '+item.request_id.slice(0,18) : ''
        ].filter(Boolean);
        return `<article class="support-admin-card ${esc(item.type)} ${item.status==='resolved'?'resolved':''}">
          <div class="support-admin-head">
            <div><b>#${item.id} · ${esc(item.subject)}</b><small>${esc(item.display_name)} · @${esc(item.username)} · ${timeLabel(item.created_at)}</small></div>
            <span class="support-admin-state ${esc(item.status)}">${esc(supportAdminStatusLabel(item.status))} · ${esc(supportAdminTypeLabel(item.type))}</span>
          </div>
          <p>${esc(item.message)}</p>
          ${contextBits.length?`<div class="support-admin-context">${contextBits.map(bit=>`<span>${esc(bit)}</span>`).join('')}</div>`:''}
          ${item.admin_note?`<div class="support-admin-note"><b>Nota de soporte</b><p>${esc(item.admin_note)}</p></div>`:''}
          <div class="actions">
            ${item.status==='new'? `<button class="soft" data-admin-action="support-status" data-id="${item.id}" data-status="reviewing">Revisar</button>` : ''}
            ${item.status!=='resolved'? `<button class="alt" data-admin-action="support-status" data-id="${item.id}" data-status="resolved">Resolver</button>` : `<button class="soft" data-admin-action="support-status" data-id="${item.id}" data-status="reviewing">Reabrir</button>`}
            <button data-admin-action="support-note" data-id="${item.id}">Nota / respuesta</button>
          </div>
        </article>`;
      }).join('')
    : '<div class="empty-admin">No hay feedback en este filtro.</div>';
}

async function supportAdmin(){
  const root=$('#supportAdminList');
  if(!root)return;
  root.innerHTML='<div class="empty-admin">Cargando feedback...</div>';
  const status=$('#supportAdminStatus')?.value||'open';
  const type=$('#supportAdminType')?.value||'all';
  const {r,d}=await api('/api/support/admin?'+new URLSearchParams({status,type}).toString());
  if(!r.ok){
    root.innerHTML='<div class="empty-admin">No se pudo cargar el feedback.</div>';
    return;
  }
  supportAdminCache=Array.isArray(d.feedback)?d.feedback:[];
  renderSupportAdmin();
}

async function updateSupportAdmin(id,payload,button){
  if(button)button.disabled=true;
  try{
    const {r}=await api('/api/support/admin/'+encodeURIComponent(id),{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!r.ok){
      setAdminNotice('No se pudo actualizar el feedback.',true);
      return;
    }
    setAdminNotice('Feedback actualizado.');
    await supportAdmin();
  }finally{
    if(button&&button.isConnected)button.disabled=false;
  }
}

function filteredReports() {
  const mode = $('#reportFilter').value;
  if (mode === 'all') return reportCache;
  if (mode === 'critical') return reportCache.filter(r => r.status === 'open' && r.priority === 'critical');
  if (mode === 'resolved') return reportCache.filter(r => r.status !== 'open');
  return reportCache.filter(r => r.status === 'open');
}

function reportCard(r) {
  const target = r.target_username
    ? `<b>@${esc(r.target_username)}</b>`
    : `<b>${esc(r.target_type)} #${r.target_id}</b>`;
  const preview = r.target_preview
    ? `<div class="report-preview">${esc(r.target_preview)}</div>`
    : '';
  const targetModeration = r.target_user_id
    ? `<button class="soft" data-admin-action="open-moderation" data-user-id="${r.target_user_id}" data-user-label="@${esc(r.target_username || r.target_user_id)}">Moderar usuario</button>`
    : '';

  return `<article class="report ${r.priority === 'critical' ? 'critical' : ''} ${r.status !== 'open' ? 'closed' : ''}">
    <div class="report-top">
      <div><b>#${r.id} · ${esc(r.reason)}</b><small>${esc(r.target_type)} · ${target}</small></div>
      <span class="state ${r.priority === 'critical' ? 'danger-state' : ''}">${esc(r.priority)}</span>
    </div>
    <small>Denunciado por @${esc(r.reporter_username)} · ${timeLabel(r.created_at)}</small>
    ${preview}
    ${r.details ? `<p class="report-details">${esc(r.details)}</p>` : ''}
    ${r.status === 'open' ? `
      <div class="actions">
        <button data-admin-action="report-decision" data-id="${r.id}" data-status="resolved" data-decision="none">Resolver</button>
        ${r.target_type === 'post'
          ? `<button class="alt" data-admin-action="report-decision" data-id="${r.id}" data-status="resolved" data-decision="hide_post">Ocultar post</button>`
          : ''}
        ${targetModeration}
        <button class="soft" data-admin-action="report-decision" data-id="${r.id}" data-status="dismissed" data-decision="none">Descartar</button>
      </div>
    ` : `<div class="closed-meta"><b>${esc(r.status)}</b><span>${esc(r.moderator_note || 'Sin nota de moderación')}</span></div>`}
  </article>`;
}

function renderReports() {
  const rows = filteredReports();
  $('#reports').innerHTML = rows.length
    ? rows.map(reportCard).join('')
    : '<div class="empty-admin">No hay denuncias en este filtro.</div>';
}

async function reports() {
  $('#reports').innerHTML = '<div class="empty-admin">Cargando denuncias...</div>';
  const { r, d } = await api('/api/admin/reports');
  if (!r.ok) {
    $('#reports').innerHTML = '<div class="empty-admin">No se pudieron cargar las denuncias.</div>';
    return;
  }
  reportCache = Array.isArray(d.reports) ? d.reports : [];
  renderReports();
}

async function decide(id, status, action) {
  const note = prompt('Nota de moderación (opcional)') || '';
  const { r, d } = await api(`/api/admin/reports/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, action, note })
  });
  if (!r.ok) {
    setAdminNotice(d.error === 'admin_account_protected'
      ? 'La cuenta administradora está protegida.'
      : 'No se pudo guardar la decisión.', true);
    return;
  }
  setAdminNotice('Decisión guardada.');
  await Promise.all([reports(), metrics(), users($('#search').value)]);
}

function verificationStateLabel(status) {
  return ({
    pending:'Pendiente',
    approved:'Aprobada',
    rejected:'No aprobada',
    cancelled:'Cancelada'
  })[status] || status;
}

function verificationCard(item) {
  const typeLabel = item.type === 'age' ? 'Verificación +18' : 'Verificación de creador';
  const verifiedAlready = item.type === 'age' ? item.age_verified : item.creator_verified;
  const avatar = item.avatar_url
    ? `<img src="${esc(item.avatar_url)}" alt="">`
    : esc((item.display_name || item.username || 'R').slice(0,1).toUpperCase());

  return `<article class="verification-card ${item.status}">
    <div class="verification-main">
      <span class="verification-avatar">${avatar}</span>
      <div>
        <div class="verification-title"><b>${esc(item.display_name)} · @${esc(item.username)}</b><span class="state">${esc(typeLabel)}</span></div>
        <small>${esc(item.email)} · ${timeLabel(item.created_at)}</small>
      </div>
    </div>
    <div class="verification-state-row">
      <span class="state ${item.status === 'rejected' ? 'danger-state' : item.status === 'pending' ? 'warning-state' : ''}">${verificationStateLabel(item.status)}</span>
      ${verifiedAlready ? '<span class="state">Ya figura verificado</span>' : item.status === 'approved' ? '<span class="state danger-state">Verificación actual retirada</span>' : ''}
    </div>
    ${item.request_note ? `<div class="verification-note"><b>Nota del usuario</b><p>${esc(item.request_note)}</p></div>` : ''}
    ${item.review_note ? `<div class="verification-note review"><b>Revisión</b><p>${esc(item.review_note)}</p></div>` : ''}
    ${item.status === 'pending' ? `
      <div class="actions">
        <button class="alt" data-admin-action="verification-decision" data-id="${item.id}" data-decision="approve">Aprobar</button>
        <button class="soft" data-admin-action="verification-decision" data-id="${item.id}" data-decision="reject">No aprobar</button>
      </div>
    ` : `<small>Revisada ${item.reviewed_at ? timeLabel(item.reviewed_at) : '—'}${item.admin_username ? ' · por @' + esc(item.admin_username) : ''}</small>`}
  </article>`;
}

async function verifications() {
  const root = $('#verifications');
  if (!root) return;
  root.innerHTML = '<div class="empty-admin">Cargando solicitudes...</div>';

  const filter = $('#verificationFilter')?.value || 'pending';
  const { r, d } = await api('/api/admin/verifications?status=' + encodeURIComponent(filter));
  if (!r.ok) {
    root.innerHTML = '<div class="empty-admin">No se pudieron cargar las verificaciones.</div>';
    return;
  }

  const rows = Array.isArray(d.requests) ? d.requests : [];
  root.innerHTML = rows.length
    ? rows.map(verificationCard).join('')
    : '<div class="empty-admin">No hay solicitudes en este filtro.</div>';
}

async function decideVerification(id, decision, button) {
  const note = prompt(
    decision === 'approve'
      ? 'Nota de revisión (opcional)'
      : 'Motivo de no aprobación (recomendado)'
  ) || '';

  if (button) button.disabled = true;
  try {
    const { r, d } = await api(`/api/admin/verifications/${id}/decision`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({decision,note})
    });

    if (!r.ok) {
      setAdminNotice(
        d.error === 'verification_request_not_pending'
          ? 'La solicitud ya no está pendiente.'
          : 'No se pudo guardar la revisión.',
        true
      );
      return;
    }

    setAdminNotice(decision === 'approve' ? 'Verificación aprobada.' : 'Solicitud revisada.');
    await Promise.all([
      verifications(),
      metrics(),
      users($('#search').value)
    ]);
  } finally {
    if (button) button.disabled = false;
  }
}

function userCard(u) {
  const avatar = u.avatar_url
    ? `<img src="${esc(u.avatar_url)}" alt="">`
    : esc((u.display_name || u.username || 'R').slice(0,1).toUpperCase());

  const stateClass = u.status === 'banned'
    ? 'danger-state'
    : u.status === 'suspended'
      ? 'warning-state'
      : '';

  const suspension = u.status === 'suspended'
    ? `<div class="user-alert">Suspendida ${u.suspended_until ? 'hasta ' + timeLabel(u.suspended_until) : 'indefinidamente'}${u.suspension_reason ? ' · ' + esc(u.suspension_reason) : ''}</div>`
    : u.status === 'banned' && u.suspension_reason
      ? `<div class="user-alert danger-copy">${esc(u.suspension_reason)}</div>`
      : '';

  return `<article class="user-card">
    <div class="user-main">
      <span class="user-avatar">${avatar}</span>
      <div class="user-copy">
        <div class="user-title"><b>${esc(u.display_name)} · @${esc(u.username)}</b><span class="state ${stateClass}">${statusLabel(u.status)}</span></div>
        <small>${esc(u.email)}${u.location_label ? ' · ' + esc(u.location_label) : ''}</small>
        ${u.bio ? `<p>${esc(u.bio)}</p>` : ''}
      </div>
    </div>
    <div class="user-mini-metrics">
      <span><b>${u.post_count}</b> posts</span>
      <span><b>${u.report_count}</b> denuncias</span>
      <span><b>${u.moderation_count}</b> acciones</span>
      <span>Última actividad <b>${timeLabel(u.last_activity_at)}</b></span>
    </div>
    ${suspension}
    <div class="user-badges">
      ${u.is_admin ? '<span class="state">Admin</span>' : ''}
      ${u.age_verified ? '<span class="state">+18 verificado</span>' : ''}
      ${u.creator_verified ? '<span class="state">Creador verificado</span>' : ''}
    </div>
    <div class="actions">
      ${!u.age_verified ? `<button class="soft" data-admin-action="verify-age" data-user-id="${u.id}">Verificar +18</button>` : `<button class="soft" data-admin-action="revoke-age" data-user-id="${u.id}" data-user-label="@${esc(u.username)}">Quitar +18</button>`}
      ${!u.creator_verified ? `<button class="alt" data-admin-action="verify-creator" data-user-id="${u.id}">Verificar creador</button>` : `<button class="alt" data-admin-action="revoke-creator" data-user-id="${u.id}" data-user-label="@${esc(u.username)}">Quitar creador</button>`}
      <button data-admin-action="open-history" data-user-id="${u.id}" data-user-label="@${esc(u.username)}">Historial</button>
      <button class="${u.status === 'active' ? 'soft' : 'alt'}" data-admin-action="open-moderation" data-user-id="${u.id}" data-user-label="@${esc(u.username)}">Moderar</button>
    </div>
  </article>`;
}

async function users(q = '') {
  $('#users').innerHTML = '<div class="empty-admin">Cargando usuarios...</div>';
  const { r, d } = await api('/api/admin/users?q=' + encodeURIComponent(q));
  if (!r.ok) return;
  userCache = Array.isArray(d.users) ? d.users : [];
  $('#users').innerHTML = userCache.length
    ? userCache.map(userCard).join('')
    : '<div class="empty-admin">Sin resultados.</div>';
}

async function verifyAge(id, button) {
  if (button) button.disabled = true;
  try {
    const { r, d } = await api(`/api/admin/users/${id}/verify-age`, { method: 'POST' });
    if (!r.ok) throw new Error(d.error || 'verify_failed');
    setAdminNotice('Cuenta +18 verificada.');
    await Promise.all([users($('#search').value), metrics()]);
  } catch (_) {
    setAdminNotice('No se pudo verificar la mayoría de edad.', true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function verifyCreator(id, button) {
  if (button) button.disabled = true;
  try {
    const { r, d } = await api(`/api/admin/users/${id}/verify-creator`, { method: 'POST' });
    if (!r.ok) throw new Error(d.error || 'verify_failed');
    setAdminNotice('Creador verificado.');
    await Promise.all([users($('#search').value), metrics()]);
  } catch (_) {
    setAdminNotice('No se pudo verificar al creador.', true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function revokeVerification(type,id,label,button) {
  const kind=type==='age'?'+18':'creador';
  if(!confirm(`¿Quitar la verificación ${kind} a ${label||'este usuario'}? La otra verificación no cambiará.`))return;
  if(button)button.disabled=true;
  try{
    const {r,d}=await api(`/api/admin/users/${id}/revoke-${type}`,{method:'POST'});
    if(!r.ok)throw new Error(d.error||'revoke_failed');
    setAdminNotice(type==='age'?'Verificación +18 retirada.':'Verificación de creador retirada.');
    await Promise.all([users($('#search').value),metrics(),verifications()]);
  }catch(_){
    setAdminNotice('No se pudo retirar la verificación.',true);
  }finally{
    if(button?.isConnected)button.disabled=false;
  }
}

function openModeration(userId, label) {
  const modal = $('#moderationModal');
  const form = $('#moderationForm');
  form.reset();
  form.userId.value = userId;
  form.action.value = 'warn';
  $('#moderationTarget').textContent = `Moderar ${label || 'usuario'}`;
  $('#moderationStatus').textContent = '';
  syncModerationDuration();
  modal.classList.remove('hidden');
}

function closeModeration() {
  $('#moderationModal').classList.add('hidden');
}

function syncModerationDuration() {
  $('#moderationDurationRow').classList.toggle(
    'hidden',
    $('#moderationForm').action.value !== 'suspend'
  );
}

$('#moderationForm').action.addEventListener('change', syncModerationDuration);
$('#closeModerationModal').addEventListener('click', closeModeration);
$('#cancelModeration').addEventListener('click', closeModeration);
$('#moderationModal').addEventListener('click', e => {
  if (e.target === $('#moderationModal')) closeModeration();
});

$('#moderationForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fd = new FormData(form);
  const status = $('#moderationStatus');
  const payload = {
    action: fd.get('action'),
    duration: fd.get('duration') || '7d',
    reason: String(fd.get('reason') || '').trim()
  };

  if (['suspend','ban'].includes(payload.action) && !payload.reason) {
    status.textContent = 'Añade un motivo para esta acción.';
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = 'Aplicando...';

  try {
    const { r, d } = await api(`/api/admin/users/${fd.get('userId')}/moderate`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if (!r.ok) {
      status.textContent = d.error === 'cannot_moderate_self'
        ? 'No puedes suspender o bloquear tu propia cuenta.'
        : d.error === 'admin_account_protected'
          ? 'Las cuentas administradoras están protegidas.'
          : 'No se pudo aplicar la acción.';
      return;
    }

    closeModeration();
    setAdminNotice('Acción de moderación aplicada.');
    await Promise.all([users($('#search').value),metrics(),reports()]);
  } finally {
    submit.disabled = false;
  }
});

async function openHistory(userId, label) {
  const modal = $('#historyModal');
  $('#historyTitle').textContent = `Historial · ${label || 'usuario'}`;
  $('#historyContent').innerHTML = '<div class="empty-admin">Cargando historial...</div>';
  modal.classList.remove('hidden');

  const { r, d } = await api(`/api/admin/users/${userId}/history`);
  if (!r.ok) {
    $('#historyContent').innerHTML = '<div class="empty-admin">No se pudo cargar el historial.</div>';
    return;
  }

  const rows = Array.isArray(d.history) ? d.history : [];
  $('#historyContent').innerHTML = rows.length
    ? `<div class="history-list">${rows.map(item => `
        <article class="history-item">
          <div><b>${esc(item.action)}</b><span>${timeLabel(item.created_at)}</span></div>
          <small>por @${esc(item.admin_username)}${item.duration_label ? ' · ' + esc(item.duration_label) : ''}${item.expires_at ? ' · hasta ' + timeLabel(item.expires_at) : ''}</small>
          ${item.reason ? `<p>${esc(item.reason)}</p>` : ''}
        </article>
      `).join('')}</div>`
    : '<div class="empty-admin">No hay acciones de moderación registradas.</div>';
}

function closeHistory() {
  $('#historyModal').classList.add('hidden');
}
$('#closeHistoryModal').addEventListener('click', closeHistory);
$('#historyModal').addEventListener('click', e => {
  if (e.target === $('#historyModal')) closeHistory();
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-admin-action]');
  if (!button) return;
  const action = button.dataset.adminAction;

  if (action === 'release-rollback') return rollbackReleaseAudit(button.dataset.id,button);
  if (action === 'release-toggle-feature') return releasePatchFeature(button.dataset.key,{enabled:button.dataset.enabled!=='1'},button);
  if (action === 'release-toggle-freeze') return updateFeatureRollout(button.dataset.key,{frozen:button.dataset.frozen!=='1'},button);
  if (action === 'release-apply-wave') {
    const select=document.querySelector('[data-release-wave-select="'+CSS.escape(button.dataset.key)+'"]');
    const percentage=Number(select?.value||0);
    const stage=percentage===0?'cohorts':percentage<=10?'pilot':percentage<100?'expanded':'graduated';
    const existing=releaseControlState.features.find(item=>item.feature_key===button.dataset.key);
    const note=prompt('Criterio o nota para avanzar esta ola (opcional)',existing?.rollout_note||'');
    if(note===null)return;
    return updateFeatureRollout(button.dataset.key,{stage,percentage,note},button);
  }
  if (action === 'release-toggle-cohort') return releasePatchCohort(button.dataset.id,{enabled:button.dataset.enabled!=='1'},button);
  if (action === 'release-add-member') {
    const input=document.querySelector('[data-release-member-input="'+button.dataset.id+'"]');
    const username=String(input?.value||'').trim();
    if(!username)return;
    button.disabled=true;
    try{
      const {r,d}=await api('/api/release/admin/cohorts/'+encodeURIComponent(button.dataset.id)+'/members',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})
      });
      if(!r.ok)return setAdminNotice(d.error==='user_not_found'?'Usuario no encontrado.':'No se pudo añadir.',true);
      if(input)input.value='';
      await releaseControl();
    }finally{if(button.isConnected)button.disabled=false;}
    return;
  }
  if (action === 'release-remove-member') {
    await api('/api/release/admin/cohorts/'+encodeURIComponent(button.dataset.id)+'/members/'+encodeURIComponent(button.dataset.userId),{method:'DELETE'});
    await releaseControl(); return;
  }
  if (action === 'release-assign-cohort') {
    const select=document.querySelector('[data-release-cohort-select="'+CSS.escape(button.dataset.key)+'"]');
    const cohortId=select?.value;
    if(!cohortId)return;
    await api('/api/release/admin/features/'+encodeURIComponent(button.dataset.key)+'/cohorts/'+encodeURIComponent(cohortId),{method:'POST'});
    await releaseControl(); return;
  }
  if (action === 'release-remove-cohort') {
    await api('/api/release/admin/features/'+encodeURIComponent(button.dataset.key)+'/cohorts/'+encodeURIComponent(button.dataset.id),{method:'DELETE'});
    await releaseControl(); return;
  }
  if (action === 'support-status') return updateSupportAdmin(button.dataset.id,{status:button.dataset.status},button);
  if (action === 'support-note') {
    const item=supportAdminCache.find(x=>String(x.id)===String(button.dataset.id));
    const adminNote=prompt('Nota o respuesta visible para el usuario',item?.admin_note||'');
    if(adminNote===null)return;
    return updateSupportAdmin(button.dataset.id,{adminNote},button);
  }
  if (action === 'incident-status') return updateIncident(button.dataset.id,{status:button.dataset.status},button);
  if (action === 'incident-note') {
    const item=incidentCache.find(x=>String(x.id)===String(button.dataset.id));
    const note=prompt('Nota operativa',item?.note||'');
    if(note===null)return;
    return updateIncident(button.dataset.id,{note},button);
  }
  if (action === 'verification-decision') return decideVerification(button.dataset.id, button.dataset.decision, button);
  if (action === 'verify-age') return verifyAge(button.dataset.userId, button);
  if (action === 'verify-creator') return verifyCreator(button.dataset.userId, button);
  if (action === 'revoke-age') return revokeVerification('age',button.dataset.userId,button.dataset.userLabel,button);
  if (action === 'revoke-creator') return revokeVerification('creator',button.dataset.userId,button.dataset.userLabel,button);
  if (action === 'open-moderation') return openModeration(button.dataset.userId, button.dataset.userLabel);
  if (action === 'open-history') return openHistory(button.dataset.userId, button.dataset.userLabel);
  if (action === 'report-decision') {
    return decide(button.dataset.id, button.dataset.status, button.dataset.decision);
  }
});


$('#cohortCreateForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,fd=new FormData(form),status=$('#cohortCreateStatus'),submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;status.textContent='Creando...';
  try{
    const {r,d}=await api('/api/release/admin/cohorts',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:String(fd.get('key')||'').trim(),name:String(fd.get('name')||'').trim(),description:String(fd.get('description')||'').trim()})
    });
    if(!r.ok){status.textContent=d.error==='cohort_key_exists'?'Esa clave ya existe.':'No se pudo crear.';return;}
    form.reset();status.textContent='';await releaseControl();
  }finally{submit.disabled=false;}
});
$('#featureCreateForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,fd=new FormData(form),status=$('#featureCreateStatus'),submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;status.textContent='Creando...';
  try{
    const {r,d}=await api('/api/release/admin/features',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        key:String(fd.get('key')||'').trim(),
        name:String(fd.get('name')||'').trim(),
        description:String(fd.get('description')||'').trim(),
        defaultEnabled:fd.get('defaultEnabled')==='on'
      })
    });
    if(!r.ok){status.textContent=d.error==='feature_key_exists'?'Esa clave ya existe.':'No se pudo crear.';return;}
    form.reset();status.textContent='';await releaseControl();
  }finally{submit.disabled=false;}
});
$('#reloadReleaseControl')?.addEventListener('click',releaseControl);

$('#reloadSupportAdmin')?.addEventListener('click',supportAdmin);
$('#supportAdminStatus')?.addEventListener('change',supportAdmin);
$('#supportAdminType')?.addEventListener('change',supportAdmin);

$('#incidentForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const fd=new FormData(form);
  const status=$('#incidentFormStatus');
  const submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;
  status.textContent='Registrando...';
  try{
    const {r,d}=await api('/api/admin/incidents',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        title:String(fd.get('title')||'').trim(),
        severity:fd.get('severity')||'info',
        note:String(fd.get('note')||'').trim()
      })
    });
    if(!r.ok){
      status.textContent='No se pudo registrar la incidencia.';
      return;
    }
    form.reset();
    status.textContent='';
    setAdminNotice('Incidencia registrada.');
    await betaOps();
  }finally{
    submit.disabled=false;
  }
});
$('#reloadBetaOps')?.addEventListener('click',betaOps);
$('#reloadSeoHealth')?.addEventListener('click',seoHealth);
$('#reloadGrowthAttribution')?.addEventListener('click',growthAttribution);
$('#growthAttributionDays')?.addEventListener('change',growthAttribution);

$('#searchForm').addEventListener('submit', event => {
  event.preventDefault();
  users($('#search').value);
});
$('#reloadReports').addEventListener('click', reports);
$('#reportFilter').addEventListener('change', renderReports);
$('#reloadVerifications')?.addEventListener('click', verifications);
$('#verificationFilter')?.addEventListener('change', verifications);

(async () => {
  await Promise.all([metrics(), betaOps(), seoHealth(), growthAttribution(), releaseControl(), supportAdmin(), reports(), users(), verifications()]);
})();
