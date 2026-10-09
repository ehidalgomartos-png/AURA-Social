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


function growthCenterRate(value,eligible){
  return value===null||!Number(eligible)?'—':Number(value).toLocaleString('es-ES',{maximumFractionDigits:1})+'%';
}
async function growthCenter(){
  const metricsRoot=$('#growthCenterMetrics'),sourcesRoot=$('#growthCenterSources');
  const guidesRoot=$('#growthCenterGuides'),dailyRoot=$('#growthCenterDaily'),noteRoot=$('#growthCenterMethod');
  if(!metricsRoot||!sourcesRoot||!guidesRoot||!dailyRoot)return;
  const raw=$('#growthCenterDays')?.value||'30';
  const days=['7','30','90'].includes(raw)?raw:'30';
  metricsRoot.textContent='Consultando el crecimiento…';
  try{
    const {r,d}=await api('/api/admin/growth-center?days='+encodeURIComponent(days));
    if(!r.ok)throw new Error('growth_center_failed');
    const t=d.totals||{};
    const metricCards=[
      ['Registros · '+days+' días',t.signups||0],
      ['Origen conocido',t.attributedSignups||0],
      ['Primeros 7 días',growthCenterRate(t.firstWeekRatePct,t.eligibleWeek)],
      ['Actividad D1',growthCenterRate(t.d1RatePct,t.eligibleD1)],
      ['Actividad D7',growthCenterRate(t.d7RatePct,t.eligibleD7)],
      ['Cobertura origen',growthCenterRate(t.attributionRatePct,t.signups)]
    ];
    metricsRoot.innerHTML=metricCards.map(([label,value])=>
      '<div class="beta-metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>'
    ).join('');
    sourcesRoot.innerHTML=(d.sources||[]).map(item=>{
      const label=item.source==='unattributed'?'Sin atribución':growthSourceTypeLabel(item.source);
      return '<article class="growth-type-card"><div><b>'+esc(label)+'</b><small>'+
        Number(item.signups||0)+' altas · '+Number(item.firstWeek||0)+' primeras interacciones de '+
        Number(item.eligibleWeek||0)+' cuentas elegibles</small></div><span>'+
        esc(growthCenterRate(item.firstWeekRatePct,item.eligibleWeek))+'</span></article>';
    }).join('')||'<div class="empty-admin">Todavía no hay registros en este periodo.</div>';
    guidesRoot.innerHTML=(d.guides||[]).map(item=>
      '<article class="growth-type-card"><div><b>'+esc(item.title)+'</b><small>'+
      Number(item.signups||0)+' registros · '+Number(item.firstWeek||0)+' participaciones de '+
      Number(item.eligibleWeek||0)+' cuentas elegibles</small>'+
      '<a href="/guias/'+encodeURIComponent(item.slug)+'" target="_blank" rel="noopener">Ver guía ↗</a></div><span>'+
      esc(growthCenterRate(item.firstWeekRatePct,item.eligibleWeek))+'</span></article>'
    ).join('')||'<div class="empty-admin">Sin datos de guías.</div>';
    const daily=(d.daily||[]).slice(-30);
    const max=Math.max(1,...daily.map(x=>Number(x.signups||0)));
    dailyRoot.innerHTML=daily.map(item=>{
      const count=Math.max(0,Number(item.signups||0));
      const label=String(item.day||'').slice(5);
      const height=count?Math.max(8,Math.round(100*count/max)):4;
      return '<div class="growth-day" title="'+esc(label)+' · '+count+' registros">'+
        '<b style="height:'+height+'%"></b><span>'+esc(label)+'</span><small>'+count+'</small></div>';
    }).join('')||'<div class="empty-admin">Todavía no hay altas.</div>';
    if(noteRoot)noteRoot.textContent=
      'Muestra elegible: primera semana '+Number(t.eligibleWeek||0)+
      ', D1 '+Number(t.eligibleD1||0)+', D7 '+Number(t.eligibleD7||0)+
      '. D1 = acciones entre 24 y 48 h; D7 = acciones entre 7 y 8 días. '+
      'No mide sesiones, visitas ni conversiones desde impresiones. Sin atribución no significa tráfico directo. '+
      'Datos internos agregados; nunca se leen mensajes privados.';
  }catch(_){
    metricsRoot.textContent='No se pudieron recuperar las métricas.';
    sourcesRoot.textContent='Inténtalo de nuevo.';
    guidesRoot.textContent='';
    dailyRoot.textContent='';
  }
}
$('#reloadGrowthCenter')?.addEventListener('click',growthCenter);
$('#growthCenterDays')?.addEventListener('change',growthCenter);

function growthSourceTypeLabel(type){
  return ({
    profile:'Perfil',
    post:'Publicación',
    community:'Comunidad',
    event:'Evento',
    reel:'Reel',
    topic:'Tema',
    story:'Historia',
    guide:'Guía' 
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


async function securityOverview(){
  const root=$('#securityEvents'),stats=$('#securityMetrics');
  if(!root||!stats)return;
  try {
    const {r,d}=await api('/api/admin/security/overview');
    if(!r.ok)throw new Error('security_unavailable');
    stats.innerHTML=(d.metrics||[]).length?(d.metrics||[]).map(item=>'<div class="metric"><b>'+compact(item.blocked_requests)+'</b><span>'+esc(item.category)+' · bloqueos (7 días)</span></div>').join(''):'<p>No hay límites superados durante los últimos 7 días.</p>';
    root.innerHTML=(d.events||[]).length?(d.events||[]).map(item=>
      '<article class="report-card"><div><b>'+esc(item.category)+'</b> · '+(item.user_id?'@'+esc(item.username||'Cuenta '+item.user_id):'Red anónima')+
      '<p>'+Math.max(0,Number(item.blocked_hits)-Number(item.threshold))+' solicitudes bloqueadas · '+esc(timeLabel(item.last_seen_at))+'</p>'+
      (item.reviewed_at?'<small>Revisada · '+esc(item.review_note)+'</small>':'<button type="button" data-security-review="'+esc(item.id)+'">Marcar revisada</button>')+
      '</div></article>').join(''):'<p>No hay alertas registradas.</p>';
  }catch(error){stats.textContent='No se pudieron consultar las alertas.';root.textContent='Inténtalo de nuevo.';}
}
$('#reloadSecurity')?.addEventListener('click',securityOverview);
$('#securityEvents')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-security-review]');
  if(!button)return;
  const note=prompt('Nota de revisión (mínimo 3 caracteres):');
  if(note===null)return;
  if(note.trim().length<3)return setAdminNotice('Escribe un motivo de al menos 3 caracteres.',true);
  button.disabled=true;
  try {
    const {r}=await api('/api/admin/security/events/'+encodeURIComponent(button.dataset.securityReview)+'/review',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note:note.trim()})
    });
    if(!r.ok)throw new Error('review_failed');
    await securityOverview();
  }catch(error){setAdminNotice('No se pudo guardar la revisión.',true);button.disabled=false;}
});






function releaseCheckStatusLabel(status){
  return ({ok:'Correcto',warning:'Atención',critical:'Incidencia'})[status]||'Sin datos';
}
async function releaseVerification(refresh=false){
  const summary=$('#releaseVerificationSummary'),list=$('#releaseVerificationChecks'),note=$('#releaseVerificationNote');
  if(!summary||!list)return;
  summary.textContent='Comprobando la versión…';
  try{
    const {r,d}=await api('/api/admin/ops/release-verification'+(refresh?'?refresh=1':''));
    if(!r.ok)throw new Error('release_verification_unavailable');
    summary.innerHTML=[
      ['Versión esperada',String(d.expectedVersion||'—')],
      ['Estado',releaseCheckStatusLabel(d.level)],
      ['Comprobaciones',Number(d.passed||0)+' / '+Number(d.total||0)],
      ['Última revisión',timeLabel(d.checkedAt)]
    ].map(([label,value])=>'<div class="metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join('');
    list.innerHTML=(d.checks||[]).map(item=>
      '<article class="report-card"><div><b>'+esc(item.label)+' — '+esc(releaseCheckStatusLabel(item.status))+'</b>'+
      '<p>'+esc(item.advice||'')+'</p>'+
      '<small>HTTP '+esc(item.httpStatus===null?'Sin respuesta':item.httpStatus)+' · '+Math.max(0,Number(item.elapsedMs||0))+' ms'+
      (item.reason?' · '+esc(item.reason):'')+'</small></div></article>'
    ).join('')||'<div class="empty-admin">No se pudieron recuperar comprobaciones.</div>';
    if(note)note.textContent='Comprobación interna, solo de la instancia actual, sin modificar datos. No valida el acceso público, la CDN ni el estado del despliegue en Coolify.';
  }catch(_){
    summary.textContent='No se pudo comprobar el despliegue.';
    list.textContent='Revisa los registros de Coolify y vuelve a intentarlo.';
  }
}
$('#reloadReleaseVerification')?.addEventListener('click',()=>releaseVerification(true));

async function alertDeliveries(){
  const summary=$('#alertDeliveryStatus'),list=$('#alertDeliveryList');
  if(!summary||!list)return;
  try{
    const {r,d}=await api('/api/admin/ops/alert-deliveries');
    if(!r.ok)throw new Error('alert_delivery_unavailable');
    const config=d.config||{},counts=d.counts||{};
    if(!config.enabled){
      summary.textContent=config.configurationError
        ?'Configuración del webhook no válida. Revisa la variable segura en Coolify.'
        :'Envío externo desactivado. No se enviarán alertas hasta configurar OPS_ALERT_WEBHOOK_URL.';
      list.textContent='Puedes seguir gestionando todas las incidencias desde la bandeja interna.';
      return;
    }
    summary.innerHTML=[
      ['Canal',config.provider==='discord'?'Discord':'Slack'],
      ['Pendientes',counts.pending||0],['Entregadas',counts.sent||0],['Fallidas',counts.failed||0],
      ['Último envío',timeLabel(config.lastSuccessAt)]
    ].map(([label,value])=>'<div class="metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join('');
    list.innerHTML=(d.deliveries||[]).map(item=>{
      const id=esc(item.id);
      return '<article class="report-card"><div><b>'+esc(item.title)+' · '+esc(item.status)+'</b>'+
        '<p>Intentos: '+Math.max(0,Number(item.attempts||0))+' · '+esc(timeLabel(item.last_attempt_at))+
        (item.last_error_code?' · Error: '+esc(item.last_error_code):'')+'</p>'+
        (item.status==='failed'?'<label class="panel-copy">Motivo para reintentar'+
        '<textarea maxlength="500" rows="2" data-delivery-note="'+id+'" placeholder="Qué has comprobado"></textarea></label>'+
        '<button type="button" data-delivery-retry="'+id+'">Reintentar</button>':'')+
        '</div></article>';
    }).join('')||'<div class="empty-admin">Todavía no existen entregas externas.</div>';
  }catch(_){
    summary.textContent='No se pudo comprobar el estado de entrega.';
    list.textContent='Puedes volver a intentarlo.';
  }
}
$('#reloadAlertDeliveries')?.addEventListener('click',alertDeliveries);
$('#alertDeliveryList')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-delivery-retry]');
  if(!button)return;
  const id=String(button.dataset.deliveryRetry||'');
  if(!/^[0-9]+$/.test(id))return;
  const note=String(document.querySelector('[data-delivery-note="'+CSS.escape(id)+'"]')?.value||'').trim();
  if(note.length<3){setAdminNotice('Explica por qué reintentar (mínimo 3 caracteres).',true);return;}
  button.disabled=true;
  try{
    const {r}=await api('/api/admin/ops/alert-deliveries/'+encodeURIComponent(id)+'/retry',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note})
    });
    if(!r.ok)throw Error('retry_failed');
    setAdminNotice('Reintento programado para la siguiente comprobación.');
    await alertDeliveries();
  }catch(_){setAdminNotice('No se pudo programar el reintento.',true);button.disabled=false;}
});

function operationalAlertStatusLabel(status){
  return ({open:'Abierta',acknowledged:'En seguimiento',resolved:'Resuelta'})[status]||status;
}
async function operationalAlerts(){
  const list=$('#operationalAlertList'),summary=$('#operationalAlertSummary');
  if(!list||!summary)return;
  const status=$('#operationalAlertStatus')?.value||'active';
  try{
    const {r,d}=await api('/api/admin/ops/alerts?status='+encodeURIComponent(status));
    if(!r.ok)throw Error('operational_alerts_failed');
    const alerts=Array.isArray(d.alerts)?d.alerts:[];
    const current=alerts.filter(a=>a.is_active && a.status!=='resolved').length;
    summary.textContent=alerts.length?alerts.length+' alerta(s) en este filtro; '+current+' con señal activa pendiente de cierre.':'No hay alertas en el filtro seleccionado.';
    list.innerHTML=alerts.map(item=>{
      const active=item.is_active?'Señal detectada recientemente':'Señal recuperada';
      const id=esc(item.id);
      const actions=item.status==='resolved'?'':(
        '<div class="actions">'+
        (item.status==='open'?'<button class="soft" type="button" data-operational-action="acknowledge" data-id="'+id+'">En seguimiento</button>':'')+
        '<button class="alt" type="button" data-operational-action="resolve" data-id="'+id+'">Resolver</button></div>'+
        '<label class="panel-copy">Nota de seguimiento (obligatoria para resolver)'+
        '<textarea rows="2" maxlength="500" data-operational-note="'+id+'" placeholder="Qué se revisó y cómo quedó solucionado"></textarea></label>'
      );
      return '<article class="report-card" data-operational-id="'+id+'"><div>'+
        '<b>'+esc(item.title)+' · '+esc(operationalAlertStatusLabel(item.status))+'</b>'+
        '<p>'+esc(item.detail)+'</p>'+
        '<small>'+esc(item.severity==='critical'?'Crítica':'Atención')+' · '+esc(active)+' · Último aviso '+
        esc(timeLabel(item.last_seen_at))+' · '+Math.max(1,Number(item.occurrences||1))+' comprobaciones</small>'+
        actions+'<div class="actions"><button class="soft" type="button" data-operational-history="'+id+'">Ver historial</button></div>'+
        '<div data-operational-history-content="'+id+'" aria-live="polite"></div></div></article>';
    }).join('')||'<div class="empty-admin">No hay incidencias técnicas registradas.</div>';
  }catch(_){
    summary.textContent='No se pudieron cargar las alertas.';
    list.textContent='Puedes reintentarlo desde Actualizar.';
  }
}
$('#reloadOperationalAlerts')?.addEventListener('click',operationalAlerts);
$('#operationalAlertStatus')?.addEventListener('change',operationalAlerts);
$('#operationalAlertList')?.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-operational-action],button[data-operational-history]');
  if(!button)return;
  const id=String(button.dataset.id||button.dataset.operationalHistory||'');
  if(!/^[0-9]+$/.test(id))return;
  button.disabled=true;
  if(button.dataset.operationalHistory){
    try{
      const {r,d}=await api('/api/admin/ops/alerts/'+encodeURIComponent(id)+'/history');
      if(!r.ok)throw Error('history_failed');
      const target=document.querySelector('[data-operational-history-content="'+CSS.escape(id)+'"]');
      if(target)target.innerHTML=(d.history||[]).length
        ?d.history.map(row=>'<p>'+esc(timeLabel(row.created_at))+' · '+esc(row.admin_username||'Administrador')+
          ' · '+esc(operationalAlertStatusLabel(row.action))+(row.note?' · '+esc(row.note):'')+'</p>').join('')
        :'<p>Sin revisiones anteriores.</p>';
    }catch(_){setAdminNotice('No se pudo consultar el historial.',true);}
    finally{button.disabled=false;}
    return;
  }
  const action=button.dataset.operationalAction;
  const note=String(document.querySelector('[data-operational-note="'+CSS.escape(id)+'"]')?.value||'').trim();
  if(action==='resolve' && note.length<3){
    button.disabled=false;
    setAdminNotice('Para resolver, explica la solución (mínimo 3 caracteres).',true);return;
  }
  try{
    const {r}=await api('/api/admin/ops/alerts/'+encodeURIComponent(id)+'/action',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action,note})
    });
    if(!r.ok)throw Error('alert_update_failed');
    setAdminNotice(action==='resolve'?'Alerta resuelta.':'Alerta puesta en seguimiento.');
    await operationalAlerts();
  }catch(_){button.disabled=false;setAdminNotice('No se pudo actualizar la alerta.',true);}
});

function recoveryStatusLabel(status){
  return ({ok:'Correcto',warning:'Atención',critical:'Incidencia',disabled:'Opcional'})[status]||'Sin datos';
}
async function recoveryOverview(force=false){
  const summary=$('#recoverySummary'),servicesRoot=$('#recoveryServices'),note=$('#recoveryNote');
  if(!summary||!servicesRoot)return;
  summary.textContent='Comprobando dependencias…';
  try{
    const {r,d}=await api('/api/admin/ops/dependencies'+(force?'?refresh=1':''));
    if(!r.ok)throw new Error('dependency_check_failed');
    const services=Array.isArray(d.services)?d.services:[];
    const main=[['Estado',recoveryStatusLabel(d.level)],['Dependencias comprobadas',Number(services.length)],['Última comprobación',timeLabel(d.checkedAt)]];
    summary.innerHTML=main.map(([label,value])=>'<div class="metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join('');
    servicesRoot.innerHTML=services.map(item=>{
      const storage=item.key==='media' && item.freeMB!=null?' · '+Math.max(0,Number(item.freeMB))+' MB libres ('+esc(item.freePercent)+'%)':'';
      const latency=item.key==='database' && item.latencyMs!=null?' · '+Math.max(0,Number(item.latencyMs))+' ms':'';
      return '<article class="report-card"><div><b>'+esc(item.label)+' — '+esc(recoveryStatusLabel(item.status))+'</b>'+
        '<p>'+esc(item.advice||'')+'</p><small>'+esc(storage+latency)+'</small></div></article>';
    }).join('')||'<div class="empty-admin">No hay datos de dependencias.</div>';
    if(note)note.textContent='Comprobación de la instancia actual · '+timeLabel(d.checkedAt)+'. No modifica datos. El almacenamiento externo y la entrega real de push requieren pruebas adicionales.';
  }catch(_){
    summary.textContent='No se pudo completar la comprobación.';
    servicesRoot.textContent='Consulta los registros de Coolify y vuelve a intentarlo.';
  }
}
$('#reloadRecovery')?.addEventListener('click',()=>recoveryOverview(true));

function runtimeLatencyLabel(value){
  const ms=Number(value||0);
  return ms>=10000?'≥ 10 s':ms>=1000?'≤ '+(ms/1000).toFixed(1)+' s':'≤ '+ms+' ms';
}
async function runtimeOps(){
  const summary=$('#runtimeOpsSummary'),groups=$('#runtimeOpsGroups'),note=$('#runtimeOpsNote');
  if(!summary||!groups)return;
  try{
    const {r,d}=await api('/api/admin/ops/runtime');
    if(!r.ok)throw new Error('runtime_metrics_unavailable');
    const total=d.overall||{};
    const severity={ok:'Sin alertas',warning:'Vigilar',critical:'Revisar ahora'}[d.level]||'Sin datos';
    const items=[
      ['Estado',severity],
      ['Peticiones (15 min)',total.requests||0],
      ['Errores 5xx',total.serverErrors||0],
      ['Lentas (>1,5 s)',total.slow||0],
      ['Latencia p95',runtimeLatencyLabel(total.p95UpperBoundMs)],
      ['Memoria (RSS)',Number(d.rssMB||0)+' MB']
    ];
    summary.innerHTML=items.map(([label,value])=>
      '<div class="metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>'
    ).join('');
    groups.innerHTML=(d.groups||[]).length?(d.groups||[]).map(group=>
      '<article class="report-card"><div><b>'+esc(group.category)+'</b>'+
      '<p>'+compact(group.requests)+' peticiones · '+esc(group.errorRatePct)+'% errores 5xx · '+esc(group.slowRatePct)+'% lentas</p>'+
      '<small>Media '+esc(group.avgMs)+' ms · p95 '+esc(runtimeLatencyLabel(group.p95UpperBoundMs))+'</small></div></article>'
    ).join(''):'<div class="empty-admin">Todavía no hay suficientes solicitudes registradas.</div>';
    if(note)note.textContent='Métricas solo de esta instancia · ventana de '+Number(d.windowMinutes||15)+' min. '+
      (d.sampleNote||'')+' Se reinician cuando se reinicia el servidor.';
  }catch(_){
    summary.textContent='No se pudieron recuperar las métricas del servidor.';
    groups.textContent='Puedes volver a intentarlo con Actualizar.';
  }
}
$('#reloadRuntimeOps')?.addEventListener('click',runtimeOps);

async function loadEditorialV320(){
  const message=$('#editorialMessage');
  if(!message)return;
  try{
    const {r,d}=await api('/api/admin/editorial/overview');
    if(!r.ok)throw Error('editorial_unavailable');
    message.textContent='Configuración disponible · Consulta RSS manual, publicación automática desactivada.';
    $('#editorialStats').textContent=d.profiles.length+' perfiles · '+d.sources.length+' fuentes · Revisión obligatoria';
    const cm=$('#editorialCommunity'),pr=$('#editorialSourceProfile');
    cm.innerHTML='<option value="">Sin comunidad</option>'+(d.communities||[]).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
    pr.innerHTML='<option value="">Sin perfil</option>'+(d.profiles||[]).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    $('#editorialProfiles').innerHTML=d.profiles.map(p=>'<div class="report"><b>'+esc(p.name)+'</b><p>'+esc(p.category)+' · '+esc(p.status)+' · @'+esc(p.slug)+'</p><button type="button" class="soft" data-editorial-profile="'+esc(p.id)+'">Editar</button></div>').join('')||'<p>No hay perfiles todavía.</p>';
    $('#editorialSources').innerHTML=d.sources.map(s=>'<div class="report"><b>'+esc(s.name)+'</b><p>'+esc(s.category)+' · '+esc(s.status)+' · '+esc(s.rights_mode)+'</p><small>Última consulta: '+esc(timeLabel(s.last_checked_at))+'</small><div class="actions"><button type="button" class="soft" data-editorial-source="'+esc(s.id)+'">Editar</button>'+(s.status==='approved'?'<button type="button" class="alt" data-editorial-fetch="'+esc(s.id)+'">Consultar RSS</button>':'')+'<button type="button" class="soft editorial-source-delete-button-v3219" data-editorial-source-delete="'+esc(s.id)+'">Eliminar</button></div></div>').join('')||'<p>No hay fuentes todavía.</p>';
    $('#editorialAudit').innerHTML=(d.audit||[]).map(a=>'<div class="report">'+esc(timeLabel(a.created_at))+' · '+esc(a.action)+' · '+esc(a.entity_type)+'</div>').join('')||'<p>Sin cambios registrados.</p>';
    window.editorialV320State=d;
  }catch(_){message.textContent='No se pudo cargar la configuración editorial.';}
}
function editorialPayload(form){
  const data=Object.fromEntries(new FormData(form).entries());
  if(form.id==='editorialProfileForm'){
    data.communityId=data.communityId?Number(data.communityId):null;
    data.avatarUrl='';data.coverUrl='';
  }else{
    data.profileId=data.profileId?Number(data.profileId):null;
    data.rightsConfirmed=!!form.querySelector('[name="rightsConfirmed"]').checked;
  }
  return data;
}
for(const [formId,type] of [['editorialProfileForm','profiles'],['editorialSourceForm','sources']]){
  const form=document.getElementById(formId);
  form?.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const data=editorialPayload(form),id=form.dataset.editId||'';
    const url='/api/admin/editorial/'+type+(id?'/'+encodeURIComponent(id):'');
    const btn=form.querySelector('button[type="submit"]');btn.disabled=true;
    try{
      const {r,d}=await api(url,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      if(!r.ok)throw Error({
        editorial_source_profile_required:'Para aprobar una fuente RSS debes asociarla a un perfil editorial preparado.',
        editorial_source_profile_category_mismatch:'La categoría de la fuente RSS y la del perfil deben coincidir y el perfil debe estar preparado.'
      }[d.error]||d.error||'No se pudo guardar');
      form.reset();delete form.dataset.editId;
      setAdminNotice('Configuración editorial guardada.');
      await loadEditorialV320();
    }catch(e){setAdminNotice('No se pudo guardar: '+e.message,true);}
    finally{btn.disabled=false;}
  });
}
for(const [root,type,formId] of [['editorialProfiles','profiles','editorialProfileForm'],['editorialSources','sources','editorialSourceForm']]){
  document.getElementById(root)?.addEventListener('click',ev=>{
    const btn=ev.target.closest('button[data-editorial-profile],button[data-editorial-source]');
    if(!btn)return;
    const id=btn.dataset.editorialProfile||btn.dataset.editorialSource;
    const item=window.editorialV320State?.[type]?.find(x=>String(x.id)===String(id));
    if(!item)return;
    const form=document.getElementById(formId);
    const mappings=type==='profiles'?{
      name:item.name,slug:item.slug,bio:item.bio,category:item.category,
      communityId:item.community_id||'',status:item.status
    }:{
      name:item.name,feedUrl:item.feed_url,category:item.category,profileId:item.profile_id||'',
      status:item.status,rightsMode:item.rights_mode,rightsReference:item.rights_reference
    };
    for(const [key,value] of Object.entries(mappings))if(form.elements.namedItem(key))form.elements.namedItem(key).value=value??'';
    if(type==='sources')form.elements.namedItem('rightsConfirmed').checked=false;
    form.dataset.editId=String(id);form.scrollIntoView({behavior:'smooth',block:'center'});
  });
}
// V3.2.19 — Explicit two-step removal of editorial RSS sources.
// The UI never automatically deletes related candidates or publications.
let editorialSourceRemovalStateV3219=null;
let editorialSourceRemovalBusyV3219=false;
function clearEditorialSourceRemovalV3219(){
  editorialSourceRemovalStateV3219=null;
  const box=$('#editorialSourceRemovalV3219');
  if(box)box.hidden=true;
  const field=$('#editorialSourceRemovalNameV3219');
  if(field)field.value='';
  const confirm=$('#editorialSourceRemovalConfirmV3219');
  if(confirm)confirm.disabled=true;
}
function updateEditorialSourceRemovalV3219(){
  const state=editorialSourceRemovalStateV3219;
  const field=$('#editorialSourceRemovalNameV3219');
  const button=$('#editorialSourceRemovalConfirmV3219');
  if(button)button.disabled=editorialSourceRemovalBusyV3219||!state||!field||
    field.value!==state.name;
}
$('#editorialSourceRemovalNameV3219')?.addEventListener('input',updateEditorialSourceRemovalV3219);
$('#editorialSourceRemovalCancelV3219')?.addEventListener('click',clearEditorialSourceRemovalV3219);
$('#editorialSources')?.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-editorial-source-delete]');
  if(!button||editorialSourceRemovalBusyV3219)return;
  const id=String(button.dataset.editorialSourceDelete||'');
  if(!/^[1-9][0-9]{0,14}$/.test(id))return;
  editorialSourceRemovalBusyV3219=true;
  button.disabled=true;
  try{
    const {r,d}=await api('/api/admin/editorial/sources/'+encodeURIComponent(id)+'/deletion-preview');
    if(!r.ok)throw Error(d.error||'No se pudo comprobar la fuente RSS.');
    const source=d.source;
    if(!source||String(source.id)!==id)throw Error('La vista previa no coincide con la fuente seleccionada.');
    editorialSourceRemovalStateV3219=source;
    const count=source.impact||{};
    $('#editorialSourceRemovalDetailsV3219').textContent=
      'Fuente: '+source.name+' · Estado: '+source.status+'. '+
      'Noticias asociadas: '+Number(count.candidates||0)+' (pendientes: '+Number(count.pending||0)+
      ', aprobadas: '+Number(count.approved||0)+'). '+
      'Publicaciones existentes: '+Number(count.publications||0)+
      ', visibles actualmente: '+Number(count.live_publications||0)+'. '+
      'Estas noticias NO serán borradas al eliminar la fuente.';
    const field=$('#editorialSourceRemovalNameV3219');
    if(field)field.value='';
    $('#editorialSourceRemovalV3219').hidden=false;
    updateEditorialSourceRemovalV3219();
    $('#editorialSourceRemovalV3219').scrollIntoView({behavior:'smooth',block:'center'});
    field?.focus({preventScroll:true});
  }catch(error){setAdminNotice('No se pudo preparar la eliminación: '+error.message,true);}
  finally{editorialSourceRemovalBusyV3219=false;button.disabled=false;}
});
$('#editorialSourceRemovalConfirmV3219')?.addEventListener('click',async()=>{
  const source=editorialSourceRemovalStateV3219,field=$('#editorialSourceRemovalNameV3219');
  if(!source||editorialSourceRemovalBusyV3219||field?.value!==source.name)return;
  const count=source.impact||{};
  if(!window.confirm('¿ELIMINAR DEFINITIVAMENTE la fuente RSS «'+source.name+'»? '+
    'Se conservarán sus '+Number(count.candidates||0)+' noticias importadas y '+
    Number(count.publications||0)+' publicaciones históricas (incluidas '+
    Number(count.live_publications||0)+' visibles). La fuente dejará de consultarse.'))return;
  const button=$('#editorialSourceRemovalConfirmV3219');
  editorialSourceRemovalBusyV3219=true;button.disabled=true;
  try{
    const {r,d}=await api('/api/admin/editorial/sources/'+encodeURIComponent(source.id),{
      method:'DELETE',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({confirm:true,name:source.name,
        expectedCandidates:Number(count.candidates||0),
        expectedPublications:Number(count.publications||0),
        expectedLivePublications:Number(count.live_publications||0)})
    });
    if(!r.ok)throw Error({
      editorial_source_removal_confirmation_stale:'La fuente o el número de noticias ha cambiado. Abre otra vez Eliminar y comprueba los datos.',
      editorial_not_found:'La fuente ya no existe. Actualiza la lista.'
    }[d.error]||d.error||'No se pudo eliminar la fuente.');
    const sourceForm=$('#editorialSourceForm');
    if(sourceForm&&sourceForm.dataset.editId===String(source.id)){
      sourceForm.reset();delete sourceForm.dataset.editId;
    }
    clearEditorialSourceRemovalV3219();
    setAdminNotice('Fuente RSS eliminada. Las noticias y publicaciones existentes se han conservado; las públicas siguen visibles hasta retirarlas manualmente.');
    await Promise.all([loadEditorialV320(),loadEditorialInboxV321(),loadEditorialPublicV323(),
      loadEditorialQualityV325(),loadEditorialDailyV327()]);
  }catch(error){setAdminNotice('No se eliminó la fuente RSS: '+error.message,true);}
  finally{editorialSourceRemovalBusyV3219=false;updateEditorialSourceRemovalV3219();}
});
$('#editorialReload')?.addEventListener('click',loadEditorialV320);
let editorialReviewItems=[];
let editorialReviewCurrent=null;
let editorialRelinkPreviewV3221=null;
let editorialRelinkBusyV3221=false;
let editorialRelinkRequestV3221=0;
let editorialCategoryProfilesV3215=[];
const editorialCategoryLabelsV3215={actualidad:'Actualidad',tecnologia:'Tecnología',cultura:'Cultura',deportes:'Deportes',sociedad:'Sociedad',entretenimiento:'Entretenimiento'};

function editorialSafeHref(value){
  try{
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';
    return url.href;
  }catch(_){return '';}
}
function closeEditorialReview(){
  editorialReviewCurrent=null;
  editorialRelinkPreviewV3221=null;
  editorialRelinkRequestV3221++;
  $('#editorialRelinkPanelV3221')?.setAttribute('hidden','');
  $('#editorialReviewForm')?.reset();
  $('#editorialReviewEditor')?.classList.add('hidden');
}
let editorialReviewVisibleV3218=[];
let editorialReviewActiveStatusV3218='pending';
let editorialReviewActiveOrphanV3220='all';
// Read-only filtering over the at-most-100 results currently received from the server.
function editorialQueueFiltersV3218(){
  return {
    query:$('#editorialQueueSearchV3218')?.value||'',
    category:$('#editorialQueueCategoryV3218')?.value||'all',
    source:$('#editorialQueueSourceV3218')?.value||'all',
    view:$('#editorialQueueFocusV3218')?.value||'all'
  };
}
function resetEditorialQueueV3218({render=true}={}){
  const ids=['editorialQueueCategoryV3218','editorialQueueSourceV3218','editorialQueueFocusV3218'];
  const search=$('#editorialQueueSearchV3218');
  if(search)search.value='';
  for(const id of ids){const input=$('#'+id);if(input)input.value='all';}
  if(render)renderEditorialQueueV3218();
}
function updateEditorialQueueSourcesV3218(){
  const select=$('#editorialQueueSourceV3218');
  const sourceFn=window.editorialQueueV3218?.sources;
  if(!select||typeof sourceFn!=='function')return;
  const selected=select.value;
  const sources=sourceFn(editorialReviewItems);
  select.replaceChildren();
  const all=document.createElement('option');
  all.value='all';all.textContent='Todos los medios';select.append(all);
  for(const source of sources){
    const opt=document.createElement('option');
    opt.value=source.id;opt.textContent=source.name;select.append(opt);
  }
  select.value=sources.some(x=>x.id===selected)?selected:'all';
}
function updateEditorialQueueNavigationV3218(){
  const current=editorialReviewCurrent;
  if(!current)return;
  const index=editorialReviewVisibleV3218.findIndex(row=>String(row.id)===String(current.id));
  const counter=$('#editorialReviewProgressV3216');
  if(counter)counter.textContent=index<0
    ?'Esta noticia no aparece con los filtros actuales. Limpia filtros para recorrer la cola.'
    :'Noticia '+(index+1)+' de '+editorialReviewVisibleV3218.length+' visibles';
  const previous=$('#editorialReviewPreviousV3216'),next=$('#editorialReviewNextV3216');
  if(previous)previous.disabled=index<=0;
  if(next)next.disabled=index<0||index>=editorialReviewVisibleV3218.length-1;
}
function renderEditorialQueueV3218(){
  const root=$('#editorialInboxItems'),status=$('#editorialInboxStatus');
  if(!root||!status)return;
  const fn=window.editorialQueueV3218?.filter;
  const result=typeof fn==='function'
    ?fn(editorialReviewItems,editorialQueueFiltersV3218())
    :{items:editorialReviewItems,shown:editorialReviewItems.length,loaded:editorialReviewItems.length,limited:editorialReviewItems.length>=100};
  editorialReviewVisibleV3218=result.items;
  const state=({pending:'pendientes',approved:'aprobadas internamente',rejected:'rechazadas'}[editorialReviewActiveStatusV3218]||'');
  const orphanOnly=editorialReviewActiveOrphanV3220==='only';
  status.textContent=result.loaded+' noticias '+state+(orphanOnly?' sin fuente RSS vinculada':'')+
    ' cargadas · Revisión y publicación siempre manuales.';
  const counter=$('#editorialQueueCountV3218');
  if(counter)counter.textContent='Mostrando '+result.shown+' de '+result.loaded+
    ' noticias cargadas'+(result.limited?' (máximo 100 por estado en esta vista)':'')+
    '. Estos filtros son locales: no descartan ni modifican noticias.';
  root.innerHTML=result.items.map(item=>{
    const url=editorialSafeHref(item.canonical_url);
    const link=url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer nofollow">Fuente original ↗</a>':'Enlace no disponible';
    const summary=String(item.editorial_summary||item.source_excerpt||'Sin extracto.');
    const originMissing=item.source_id==null;
    const label=originMissing
      ?(item.removed_source_id!=null?'Fuente RSS eliminada':'Sin fuente RSS vinculada')
      :'';
    const advisory=item.status==='pending'&&item.advice?item.advice:null;
    const tip=advisory?'<div class="editorial-advice-summary"><span>Prioridad orientativa: '+esc(advisory.priority_label||'media')+' ('+Number(advisory.priority_score||0)+'/100)</span>'+
      (advisory.category_suggestion?.changeSuggested?'<span>Revisar categoría: '+esc(editorialCategoryLabelsV3215[advisory.category_suggestion.category]||advisory.category_suggestion.category)+'</span>':'')+
      (advisory.possible_duplicates?.length?'<span>Posibles noticias relacionadas: '+Number(advisory.possible_duplicates.length)+'</span>':'')+
      (item.provenance?.warningCount?'<span>Revisar datos y originalidad: '+Number(item.provenance.warningCount)+'</span>':'')+
      '</div>':'';
    return '<article class="report"><b>'+esc(item.editorial_title||item.source_title)+'</b>'+
      '<p>'+esc(summary)+'</p>'+tip+
      (originMissing?'<p class="editorial-orphan-warning-v3220"><strong>'+esc(label)+
        '</strong> · Noticia conservada. Sin fuente autorizada activa no puede aprobarse ni publicarse.</p>':'')+
      '<small>'+esc(item.source_name||'Medio histórico no identificado')+' · '+esc(editorialCategoryLabelsV3215[item.category]||item.category)+' · '+esc(timeLabel(item.reviewed_at||item.fetched_at))+'</small>'+
      '<p>'+link+'</p><div class="actions"><button type="button" class="soft" data-editorial-review-id="'+esc(item.id)+'">'+(item.status==='pending'?'Revisar y editar':'Ver revisión')+'</button></div></article>';
  }).join('')||(result.loaded
    ?'<p>No hay noticias que coincidan con estos filtros. Prueba con otra búsqueda o limpia los filtros.</p>'
    :'<p>No hay noticias en este estado. Consulta una fuente RSS aprobada para obtener nuevas noticias.</p>');
  updateEditorialQueueNavigationV3218();
}
['editorialQueueSearchV3218','editorialQueueCategoryV3218','editorialQueueSourceV3218','editorialQueueFocusV3218'].forEach(id=>{
  $('#'+id)?.addEventListener(id==='editorialQueueSearchV3218'?'input':'change',renderEditorialQueueV3218);
});
$('#editorialQueueResetV3218')?.addEventListener('click',()=>resetEditorialQueueV3218());
async function loadEditorialInboxV321(focusId=''){
  const root=$('#editorialInboxItems'),status=$('#editorialInboxStatus');
  if(!root||!status)return;
  const filter=$('#editorialReviewFilter')?.value||'pending';
  const orphaned=$('#editorialOrphanFilterV3220')?.value==='only'?'only':'all';
  try{
    const {r,d}=await api('/api/admin/editorial/review?status='+encodeURIComponent(filter)+
      '&orphaned='+encodeURIComponent(orphaned)+(focusId?'&focus='+encodeURIComponent(focusId):''));
    if(!r.ok)throw Error('review_unavailable');
    editorialReviewItems=Array.isArray(d.items)?d.items:[];
    editorialCategoryProfilesV3215=Array.isArray(d.categoryProfiles)?d.categoryProfiles:[];
    editorialReviewActiveStatusV3218=filter;
    editorialReviewActiveOrphanV3220=orphaned;
    // Direct links from Mesa editorial must always reveal the requested item.
    if(focusId&&!editorialReviewCurrent)resetEditorialQueueV3218({render:false});
    updateEditorialQueueSourcesV3218();
    renderEditorialQueueV3218();
    if(editorialReviewCurrent){
      const current=editorialReviewItems.find(it=>String(it.id)===String(editorialReviewCurrent.id));
      if(!current)closeEditorialReview();
    }
  }catch(_){
    editorialReviewItems=[];
    editorialReviewVisibleV3218=[];
    status.textContent='No se pudieron cargar las noticias.';
    root.textContent='Vuelve a intentarlo.';
  }
}
function fillEditorialDraftV3213(item,force=false){
  if(!item||item.status!=='pending')return false;
  const form=$('#editorialReviewForm');
  const suggest=window.editorialDraftV3216;
  if(!form||typeof suggest!=='function')return false;
  const title=form.elements.namedItem('title'),summary=form.elements.namedItem('summary'),
    note=form.elements.namedItem('note');
  if(force&&(title.value.trim()||summary.value.trim())&&
     !window.confirm('¿Sustituir el titular y resumen del editor por una propuesta automática provisional? Los cambios sin guardar se perderán.'))return false;
  const draft=suggest(item);
  if(!draft.title||!draft.summary)return false;
  if(force||!title.value.trim())title.value=draft.title;
  if(force||!summary.value.trim())summary.value=draft.summary;
  if(!note.value.trim())note.value=draft.note;
  renderEditorialProvenanceV3217(item);
  renderEditorialOriginalityV32171(item);
  $('#editorialSuggestionStatus').textContent='Borrador provisional basado en el título y extracto RSS. No incluye hechos comprobados fuera de esos metadatos: verifica y reescribe antes de guardar o aprobar.';
  return true;
}
$('#editorialSuggestDraft')?.addEventListener('click',()=>{
  if(!fillEditorialDraftV3213(editorialReviewCurrent,true)){
    setAdminNotice('No se pudo preparar una propuesta; comprueba que sea una noticia pendiente.',true);
  }
});

// V3.2.17.1 — Inline checks mirror server originality requirements.
// Approval is only available for an already-saved revision, never for an
// unsaved form field or an auto-generated, unverified draft.
function editorialDraftDirtyV32171(item,form=$('#editorialReviewForm')){
  if(!item||!form)return false;
  return ['title','summary'].some(name=>
    String(form.elements.namedItem(name)?.value||'').trim()!==
    String(item['editorial_'+name]||'').trim()
  );
}
function renderEditorialOriginalityV32171(item){
  const form=$('#editorialReviewForm');
  const workflow=$('#editorialOriginalityWorkflowV32171');
  const checker=window.editorialOriginalityV32171;
  if(!form||typeof checker!=='function')return null;
  if(!item||item.status!=='pending'){
    for(const name of ['title','summary']){
      const field=form.elements.namedItem(name);
      field.removeAttribute('aria-invalid');
      const info=$('#editorialOriginality'+(name==='title'?'Title':'Summary')+'V32171');
      if(info)info.textContent='';
    }
    if(workflow)workflow.textContent='';
    return null;
  }
  const result=checker(item,{
    title:form.elements.namedItem('title').value,
    summary:form.elements.namedItem('summary').value
  });
  for(const name of ['title','summary']){
    const field=form.elements.namedItem(name);
    const info=$('#editorialOriginality'+(name==='title'?'Title':'Summary')+'V32171');
    const message=result.fields[name]||'';
    if(info)info.textContent=message;
    if(message)field.setAttribute('aria-invalid','true');
    else field.removeAttribute('aria-invalid');
  }
  if(workflow){
    workflow.textContent=!result.ok
      ?'Revisa los campos señalados. Puedes guardar un borrador provisional, pero para aprobar debes corregirlos primero.'
      :editorialDraftDirtyV32171(item,form)
        ?'Hay un titular o resumen sin guardar. Pulsa «Guardar borrador» antes de aprobar internamente.'
        :'Titular y resumen guardados. Comprueba fuente, hechos, contexto y derechos antes de aprobar.';
  }
  return result;
}
$('#editorialReviewForm')?.addEventListener('input',event=>{
  if(event.target?.matches?.('[name="title"],[name="summary"]')){
    renderEditorialOriginalityV32171(editorialReviewCurrent);
  }
});
function renderEditorialProvenanceV3217(item){
  const target=$('#editorialProvenanceV3217');
  if(!target)return;
  const run=window.editorialProvenanceV3217;
  if(!item||item.status!=='pending'||typeof run!=='function'){
    target.hidden=true;target.replaceChildren();return;
  }
  const form=$('#editorialReviewForm');
  if(!form)return;
  const result=run(item,{
    title:form.elements.namedItem('title').value,
    summary:form.elements.namedItem('summary').value
  });
  target.replaceChildren();
  const heading=document.createElement('h4');
  heading.textContent='Originalidad y trazabilidad · V3.2.17';
  target.append(heading);
  const status=document.createElement('p');
  status.textContent=result.warningCount
    ?result.warningCount+' aspectos requieren comprobación humana.'
    :'Sin coincidencias extensas detectadas en los metadatos RSS. Aun así debes comprobar la noticia.';
  target.append(status);
  if(result.warnings.length){
    const list=document.createElement('ul');
    for(const warning of result.warnings){
      const li=document.createElement('li');
      const title=document.createElement('strong');
      title.textContent=warning.label+': ';
      li.append(title,document.createTextNode(warning.explanation));
      list.append(li);
    }
    target.append(list);
  }
  const disclaimer=document.createElement('small');
  disclaimer.textContent=result.notice;
  target.append(disclaimer);
  target.hidden=false;
}
$('#editorialReviewForm')?.addEventListener('input',event=>{
  if(event.target?.matches?.('[name="title"],[name="summary"]')){
    renderEditorialProvenanceV3217(editorialReviewCurrent);
  }
});
function renderEditorialAdviceV3215(item){
  const target=$('#editorialIntelligence');
  if(!target)return;
  const data=item.advice;
  if(item.status!=='pending'||!data){target.hidden=true;target.replaceChildren();return;}
  const category=data.category_suggestion||{};
  const next=category.category||item.category;
  const label=editorialCategoryLabelsV3215[next]||next;
  const available=editorialCategoryProfilesV3215.some(p=>p.category===next);
  const duplicates=(data.possible_duplicates||[]).map(story=>
    '<li>'+esc(story.title)+' · '+esc(story.source_name||'Medio')+' ('+Number(story.similarity||0)+' % coincidencia de términos; '+esc(story.status||'')+')</li>'
  ).join('');
  target.innerHTML='<h4>Asistente editorial · V3.2.16</h4>'+
    '<p>Prioridad <b>'+esc(data.priority_label||'media')+' ('+Number(data.priority_score||0)+'/100)</b>. Es una recomendación, no una verificación.</p>'+
    '<p><b>Categoría actual:</b> '+esc(editorialCategoryLabelsV3215[item.category]||item.category)+
    ' · <b>Sugerencia:</b> '+esc(label)+' ('+esc(category.confidence||'baja')+'). '+esc(category.reason||'')+'</p>'+
    (category.changeSuggested?'<button type="button" class="soft" data-editorial-category-apply="'+esc(next)+'" '+(available?'':'disabled title="Crea antes un perfil editorial preparado para esta categoría"')+'>Aplicar categoría sugerida</button>':'')+
    (category.changeSuggested&&!available?'<p>Necesitas crear y activar un perfil editorial de '+esc(label)+' antes de aplicarla.</p>':'')+
    (duplicates?'<p><b>Posibles noticias similares de otros medios:</b></p><ul>'+duplicates+'</ul>':
      '<p>No se han detectado titulares suficientemente similares en la muestra reciente.</p>')+
    '<p class="panel-copy">'+esc(data.topic_note||'')+' '+esc(data.selection_note||'')+'</p>'+ 
    '<p class="panel-copy">Compara las fuentes originales; no descartes automáticamente noticias por la coincidencia de palabras.</p>';
  target.hidden=false;
}
$('#editorialIntelligence')?.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-editorial-category-apply]');
  const item=editorialReviewCurrent;
  if(!button||!item||item.status!=='pending')return;
  const category=button.dataset.editorialCategoryApply;
  if(!Object.hasOwn(editorialCategoryLabelsV3215,category))return;
  const form=$('#editorialReviewForm');
  if(['title','summary','note'].some(name=>{
      const el=form.elements.namedItem(name);
      return el.value.trim()!==String(item['editorial_'+name]||((name==='note')?item.editor_note:'')||'').trim();
    })&&!window.confirm('Hay cambios sin guardar. ¿Continuar con la recategorización?'))return;
  if(!window.confirm('¿Asignar esta noticia al perfil editorial de '+editorialCategoryLabelsV3215[category]+'? Necesitará revisión humana.'))return;
  button.disabled=true;
  try{
    const {r,d}=await api('/api/admin/editorial/review/'+encodeURIComponent(item.id)+'/category',{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({category,revision:Number(item.revision)})
    });
    if(!r.ok)throw Error({
      editorial_category_profile_missing:'No hay perfil editorial preparado en esa categoría.',
      editorial_category_duplicate:'Ya hay una noticia con este titular en esa categoría.',
      editorial_review_stale:'La noticia cambió: actualiza antes de seguir.'
    }[d.error]||d.error||'No se pudo cambiar la categoría.');
    setAdminNotice('Categoría modificada; se ha asociado el perfil editorial correspondiente. No se ha publicado.');
    closeEditorialReview();
    await Promise.all([loadEditorialInboxV321(String(item.id)),loadEditorialDailyV327()]);
    const refreshed=editorialReviewItems.find(row=>String(row.id)===String(item.id));
    if(refreshed)openEditorialReview(refreshed);
  }catch(e){setAdminNotice(e.message,true);}
  finally{button.disabled=false;}
});
function editorialReviewHasChangesV3216(){
  const item=editorialReviewCurrent,form=$('#editorialReviewForm');
  if(!item||!form)return false;
  return [['title','editorial_title'],['summary','editorial_summary'],['note','editor_note']].some(([name,key])=>{
    const current=String(form.elements.namedItem(name)?.value||'').trim();
    // Automatically proposed text does not count as saved original text.
    return current!==String(item[key]||'').trim();
  });
}
function moveEditorialReviewV3216(step){
  const current=editorialReviewCurrent;
  if(!current)return;
  const index=editorialReviewVisibleV3218.findIndex(row=>String(row.id)===String(current.id));
  const next=index<0?null:editorialReviewVisibleV3218[index+step];
  if(!next)return;
  if(editorialReviewHasChangesV3216()&&!window.confirm('Hay cambios sin guardar en esta noticia. ¿Descartarlos y continuar?'))return;
  openEditorialReview(next);
}
$('#editorialReviewPreviousV3216')?.addEventListener('click',()=>moveEditorialReviewV3216(-1));
$('#editorialReviewNextV3216')?.addEventListener('click',()=>moveEditorialReviewV3216(1));
// V3.2.21 — Recovery is only offered for a candidate with no active RSS
// source, with strict compatible options from the authenticated server.
function updateEditorialRelinkControlsV3221(){
  const button=$('#editorialRelinkConfirmV3221');
  const source=$('#editorialRelinkSourceV3221');
  const reason=String($('#editorialRelinkReasonV3221')?.value||'').trim();
  if(button)button.disabled=editorialRelinkBusyV3221||
    !editorialRelinkPreviewV3221?.options?.some(x=>String(x.id)===String(source?.value))||
    reason.length<12||reason.length>500;
}
async function loadEditorialRelinkV3221(item){
  const panel=$('#editorialRelinkPanelV3221'),status=$('#editorialRelinkStatusV3221');
  const picker=$('#editorialRelinkSourceV3221'),reason=$('#editorialRelinkReasonV3221');
  editorialRelinkPreviewV3221=null;
  const sequence=++editorialRelinkRequestV3221;
  if(!panel||!item||item.source_id!=null){if(panel)panel.hidden=true;return;}
  panel.hidden=false;
  if(status)status.textContent='Comprobando fuentes RSS compatibles…';
  if(picker)picker.replaceChildren();
  if(reason)reason.value='';
  updateEditorialRelinkControlsV3221();
  try{
    const {r,d}=await api('/api/admin/editorial/source-relink/'+encodeURIComponent(item.id)+'/options');
    if(editorialRelinkRequestV3221!==sequence||
      String(editorialReviewCurrent?.id)!==String(item.id))return;
    if(!r.ok)throw Error(d?.error||'No se pudieron consultar las fuentes.');
    if(d.livePublication){
      if(status)status.textContent='Esta noticia tiene una publicación visible. Retírala desde Publicaciones antes de modificar la fuente.';
      return;
    }
    if(!d.removedSource){
      if(status)status.textContent='La noticia ya tiene una fuente asociada. Actualiza la revisión.';
      return;
    }
    editorialRelinkPreviewV3221=d;
    if(picker){
      const first=document.createElement('option');
      first.value='';first.textContent='Selecciona una fuente compatible';
      picker.append(first);
      for(const candidate of d.options||[]){
        const option=document.createElement('option');
        option.value=String(candidate.id);
        option.textContent=candidate.name+' · '+candidate.profileName+' · '+candidate.feedHost;
        picker.append(option);
      }
    }
    if(status)status.textContent=(d.options||[]).length
      ?'Fuentes compatibles por dominio HTTPS y categoría: '+d.options.length+
        '. Verifica que realmente corresponden al artículo antes de escoger.'
      :'No hay fuentes aprobadas del mismo dominio HTTPS y categoría, con perfil preparado. Revisa primero las fuentes en el Centro Editorial. No es posible asignar un medio diferente.';
    updateEditorialRelinkControlsV3221();
  }catch(e){
    if(editorialRelinkRequestV3221===sequence&&status)status.textContent='No se pudieron cargar las opciones: '+e.message;
  }
}
$('#editorialRelinkSourceV3221')?.addEventListener('change',updateEditorialRelinkControlsV3221);
$('#editorialRelinkReasonV3221')?.addEventListener('input',updateEditorialRelinkControlsV3221);
$('#editorialRelinkConfirmV3221')?.addEventListener('click',async()=>{
  const item=editorialReviewCurrent,preview=editorialRelinkPreviewV3221;
  const source=$('#editorialRelinkSourceV3221');
  const reason=String($('#editorialRelinkReasonV3221')?.value||'').trim();
  const choice=preview?.options?.find(x=>String(x.id)===String(source?.value));
  if(!item||item.source_id!=null||!preview||!choice||editorialRelinkBusyV3221||
    reason.length<12||reason.length>500||Number(preview.revision)!==Number(item.revision))return;
  if(editorialReviewHasChangesV3216()&&
    !window.confirm('Hay cambios sin guardar. ¿Descartarlos para vincular esta fuente?'))return;
  if(!window.confirm('¿Vincular la noticia con «'+choice.name+'»? Has de comprobar personalmente la fuente original, los hechos y los derechos. La noticia volverá a Pendientes y perderá su aprobación y control de calidad anterior. NO se publicará.'))return;
  const button=$('#editorialRelinkConfirmV3221');
  editorialRelinkBusyV3221=true;updateEditorialRelinkControlsV3221();
  try{
    const {r,d}=await api('/api/admin/editorial/source-relink/'+encodeURIComponent(item.id),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sourceId:Number(choice.id),revision:Number(item.revision),
        confirm:true,reason})
    });
    if(!r.ok)throw Error({
      editorial_source_relink_incompatible:'El dominio, categoría, permisos de la fuente o perfil ya no coinciden. Actualiza y revisa la configuración.',
      editorial_unpublish_before_reopen:'Primero retira la publicación pública antes de cambiar la fuente.',
      editorial_source_already_linked:'Esta noticia ya tiene una fuente: actualiza la página.',
      editorial_review_stale:'La noticia ha cambiado. Actualiza antes de continuar.'
    }[d.error]||d.error||'No se pudo vincular la fuente.');
    setAdminNotice('Fuente vinculada. La noticia ha vuelto a Pendientes para nueva revisión de hechos, derechos y calidad. No se ha publicado.');
    if($('#editorialReviewFilter'))$('#editorialReviewFilter').value='pending';
    if($('#editorialOrphanFilterV3220'))$('#editorialOrphanFilterV3220').value='all';
    closeEditorialReview();
    resetEditorialQueueV3218({render:false});
    await Promise.all([loadEditorialInboxV321(String(item.id)),loadEditorialPublicV323(),
      loadEditorialQualityV325(),loadEditorialDailyV327()]);
    const refreshed=editorialReviewItems.find(row=>String(row.id)===String(item.id));
    if(refreshed)openEditorialReview(refreshed);
  }catch(e){setAdminNotice('Vinculación de fuente: '+e.message,true);}
  finally{editorialRelinkBusyV3221=false;updateEditorialRelinkControlsV3221();}
});
// V3.2.22 — RSS picture is ONLY displayed on explicit admin preview.
// Public pages are fed by independently licensed, saved local snapshots.
let editorialImageBusyV3222=false;
function imageLocalV3222(value){
  return /^\/uploads\/editorial\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(String(value||''));
}
function imageReadyV3222(){
  const row=editorialReviewCurrent;
  const input=id=>$('#'+id);
  const rights=String(input('editorialImageRightsReferenceV3222')?.value||'').trim();
  const alt=String(input('editorialImageAltV3222')?.value||'').trim();
  const credit=String(input('editorialImageCreditV3222')?.value||'').trim();
  const licensed=row?.rights_mode==='licensed'&&
    String(row?.source_rights_reference||'').trim().length>=10;
  const ready=!!row?.source_image_url&&row.source_id!=null&&licensed&&
    rights.length>=12&&rights.length<=1000&&alt.length>=12&&alt.length<=220&&
    credit.length>=3&&credit.length<=200&&
    input('editorialImageConfirmRightsV3222')?.checked===true&&!editorialImageBusyV3222;
  const button=input('editorialImageUseV3222');
  if(button)button.disabled=!ready;
  return ready;
}
function displayEditorialImageV3222(item){
  const section=$('#editorialImagePanelV3222');
  if(!section)return;
  const hasSuggestion=!!item?.source_image_url&&item.source_id!=null;
  const stored=imageLocalV3222(item?.editorial_image_url);
  section.hidden=!hasSuggestion&&!stored;
  const status=$('#editorialImageStatusV3222');
  const note=$('#editorialImageRightsV3222');
  const preview=$('#editorialImagePreviewV3222'),figure=$('#editorialImageFigureV3222');
  const previewButton=$('#editorialImagePreviewButtonV3222');
  if(figure)figure.hidden=!stored;
  if(preview) {
    preview.removeAttribute('src');
    if(stored){
      preview.src=item.editorial_image_url;
      preview.alt=item.editorial_image_alt||'Fotografía editorial autorizada';
    }
  }
  if(previewButton)previewButton.hidden=!hasSuggestion;
  if(status)status.textContent=stored
    ?'Esta noticia ya tiene una fotografía local asociada. Puedes sustituirla mediante una nueva confirmación de derechos y nueva revisión.'
    :hasSuggestion?'El RSS ofrece una fotografía. Pulsa Previsualizar para verla de forma privada.':'';
  if(note)note.textContent=item?.rights_mode==='licensed'&&
    String(item?.source_rights_reference||'').trim().length>=10
    ?'La fuente tiene una referencia de licencia documentada. Comprueba además que ESTA fotografía y sus posibles autores/agencias estén incluidos en ese permiso.'
    :'La fuente está configurada para enlaces o sin licencia suficiente. Para importar fotos del RSS, documenta primero una autorización adecuada en Centro Editorial → Fuente RSS; el permiso para el texto no autoriza automáticamente sus imágenes.';
  const bind=[
    ['editorialImageAltV3222',stored?item.editorial_image_alt||'':''],
    ['editorialImageCreditV3222',stored?item.editorial_image_credit||'':''],
    ['editorialImageRightsReferenceV3222','']
  ];
  for(const [id,val] of bind){const el=$('#'+id);if(el)el.value=val;}
  const check=$('#editorialImageConfirmRightsV3222');if(check)check.checked=false;
  imageReadyV3222();
}
['editorialImageAltV3222','editorialImageCreditV3222','editorialImageRightsReferenceV3222',
  'editorialImageConfirmRightsV3222'].forEach(id=>{
  $('#'+id)?.addEventListener(id==='editorialImageConfirmRightsV3222'?'change':'input',imageReadyV3222);
});
$('#editorialImagePreviewButtonV3222')?.addEventListener('click',()=>{
  const item=editorialReviewCurrent;
  if(!item?.source_image_url||item.source_id==null)return;
  const id=String(item.id);
  if(!/^[1-9][0-9]{0,14}$/.test(id))return;
  const img=$('#editorialImagePreviewV3222'),figure=$('#editorialImageFigureV3222');
  const status=$('#editorialImageStatusV3222');
  if(!img||!figure)return;
  img.onload=()=>{if(String(editorialReviewCurrent?.id)===id){
    figure.hidden=false;if(status)status.textContent='Vista previa privada cargada. Confirma por separado los derechos de la fotografía.';}};
  img.onerror=()=>{if(String(editorialReviewCurrent?.id)===id){
    figure.hidden=true;if(status)status.textContent='No se pudo obtener la foto de forma segura. Comprueba que es HTTPS, accesible y JPEG, PNG o WebP (máximo 4 MB).';}};
  img.alt='Vista previa privada de la fotografía del RSS';
  if(status)status.textContent='Cargando la vista previa privada…';
  img.src='/api/admin/editorial/images/'+encodeURIComponent(id)+'/preview';
});
$('#editorialImageUseV3222')?.addEventListener('click',async()=>{
  const item=editorialReviewCurrent;
  if(!imageReadyV3222()||!item)return;
  if(editorialReviewHasChangesV3216()&&
    !window.confirm('Hay cambios de texto sin guardar. ¿Descartarlos y guardar únicamente la foto autorizada?'))return;
  if(!window.confirm('¿Confirmas que tienes permiso específico para reutilizar esta fotografía, con el crédito y justificante indicados? Se descargará al VPS. La noticia volverá a Pendientes y exigirá una nueva aprobación y control de calidad. NO se publicará.'))return;
  const id=String(item.id);
  const body={revision:Number(item.revision),confirmedPhotoRights:true,
    alt:$('#editorialImageAltV3222').value.trim(),
    credit:$('#editorialImageCreditV3222').value.trim(),
    photoRightsReference:$('#editorialImageRightsReferenceV3222').value.trim()};
  editorialImageBusyV3222=true;imageReadyV3222();
  try{
    const {r,d}=await api('/api/admin/editorial/images/'+encodeURIComponent(id)+'/use',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    if(!r.ok)throw Error({
      editorial_image_source_license_required:'Esta fuente no tiene una licencia de imágenes documentada. Revisa los derechos de esa fotografía.',
      editorial_unpublish_before_reopen:'Retira primero la noticia pública para modificar su imagen.',
      editorial_review_stale:'La noticia ha cambiado. Actualiza la revisión.',
      editorial_image_type_invalid:'La imagen remota no es un JPG, PNG o WebP válido.',
      editorial_image_too_large:'La imagen supera el límite de 4 MB.',
      editorial_image_rate_limited:'Demasiadas solicitudes de imágenes. Espera unos minutos.'
    }[d?.error]||d?.error||'No se pudo guardar la fotografía.');
    setAdminNotice('Fotografía autorizada guardada en el VPS. Noticia devuelta a Pendientes para revisión humana y calidad. No se ha publicado.');
    if($('#editorialReviewFilter'))$('#editorialReviewFilter').value='pending';
    if($('#editorialOrphanFilterV3220'))$('#editorialOrphanFilterV3220').value='all';
    closeEditorialReview();
    resetEditorialQueueV3218({render:false});
    await Promise.all([loadEditorialInboxV321(id),loadEditorialPublicV323(),
      loadEditorialQualityV325(),loadEditorialDailyV327()]);
    const saved=editorialReviewItems.find(x=>String(x.id)===id);
    if(saved)openEditorialReview(saved);
  }catch(e){setAdminNotice('Imagen editorial: '+e.message,true);}
  finally{editorialImageBusyV3222=false;imageReadyV3222();}
});
function openEditorialReview(item){
  if(!item)return;
  editorialReviewCurrent=item;
  updateEditorialQueueNavigationV3218();
  const form=$('#editorialReviewForm');
  form.reset();
  form.elements.namedItem('title').value=item.editorial_title||'';
  form.elements.namedItem('summary').value=item.editorial_summary||'';
  form.elements.namedItem('note').value=item.editor_note||'';
  $('#editorialSuggestionStatus').textContent='';
  $('#editorialSuggestDraft').hidden=item.status!=='pending';
  if(item.status==='pending')fillEditorialDraftV3213(item,false);
  $('#editorialReviewEditorTitle').textContent='Revisión #'+item.id+' · '+(item.status==='pending'?'Pendiente':item.status==='approved'?'Aprobada':'Rechazada');
  renderEditorialAdviceV3215(item);
  renderEditorialProvenanceV3217(item);
  renderEditorialOriginalityV32171(item);
  $('#editorialReviewSource').textContent='Original: '+item.source_title+' · Fuente: '+(item.source_name||'Medio histórico no identificado')+
    ' · Estado de fuente: '+(item.source_status||(item.removed_source_id!=null?'eliminada':'sin vínculo activo'))+
    '. '+(item.source_id==null
      ?'Esta noticia se conserva como historial. Sin fuente RSS aprobada y activa no puede aprobarse ni publicarse.'
      :'Consulta la noticia completa antes de decidir.');
  const link=$('#editorialReviewLink'),url=editorialSafeHref(item.canonical_url);
  link.hidden=!url;
  if(url)link.href=url;else link.removeAttribute('href');
  const pending=item.status==='pending';
  for(const name of ['title','summary','note'])form.elements.namedItem(name).readOnly=!pending;
  for(const name of ['sourceRead','factsChecked','rightsChecked'])form.elements.namedItem(name).disabled=!pending;
  $('#editorialSaveDraft').hidden=!pending;
  form.querySelector('[data-editorial-decision="approve"]').hidden=!pending;
  form.querySelector('[data-editorial-decision="reject"]').hidden=!pending;
  const reopenBtn=form.querySelector('[data-editorial-decision="reopen"]');
  reopenBtn.hidden=pending;
  reopenBtn.classList.toggle('hidden',pending);
  $('#editorialReviewEditor').classList.remove('hidden');
  displayEditorialImageV3222(item);
  loadEditorialRelinkV3221(item);
  $('#editorialReviewEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#editorialInboxItems')?.addEventListener('click',event=>{
  const button=event.target.closest('button[data-editorial-review-id]');
  if(!button)return;
  const next=editorialReviewItems.find(item=>String(item.id)===String(button.dataset.editorialReviewId));
  if(!next)return;
  if(editorialReviewCurrent&&String(editorialReviewCurrent.id)!==String(next.id)&&
    editorialReviewHasChangesV3216()&&!window.confirm('Hay cambios sin guardar en esta noticia. ¿Descartarlos y abrir otra?'))return;
  openEditorialReview(next);
});
$('#editorialReviewFilter')?.addEventListener('change',()=>{
  if(editorialReviewHasChangesV3216()&&
    !window.confirm('Hay cambios sin guardar. ¿Descartarlos y cambiar el estado de la cola?')){
    $('#editorialReviewFilter').value=editorialReviewActiveStatusV3218;return;
  }
  closeEditorialReview();loadEditorialInboxV321();
});
$('#editorialOrphanFilterV3220')?.addEventListener('change',()=>{
  if(editorialReviewHasChangesV3216()&&
    !window.confirm('Hay cambios sin guardar. ¿Descartarlos y cambiar el filtro de fuentes?')){
    $('#editorialOrphanFilterV3220').value=editorialReviewActiveOrphanV3220;
    return;
  }
  closeEditorialReview();
  resetEditorialQueueV3218({render:false});
  loadEditorialInboxV321();
});
$('#editorialCancelEditor')?.addEventListener('click',closeEditorialReview);
async function submitEditorialReview(action){
  const item=editorialReviewCurrent;
  if(!item)return;
  const form=$('#editorialReviewForm');
  const note=String(form.elements.namedItem('note').value||'').trim();
  const decision=action!=='save';
  if(decision&&action!=='reopen'&&note.length<8){
    setAdminNotice('Escribe un motivo de revisión (mínimo 8 caracteres).',true);return;
  }
  if(action==='approve'){
    const check=renderEditorialOriginalityV32171(item);
    if(!check?.ok){
      setAdminNotice('Revisa el titular y el resumen: los avisos debajo de cada campo indican qué debes corregir.',true);
      const field=check?.fields.title?'title':'summary';
      form.elements.namedItem(field).focus();
      return;
    }
    if(editorialDraftDirtyV32171(item,form)){
      setAdminNotice('Los cambios del titular o del resumen no están guardados. Pulsa «Guardar borrador» y vuelve a aprobar después.',true);
      $('#editorialSaveDraft')?.focus();
      return;
    }
    if(!item.editorial_title||!item.editorial_summary){
      setAdminNotice('Guarda primero un titular y resumen originales.',true);return;
    }
    if(!['sourceRead','factsChecked','rightsChecked'].every(name=>form.elements.namedItem(name).checked)){
      setAdminNotice('Confirma la fuente, los hechos y los derechos.',true);return;
    }
    if(!window.confirm('¿Aprobar internamente esta noticia? NO se publicará en RedLibertad.'))return;
  }
  if(action==='reject'&&!window.confirm('¿Rechazar este candidato editorial?'))return;
  const payload=decision?{
    revision:Number(item.revision),decision:action,note,
    sourceRead:form.elements.namedItem('sourceRead').checked,
    factsChecked:form.elements.namedItem('factsChecked').checked,
    rightsChecked:form.elements.namedItem('rightsChecked').checked
  }:{
    revision:Number(item.revision),
    title:String(form.elements.namedItem('title').value||'').trim(),
    summary:String(form.elements.namedItem('summary').value||'').trim(),
    note
  };
  const controls=[...form.querySelectorAll('button')];
  controls.forEach(b=>b.disabled=true);
  try{
    const url='/api/admin/editorial/review/'+encodeURIComponent(item.id)+(decision?'/decision':'/draft');
    const {r,d}=await api(url,{
      method:decision?'POST':'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!r.ok){
      const messages={
        editorial_review_stale:'La noticia ha cambiado. Actualiza y vuelve a revisarla.',
        editorial_original_draft_required:(d.fields&&Object.values(d.fields).length?Object.values(d.fields).join(' '):'Revisa y guarda un titular y resumen distintos de los textos del RSS.'),
        editorial_source_not_approved:'La fuente no está aprobada o el enlace no es válido.',
        editorial_review_locked:'La noticia ya está revisada. Reábrela para editarla.'
      };
      throw Error(messages[d.error]||d.error||'No se pudo guardar');
    }
    if(action==='reopen' && $('#editorialReviewFilter')) $('#editorialReviewFilter').value='pending';
    setAdminNotice(action==='save'?'Borrador guardado.':action==='reopen'?'Noticia reabierta. Ahora está en Pendientes para editarla.':action==='approve'?'Noticia aprobada internamente (sin publicar).':'Noticia rechazada.');
    closeEditorialReview();
    await Promise.all([loadEditorialInboxV321(action==='save'?String(item.id):''),loadEditorialV320(),loadEditorialPublicV323(),loadEditorialQualityV325(),loadEditorialPlanningV326(),loadEditorialDailyV327()]);
    if(action==='save'){
      const refreshed=editorialReviewItems.find(row=>String(row.id)===String(item.id));
      if(refreshed)openEditorialReview(refreshed);
    }
  }catch(e){setAdminNotice('Revisión no guardada: '+e.message,true);}
  finally{controls.forEach(b=>b.disabled=false);}
}
$('#editorialReviewForm')?.addEventListener('submit',event=>{
  event.preventDefault();submitEditorialReview('save');
});
$('#editorialReviewActions')?.addEventListener('click',event=>{
  const button=event.target.closest('button[data-editorial-decision]');
  if(button)submitEditorialReview(button.dataset.editorialDecision);
});
$('#editorialInboxReload')?.addEventListener('click',()=>loadEditorialInboxV321());
$('#editorialSources')?.addEventListener('click',async ev=>{
  const button=ev.target.closest('button[data-editorial-fetch]');
  if(!button)return;
  const id=String(button.dataset.editorialFetch||'');
  if(!/^[1-9]\d{0,8}$/.test(id))return;
  button.disabled=true;
  const before=button.textContent;
  button.textContent='Consultando…';
  try{
    const {r,d}=await api('/api/admin/editorial/sources/'+encodeURIComponent(id)+'/fetch',{method:'POST'});
    if(!r.ok){
      const labels={editorial_source_not_approved:'Aprueba la fuente antes de consultarla.',editorial_fetch_cooldown:'Puedes consultar la misma fuente cada 5 minutos.',editorial_fetch_already_running:'Esta fuente ya se está consultando.',feed_redirect_blocked:'La fuente redirige: introduce la URL final HTTPS.',feed_network_blocked:'El destino de red no está permitido.',feed_dns_error:'No se puede resolver el dominio RSS desde el VPS (DNS).',feed_tls_error:'Falló la conexión segura HTTPS con el medio (certificado o TLS).',feed_connect_error:'El servidor no pudo establecer conexión con la fuente. Comprueba la salida HTTPS del VPS.',feed_response_error:'Se interrumpió la descarga del RSS. Inténtalo de nuevo.',feed_timeout:'La fuente tardó demasiado en responder. Inténtalo más tarde.',feed_http_error:'La fuente devolvió un error HTTP. Comprueba la URL RSS.',feed_url_rejected:'La URL RSS debe ser HTTPS, sin credenciales ni redirecciones inseguras.',feed_not_xml:'La respuesta no es RSS o Atom.',feed_parse_failed:'El XML no es un feed RSS/Atom válido.',feed_xml_rejected:'XML no admitido por seguridad.',feed_too_large:'El feed supera el tamaño máximo.'};
      throw Error(labels[d.error]||'No fue posible consultar la fuente ('+String(d.error||r.status)+').');
    }
    setAdminNotice('RSS consultado: '+Number(d.added||0)+' nuevas, '+Number(d.duplicates||0)+' duplicadas.');
    await Promise.all([loadEditorialV320(),loadEditorialInboxV321()]);
  }catch(e){setAdminNotice(e.message,true);}
  finally{button.disabled=false;button.textContent=before;}
});



// V3.2.3 public editorial release: explicit admin actions only.
let editorialPublishingBusy=false;
async function loadEditorialPublicV323(){
  const status=$('#editorialPublicStatus'),root=$('#editorialPublicItems');
  if(!status||!root)return;
  try{
    const {r,d}=await api('/api/admin/editorial/publication-queue');
    if(!r.ok)throw Error('publication_queue_unavailable');
    const items=Array.isArray(d.items)?d.items:[];
    status.textContent=items.length+' noticia(s) aprobada(s) · Publicación solo manual';
    root.innerHTML=items.map(item=>{
      const live=item.publication_id && !item.unpublished_at;
      const linked=item.publication_id
        ?'<a href="/noticias/p/'+encodeURIComponent(item.publication_id)+'" target="_blank" rel="noopener noreferrer">Ver publicación ↗</a>':'';
      const preview='<details class="editorial-pub-preview"><summary>Vista previa y atribución</summary>'+
        '<h3>'+esc(item.editorial_title||'Sin título')+'</h3><p>'+esc(item.editorial_summary||'Sin resumen')+'</p>'+
        (imageLocalV3222(item.editorial_image_url)
          ?'<figure class="editorial-pub-photo-v3222"><img loading="lazy" src="'+esc(item.editorial_image_url)+
          '" alt="'+esc(item.editorial_image_alt||'Fotografía editorial')+'"><figcaption>Imagen: '+
          esc(item.editorial_image_credit||'Crédito documentado')+'</figcaption></figure>':'')+
        '<small>Perfil: '+esc(item.profile_name||'Sin perfil')+' · Categoría: '+esc(item.category)+
        ' · Fuente: '+esc(item.source_name||'No disponible')+'</small></details>';
      const qualityOk=item.quality_decision==='clear' && Number(item.quality_revision)===Number(item.revision);
      const alignment=item.alignment||{ok:false,issues:[{message:'No se pudo comprobar la asignación editorial.'}],canReconcile:false};
      const aligned=alignment.ok===true;
      const ready=!!item.editorial_title && !!item.editorial_summary && item.source_status==='approved' &&
        item.profile_status==='ready' && aligned && qualityOk;
      const orphanPublished=item.source_id==null&&!live;
      const mismatch=!aligned&&!live
        ?'<div class="editorial-assignment-alert-v32181" role="alert"><strong>'+
          (orphanPublished?'Noticia sin fuente RSS activa: publicación bloqueada':'Asignación editorial pendiente de corregir')+
          '</strong><ul>'+
          (alignment.issues||[]).map(issue=>'<li>'+esc(issue.message||'Comprueba la asignación editorial.')+'</li>').join('')+
          '</ul><p>Fuente RSS: '+esc(item.source_name||'Sin fuente')+
          ' · Categoría fuente: '+esc(editorialCategoryLabelsV3215[item.source_category]||item.source_category||'No definida')+
          ' · Perfil de la fuente: '+esc(item.source_profile_name||'Sin asignar')+
          ' · Categoría de la noticia: '+esc(editorialCategoryLabelsV3215[item.category]||item.category)+
          '</p><p><a href="#editorialCenter">Revisar fuentes y perfiles editoriales</a></p>'+
          (alignment.canReconcile?'<button type="button" class="soft" data-editorial-reconcile="'+esc(item.id)+'">Reasignar y devolver a revisión</button>':
            '<p>Antes de continuar, configura una fuente RSS aprobada con un perfil preparado de su misma categoría y pulsa Actualizar.</p>')+
          '</div>':'';

      return '<article class="report" data-editorial-pub="'+esc(item.id)+'"><div>'+
        '<b>'+esc(item.editorial_title||'Noticia pendiente de completar')+'</b>'+
        '<p>'+esc(item.profile_name||'Sin perfil')+' · '+esc(item.source_name||'Sin fuente')+' · '+
        (live?'Publicada':orphanPublished?'Fuente RSS eliminada o sin vincular':!aligned?'Asignación editorial incompatible':ready?'Aprobada y apta; lista para publicar':!qualityOk?'Pendiente de control de calidad':'Necesita perfil y fuente aprobados')+'</p>'+mismatch+preview+
        '<div class="actions">'+
        (live?'<button type="button" class="soft" data-editorial-unpublish="'+esc(item.id)+'">Retirar publicación</button>'
          :'<button type="button" class="alt" data-editorial-publish="'+esc(item.id)+'" '+(ready?'':'disabled')+'>Publicar manualmente</button>')+
        (live?linked:'')+'</div></div></article>';
    }).join('')||'<div class="empty-admin">No hay noticias aprobadas para publicar.</div>';
    window.editorialPublishingRowsV323=items;
  }catch(_){
    status.textContent='No se pudo cargar la cola de publicación.';
    root.textContent='Actualiza o revisa la conexión.';
  }
}
// Reconciliation is deliberately separate from publication and requires a
// second human review plus a fresh quality clearance at the new revision.
$('#editorialPublicItems')?.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-editorial-reconcile]');
  if(!button||editorialPublishingBusy)return;
  const id=button.dataset.editorialReconcile;
  const item=(window.editorialPublishingRowsV323||[]).find(row=>String(row.id)===String(id));
  if(!item||!item.alignment?.canReconcile||!(/^[1-9][0-9]{0,14}$/.test(String(id))))return;
  const question='¿Reasignar esta noticia a la categoría «'+
    (editorialCategoryLabelsV3215[item.source_category]||item.source_category)+
    '» y al perfil «'+(item.source_profile_name||'No asignado')+'» de su fuente RSS? '+
    'Se conservarán los textos, pero la noticia volverá a Pendientes y necesitará aprobación humana y control de calidad nuevos. NO se publicará.';
  if(!window.confirm(question))return;
  editorialPublishingBusy=true;button.disabled=true;
  try{
    const {r,d}=await api('/api/admin/editorial/reconcile/'+encodeURIComponent(id),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({revision:Number(item.revision),confirm:true})
    });
    if(!r.ok)throw Error({
      editorial_review_stale:'La noticia cambió. Actualiza antes de continuar.',
      editorial_review_required:'Solo puede corregirse una noticia aprobada que no esté publicada.',
      editorial_unpublish_before_reopen:'Retira primero la publicación pública.',
      editorial_source_assignment_invalid:'La fuente RSS no tiene un perfil preparado y coherente con su categoría. Corrige primero la fuente.',
      editorial_assignment_already_valid:'La asignación ya es correcta. Actualiza la lista.'
    }[d.error]||d.error||'No se pudo corregir la asignación.');
    setAdminNotice('Asignación corregida. Noticia devuelta a Pendientes: vuelve a revisar y aprobar el texto y completar un nuevo control de calidad. No se ha publicado.');
    if($('#editorialReviewFilter'))$('#editorialReviewFilter').value='pending';
    closeEditorialReview();
    await Promise.all([loadEditorialPublicV323(),loadEditorialInboxV321(String(id)),
      loadEditorialQualityV325(),loadEditorialV320(),loadEditorialDailyV327()]);
    const refreshed=editorialReviewItems.find(row=>String(row.id)===String(id));
    if(refreshed)openEditorialReview(refreshed);
    else $('#editorialInbox')?.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){setAdminNotice('Asignación editorial: '+e.message,true);}
  finally{editorialPublishingBusy=false;button.disabled=false;}
});
$('#editorialPublicReload')?.addEventListener('click',loadEditorialPublicV323);
$('#editorialPublicItems')?.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-editorial-publish],button[data-editorial-unpublish]');
  if(!button||editorialPublishingBusy)return;
  const publish=!!button.dataset.editorialPublish;
  const id=button.dataset.editorialPublish||button.dataset.editorialUnpublish;
  const item=(window.editorialPublishingRowsV323||[]).find(row=>String(row.id)===String(id));
  if(!item||!(/^[1-9][0-9]{0,14}$/.test(String(id))))return;
  const question=publish
    ?'Vas a publicar esta noticia en /noticias, accesible a todo el mundo. ¿Has revisado personalmente el texto, la fuente, el contexto y los derechos de uso?'
    :'¿Retirar esta noticia de la sección pública de RedLibertad?';
  if(!window.confirm(question))return;
  editorialPublishingBusy=true;
  button.disabled=true;
  try{
    const endpoint=publish?'publish':'unpublish';
    const {r,d}=await api('/api/admin/editorial/'+endpoint+'/'+encodeURIComponent(id),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(publish?{revision:Number(item.revision),confirm:true}:{confirm:true})
    });
    if(!r.ok){
      const messages={
        editorial_daily_limit:'Límite piloto: máximo seis noticias visibles nuevas al día.',
        editorial_review_stale:'La noticia ha cambiado. Actualiza antes de publicar.',
        editorial_review_required:'La noticia todavía no está aprobada.',
        editorial_source_or_profile_not_ready:'Fuente o perfil editorial no preparado.',
        editorial_profile_mismatch:'La categoría y el perfil asignados no coinciden.',
        editorial_already_published:'Esta noticia ya está publicada.',
        editorial_quality_clearance_required:'Revisa la calidad y márcala apta antes de publicar.'
      };
      throw Error(messages[d.error]||d.error||'Error al publicar');
    }
    setAdminNotice(publish?'Noticia publicada manualmente.':'Noticia retirada de la sección pública.');
    await Promise.all([loadEditorialPublicV323(),loadEditorialInboxV321()]);
  }catch(e){setAdminNotice('Publicación editorial: '+e.message,true);}
  finally{editorialPublishingBusy=false;button.disabled=false;}
});

// V3.2.4 — review reports about real users' comments on editorial articles.
async function loadEditorialSocialModeration(){
  const summary=$('#editorialModerationStatus'),root=$('#editorialModerationReports');
  if(!summary||!root)return;
  try{
    const {r,d}=await api('/api/admin/editorial/comment-reports');
    if(!r.ok)throw Error('editorial_reports_unavailable');
    const reports=Array.isArray(d.reports)?d.reports:[];
    summary.textContent=reports.length+' denuncia(s) pendiente(s)';
    root.innerHTML=reports.map(item=>
      '<article class="report"><b>Denuncia #'+esc(item.id)+' · '+esc(item.reason)+'</b>'+
      '<p>'+esc(item.comment_body||'Comentario no disponible')+'</p>'+
      '<small>Usuario: '+esc(item.comment_author||'No disponible')+
      ' · Fecha: '+esc(timeLabel(item.created_at))+' · Noticia #'+esc(item.publication_id)+'</small>'+
      '<div class="actions"><button type="button" class="soft" data-ed-report-action="dismiss" data-ed-report-id="'+esc(item.id)+'">Descartar denuncia</button>'+
      '<button type="button" data-ed-report-action="remove" data-ed-report-id="'+esc(item.id)+'">Retirar comentario</button></div></article>'
    ).join('')||'<p>No hay denuncias editoriales pendientes.</p>';
  }catch(_){
    summary.textContent='No se pudieron consultar las denuncias.';
    root.textContent='Actualiza para reintentar.';
  }
}
$('#editorialModerationReload')?.addEventListener('click',loadEditorialSocialModeration);
$('#editorialModerationReports')?.addEventListener('click',async event=>{
  const btn=event.target.closest('button[data-ed-report-action]');
  if(!btn)return;
  const id=String(btn.dataset.edReportId||'');
  const action=btn.dataset.edReportAction;
  if(!/^[1-9][0-9]{0,14}$/.test(id)||!['remove','dismiss'].includes(action))return;
  if(!window.confirm(action==='remove'?'¿Retirar este comentario y resolver sus denuncias?':'¿Descartar las denuncias sobre este comentario?'))return;
  btn.disabled=true;
  try{
    const {r,d}=await api('/api/admin/editorial/comment-reports/'+encodeURIComponent(id)+'/resolve',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})
    });
    if(!r.ok)throw Error(d.error||'No se pudo resolver la denuncia');
    setAdminNotice(action==='remove'?'Comentario retirado.':'Denuncia descartada.');
    await loadEditorialSocialModeration();
  }catch(e){setAdminNotice(e.message,true);}
  finally{btn.disabled=false;}
});

// V3.2.5 — aggregated quality signals and human-assessed publishing clearance.
let editorialQualityItemsV325=[];
async function loadEditorialQualityV325(focusId=''){
  const status=$('#editorialQualityStatus'),metrics=$('#editorialQualityMetrics');
  const sources=$('#editorialQualitySources'),queue=$('#editorialQualityQueue');
  if(!status||!metrics||!sources||!queue)return;
  try{
    const {r,d}=await api('/api/admin/editorial/quality/overview'+(focusId?'?focus='+encodeURIComponent(focusId):''));
    if(!r.ok)throw Error(d.error||'quality_overview_unavailable');
    const m=d.summary||{},period=Number(d.periodDays||30);
    const pairs=[
      ['Fuentes',m.sources],['Detectadas ('+period+' días)',m.candidates_30d],
      ['Aprobadas',m.approved_30d],['Rechazadas',m.rejected_30d],
      ['Publicadas',m.published_30d],['Noticias visibles',m.live_publications],
      ['Me gusta reales',m.likes_30d],['Comentarios visibles',m.comments_30d],
      ['Denuncias recibidas',m.reports_30d],['Retenidas',m.quality_holds]
    ];
    metrics.innerHTML=pairs.map(([label,value])=>
      '<div class="metric"><b>'+esc(Number(value||0))+'</b><span>'+esc(label)+'</span></div>'
    ).join('');
    const sourceRows=Array.isArray(d.sources)?d.sources:[];
    sources.innerHTML=sourceRows.map(item=>
      '<article class="report"><b>'+esc(item.name)+' · '+esc(item.status)+'</b>'+
      '<small>'+esc(item.category)+' · Última consulta: '+esc(timeLabel(item.last_checked_at))+'</small>'+
      '<p>'+Number(item.candidates_30d||0)+' encontradas · '+Number(item.approved_30d||0)+' aprobadas · '+
      Number(item.rejected_30d||0)+' rechazadas · '+Number(item.publications_30d||0)+' publicadas</p>'+
      '<small>'+Number(item.fetches_30d||0)+' consultas RSS y '+Number(item.duplicates_30d||0)+' duplicadas descartadas (30 días)</small></article>'
    ).join('')||'<p>No hay fuentes configuradas.</p>';
    editorialQualityItemsV325=Array.isArray(d.queue)?d.queue:[];
    const labels={noticia_antigua:'Publicación de origen de más de 7 días',fuente_no_aprobada:'Fuente no aprobada',
      perfil_no_preparado:'Perfil no preparado',texto_editorial_incompleto:'Texto sin terminar',enlace_no_https:'Revisar enlace HTTPS'};
    queue.innerHTML=editorialQualityItemsV325.map(item=>{
      const live=!!(item.publication_id&&!item.unpublished_at);
      const quality=item.quality_ready?'Apta':item.quality_decision==='hold'?'Retenida':'Sin comprobación vigente';
      const alerts=Array.isArray(item.signals)?item.signals:[];
      const cues=alerts.length?'<p class="editorial-quality-alerts">Señales para revisar: '+alerts.map(flag=>esc(labels[flag]||flag)).join(' · ')+'</p>':'';
      const disabled=live?'disabled':'';
      return '<article class="report"><details class="editorial-quality-detail" data-editorial-quality-id="'+esc(item.id)+'"><summary><b>'+esc(item.editorial_title||item.source_title)+
        '</b> · <span>'+esc(quality)+(live?' · Publicada':'')+'</span></summary>'+
        '<p>'+esc(item.editorial_summary||'Sin resumen editorial')+'</p>'+
        '<small>Fuente: '+esc(item.source_name||'No disponible')+' · Perfil: '+esc(item.profile_name||'No disponible')+
        ' · Revisión #'+Number(item.revision||0)+'</small>'+cues+
        '<form data-editorial-quality="'+esc(item.id)+'" class="editorial-quality-form">'+
          '<label>Motivo de evaluación <select name="reason" required>'+
            '<option value="accuracy">Exactitud de los hechos</option>'+
            '<option value="source">Fuente y procedencia</option>'+
            '<option value="rights">Derechos de reutilización</option>'+
            '<option value="context">Contexto y vigencia</option>'+
            '<option value="other">Otras comprobaciones</option></select></label>'+
          '<label>Justificación (mínimo 12 caracteres) <textarea name="note" required minlength="12" maxlength="500" rows="3">'+esc(item.quality_note||'')+'</textarea></label>'+
          '<label><input type="checkbox" name="sourceChecked"> Fuente original consultada</label>'+
          '<label><input type="checkbox" name="contextChecked"> Contexto y hechos comprobados</label>'+
          '<label><input type="checkbox" name="rightsChecked"> Derechos y atribución comprobados</label>'+
          '<div class="actions"><button type="submit" class="alt" data-quality-decision="clear">Marcar apta</button>'+
          '<button type="submit" class="soft" data-quality-decision="hold" '+disabled+'>Retener noticia</button></div>'+
        '</form>'+ (live?'<small>Para retener una noticia publicada, retírala primero desde Publicaciones editoriales.</small>':'')+
        '</details></article>';
    }).join('')||'<p>No hay noticias aprobadas pendientes de control de calidad.</p>';
    status.textContent='Actualizado · '+editorialQualityItemsV325.length+' noticias aprobadas · Período de '+period+' días';
  }catch(e){
    status.textContent='No se pudieron cargar las métricas y comprobaciones.';
    metrics.replaceChildren();sources.replaceChildren();queue.replaceChildren();
  }
}
$('#editorialQualityReload')?.addEventListener('click',loadEditorialQualityV325);
$('#editorialQualityQueue')?.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-editorial-quality]');
  if(!form)return;
  event.preventDefault();
  const id=String(form.dataset.editorialQuality||'');
  const decision=event.submitter?.dataset.qualityDecision;
  const item=editorialQualityItemsV325.find(row=>String(row.id)===id);
  if(!item||!['clear','hold'].includes(decision))return;
  const elements=form.elements;
  const data={
    revision:Number(item.revision),decision,
    reason:elements.namedItem('reason').value,
    note:String(elements.namedItem('note').value||'').trim(),
    sourceChecked:elements.namedItem('sourceChecked').checked,
    contextChecked:elements.namedItem('contextChecked').checked,
    rightsChecked:elements.namedItem('rightsChecked').checked
  };
  if(data.note.length<12)return setAdminNotice('Escribe una justificación de al menos 12 caracteres.',true);
  if(decision==='clear'&&(!data.sourceChecked||!data.contextChecked||!data.rightsChecked))
    return setAdminNotice('Confirma las tres comprobaciones antes de marcar la noticia como apta.',true);
  if(!window.confirm(decision==='clear'?'¿Confirmas que has comprobado manualmente fuente, contexto y derechos?':'¿Retener esta noticia para revisión adicional?'))return;
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{
    const {r,d}=await api('/api/admin/editorial/quality/'+encodeURIComponent(id),{
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
    });
    if(!r.ok){
      const messages={editorial_quality_stale:'La revisión cambió. Actualiza y comprueba de nuevo.',
        editorial_quality_unpublish_first:'Retira primero la noticia publicada.',
        editorial_quality_source_not_ready:'Prepara el perfil y aprueba la fuente antes de marcar apta.'};
      throw Error(messages[d.error]||d.error||'No se pudo guardar la evaluación');
    }
    setAdminNotice(decision==='clear'?'Comprobación registrada: noticia apta para publicación manual.':'Noticia retenida para nueva revisión.');
    await Promise.all([loadEditorialQualityV325(),loadEditorialPublicV323()]);
  }catch(e){setAdminNotice('Calidad editorial: '+e.message,true);}
  finally{buttons.forEach(b=>b.disabled=false);}
});

// V3.2.6 — priority and calendar are advisory. NEVER schedule or auto-publish.
let editorialPlanningRowsV326=[];
function editorialPlanningDateInput(iso){
  if(!iso)return '';
  const dt=new Date(iso);
  if(!Number.isFinite(dt.getTime()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate())+'T'+pad(dt.getHours())+':'+pad(dt.getMinutes());
}
function editorialPlanningDateLabel(iso){
  if(!iso)return 'Sin fecha';
  try{return new Intl.DateTimeFormat('es-ES',{
    timeZone:'Europe/Madrid',dateStyle:'medium',timeStyle:'short'
  }).format(new Date(iso));}
  catch(_){return 'Fecha sin formato';}
}
async function loadEditorialPlanningV326(){
  const status=$('#editorialPlanningStatus'),list=$('#editorialPlanningQueue'),calendar=$('#editorialPlanningCalendar');
  const form=$('#editorialPlanningFilters');
  if(!status||!list||!calendar||!form)return;
  const f=new FormData(form);
  const qs=new URLSearchParams();
  for(const name of ['category','sourceId','search','quality']){
    const value=String(f.get(name)||'').trim();
    if(value)qs.set(name,value);
  }
  try{
    const {r,d}=await api('/api/admin/editorial/planning/overview?'+qs.toString());
    if(!r.ok)throw Error(d.error||'No se pudo consultar el calendario');
    const currentSource=String(form.elements.namedItem('sourceId').value||'');
    const selector=$('#editorialPlanningSource');
    selector.innerHTML='<option value="">Todas las fuentes</option>'+(d.sources||[]).map(x=>
      '<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>'
    ).join('');
    selector.value=currentSource;
    editorialPlanningRowsV326=Array.isArray(d.items)?d.items:[];
    const calendarRows=Array.isArray(d.calendar)?d.calendar:[];
    calendar.innerHTML=calendarRows.map(row=>
      '<div class="editorial-planning-day"><b>'+esc(String(row.day||'').slice(0,10))+'</b><span>'+
      Number(row.count||0)+' / 6 objetivos</span></div>'
    ).join('')||'<p>No hay fechas planificadas.</p>';
    const reasons={
      noticia_reciente:'Actualidad reciente',
      menos_de_3_dias:'Fecha reciente',
      calidad_validada:'Calidad comprobada',
      calidad_pendiente:'Calidad sin aprobar',
      fuente_no_preparada:'Fuente no aprobada',
      perfil_no_preparado:'Perfil no preparado',
      categoria_repetida:'Categoría muy repetida',
      fuente_repetida:'Medio repetido',
      noticia_antigua:'Fecha de origen antigua',
      fecha_objetivo_manual:'Fecha editorial marcada',
      fecha_objetivo_vencida:'Fecha editorial pasada'
    };
    list.innerHTML=editorialPlanningRowsV326.map(item=>{
      const stale=item.plan_revision!==null&&item.plan_revision!==undefined&&Number(item.plan_revision)!==Number(item.revision);
      const tags=(item.reasons||[]).map(x=>esc(reasons[x]||x)).join(' · ');
      const planned=item.planned_for?'<small>Objetivo: '+esc(editorialPlanningDateLabel(item.planned_for))+'</small>':'<small>Sin fecha programada</small>';
      const saved=!!item.planned_for||!!item.planning_note||item.plan_revision!==null&&item.plan_revision!==undefined;
      return '<article class="report"><details class="editorial-planning-detail"><summary>'+
        '<b>'+esc(item.editorial_title||item.source_title)+'</b> <span class="editorial-rank">Selección '+Number(item.score||0)+'</span></summary>'+
        '<p>'+esc(item.editorial_summary||'Sin resumen editorial')+'</p>'+
        '<small>'+esc(item.source_name||'Fuente no disponible')+' · '+esc(item.category)+' · Prioridad '+Number(item.priority||2)+'</small>'+
        '<p class="editorial-planning-reasons">'+tags+'</p>'+planned+
        (stale?'<p class="editorial-planning-warning">La noticia cambió desde la última planificación. Comprueba de nuevo el contenido.</p>':'')+
        '<form class="editorial-planning-form" data-editorial-plan="'+esc(item.id)+'">'+
          '<label>Prioridad <select name="priority">'+[1,2,3].map(p=>
            '<option value="'+p+'" '+(Number(item.priority)===p?'selected':'')+'>'+
            ({1:'Baja',2:'Normal',3:'Alta'}[p])+'</option>').join('')+'</select></label>'+
          '<label>Fecha y hora objetivo (opcional, NO automática)<input name="plannedFor" type="datetime-local" value="'+esc(editorialPlanningDateInput(item.planned_for))+'"></label>'+
          '<label>Nota editorial <textarea name="note" rows="2" maxlength="500" placeholder="Motivo de selección / enfoque">'+esc(item.planning_note||'')+'</textarea></label>'+
          '<div class="actions"><button type="submit" class="alt">Guardar planificación</button>'+
          (saved?'<button type="button" class="soft" data-editorial-unplan="'+esc(item.id)+'">Quitar del calendario</button>':'')+'</div>'+
        '</form></details></article>';
    }).join('')||'<p>No hay noticias aprobadas que cumplan estos filtros.</p>';
    status.textContent=editorialPlanningRowsV326.length+' noticias en selección · Orden orientativo · Sin publicación automática';
  }catch(e){
    status.textContent='No se pudo cargar la selección editorial.';
    list.textContent='Actualiza para reintentar.';
    calendar.replaceChildren();
  }
}
$('#editorialPlanningReload')?.addEventListener('click',loadEditorialPlanningV326);
$('#editorialPlanningFilters')?.addEventListener('submit',event=>{
  event.preventDefault();
  loadEditorialPlanningV326();
});
for(const key of ['category','quality','sourceId']){
  $('#editorialPlanningFilters')?.elements.namedItem(key)?.addEventListener('change',loadEditorialPlanningV326);
}
$('#editorialPlanningQueue')?.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-editorial-plan]');
  if(!form)return;
  event.preventDefault();
  const id=String(form.dataset.editorialPlan||'');
  const item=editorialPlanningRowsV326.find(x=>String(x.id)===id);
  if(!item)return;
  const raw=String(form.elements.namedItem('plannedFor').value||'');
  const localTime=raw?new Date(raw):null;
  if(raw&&(!localTime||!Number.isFinite(localTime.getTime())))return setAdminNotice('Fecha de planificación incorrecta.',true);
  const payload={
    revision:Number(item.revision),
    priority:Number(form.elements.namedItem('priority').value),
    plannedFor:localTime?localTime.toISOString():null,
    note:String(form.elements.namedItem('note').value||'').trim()
  };
  if(!window.confirm('Guardar este objetivo editorial. No se publicará automáticamente.'))return;
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{
    const {r,d}=await api('/api/admin/editorial/planning/'+encodeURIComponent(id),{
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    if(!r.ok){
      const messages={editorial_planning_day_full:'Máximo de seis objetivos editoriales por día (hora de Madrid).',
        editorial_planning_date_out_of_range:'La fecha debe estar dentro de los próximos 90 días.',
        editorial_planning_stale:'La revisión cambió; actualiza y planifica otra vez.',
        editorial_planning_already_published:'Esta noticia ya está publicada.',
        editorial_planning_review_required:'La noticia no está aprobada.'};
      throw Error(messages[d.error]||d.error||'No se pudo guardar la planificación');
    }
    setAdminNotice('Objetivo editorial guardado. La publicación sigue siendo manual.');
    await loadEditorialPlanningV326();
  }catch(e){setAdminNotice('Calendario: '+e.message,true);}
  finally{buttons.forEach(b=>b.disabled=false);}
});
$('#editorialPlanningQueue')?.addEventListener('click',async event=>{
  const btn=event.target.closest('button[data-editorial-unplan]');
  if(!btn)return;
  const id=String(btn.dataset.editorialUnplan||'');
  if(!/^[1-9][0-9]{0,14}$/.test(id))return;
  if(!window.confirm('¿Quitar esta noticia del calendario manual?'))return;
  btn.disabled=true;
  try{
    const {r,d}=await api('/api/admin/editorial/planning/'+encodeURIComponent(id),{method:'DELETE'});
    if(!r.ok)throw Error(d.error||'No se pudo quitar el objetivo');
    setAdminNotice('Planificación eliminada. La noticia aprobada se conserva.');
    await loadEditorialPlanningV326();
  }catch(e){setAdminNotice('Calendario: '+e.message,true);}
  finally{btn.disabled=false;}
});

// V3.2.7 — Daily editorial desk. Read-only overview and navigation to existing workflows.
const editorialDailyTargetsV327={review:'editorialInbox',quality:'editorialQuality',planning:'editorialPlanning',
  publish:'editorialPublication',source:'editorialCenter'};
function editorialMadridTodayV327(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function editorialDailyEscV327(x){return esc(String(x??''));}
function editorialDailyRowV327(row,kind){
  const title=editorialDailyEscV327(row.editorial_title||row.source_title||row.title||row.name||'Sin título');
  const source=editorialDailyEscV327(row.source_name||row.name||'Fuente no disponible');
  const category=editorialDailyEscV327(row.category||'');
  const publicationId=row.id;
  const direct=kind==='published'?'<a href="/noticias/p/'+encodeURIComponent(publicationId)+'" target="_blank" rel="noopener noreferrer">Ver noticia publicada ↗</a>':'';
  let action='review';
  if(kind==='ready')action='publish';
  if(kind==='planned')action=row.publication_prechecks_met?'publish':'quality';
  if(kind==='needsQuality')action='quality';
  if(kind==='sourceAlerts')action='source';
  if(kind==='published')action='publish';
  const short={
    review:'Revisar noticia',quality:'Ver controles de calidad',
    publish:'Ir a publicación manual',source:'Revisar fuente'
  };
  const flags=[];
  if(kind==='pending'&&row.advice){
    flags.push('Prioridad orientativa: '+(row.advice.priority_label||'media')+' ('+Number(row.advice.priority_score||0)+'/100)');
    if(row.advice.category_suggestion?.changeSuggested)flags.push('Revisar categoría sugerida');
    if(row.advice.possible_duplicates?.length)flags.push('Posibles temas repetidos: '+row.advice.possible_duplicates.length);
  }
  if(row.overdue)flags.push('Fecha prevista vencida');
  if(row.plan_stale)flags.push('La noticia cambió tras planificarla');
  if(kind==='planned'&&!row.publication_prechecks_met)flags.push('Faltan requisitos para publicar');
  if(kind==='ready')flags.push('Condiciones preliminares de publicación cumplidas');
  if(kind==='sourceAlerts')flags.push('Más de 48 h sin consulta registrada');
  const small=kind==='published'?
    '<small>Publicado: '+editorialDailyEscV327(timeLabel(row.published_at))+' · '+source+'</small>':
    '<small>'+source+(category?' · '+category:'')+'</small>';
  const plan=row.planned_for?
    '<small>Objetivo: '+editorialDailyEscV327(new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'medium',timeStyle:'short'}).format(new Date(row.planned_for)))+'</small>':'';
  return '<article class="editorial-daily-item"><b>'+title+'</b>'+small+plan+
    (flags.length?'<p class="editorial-daily-flags">'+flags.map(editorialDailyEscV327).join(' · ')+'</p>':'')+
    '<div class="actions">'+direct+'<button type="button" class="soft" data-editorial-daily-target="'+action+'" data-editorial-daily-id="'+editorialDailyEscV327(row.id)+'">'+
    editorialDailyEscV327(short[action])+'</button></div></article>';
}
async function loadEditorialDailyV327(){
  const input=$('#editorialDailyDay'),state=$('#editorialDailyStatus'),metrics=$('#editorialDailyMetrics'),
    sections=$('#editorialDailySections');
  if(!input||!state||!metrics||!sections)return;
  if(!input.value)input.value=editorialMadridTodayV327();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.value)){
    state.textContent='Selecciona una fecha válida.';return;
  }
  try{
    const {r,d}=await api('/api/admin/editorial/daily/overview?day='+encodeURIComponent(input.value));
    if(!r.ok)throw Error(d.error||'No se pudo cargar la jornada');
    const m=d.totals||{},groups=d.groups||{};
    const totals=[
      ['Por revisar',m.pending],['Previstas o vencidas',m.due],
      ['Publicadas en la jornada',m.published],['Aptas mostradas',m.readyShown],
      ['Para comprobar',m.blockedShown],['Fuentes por consultar',m.sourceAlerts]
    ];
    metrics.innerHTML=totals.map(([label,num])=>'<div class="metric"><b>'+Number(num||0)+'</b><span>'+editorialDailyEscV327(label)+'</span></div>').join('');
    const sets=[
      ['planned','Noticias previstas o vencidas','Planificadas para esta jornada o pendientes de una fecha anterior.'],
      ['ready','Listas para publicación manual','Comprobaciones preliminares correctas; aún hay que confirmar cada publicación.'],
      ['pending','Pendientes de revisión','Nuevas noticias RSS sin decisión editorial.'],
      ['needsQuality','Necesitan completar controles','Aprobadas editorialmente, pero aún no aptas para publicar.'],
      ['published','Publicadas en esta jornada','Publicaciones visibles, con su enlace correspondiente.'],
      ['sourceAlerts','Fuentes RSS a revisar','Fuentes aprobadas sin consulta registrada en más de 48 horas.']
    ];
    sections.innerHTML=sets.map(([key,title,explain])=>{
      const values=Array.isArray(groups[key])?groups[key]:[];
      return '<section class="editorial-daily-group" aria-labelledby="ed-daily-'+key+'"><h3 id="ed-daily-'+key+'">'+
        editorialDailyEscV327(title)+' <small>('+values.length+' mostradas)</small></h3>'+
        '<p class="panel-copy">'+editorialDailyEscV327(explain)+'</p>'+
        '<div class="editorial-daily-list">'+
        (values.length?values.map(row=>editorialDailyRowV327(row,key)).join(''):'<p>Sin elementos en esta sección.</p>')+
        '</div></section>';
    }).join('');
    state.textContent='Jornada '+input.value+' · Europe/Madrid · Actualización manual. Las listas pueden mostrar solo los registros más recientes.';
  }catch(e){
    state.textContent='No se pudo cargar la jornada ('+String(e.message||'error')+').';
    metrics.replaceChildren();sections.replaceChildren();
  }
}
$('#editorialDailyReload')?.addEventListener('click',loadEditorialDailyV327);
$('#editorialDailyToday')?.addEventListener('click',()=>{
  $('#editorialDailyDay').value=editorialMadridTodayV327();loadEditorialDailyV327();
});
$('#editorialDailyDayForm')?.addEventListener('submit',event=>{
  event.preventDefault();loadEditorialDailyV327();
});
$('#editorialDailySections')?.addEventListener('click',async event=>{
  const control=event.target.closest('button[data-editorial-daily-target]');
  if(!control)return;
  const action=control.dataset.editorialDailyTarget;
  const sectionId=editorialDailyTargetsV327[action];
  if(!sectionId)return;
  const section=document.getElementById(sectionId);
  if(!section)return;
  const candidateId=String(control.dataset.editorialDailyId||'');
  const validId=/^[1-9][0-9]{0,14}$/.test(candidateId);
  control.disabled=true;
  try{
    if(validId&&action==='review'){
      $('#editorialReviewFilter').value='pending';
      closeEditorialReview();
      await loadEditorialInboxV321(candidateId);
      const item=editorialReviewItems.find(row=>String(row.id)===candidateId);
      if(item){openEditorialReview(item);return;}
      setAdminNotice('No se ha encontrado la noticia pendiente: puede haber cambiado de estado. Actualiza la jornada.',true);
    }
    if(validId&&action==='quality'){
      await loadEditorialQualityV325(candidateId);
      const detail=[...document.querySelectorAll('#editorialQualityQueue details[data-editorial-quality-id]')]
        .find(node=>node.dataset.editorialQualityId===candidateId);
      if(detail){
        detail.open=true;
        detail.scrollIntoView({behavior:'smooth',block:'center'});
        const summary=detail.querySelector('summary');
        summary?.setAttribute('tabindex','-1');summary?.focus({preventScroll:true});
        return;
      }
      setAdminNotice('La noticia ya no está pendiente de calidad. Actualiza la jornada.',true);
    }
    section.scrollIntoView({behavior:'smooth',block:'start'});
    const heading=section.querySelector('h2');
    if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
  }finally{control.disabled=false;}
});

$('#searchForm').addEventListener('submit', event => {
  event.preventDefault();
  users($('#search').value);
});
$('#reloadReports').addEventListener('click', reports);
$('#reportFilter').addEventListener('change', renderReports);
$('#reloadVerifications')?.addEventListener('click', verifications);
$('#verificationFilter')?.addEventListener('change', verifications);

(async () => {
  await Promise.all([loadEditorialV320(),loadEditorialInboxV321(),loadEditorialPublicV323(),loadEditorialSocialModeration(),loadEditorialQualityV325(),loadEditorialPlanningV326(),loadEditorialDailyV327(), growthCenter(), releaseVerification(), alertDeliveries(), operationalAlerts(), recoveryOverview(), runtimeOps(), securityOverview(), metrics(), betaOps(), seoHealth(), growthAttribution(), releaseControl(), supportAdmin(), reports(), users(), verifications()]);
})();
