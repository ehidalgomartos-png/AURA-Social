const $ = s => document.querySelector(s);

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let data = {};
  try { data = await response.json(); } catch {}

  if (response.status === 401) {
    location.href = '/?login=1';
    throw new Error('unauthorized');
  }
  if (response.status === 403) {
    location.href = '/app?admin=denied';
    throw new Error('admin_required');
  }
  return { r: response, d: data };
}

function esc(s = '') {
  return String(s).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

function setAdminNotice(text, isError = false) {
  let box = document.getElementById('adminNotice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'adminNotice';
    box.style.cssText = [
      'position:fixed',
      'right:20px',
      'bottom:20px',
      'z-index:9999',
      'padding:12px 16px',
      'border-radius:12px',
      'font-weight:700',
      'box-shadow:0 10px 30px rgba(0,0,0,.12)'
    ].join(';');
    document.body.appendChild(box);
  }
  box.style.background = isError ? '#fff0ec' : '#e8f8f5';
  box.style.color = isError ? '#9c3d2c' : '#0d5b52';
  box.textContent = text;
  box.hidden = false;
  clearTimeout(setAdminNotice._timer);
  setAdminNotice._timer = setTimeout(() => { box.hidden = true; }, 2600);
}

async function metrics() {
  const { d } = await api('/api/admin/dashboard');
  $('#metrics').innerHTML = [
    ['Usuarios', d.users],
    ['Publicaciones', d.posts],
    ['Denuncias abiertas', d.openReports],
    ['Críticas', d.criticalReports],
    ['Creadores verificados', d.verifiedCreators]
  ].map(x => `<div class="metric"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
}

async function reports() {
  const { d } = await api('/api/admin/reports');

  $('#reports').innerHTML = d.reports.length
    ? d.reports.map(r => `
      <article class="report ${r.priority === 'critical' ? 'critical' : ''}">
        <b>#${r.id} · ${esc(r.reason)}</b>
        <span class="state">${esc(r.priority)}</span>
        <small>${esc(r.target_type)} #${r.target_id} · por @${esc(r.reporter_username)} · ${new Date(r.created_at).toLocaleString()}</small>
        <p>${esc(r.details || 'Sin detalles')}</p>
        ${r.status === 'open' ? `
          <div class="actions">
            <button data-admin-action="report-decision" data-id="${r.id}" data-status="resolved" data-decision="none">Resolver</button>
            ${r.target_type === 'post'
              ? `<button class="alt" data-admin-action="report-decision" data-id="${r.id}" data-status="resolved" data-decision="hide_post">Ocultar post</button>`
              : ''}
            <button class="soft" data-admin-action="report-decision" data-id="${r.id}" data-status="dismissed" data-decision="none">Descartar</button>
          </div>
        ` : `<small>Estado: ${esc(r.status)}</small>`}
      </article>
    `).join('')
    : '<p>No hay denuncias.</p>';
}

async function decide(id, status, action) {
  const note = prompt('Nota de moderación (opcional)') || '';
  const { r } = await api(`/api/admin/reports/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, action, note })
  });

  if (!r.ok) {
    setAdminNotice('No se pudo guardar la decisión.', true);
    return;
  }

  setAdminNotice('Decisión guardada.');
  await Promise.all([reports(), metrics()]);
}

async function users(q = '') {
  const { d } = await api('/api/admin/users?q=' + encodeURIComponent(q));

  $('#users').innerHTML = d.users.map(u => `
    <article class="user">
      <b>${esc(u.display_name)} · @${esc(u.username)}</b>
      <small>${esc(u.email)} · ${esc(u.status)}</small>

      <div>
        ${u.age_verified ? '<span class="state">+18 verificado</span>' : ''}
        ${u.creator_verified ? '<span class="state">creador verificado</span>' : ''}
      </div>

      <div class="actions">
        ${!u.age_verified
          ? `<button class="soft" data-admin-action="verify-age" data-user-id="${u.id}">Verificar +18</button>`
          : ''}
        ${!u.creator_verified
          ? `<button class="alt" data-admin-action="verify-creator" data-user-id="${u.id}">Verificar creador</button>`
          : ''}
      </div>
    </article>
  `).join('') || '<p>Sin resultados.</p>';
}

async function verifyAge(id, button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Verificando...';
  }

  try {
    const { r, d } = await api(`/api/admin/users/${id}/verify-age`, { method: 'POST' });
    if (!r.ok) throw new Error(d.error || 'verify_failed');
    setAdminNotice('Cuenta +18 verificada.');
    await Promise.all([users($('#search').value), metrics()]);
  } catch (error) {
    setAdminNotice('No se pudo verificar la mayoría de edad.', true);
    if (button) {
      button.disabled = false;
      button.textContent = 'Verificar +18';
    }
  }
}

async function verifyCreator(id, button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Verificando...';
  }

  try {
    const { r, d } = await api(`/api/admin/users/${id}/verify-creator`, { method: 'POST' });
    if (!r.ok) throw new Error(d.error || 'verify_failed');
    setAdminNotice('Creador verificado. También queda verificado como +18.');
    await Promise.all([users($('#search').value), metrics()]);
  } catch (error) {
    setAdminNotice('No se pudo verificar al creador.', true);
    if (button) {
      button.disabled = false;
      button.textContent = 'Verificar creador';
    }
  }
}

/*
  Event delegation instead of inline onclick.
  This is compatible with AURA's Content Security Policy:
  script-src 'self'
*/
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-admin-action]');
  if (!button) return;

  const action = button.dataset.adminAction;

  if (action === 'verify-age') {
    await verifyAge(button.dataset.userId, button);
    return;
  }

  if (action === 'verify-creator') {
    await verifyCreator(button.dataset.userId, button);
    return;
  }

  if (action === 'report-decision') {
    await decide(
      button.dataset.id,
      button.dataset.status,
      button.dataset.decision
    );
  }
});

$('#searchForm').addEventListener('submit', event => {
  event.preventDefault();
  users($('#search').value);
});

$('#reloadReports').addEventListener('click', reports);

(async () => {
  await Promise.all([metrics(), reports(), users()]);
})();
