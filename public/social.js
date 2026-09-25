const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let me = null;
let currentMode = 'foryou';
let currentFileMedia = null;
let activeConversationId = null;
let activeConversationOther = null;

async function api(url, opts = {}) {
  const r = await fetch(url, opts);
  let d = {};
  try { d = await r.json(); } catch (_) {}
  if (r.status === 401) {
    location.href = '/';
    throw new Error('unauthorized');
  }
  return { r, d };
}
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2600);
}
function initials(n = 'A') {
  return n.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}
function avatarHTML(p) {
  return p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : initials(p?.display_name || p?.username || 'A');
}
function esc(s = '') {
  return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function gateText(reason) {
  return ({
    login_required: 'Inicia sesión para ver este contenido.',
    age_verification_required: 'Necesitas acreditar que eres mayor de 18 años.',
    sensitive_content_disabled: 'Activa el contenido sensible desde tu perfil.',
    permission_required: 'Primero debes aceptar contenido sensible de esta persona.'
  })[reason] || 'Contenido protegido.';
}
function mediaHTML(p, compact = false) {
  if (p.gated) return `<div class="${compact ? 'tile-gate' : 'gate'}"><div>${compact ? '18+' : `<span class="badge">18+</span><b>Contenido sensible</b><p>${gateText(p.gate_reason)}</p>`}</div></div>`;
  const url = p.playback_url || p.media_url;
  if (!url) return '';
  if (p.media_type === 'image') return `<img src="${esc(url)}" loading="lazy" alt="Contenido de ${esc(p.username || '')}">`;
  if (p.media_provider === 'bunny-stream' && String(url).includes('iframe.mediadelivery.net')) return `<iframe src="${esc(url)}" loading="lazy" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture" allowfullscreen></iframe>`;
  return `<video src="${esc(url)}" controls playsinline preload="metadata"></video>`;
}
function postHTML(p) {
  return `<article class="post" data-id="${p.id}">
    <div class="post-head"><div class="avatar">${avatarHTML(p)}</div><div class="post-user"><b>${esc(p.display_name)} ${p.creator_verified ? '<span class="verified">✓</span>' : ''}</b><small>@${esc(p.username)} · ${p.post_kind === 'reel' ? 'Reel' : 'Publicación'}</small></div></div>
    <div class="post-media">${mediaHTML(p)}</div>
    <div class="post-actions"><button data-like="${p.id}">♡ ${p.like_count || 0}</button><button>◯ ${p.comment_count || 0}</button><button data-report="${p.id}">⋯</button></div>
    ${p.caption ? `<div class="post-caption"><b>${esc(p.username)}</b> ${esc(p.caption)}</div>` : ''}
  </article>`;
}

async function uploadFile(file) {
  if (!file) return null;
  const fd = new FormData();
  fd.append('file', file);
  const { r, d } = await api('/api/media/upload', { method: 'POST', body: fd });
  if (!r.ok) throw new Error(d.error === 'file_too_large' ? 'El archivo es demasiado grande.' : 'No se pudo subir el archivo.');
  return d.media;
}

async function loadMe() {
  const { d } = await api('/api/profiles/me/summary');
  me = d.profile;
  if (me.is_admin) $('#adminLink').classList.remove('hidden');
  $('#meCard').classList.remove('skeleton');
  $('#meCard').innerHTML = `<div class="mini-head"><div class="avatar">${avatarHTML(me)}</div><div><h3>${esc(me.display_name)}</h3><p>@${esc(me.username)} ${me.creator_verified ? '· ✓ Creador' : ''}</p></div></div><div class="mini-stats"><div><b>${me.post_count}</b><span>posts</span></div><div><b>${me.follower_count}</b><span>seguidores</span></div><div><b>${me.following_count}</b><span>siguiendo</span></div></div>`;
  updateNotificationBadge(me.notification_count || 0);
}
async function loadFeed(mode = currentMode) {
  currentMode = mode;
  const { d } = await api(`/api/posts/feed?mode=${mode}`);
  $('#feed').innerHTML = d.posts.length ? d.posts.map(postHTML).join('') : `<div class="info-card"><b>Aún no hay publicaciones aquí.</b><p>Sé de las primeras personas en compartir contenido en AURA.</p></div>`;
  bindPostActions($('#feed'));
}
async function loadStories() {
  const { d } = await api('/api/stories');
  const users = [], seen = new Set();
  for (const s of d.stories) if (!seen.has(s.user_id)) { seen.add(s.user_id); users.push(s); }
  $('#stories').innerHTML = `<button class="story" data-action="create"><div class="story-ring"><div>＋</div></div><small>Tu Story</small></button>` + users.map(s => `<div class="story" title="${s.gated ? gateText(s.gate_reason) : 'Story activa'}"><div class="story-ring"><div>${s.avatar_url ? `<img src="${esc(s.avatar_url)}">` : initials(s.display_name)}</div></div><small>${esc(s.username)}</small></div>`).join('');
  bindCreateButtons();
}
async function loadExplore() {
  const { d } = await api('/api/posts/discover');
  $('#exploreGrid').innerHTML = d.posts.map(p => `<div class="tile">${mediaHTML(p, true)}${p.post_kind === 'reel' ? '<span class="tile-label">REEL</span>' : ''}</div>`).join('') || '<p class="muted">Todavía no hay contenido para explorar.</p>';
}
async function loadReels() {
  const { d } = await api('/api/posts/feed?mode=latest');
  const reels = d.posts.filter(p => p.post_kind === 'reel');
  $('#reelsFeed').innerHTML = reels.map(postHTML).join('') || '<div class="info-card"><b>Todavía no hay Reels.</b><p>Publica el primero usando Crear → Reel.</p></div>';
  bindPostActions($('#reelsFeed'));
}

async function loadProfile() {
  if (!me) await loadMe();
  const { d } = await api(`/api/posts/user/${encodeURIComponent(me.username)}`);
  const web = me.website_url ? `<a href="${esc(me.website_url)}" target="_blank" rel="noopener noreferrer">${esc(me.website_url)}</a>` : '';
  $('#profileFull').innerHTML = `<div class="cover" ${me.cover_url ? `style="background-image:url('${esc(me.cover_url)}')"` : ''}></div><div class="profile-body"><div class="profile-avatar">${avatarHTML(me)}</div><div class="profile-title"><div><h2>${esc(me.display_name)} ${me.creator_verified ? '<span class="verified">✓</span>' : ''}</h2><p>@${esc(me.username)}</p></div><div class="profile-buttons"><button id="editProfile" class="secondary">Editar perfil</button><button id="sensitiveToggle" class="secondary">${me.show_sensitive ? 'Ocultar' : 'Mostrar'} contenido sensible</button></div></div><p class="profile-bio">${esc(me.bio || 'Todavía no has escrito una biografía.')}</p><div class="profile-meta">${me.location_label ? `<span>⌖ ${esc(me.location_label)}</span>` : ''}${web}</div><div class="profile-stats"><span><b>${me.post_count}</b> publicaciones</span><span><b>${me.follower_count}</b> seguidores</span><span><b>${me.following_count}</b> siguiendo</span></div><p class="muted">Edad: ${me.age_verified ? '✓ verificada' : 'pendiente de verificación'} · Creador: ${me.creator_verified ? '✓ verificado' : 'no verificado'}</p></div>`;
  $('#profilePosts').innerHTML = d.posts.map(p => `<div class="tile">${mediaHTML(p, true)}${p.post_kind === 'reel' ? '<span class="tile-label">REEL</span>' : ''}</div>`).join('');
  $('#sensitiveToggle').onclick = async () => {
    const { r } = await api('/api/profiles/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showSensitive: !me.show_sensitive }) });
    if (r.ok) { me.show_sensitive = !me.show_sensitive; toast('Preferencia actualizada'); await loadProfile(); await loadFeed(currentMode); }
  };
  $('#editProfile').onclick = openProfileModal;
  await loadConsents();
}

function openProfileModal() {
  const form = $('#profileForm');
  form.displayName.value = me.display_name || '';
  form.bio.value = me.bio || '';
  form.locationLabel.value = me.location_label || '';
  form.websiteUrl.value = me.website_url || '';
  $('#profileMessage').textContent = '';
  $('#profileModal').classList.remove('hidden');
}
$('#closeProfileModal').onclick = () => $('#profileModal').classList.add('hidden');
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#profileMessage');
  msg.textContent = 'Guardando...';
  try {
    const fd = new FormData(e.target);
    const avatar = await uploadFile($('#avatarFile').files[0]);
    const cover = await uploadFile($('#coverFile').files[0]);
    const payload = {
      displayName: fd.get('displayName'), bio: fd.get('bio'), locationLabel: fd.get('locationLabel'), websiteUrl: fd.get('websiteUrl'),
      ...(avatar ? { avatarUrl: avatar.url } : {}), ...(cover ? { coverUrl: cover.url } : {})
    };
    const { r, d } = await api('/api/profiles/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('No se pudo guardar el perfil.');
    me = { ...me, ...d.profile };
    $('#profileModal').classList.add('hidden');
    toast('Perfil actualizado');
    await loadMe(); await loadProfile();
  } catch (err) { msg.textContent = err.message; }
});

async function loadConsents() {
  const { d } = await api('/api/posts/consents/pending');
  const root = $('#consentRequests');
  if (!d.requests.length) { root.innerHTML = '<div class="info-card"><b>No tienes solicitudes pendientes.</b><p>Cuando alguien indique que apareces en una publicación, podrás revisarla aquí.</p></div>'; return; }
  root.innerHTML = d.requests.map(x => `<article class="consent-card"><div class="consent-head"><div class="avatar">${x.avatar_url ? `<img src="${esc(x.avatar_url)}">` : initials(x.display_name)}</div><div><b>${esc(x.display_name)}</b><small>@${esc(x.username)} solicita tu consentimiento</small></div></div><div class="consent-media">${x.gated ? `<div class="gate"><span class="badge">18+</span><b>Verificación necesaria</b><p>${gateText(x.gate_reason)}</p></div>` : mediaHTML(x)}</div>${x.caption ? `<p>${esc(x.caption)}</p>` : ''}<div class="consent-actions">${x.consent_status === 'pending' ? `<button class="primary" data-consent="approved" data-post="${x.id}">Autorizar</button><button class="danger-outline" data-consent="rejected" data-post="${x.id}">Rechazar</button>` : `<span class="approved-label">✓ Autorizado</span><button class="danger-outline" data-consent="revoked" data-post="${x.id}">Retirar autorización</button>`}</div></article>`).join('');
  $$('[data-consent]', root).forEach(b => b.onclick = async () => {
    if (b.dataset.consent === 'approved' && !d.ageVerified && b.closest('.consent-card').querySelector('.gate')) return toast('Primero necesitas verificar tu mayoría de edad.');
    const { r } = await api(`/api/posts/${b.dataset.post}/consent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: b.dataset.consent }) });
    if (r.ok) { toast(b.dataset.consent === 'revoked' ? 'Consentimiento retirado' : 'Decisión guardada'); await loadConsents(); }
  });
}

function bindPostActions(root) {
  $$('[data-like]', root).forEach(b => b.onclick = async () => { await api(`/api/posts/${b.dataset.like}/like`, { method: 'POST' }); loadFeed(currentMode); });
  $$('[data-report]', root).forEach(b => b.onclick = async () => {
    const reason = prompt('Motivo: minor / non_consensual_intimate_content / impersonation / harassment / threats / spam / copyright / sexual_services / prohibited_explicit_content / other_illegal');
    if (!reason) return;
    const { r } = await api('/api/moderation/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType: 'post', targetId: Number(b.dataset.report), reason, details: '' }) });
    toast(r.ok ? 'Denuncia enviada' : 'No se pudo enviar');
  });
}

function updateNotificationBadge(n) {
  const b = $('#notificationBadge');
  if (!b) return;
  b.textContent = n > 99 ? '99+' : String(n);
  b.classList.toggle('hidden', !n);
}
async function loadNotifications() {
  const { d } = await api('/api/notifications');
  updateNotificationBadge(d.unread);
  $('#notificationsList').innerHTML = d.notifications.length ? d.notifications.map(n => `<article class="notification-item ${n.read_at ? '' : 'unread'}" data-notification="${n.id}"><div class="avatar">${n.actor_avatar_url ? `<img src="${esc(n.actor_avatar_url)}">` : initials(n.actor_display_name || 'AURA')}</div><div><b>${n.actor_display_name ? esc(n.actor_display_name) : 'AURA'}</b><p>${esc(n.text)}</p><small>${new Date(n.created_at).toLocaleString()}</small></div></article>`).join('') : '<div class="info-card"><b>Todo al día.</b><p>Aquí aparecerán mensajes, follows y solicitudes de consentimiento.</p></div>';
  $$('[data-notification]').forEach(x => x.onclick = async () => { await api(`/api/notifications/${x.dataset.notification}/read`, { method: 'POST' }); x.classList.remove('unread'); });
}
$('#readAllNotifications').onclick = async () => { await api('/api/notifications/read-all', { method: 'POST' }); toast('Notificaciones marcadas como leídas'); await loadNotifications(); };

async function loadConversations(openId = null) {
  const { d } = await api('/api/messages/conversations');
  const total = d.conversations.reduce((a, x) => a + Number(x.unread_count || 0), 0);
  const badge = $('#messageBadge'); badge.textContent = total > 99 ? '99+' : String(total); badge.classList.toggle('hidden', !total);
  $('#conversationList').innerHTML = d.conversations.length ? d.conversations.map(c => `<button class="conversation-row ${String(c.id) === String(activeConversationId) ? 'active' : ''}" data-conversation="${c.id}"><div class="avatar">${c.avatar_url ? `<img src="${esc(c.avatar_url)}">` : initials(c.display_name)}</div><div class="conversation-copy"><b>${esc(c.display_name)} ${c.creator_verified ? '<span class="verified">✓</span>' : ''}</b><small>${c.last_content_level && c.last_content_level !== 'normal' ? 'Contenido sensible' : esc(c.last_body || 'Conversación nueva')}</small></div>${Number(c.unread_count) ? `<i class="count-badge">${c.unread_count}</i>` : ''}</button>`).join('') : '<div class="empty-list">Todavía no tienes conversaciones.</div>';
  $$('[data-conversation]').forEach(b => b.onclick = () => openConversation(b.dataset.conversation));
  if (openId) await openConversation(openId);
}
async function openConversation(id) {
  activeConversationId = id;
  const { d } = await api(`/api/messages/conversations/${id}/messages`);
  activeConversationOther = d.other;
  const messages = d.messages.map(m => messageHTML(m, d.other)).join('');
  $('#chatPanel').className = 'chat-panel';
  $('#chatPanel').innerHTML = `<header class="chat-head"><div class="avatar">${avatarHTML(d.other)}</div><div class="chat-person"><b>${esc(d.other.display_name)}</b><small>@${esc(d.other.username)}</small></div>${d.sensitiveAllowed ? `<button id="revokeSensitive" class="tiny-action">No recibir sensible</button>` : ''}</header><div id="messageThread" class="message-thread">${messages || '<div class="empty-state"><p>Empieza la conversación.</p></div>'}</div><form id="messageForm" class="message-form"><div class="message-options"><label>Archivo<input id="messageFile" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"></label><label>Tipo<select id="messageLevel"><option value="normal">Normal</option><option value="sensitive">Sensible</option><option value="nudity">Desnudez</option></select></label></div><div class="message-compose"><textarea id="messageBody" maxlength="4000" placeholder="Escribe un mensaje..."></textarea><button class="primary" type="submit">Enviar</button></div><small class="message-hint">El destinatario tendrá que aceptar antes de ver archivos sensibles enviados por ti.</small></form>`;
  $('#messageForm').onsubmit = sendMessage;
  $$('[data-accept-sensitive]').forEach(b => b.onclick = acceptSensitiveMessages);
  if ($('#revokeSensitive')) $('#revokeSensitive').onclick = async () => {
    await api(`/api/messages/users/${d.other.id}/sensitive-permission`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allow: false }) });
    toast('Ya no recibirás contenido sensible visible de esta persona');
    await openConversation(activeConversationId);
  };
  const thread = $('#messageThread'); thread.scrollTop = thread.scrollHeight;
  await loadConversations();
}
function messageHTML(m, other) {
  const mine = String(m.sender_id) === String(me.id);
  let body = m.body ? `<p>${esc(m.body)}</p>` : '';
  let media = '';
  if (m.gated) {
    media = `<div class="message-gate"><b>Contenido sensible oculto</b><span>${gateText(m.gate_reason)}</span>${m.gate_reason === 'permission_required' ? `<button class="secondary" data-accept-sensitive="${other.id}">Aceptar contenido sensible de @${esc(other.username)}</button>` : ''}</div>`;
  } else if (m.media_url || m.playback_url) {
    media = `<div class="message-media">${mediaHTML(m)}</div>`;
  }
  return `<div class="message-bubble ${mine ? 'mine' : 'theirs'}">${body}${media}<small>${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${m.content_level !== 'normal' ? ' · 18+' : ''}</small></div>`;
}
async function acceptSensitiveMessages(e) {
  const senderId = e.currentTarget.dataset.acceptSensitive;
  const { r, d } = await api(`/api/messages/users/${senderId}/sensitive-permission`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allow: true }) });
  if (!r.ok) return toast(d.error === 'age_verification_required' ? 'Necesitas verificación +18 para aceptar este contenido.' : 'No se pudo actualizar.');
  toast('Contenido sensible permitido para esta persona');
  await openConversation(activeConversationId);
}
async function sendMessage(e) {
  e.preventDefault();
  try {
    const file = $('#messageFile').files[0];
    const media = await uploadFile(file);
    const payload = { body: $('#messageBody').value, contentLevel: $('#messageLevel').value, ...(media ? { mediaUrl: media.url, mediaType: media.mediaType, mediaProvider: media.provider, externalId: media.externalId, playbackUrl: media.playbackUrl } : {}) };
    const { r, d } = await api(`/api/messages/conversations/${activeConversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(d.error === 'verified_creator_required_for_nudity' ? 'Necesitas ser creador adulto verificado para enviar desnudez.' : 'No se pudo enviar el mensaje.');
    await openConversation(activeConversationId);
  } catch (err) { toast(err.message); }
}
$('#newConversation').onclick = () => $('#newMessageModal').classList.remove('hidden');
$('#closeNewMessage').onclick = () => $('#newMessageModal').classList.add('hidden');
$('#newMessageForm').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target); const status = $('#newMessageStatus'); status.textContent = 'Abriendo...';
  const username = String(fd.get('username') || '').replace(/^@/, '');
  const { r, d } = await api('/api/messages/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  if (!r.ok) { status.textContent = d.error === 'user_not_found' ? 'No encuentro ese usuario.' : 'No se pudo abrir la conversación.'; return; }
  $('#newMessageModal').classList.add('hidden'); e.target.reset(); showView('messages'); await loadConversations(d.conversationId);
});

function showView(name) {
  $$('.view').forEach(v => v.classList.add('hidden'));
  $(`#${name}View`).classList.remove('hidden');
  $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'explore') loadExplore();
  if (name === 'reels') loadReels();
  if (name === 'profile') loadProfile();
  if (name === 'messages') loadConversations();
  if (name === 'notifications') loadNotifications();
}
$$('[data-view]').forEach(b => b.onclick = () => showView(b.dataset.view));
$$('[data-mode]').forEach(b => b.onclick = () => { $$('[data-mode]').forEach(x => x.classList.remove('active')); b.classList.add('active'); loadFeed(b.dataset.mode); });

function openModal() { $('#modal').classList.remove('hidden'); }
function bindCreateButtons() { $$('[data-action="create"]').forEach(b => b.onclick = openModal); }
bindCreateButtons();
$('#closeModal').onclick = () => $('#modal').classList.add('hidden');
$('#mediaFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  currentFileMedia = null;
  const u = URL.createObjectURL(f); $('#uploadText').classList.add('hidden');
  const p = $('#preview'); p.classList.remove('hidden'); p.innerHTML = f.type.startsWith('image/') ? `<img src="${u}">` : `<video src="${u}" controls></video>`;
});
async function ensureUpload() {
  if (currentFileMedia) return currentFileMedia;
  const f = $('#mediaFile').files[0]; if (!f) throw new Error('Selecciona un archivo.');
  currentFileMedia = await uploadFile(f); return currentFileMedia;
}
$('#createForm').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('#createMessage');
  try {
    msg.textContent = 'Subiendo archivo...'; const media = await ensureUpload(); const fd = new FormData(e.target); msg.textContent = 'Publicando...';
    const participants = String(fd.get('participants') || '').split(',').map(x => x.trim()).filter(Boolean);
    const { r, d } = await api('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caption: fd.get('caption'), kind: fd.get('kind'), contentLevel: fd.get('contentLevel'), participantUsernames: participants, mediaUrl: media.url, mediaType: media.mediaType, mediaProvider: media.provider, externalId: media.externalId, playbackUrl: media.playbackUrl }) });
    if (!r.ok) throw new Error(d.error === 'verified_creator_required_for_nudity' ? 'Necesitas verificación de creador adulto para publicar desnudez.' : d.error === 'participant_not_found' ? `No encontramos: ${(d.missing || []).join(', ')}` : 'No se pudo publicar.');
    toast(d.consentRequired ? 'Publicación guardada. Esperando consentimientos.' : 'Publicado');
    $('#modal').classList.add('hidden'); e.target.reset(); $('#preview').classList.add('hidden'); $('#uploadText').classList.remove('hidden'); currentFileMedia = null; await loadFeed('latest'); await loadMe();
  } catch (err) { msg.textContent = err.message; }
});
$('#storyForm').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('#storyMessage');
  try {
    msg.textContent = 'Publicando Story...'; const media = await ensureUpload(); const level = $('#createForm [name="contentLevel"]').value;
    const { r, d } = await api('/api/stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentLevel: level, mediaUrl: media.url, mediaType: media.mediaType, mediaProvider: media.provider, externalId: media.externalId, playbackUrl: media.playbackUrl }) });
    if (!r.ok) throw new Error(d.error === 'verified_creator_required_for_nudity' ? 'Necesitas verificación de creador adulto para esta Story.' : 'No se pudo publicar.');
    toast('Story publicada durante 24 h'); $('#modal').classList.add('hidden'); currentFileMedia = null; await loadStories();
  } catch (err) { msg.textContent = err.message; }
});
$('#logout').onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; };

window.addEventListener('aura-install-ready', e => {
  const button = $('#installApp');
  if (!button) return;
  button.classList.remove('hidden');
  button.onclick = async () => {
    const promptEvent = e.detail;
    promptEvent.prompt();
    await promptEvent.userChoice;
    button.classList.add('hidden');
  };
}, { once: true });

(async () => {
  try {
    await loadMe();
    await Promise.all([loadStories(), loadFeed('foryou'), loadConversations(), loadNotifications()]);
  } catch (e) { console.error(e); }
})();
