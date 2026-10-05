const $ = s => document.querySelector(s);
let reportCache = [];
let userCache = [];

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
    ['Avisos · 30 días', d.warnings30d]
  ];
  $('#metrics').innerHTML = items.map(([label,value]) =>
    `<div class="metric"><b>${compact(value)}</b><span>${esc(label)}</span></div>`
  ).join('');
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
      ${!u.age_verified ? `<button class="soft" data-admin-action="verify-age" data-user-id="${u.id}">Verificar +18</button>` : ''}
      ${!u.creator_verified ? `<button class="alt" data-admin-action="verify-creator" data-user-id="${u.id}">Verificar creador</button>` : ''}
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
    setAdminNotice('Creador verificado. También queda verificado como +18.');
    await Promise.all([users($('#search').value), metrics()]);
  } catch (_) {
    setAdminNotice('No se pudo verificar al creador.', true);
  } finally {
    if (button) button.disabled = false;
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

  if (action === 'verify-age') return verifyAge(button.dataset.userId, button);
  if (action === 'verify-creator') return verifyCreator(button.dataset.userId, button);
  if (action === 'open-moderation') return openModeration(button.dataset.userId, button.dataset.userLabel);
  if (action === 'open-history') return openHistory(button.dataset.userId, button.dataset.userLabel);
  if (action === 'report-decision') {
    return decide(button.dataset.id, button.dataset.status, button.dataset.decision);
  }
});

$('#searchForm').addEventListener('submit', event => {
  event.preventDefault();
  users($('#search').value);
});
$('#reloadReports').addEventListener('click', reports);
$('#reportFilter').addEventListener('change', renderReports);

(async () => {
  await Promise.all([metrics(), reports(), users()]);
})();
