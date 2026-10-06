const $ = (s, r = document) => r.querySelector(s);
const all = (s, r = document) => [...r.querySelectorAll(s)];
let me = null;
let currentMode = 'foryou';
let currentFileMedia = null;
let activeConversationId = null;
let activeConversationOther = null;
let interestCatalog = [];
let activeExploreInterest = '';
let activeCommentsPostId = null;
let activeReportPostId = null;
let pendingDeleteComment = null;
let activeManagePost = null;
let deletePostArmed = false;
let activeContentMode = 'trending';
let activePostSearch = '';
let savedPostIds = new Set();
let toastTimer = null;
let ownProfileMode = 'posts';
let activeNotificationFilter = 'all';
let notificationCache = [];
const HOME_LAST_VISIT_KEY = 'redlibertad:last-home-visit';
const VIP_LAST_VISIT_KEY = 'redlibertad:last-vip-visit';
let visibleStories = [];
let storyGroups = new Map();
let activeStoryGroup = [];
let activeStoryIndex = 0;


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
  if (!el) return;
  if (toastTimer) clearTimeout(toastTimer);
  el.textContent = t;
  el.classList.remove('hidden', 'toast-enter');
  void el.offsetWidth;
  el.classList.add('toast-enter');
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('toast-enter');
  }, 2600);
}
function tapFeedback() {
  if (navigator.vibrate) navigator.vibrate(8);
}
function pulseAction(button) {
  if (!button) return;
  button.classList.remove('action-pop');
  void button.offsetWidth;
  button.classList.add('action-pop');
  setTimeout(() => button.classList.remove('action-pop'), 340);
}
function animateView(view) {
  if (!view) return;
  view.classList.remove('view-enter');
  void view.offsetWidth;
  view.classList.add('view-enter');
  setTimeout(() => view.classList.remove('view-enter'), 340);
}
function initials(n = 'R') {
  return n.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}
function avatarHTML(p) {
  return p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : initials(p?.display_name || p?.username || 'A');
}
function esc(s = '') {
  return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function captionHTML(value = '') {
  const source = String(value || '');
  const token = /(^|\s)(#[\p{L}\p{N}_]{2,40}|@[a-zA-Z0-9_.]{3,30})/gu;
  let out = '';
  let last = 0;

  for (const match of source.matchAll(token)) {
    const start = match.index;
    out += esc(source.slice(last, start));
    out += esc(match[1] || '');

    const raw = match[2];
    if (raw.startsWith('#')) {
      const tag = raw.slice(1);
      out += `<button type="button" class="hashtag-link" data-hashtag="${esc(tag)}">#${esc(tag)}</button>`;
    } else {
      const username = raw.slice(1);
      out += `<button type="button" class="mention-link" data-profile="${esc(username)}">@${esc(username)}</button>`;
    }

    last = start + match[0].length;
  }

  out += esc(source.slice(last));
  return out.replace(/\n/g, '<br>');
}
function timeAgo(value) {
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return 'ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
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
function profileLink(username, label, className = '') {
  return `<button type="button" class="profile-link ${className}" data-profile="${esc(username)}">${label}</button>`;
}

function participantsHTML(p) {
  const participants = Array.isArray(p.participants) ? p.participants : [];
  if (!participants.length) return '';

  const visible = participants.slice(0, 3).map(x =>
    profileLink(x.username, `@${esc(x.username)}`, 'participant-link')
  );
  const extra = participants.length > 3 ? ` <span class="participants-extra">y ${participants.length - 3} más</span>` : '';
  const taggedMe = me && participants.some(x => String(x.id) === String(me.id));

  return `<div class="post-participants"><span class="participants-label">Con ${visible.join(', ')}${extra}</span>${taggedMe ? '<span class="tagged-me">✓ Estás etiquetado</span>' : ''}</div>`;
}


function inlineCommentsHTML(p) {
  const comments = Array.isArray(p.latest_comments) ? p.latest_comments : [];
  const count = Number(p.comment_count || 0);

  if (!comments.length && !count) return '';

  const rows = comments.map(comment => `
    <div class="inline-comment">
      <div class="inline-comment-text">
        ${profileLink(
          comment.username,
          `<b>@${esc(comment.username)}</b>`,
          'inline-comment-user'
        )}
        <span>${captionHTML(comment.body)}</span>
      </div>
      ${comment.can_delete ? `
        <button
          type="button"
          class="comment-delete-button inline"
          data-delete-comment="${comment.id}"
          data-delete-comment-post="${p.id}"
          aria-label="Eliminar comentario"
          title="Eliminar comentario">×</button>
      ` : ''}
    </div>
  `).join('');

  const more = count > comments.length
    ? `<button type="button" class="view-comments-link" data-comments="${p.id}">Ver los ${count} comentarios</button>`
    : count > 0
      ? `<button type="button" class="view-comments-link subtle" data-comments="${p.id}">Ver comentarios</button>`
      : '';

  return `<div class="inline-comments-preview">${rows}${more}</div>`;
}

function tileContentHTML(p) {
  const media = mediaHTML(p, true);
  if (media) return media;
  const text = String(p.caption || '').trim();
  if (!text) return '<div class="text-tile"><span>Publicación</span></div>';
  const shortText = text.length > 150 ? text.slice(0, 147) + '…' : text;
  return `<div class="text-tile"><span>${esc(shortText)}</span></div>`;
}

function postHTML(p) {
  const media = mediaHTML(p);
  const textOnly = !media;
  const ownPost = !!me && String(me.id) === String(p.user_id);
  const canManage = !!me && (ownPost || me.is_admin === true);
  const vipOnly = p.audience === 'vip';
  const liked = p.liked_by_me === true;
  const reposted = p.reposted_by_me === true;
  const repostBanner = p.repost_actor_username
    ? `<div class="repost-banner">⟳ ${profileLink(
        p.repost_actor_username,
        `${esc(p.repost_actor_display_name || p.repost_actor_username)} republicó esto`,
        'repost-profile-link'
      )}</div>`
    : '';
  return `<article class="post ${textOnly ? 'text-only-post' : ''} ${vipOnly ? 'vip-exclusive-post' : ''}" data-id="${p.id}">
    ${repostBanner}
    <div class="post-head">
      ${profileLink(p.username, `<span class="avatar">${avatarHTML(p)}</span>`, 'post-avatar-link')}
      <div class="post-user">
        ${profileLink(p.username, `<b>${esc(p.display_name)} ${p.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`, 'post-name-link')}
        <small>${profileLink(p.username, `@${esc(p.username)}`, 'post-username-link')} · ${p.post_kind === 'reel' ? 'Reel' : 'Publicación'} · <span class="post-time">${timeAgo(p.created_at)}</span></small>
        ${vipOnly ? '<span class="vip-content-badge">★ SOLO VIP</span>' : ''}
        ${participantsHTML(p)}
      </div>
    </div>
    ${media ? `<div class="post-media">${media}</div>` : ''}
    ${p.caption ? `<div class="post-caption">${profileLink(p.username, `<b>${esc(p.username)}</b>`, 'caption-profile-link')} <span class="post-caption-text">${captionHTML(p.caption)}</span></div>` : ''}
    <div class="post-actions">
      <button class="${liked ? 'liked' : ''}" data-like="${p.id}" data-liked="${liked ? '1' : '0'}">${liked ? '♥' : '♡'} <span>${p.like_count || 0}</span></button>
      <button data-comments="${p.id}">◯ ${p.comment_count || 0}</button>
      <button class="${reposted ? 'reposted' : ''}" ${ownPost || vipOnly ? 'disabled' : `data-repost="${p.id}" data-reposted="${reposted ? '1' : '0'}"`} title="${vipOnly ? 'El contenido VIP no se puede republicar' : ownPost ? 'No puedes republicar tu propia publicación' : reposted ? 'Quitar republicación' : 'Republicar'}">⟳ <span>${p.repost_count || 0}</span></button>
      <button class="${savedPostIds.has(String(p.id)) ? 'saved' : ''}" data-save-post="${p.id}" data-saved="${savedPostIds.has(String(p.id)) ? '1' : '0'}" title="${savedPostIds.has(String(p.id)) ? 'Quitar de guardados' : 'Guardar publicación'}" aria-label="${savedPostIds.has(String(p.id)) ? 'Quitar de guardados' : 'Guardar publicación'}">${savedPostIds.has(String(p.id)) ? '★' : '☆'}</button>
      <button class="share-action" ${vipOnly ? 'disabled title="El contenido VIP no se puede compartir"' : `data-share="${p.id}"`}>↗ <span class="share-label">${vipOnly ? 'VIP' : 'Compartir'}</span></button>
      ${canManage
        ? `<button class="post-more" data-manage-post="${p.id}" data-caption="${encodeURIComponent(p.caption || '')}" aria-label="Gestionar publicación">⋯</button>`
        : `<button class="post-more" data-report="${p.id}" aria-label="Denunciar publicación">⋯</button>`}
    </div>
    ${inlineCommentsHTML(p)}
  </article>`;
}


function interestPillsHTML(interests = [], compact = false) {
  if (!Array.isArray(interests) || !interests.length) return '';
  const shown = interests.slice(0, compact ? 3 : 8);
  return `<div class="interest-pills ${compact ? 'compact' : ''}">${shown.map(i => `<span>${esc(i)}</span>`).join('')}</div>`;
}

function personCardHTML(user, compact = false) {
  const shared = Number(user.shared_interest_count || 0);
  const followers = Number(user.follower_count || 0);
  const reason = shared > 0
    ? `${shared} ${shared === 1 ? 'interés' : 'intereses'} en común`
    : followers > 0
      ? `${followers} ${followers === 1 ? 'seguidor' : 'seguidores'}`
      : 'Nuevo por aquí';

  return `<article class="person-card ${compact ? 'compact' : ''}" data-person-card="${user.id}">
    ${profileLink(user.username, `<span class="person-avatar">${avatarHTML(user)}</span>`, 'person-avatar-link')}
    <div class="person-copy">
      ${profileLink(user.username, `<b>${esc(user.display_name)} ${user.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`, 'person-name-link')}
      <small>${profileLink(user.username, `@${esc(user.username)}`, 'post-username-link')}${user.location_label ? ` · ${esc(user.location_label)}` : ''}</small>
      <span class="suggestion-reason">${reason}</span>
      ${!compact && user.bio ? `<p>${esc(user.bio)}</p>` : ''}
      ${interestPillsHTML(user.interests, compact)}
    </div>
    <button
      type="button"
      class="person-follow ${user.following ? 'following' : ''}"
      data-suggest-follow="${user.id}"
      data-following="${user.following ? '1' : '0'}">
      ${user.following ? 'Siguiendo' : 'Seguir'}
    </button>
  </article>`;
}

async function toggleSuggestedFollow(button) {
  const following = button.dataset.following === '1';
  button.disabled = true;

  try {
    const { r } = await api(`/api/profiles/${button.dataset.suggestFollow}/follow`, {
      method: following ? 'DELETE' : 'POST'
    });

    if (!r.ok) throw new Error('follow_failed');

    button.dataset.following = following ? '0' : '1';
    button.textContent = following ? 'Seguir' : 'Siguiendo';
    button.classList.toggle('following', !following);

    await loadMe();
    if ($('#homeSuggestions')) await loadHomeSuggestions();
    if ($('#activePeople')) await loadActivePeople();
    if ($('#growthPanel')) await loadGrowthPanel();
  } catch (_) {
    toast('No se pudo actualizar el seguimiento.');
  } finally {
    button.disabled = false;
  }
}

async function loadInterestCatalog() {
  if (interestCatalog.length) return interestCatalog;
  const { d } = await api('/api/profiles/interests');
  interestCatalog = Array.isArray(d.interests) ? d.interests : [];
  return interestCatalog;
}

function compactTimeAgo(value) {
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function momentumCardHTML(post) {
  const media = mediaHTML(post, true);
  const copy = String(post.caption || '').trim();
  const shortCopy = copy.length > 115 ? copy.slice(0, 112) + '…' : copy;
  const engagement = Number(post.like_count || 0) + Number(post.comment_count || 0) + Number(post.repost_count || 0);

  return `<button type="button" class="momentum-card" data-open-post="${post.id}">
    <div class="momentum-card-media">
      ${media || `<div class="momentum-text-preview">${esc(shortCopy || 'Publicación en RedLibertad')}</div>`}
    </div>
    <div class="momentum-card-copy">
      <span class="momentum-author"><span class="momentum-avatar">${avatarHTML(post)}</span><b>${esc(post.display_name)}</b></span>
      ${post.audience === 'vip' ? '<span class="vip-content-badge compact">★ SOLO VIP</span>' : ''}
      ${media && shortCopy ? `<p>${esc(shortCopy)}</p>` : ''}
      <small>${post.from_following ? 'Siguiendo · ' : ''}${compactTimeAgo(post.created_at)}${engagement ? ` · ${engagement} interacciones` : ''}</small>
    </div>
  </button>`;
}

function activePersonHTML(user) {
  const shared = Number(user.shared_interest_count || 0);
  const activity = compactTimeAgo(user.last_activity_at);
  const reason = shared
    ? `${shared} ${shared === 1 ? 'interés' : 'intereses'} en común`
    : user.following
      ? 'Ya le sigues'
      : 'Actividad reciente';

  return `<article class="active-person-card">
    ${profileLink(user.username, `<span class="active-person-avatar">${avatarHTML(user)}<i></i></span>`, 'active-person-profile')}
    <div class="active-person-copy">
      ${profileLink(user.username, `<b>${esc(user.display_name)}</b>`, 'active-person-name')}
      <small>@${esc(user.username)} · ${activity}</small>
      <span>${reason}</span>
    </div>
    <button type="button" class="person-follow ${user.following ? 'following' : ''}" data-suggest-follow="${user.id}" data-following="${user.following ? '1' : '0'}">${user.following ? 'Siguiendo' : 'Seguir'}</button>
  </article>`;
}

function readLastHomeVisit() {
  try {
    const value = localStorage.getItem(HOME_LAST_VISIT_KEY);
    const parsed = Date.parse(value || '');
    if (Number.isFinite(parsed)) return new Date(parsed);
  } catch (_) {}
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function storeHomeVisit(date = new Date()) {
  try { localStorage.setItem(HOME_LAST_VISIT_KEY, date.toISOString()); } catch (_) {}
}

function updateLatestModeBadge(count = 0) {
  const button = document.querySelector('[data-mode="latest"]');
  if (!button) return;
  const safeCount = Math.max(0,Number(count || 0));
  button.innerHTML = safeCount
    ? `Nuevo <span class="mode-new-count">${safeCount > 99 ? '99+' : safeCount}</span>`
    : 'Nuevo';
}

async function loadActivePeople() {
  const root = $('#activePeople');
  if (!root) return [];

  const { r, d } = await api('/api/profiles/active?limit=10');
  const users = r.ok && Array.isArray(d.users) ? d.users : [];

  root.innerHTML = users.length
    ? users.map(activePersonHTML).join('')
    : '<div class="active-people-empty">Cuando haya más actividad reciente aparecerán personas aquí.</div>';

  return users;
}

async function loadHomeMomentum() {
  const section = $('#homeMomentum');
  const root = $('#momentumPosts');
  if (!section || !root) return;

  const lastVisit = readLastHomeVisit();
  const since = lastVisit.toISOString();

  const [momentumResponse, activeUsers] = await Promise.all([
    api(`/api/posts/momentum?since=${encodeURIComponent(since)}`),
    loadActivePeople()
  ]);

  if (!momentumResponse.r.ok) {
    if (!activeUsers.length) section.classList.add('hidden');
    return;
  }

  const data = momentumResponse.d;
  const catchup = Array.isArray(data.catchup) ? data.catchup : [];
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const posts = catchup.length ? catchup : highlights;

  $('#momentumTitle').textContent = catchup.length ? 'Desde tu última visita' : 'Destacados de hoy';
  $('#momentumSubtitle').textContent = catchup.length
    ? `${catchup.length} ${catchup.length === 1 ? 'publicación puede' : 'publicaciones pueden'} interesarte desde la última vez.`
    : highlights.length
      ? 'Lo que más está moviendo la conversación hoy.'
      : 'Todavía no hay novedades destacadas.';

  root.innerHTML = posts.length
    ? posts.map(momentumCardHTML).join('')
    : '<div class="momentum-empty"><b>Estás al día.</b><span>Las próximas novedades aparecerán aquí.</span></div>';

  updateLatestModeBadge(catchup.length);
  section.classList.remove('hidden');
  storeHomeVisit(new Date());
}

function growthInviteUrl(code) {
  return `${location.origin}/?ref=${encodeURIComponent(code)}#registro`;
}

function growthInviteText() {
  return 'Te invito a RedLibertad, una comunidad donde la libertad es lo primero.';
}

function growthStepHTML(step) {
  return `<button type="button" class="growth-step ${step.done ? 'done' : ''}" data-growth-action="${esc(step.action)}" ${step.done ? 'disabled' : ''}>
    <span class="growth-step-check">${step.done ? '✓' : '○'}</span>
    <span><b>${esc(step.label)}</b><small>${step.done ? 'Completado' : 'Continuar'}</small></span>
    <i>›</i>
  </button>`;
}

let growthInviteCode = '';

async function loadGrowthPanel() {
  const panel = $('#growthPanel');
  if (!panel) return;

  const { r, d } = await api('/api/growth/me');
  if (!r.ok) {
    panel.classList.add('hidden');
    return;
  }

  growthInviteCode = String(d.inviteCode || me?.username || '');
  $('#growthProgressValue').textContent = `${Number(d.progress || 0)}%`;
  const ring = panel.querySelector('.growth-progress-ring');
  if (ring) ring.style.setProperty('--progress', `${Number(d.progress || 0) * 3.6}deg`);

  $('#growthReferralTotal').textContent = Number(d.referrals?.total || 0);
  $('#growthReferralActivated').textContent = Number(d.referrals?.activated || 0);
  $('#growthSteps').innerHTML = Array.isArray(d.steps) ? d.steps.map(growthStepHTML).join('') : '';

  const hint = $('#growthInviteHint');
  if (hint && growthInviteCode) {
    hint.textContent = `Tu enlace personal: ${growthInviteUrl(growthInviteCode)}`;
  }

  panel.classList.remove('hidden');

  if (Number(d.progress || 0) >= 100) {
    panel.classList.add('growth-complete');
    const heading = panel.querySelector('.growth-onboarding h2');
    const copy = panel.querySelector('.growth-onboarding .growth-heading p');
    if (heading) heading.textContent = 'Tu perfil ya está en marcha';
    if (copy) copy.textContent = 'Has completado los pasos principales. Sigue participando y haciendo crecer tu comunidad.';
  } else {
    panel.classList.remove('growth-complete');
  }
}

async function shareGrowthInvite(kind = 'native') {
  const code = growthInviteCode || me?.username;
  if (!code) return;

  const url = growthInviteUrl(code);
  const text = growthInviteText();

  if (kind === 'whatsapp') {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener,noreferrer');
    return;
  }

  if (kind === 'copy') {
    try {
      await writeClipboardText(`${text} ${url}`);
      toast('Invitación copiada');
    } catch (_) {
      window.prompt('Copia esta invitación:', `${text} ${url}`);
    }
    return;
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: 'RedLibertad', text, url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  await shareGrowthInvite('copy');
}

async function handleGrowthAction(action) {
  if (action === 'profile') {
    showView('profile');
    setTimeout(() => $('#editProfile')?.click(), 220);
    return;
  }
  if (action === 'explore') {
    showView('explore');
    return;
  }
  if (action === 'create') {
    openModal();
    return;
  }
  showView('feed');
  await loadFeed('latest');
}

async function loadHomeSuggestions() {
  const root = $('#homeSuggestions');
  if (!root) return;

  const { d } = await api('/api/profiles/suggestions?limit=4');
  root.innerHTML = d.users?.length
    ? d.users.map(u => personCardHTML(u, true)).join('')
    : `<div class="mini-empty"><b>Ya conoces a todos por aquí.</b><small>Explora contenido o invita a alguien.</small></div>`;
}

async function renderInterestFilters() {
  const root = $('#interestFilters');
  if (!root) return;

  const catalog = await loadInterestCatalog();
  root.innerHTML = [
    `<button type="button" class="${!activeExploreInterest ? 'active' : ''}" data-interest-filter="">Todos</button>`,
    ...catalog.map(i => `<button type="button" class="${activeExploreInterest === i ? 'active' : ''}" data-interest-filter="${esc(i)}">${esc(i)}</button>`)
  ].join('');
}

async function loadPeopleSuggestions(interest = activeExploreInterest) {
  activeExploreInterest = interest || '';
  const query = activeExploreInterest ? `&interest=${encodeURIComponent(activeExploreInterest)}` : '';
  const { d } = await api(`/api/profiles/suggestions?limit=18${query}`);
  $('#peopleSuggestions').innerHTML = d.users?.length
    ? d.users.map(u => personCardHTML(u)).join('')
    : `<div class="info-card discovery-empty"><b>No encontramos personas con ese interés todavía.</b><p>Prueba otra categoría.</p></div>`;
  await renderInterestFilters();
}

async function searchPeople(query) {
  const clean = String(query || '').trim();
  if (clean.length < 2) {
    $('#peopleDiscoveryTitle').textContent = 'Personas que podrías conocer';
    $('#clearPeopleSearch').classList.add('hidden');
    return loadPeopleSuggestions(activeExploreInterest);
  }

  const { d } = await api(`/api/profiles/search/users?q=${encodeURIComponent(clean)}`);
  $('#peopleDiscoveryTitle').textContent = `Resultados para “${clean}”`;
  $('#clearPeopleSearch').classList.remove('hidden');
  $('#peopleSuggestions').innerHTML = d.users?.length
    ? d.users.map(u => personCardHTML(u)).join('')
    : `<div class="info-card discovery-empty"><b>No encontramos a nadie.</b><p>Prueba con otro nombre o @usuario.</p></div>`;
}

async function uploadFile(file) {
  if (!file) return null;
  const fd = new FormData();
  fd.append('file', file);
  const { r, d } = await api('/api/media/upload', { method: 'POST', body: fd });
  if (!r.ok) throw new Error(d.error === 'file_too_large' ? 'El archivo es demasiado grande.' : 'No se pudo subir el archivo.');
  return d.media;
}

async function loadSavedPostIds() {
  const { r, d } = await api('/api/posts/saved/ids');
  if (!r.ok) {
    savedPostIds = new Set();
    return savedPostIds;
  }
  savedPostIds = new Set((d.ids || []).map(String));
  return savedPostIds;
}

async function loadMe() {
  const { d } = await api('/api/profiles/me/summary');
  me = d.profile;
  const quickAvatar = $('#quickAvatar');
  if (quickAvatar) quickAvatar.innerHTML = avatarHTML(me);
  if (me.is_admin) $('#adminLink').classList.remove('hidden');
  $('#meCard').classList.remove('skeleton');
  $('#meCard').innerHTML = `<div class="mini-head"><div class="avatar">${avatarHTML(me)}</div><div><h3>${esc(me.display_name)}</h3><p>@${esc(me.username)} ${me.creator_verified ? '· ✓ Creador' : ''}</p></div></div><div class="mini-stats"><div><b>${me.post_count}</b><span>posts</span></div><div><b>${me.follower_count}</b><span>seguidores</span></div><div><b>${me.following_count}</b><span>siguiendo</span></div></div>`;
  updateNotificationBadge(me.notification_count || 0);
}
function readVipLastVisit() {
  try {
    const value=localStorage.getItem(VIP_LAST_VISIT_KEY);
    const parsed=Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (_) {
    return 0;
  }
}

function markVipSeen() {
  try { localStorage.setItem(VIP_LAST_VISIT_KEY,new Date().toISOString()); } catch (_) {}
  const badge=$('#vipFeedBadge');
  if(badge){
    badge.textContent='';
    badge.classList.add('hidden');
  }
}

function updateVipBadge(count=0) {
  const badge=$('#vipFeedBadge');
  if(!badge)return;
  const safe=Math.max(0,Number(count || 0));
  badge.textContent=safe>9 ? '9+' : String(safe || '');
  badge.classList.toggle('hidden',safe===0);
}

async function refreshVipSignal(stories=visibleStories) {
  if(!me)return;
  const lastSeen=readVipLastVisit();
  let newCount=(Array.isArray(stories) ? stories : []).filter(item =>
    item.audience==='vip' &&
    String(item.user_id)!==String(me.id) &&
    new Date(item.created_at).getTime()>lastSeen
  ).length;

  try{
    const { r,d }=await api('/api/posts/feed?mode=vip');
    if(r.ok){
      newCount+=(Array.isArray(d.posts) ? d.posts : []).filter(item =>
        String(item.user_id)!==String(me.id) &&
        new Date(item.created_at).getTime()>lastSeen
      ).length;
    }
  }catch(_){}

  updateVipBadge(newCount);
}

async function loadFeed(mode = currentMode) {
  currentMode = mode;
  all('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  const { d } = await api(`/api/posts/feed?mode=${mode}`);
  const posts=Array.isArray(d.posts) ? d.posts : [];

  const emptyTitle=mode==='vip'
    ? 'Todavía no tienes contenido VIP disponible.'
    : mode==='following'
      ? 'Tu feed de Siguiendo empieza aquí.'
      : 'Todavía hay poco por aquí.';
  const emptyCopy=mode==='vip'
    ? 'Cuando un creador te añada a su círculo VIP y publique contenido exclusivo, aparecerá aquí.'
    : mode==='following'
      ? 'Sigue a personas que te interesen y sus publicaciones aparecerán aquí.'
      : 'Descubre personas, sigue perfiles o publica algo para poner RedLibertad en movimiento.';

  $('#feed').innerHTML = posts.length
    ? posts.map(postHTML).join('')
    : `<div class="empty-feed-card ${mode==='vip' ? 'vip-empty-feed' : ''}">
        <span class="empty-feed-icon">${mode==='vip' ? '★' : 'A'}</span>
        <h2>${emptyTitle}</h2>
        <p>${emptyCopy}</p>
        <div class="empty-feed-actions">
          <button type="button" class="primary" data-view-jump="explore">Descubrir personas</button>
          <button type="button" class="secondary" data-open-create="1">Crear publicación</button>
        </div>
      </div>`;

  bindPostActions($('#feed'));
  if(mode==='vip')markVipSeen();
}

function renderStoryViewer() {
  const story=activeStoryGroup[activeStoryIndex];
  const root=$('#storyViewerContent');
  if(!story || !root)return;

  const media=mediaHTML(story);
  root.innerHTML=`<article class="story-viewer-story ${story.audience==='vip' ? 'vip-story' : ''}">
    <header>
      <span class="story-viewer-avatar">${avatarHTML(story)}</span>
      <div><b>${esc(story.display_name)}</b><small>@${esc(story.username)} · ${timeAgo(story.created_at)}</small></div>
      ${story.audience==='vip' ? '<span class="vip-content-badge">★ SOLO VIP</span>' : ''}
    </header>
    <div class="story-viewer-media">${media || '<div class="gate"><b>Story no disponible</b></div>'}</div>
  </article>`;

  if($('#storyPrev'))$('#storyPrev').disabled=activeStoryIndex<=0;
  if($('#storyNext'))$('#storyNext').disabled=activeStoryIndex>=activeStoryGroup.length-1;
  if(story.audience==='vip')markVipSeen();
}

function openStoryViewer(userId,index=0) {
  activeStoryGroup=storyGroups.get(String(userId)) || [];
  if(!activeStoryGroup.length)return;
  activeStoryIndex=Math.max(0,Math.min(Number(index || 0),activeStoryGroup.length-1));
  $('#storyViewerModal')?.classList.remove('hidden');
  renderStoryViewer();
}

function closeStoryViewer() {
  $('#storyViewerModal')?.classList.add('hidden');
  const root=$('#storyViewerContent');
  if(root)root.innerHTML='';
  activeStoryGroup=[];
  activeStoryIndex=0;
}

async function loadStories() {
  const { d } = await api('/api/stories');
  visibleStories=Array.isArray(d.stories) ? d.stories : [];
  storyGroups=new Map();

  for(const story of visibleStories){
    const key=String(story.user_id);
    if(!storyGroups.has(key))storyGroups.set(key,[]);
    storyGroups.get(key).push(story);
  }

  const representatives=[...storyGroups.values()].map(group=>group[0]);
  $('#stories').innerHTML = `<button class="story" data-action="create"><div class="story-ring"><div>＋</div></div><small>Tu Story</small></button>` + representatives.map(story => {
    const group=storyGroups.get(String(story.user_id)) || [];
    const hasVip=group.some(item=>item.audience==='vip');
    return `<button type="button" class="story ${hasVip ? 'has-vip-story' : ''}" data-story-user="${story.user_id}" title="${story.gated ? gateText(story.gate_reason) : hasVip ? 'Story VIP disponible' : 'Story activa'}"><div class="story-ring"><div>${story.avatar_url ? `<img src="${esc(story.avatar_url)}">` : initials(story.display_name)}</div>${hasVip ? '<span class="story-vip-star">★</span>' : ''}</div><small>${esc(story.username)}</small></button>`;
  }).join('');

  bindCreateButtons();
  all('[data-story-user]',$('#stories')).forEach(button=>{
    button.onclick=()=>openStoryViewer(button.dataset.storyUser,0);
  });
  await refreshVipSignal(visibleStories);
}

$('#closeStoryViewer')?.addEventListener('click',closeStoryViewer);
$('#storyViewerModal')?.addEventListener('click',event=>{
  if(event.target===$('#storyViewerModal'))closeStoryViewer();
});
$('#storyPrev')?.addEventListener('click',()=>{
  if(activeStoryIndex>0){activeStoryIndex--;renderStoryViewer();}
});
$('#storyNext')?.addEventListener('click',()=>{
  if(activeStoryIndex<activeStoryGroup.length-1){activeStoryIndex++;renderStoryViewer();}
});
function renderDiscoveryPosts(posts = [], emptyTitle = 'Todavía no hay contenido aquí.', emptyCopy = 'Vuelve pronto o publica algo para poner RedLibertad en movimiento.') {
  const root = $('#discoveryFeed');
  if (!root) return;
  root.innerHTML = posts.length
    ? posts.map(postHTML).join('')
    : `<div class="info-card discovery-empty"><b>${emptyTitle}</b><p>${emptyCopy}</p></div>`;
  bindPostActions(root);
}

async function loadTrendChips() {
  const root = $('#trendChips');
  if (!root) return;
  const { d } = await api('/api/posts/trends');
  const trends = Array.isArray(d.trends) ? d.trends : [];
  root.innerHTML = trends.length
    ? trends.map(item => `<button type="button" data-hashtag="${esc(item.tag)}">#${esc(item.tag)} <small>${item.count}</small></button>`).join('')
    : '<span class="trend-empty">Los hashtags aparecerán aquí cuando empiece la conversación.</span>';
}

async function loadDiscoveryContent(mode = activeContentMode) {
  activeContentMode = mode;
  activePostSearch = '';
  all('[data-content-mode]').forEach(button => button.classList.toggle('active', button.dataset.contentMode === mode));

  const title = $('#contentDiscoveryTitle');
  const endpoint = mode === 'saved'
    ? '/api/posts/saved'
    : mode === 'latest'
      ? '/api/posts/feed?mode=latest'
      : mode === 'liked'
        ? '/api/posts/trending?sort=likes'
        : mode === 'commented'
          ? '/api/posts/trending?sort=comments'
          : '/api/posts/trending?sort=score';

  if (title) {
    title.textContent = mode === 'saved'
      ? 'Tus guardados'
      : mode === 'latest'
        ? 'Lo más nuevo'
        : mode === 'liked'
          ? 'Lo más gustado'
          : mode === 'commented'
            ? 'Lo más comentado'
            : 'Tendencias';
  }
  const root = $('#discoveryFeed');
  if (root) root.innerHTML = '<div class="discovery-loading">Buscando publicaciones...</div>';

  const { r, d } = await api(endpoint);
  if (activePostSearch) return;
  if (!r.ok) {
    return renderDiscoveryPosts([], 'No se pudo cargar el contenido.', 'Inténtalo de nuevo dentro de unos segundos.');
  }

  const posts = Array.isArray(d.posts) ? d.posts : [];
  const emptyTitle = mode === 'saved' ? 'Todavía no has guardado nada.' : 'Todavía no hay publicaciones en esta sección.';
  const emptyCopy = mode === 'saved'
    ? 'Pulsa ☆ en cualquier publicación para guardarla y volver a ella después.'
    : 'Las primeras publicaciones aparecerán aquí.';
  renderDiscoveryPosts(posts, emptyTitle, emptyCopy);
}

async function searchPosts(query) {
  const clean = String(query || '').trim();
  if (clean.length < 2) return loadDiscoveryContent(activeContentMode);

  activePostSearch = clean;
  all('[data-content-mode]').forEach(button => button.classList.remove('active'));
  $('#contentDiscoveryTitle').textContent = `Resultados para “${clean}”`;
  $('#discoveryFeed').innerHTML = '<div class="discovery-loading">Buscando publicaciones...</div>';

  const { r, d } = await api(`/api/posts/search?q=${encodeURIComponent(clean)}`);
  if (!r.ok) {
    return renderDiscoveryPosts([], 'No se pudo completar la búsqueda.', 'Prueba de nuevo.');
  }
  renderDiscoveryPosts(
    Array.isArray(d.posts) ? d.posts : [],
    'No encontramos publicaciones.',
    'Prueba otras palabras o un #hashtag.'
  );
}

async function loadExplore() {
  await Promise.all([
    loadPeopleSuggestions(activeExploreInterest),
    loadTrendChips(),
    loadDiscoveryContent(activeContentMode)
  ]);
}
async function loadReels() {
  const { d } = await api('/api/posts/feed?mode=latest');
  const reels = d.posts.filter(p => p.post_kind === 'reel');
  $('#reelsFeed').innerHTML = reels.map(postHTML).join('') || '<div class="info-card"><b>Todavía no hay Reels.</b><p>Publica el primero usando Crear → Reel.</p></div>';
  bindPostActions($('#reelsFeed'));
}

function profileTilesHTML(posts = [], emptyText = 'Todavía no hay publicaciones visibles.') {
  if (!posts.length) {
    return `<div class="profile-content-empty"><b>${esc(emptyText)}</b><span>Cuando haya contenido aparecerá aquí.</span></div>`;
  }

  return posts.map(p => {
    const participants = Array.isArray(p.participants) ? p.participants : [];
    const participantBadge = participants.length
      ? `<span class="tile-participants" title="Con ${participants.map(x => '@' + esc(x.username)).join(', ')}">👥 ${participants.length}</span>`
      : '';
    return `<button type="button" class="tile tile-button profile-content-tile ${p.featured ? 'is-featured' : ''} ${p.audience === 'vip' ? 'is-vip-exclusive' : ''}" data-open-post="${p.id}">${tileContentHTML(p)}${p.audience === 'vip' ? '<span class="tile-vip">★ VIP</span>' : ''}${p.featured ? '<span class="tile-featured">★ DESTACADO</span>' : ''}${p.post_kind === 'reel' ? '<span class="tile-label">REEL</span>' : ''}${participantBadge}</button>`;
  }).join('');
}

function setOwnProfileMode(mode) {
  ownProfileMode = ['posts','reposts','media'].includes(mode) ? mode : 'posts';
  all('[data-own-profile-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.ownProfileMode === ownProfileMode);
  });
}

async function loadProfile(mode = ownProfileMode) {
  if (!me) await loadMe();
  setOwnProfileMode(mode);

  const { d } = await api(`/api/posts/user/${encodeURIComponent(me.username)}?mode=${encodeURIComponent(ownProfileMode)}`);
  const web = me.website_url ? `<a href="${esc(me.website_url)}" target="_blank" rel="noopener noreferrer">${esc(me.website_url)}</a>` : '';

  $('#profileFull').innerHTML = `<div class="cover" ${me.cover_url ? `style="background-image:url('${esc(me.cover_url)}')"` : ''}></div><div class="profile-body"><div class="profile-avatar">${avatarHTML(me)}</div><div class="profile-title"><div><h2>${esc(me.display_name)} ${me.creator_verified ? '<span class="verified">✓</span>' : ''}</h2><p>@${esc(me.username)}</p></div><div class="profile-buttons"><button id="editProfile" class="secondary">Editar perfil</button>${me.creator_verified ? '<button id="creatorCenter" class="secondary creator-center-button">Centro de creador</button>' : ''}<button id="trustSettings" class="secondary">Confianza</button><button id="privacySettings" class="secondary">Privacidad</button><button id="accountSettings" class="secondary">Cuenta</button><button id="sensitiveToggle" class="secondary">${me.show_sensitive ? 'Ocultar' : 'Mostrar'} contenido sensible</button></div></div><p class="profile-bio">${esc(me.bio || 'Todavía no has escrito una biografía.')}</p>${me.creator_verified && me.creator_headline ? `<div class="own-creator-headline"><span>CREADOR</span><b>${esc(me.creator_headline)}</b></div>` : ''}${interestPillsHTML(me.interests)}<div class="profile-meta">${me.location_label ? `<span>⌖ ${esc(me.location_label)}</span>` : ''}${web}</div><div class="profile-stats"><span><b>${me.post_count}</b> publicaciones</span><button type="button" data-social-list="followers" data-social-username="${esc(me.username)}"><b>${me.follower_count}</b> seguidores</button><button type="button" data-social-list="following" data-social-username="${esc(me.username)}"><b>${me.following_count}</b> siguiendo</button></div><p class="muted">Edad: ${me.age_verified ? '✓ verificada' : 'pendiente de verificación'} · Creador: ${me.creator_verified ? '✓ verificado' : 'no verificado'}</p></div>`;

  const emptyText = ownProfileMode === 'reposts'
    ? 'Todavía no has republicado nada.'
    : ownProfileMode === 'media'
      ? 'Todavía no tienes fotos o vídeos publicados.'
      : 'Todavía no tienes publicaciones.';

  $('#profilePosts').innerHTML = profileTilesHTML(Array.isArray(d.posts) ? d.posts : [], emptyText);

  $('#sensitiveToggle').onclick = async () => {
    const { r } = await api('/api/profiles/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showSensitive: !me.show_sensitive }) });
    if (r.ok) { me.show_sensitive = !me.show_sensitive; toast('Preferencia actualizada'); await loadProfile(ownProfileMode); await loadFeed(currentMode); }
  };
  $('#editProfile').onclick = openProfileModal;
  if ($('#creatorCenter')) $('#creatorCenter').onclick = openCreatorModal;
  $('#trustSettings').onclick = openTrustModal;
  $('#privacySettings').onclick = openPrivacyModal;
  $('#accountSettings').onclick = openAccountModal;
  await loadConsents();
}


function mutualContextHTML(profileData) {
  const mutuals = Array.isArray(profileData.mutuals) ? profileData.mutuals : [];
  const count = Number(profileData.mutualCount || 0);
  if (!count) {
    return profileData.followsYou
      ? '<div class="profile-relationship-note">Te sigue</div>'
      : '';
  }

  const shown = mutuals.map(user =>
    profileLink(user.username, `<span class="mutual-avatar">${avatarHTML(user)}</span>`, 'mutual-profile-link')
  ).join('');

  const names = mutuals.map(user => `@${esc(user.username)}`).join(', ');
  const extra = Math.max(0, count - mutuals.length);
  const copy = extra
    ? `También le siguen ${names} y ${extra} más`
    : `También le siguen ${names}`;

  return `<div class="profile-mutuals"><div class="mutual-avatars">${shown}</div><span>${copy}</span>${profileData.followsYou ? '<b>Te sigue</b>' : ''}</div>`;
}

function creatorLinksHTML(profileData) {
  const profile = profileData?.profile || {};
  if (!profile.creator_verified) return '';
  const links = Array.isArray(profileData.creatorLinks) ? profileData.creatorLinks : [];
  const headline = String(profile.creator_headline || '').trim();
  if (!headline && !links.length) return '';

  return `<section class="public-creator-showcase">
    <div class="public-creator-showcase-head"><span>CREADOR</span>${headline ? `<b>${esc(headline)}</b>` : ''}</div>
    ${links.length ? `<div class="public-creator-links">${links.map(link =>
      `<a href="${esc(link.url)}" target="_blank" rel="ugc nofollow noopener noreferrer" data-creator-link-click="${link.id}">${esc(link.label)} <span>↗</span></a>`
    ).join('')}</div>` : ''}
  </section>`;
}

async function shareProfile(profile) {
  const url = `${location.origin}/app?profile=${encodeURIComponent(profile.username)}`;
  const text = `Mira el perfil de @${profile.username} en RedLibertad.`;

  if (navigator.share) {
    try {
      await navigator.share({ title: profile.display_name || 'RedLibertad', text, url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  try {
    await writeClipboardText(`${text} ${url}`);
    toast('Enlace del perfil copiado');
  } catch (_) {
    window.prompt('Copia este enlace:', url);
  }
}

async function loadPublicProfileContent(username, mode = 'posts') {
  const root = $('#publicProfilePosts');
  if (!root) return;

  const cleanMode = ['posts','reposts','media'].includes(mode) ? mode : 'posts';
  all('[data-public-profile-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.publicProfileMode === cleanMode);
  });

  root.innerHTML = '<div class="profile-content-empty"><span>Cargando contenido...</span></div>';

  const { r, d } = await api(`/api/posts/user/${encodeURIComponent(username)}?mode=${encodeURIComponent(cleanMode)}`);
  if (!r.ok) {
    root.innerHTML = '<div class="profile-content-empty"><b>No se pudo cargar el contenido.</b></div>';
    return;
  }

  const emptyText = cleanMode === 'reposts'
    ? 'Todavía no ha republicado nada.'
    : cleanMode === 'media'
      ? 'Todavía no tiene fotos o vídeos publicados.'
      : 'Todavía no tiene publicaciones visibles.';

  root.innerHTML = profileTilesHTML(Array.isArray(d.posts) ? d.posts : [], emptyText);
}

async function openPublicProfile(username) {
  const clean = String(username || '').replace(/^@/, '').trim();
  if (!clean) return;

  if (me && clean.toLowerCase() === String(me.username).toLowerCase()) {
    $('#publicProfileModal').classList.add('hidden');
    showView('profile');
    return;
  }

  const modal = $('#publicProfileModal');
  const content = $('#publicProfileContent');
  modal.classList.remove('hidden');
  content.innerHTML = '<div class="public-profile-loading">Cargando perfil...</div>';

  try {
    const { r: profileResponse, d: profileData } = await api(`/api/profiles/${encodeURIComponent(clean)}`);

    if (!profileResponse.ok || !profileData.profile) {
      throw new Error('profile_not_found');
    }

    const profile = profileData.profile;
    const website = profile.website_url
      ? `<a href="${esc(profile.website_url)}" target="_blank" rel="noopener noreferrer">${esc(profile.website_url)}</a>`
      : '';

    const actions = `
      <div class="public-profile-actions">
        <button
          type="button"
          class="${profileData.following ? 'secondary' : 'primary'}"
          data-public-follow="${profile.id}"
          data-following="${profileData.following ? '1' : '0'}"
          ${profileData.blockedByMe ? 'disabled' : ''}>
          ${profileData.following ? 'Siguiendo' : 'Seguir'}
        </button>
        <button type="button" class="secondary" data-message-profile="${esc(profile.username)}" ${profileData.blockedByMe ? 'disabled' : ''}>Mensaje</button>
        <button type="button" class="secondary" data-share-profile="${esc(profile.username)}">Compartir perfil</button>
        <button type="button" class="secondary ${profileData.mutedByMe ? 'active-control' : ''}" data-mute-profile="${profile.id}" data-muted="${profileData.mutedByMe ? '1' : '0'}">${profileData.mutedByMe ? 'Silenciado' : 'Silenciar'}</button>
        <button type="button" class="danger-outline" data-block-profile="${profile.id}" data-blocked="${profileData.blockedByMe ? '1' : '0'}">${profileData.blockedByMe ? 'Desbloquear' : 'Bloquear'}</button>
      </div>
    `;

    content.innerHTML = `
      <div class="public-profile-card">
        <div class="cover" ${profile.cover_url ? `style="background-image:url('${esc(profile.cover_url)}')"` : ''}></div>
        <div class="profile-body">
          <div class="profile-avatar">${avatarHTML(profile)}</div>
          <div class="profile-title">
            <div>
              <h2>${esc(profile.display_name)} ${profile.creator_verified ? '<span class="verified">✓</span>' : ''}</h2>
              <p>@${esc(profile.username)}</p>
            </div>
            ${actions}
          </div>
          ${mutualContextHTML(profileData)}
          ${profile.age_verified || profile.creator_verified ? `<div class="public-trust-badges">${profile.age_verified ? '<span>+18 verificado</span>' : ''}${profile.creator_verified ? '<span>✓ Creador verificado</span>' : ''}</div>` : ''}
          ${creatorLinksHTML(profileData)}
          <p class="profile-bio">${esc(profile.bio || 'Todavía no ha escrito una biografía.')}</p>
          ${interestPillsHTML(profile.interests)}
          <div class="profile-meta">
            ${profile.location_label ? `<span>⌖ ${esc(profile.location_label)}</span>` : ''}
            ${website}
          </div>
          <div class="profile-stats">
            <span><b>${profile.post_count || 0}</b> publicaciones</span>
            <button type="button" data-social-list="followers" data-social-username="${esc(profile.username)}"><b>${profile.follower_count || 0}</b> seguidores</button>
            <button type="button" data-social-list="following" data-social-username="${esc(profile.username)}"><b>${profile.following_count || 0}</b> siguiendo</button>
          </div>
        </div>
      </div>
      <div class="profile-content-tabs public-profile-tabs" role="tablist" aria-label="Contenido del perfil">
        <button type="button" class="active" data-public-profile-mode="posts" data-profile-username="${esc(profile.username)}">Publicaciones</button>
        <button type="button" data-public-profile-mode="reposts" data-profile-username="${esc(profile.username)}">Republicados</button>
        <button type="button" data-public-profile-mode="media" data-profile-username="${esc(profile.username)}">Multimedia</button>
      </div>
      <div id="publicProfilePosts" class="public-profile-posts explore-grid">
        <div class="profile-content-empty"><span>Cargando contenido...</span></div>
      </div>
    `;

    await loadPublicProfileContent(profile.username, 'posts');

    const followButton = content.querySelector('[data-public-follow]');
    if (followButton) {
      followButton.onclick = async () => {
        const following = followButton.dataset.following === '1';
        const { r } = await api(`/api/profiles/${profile.id}/follow`, {
          method: following ? 'DELETE' : 'POST'
        });
        if (!r.ok) return toast('No se pudo actualizar el seguimiento.');
        followButton.dataset.following = following ? '0' : '1';
        followButton.textContent = following ? 'Seguir' : 'Siguiendo';
        followButton.className = following ? 'primary' : 'secondary';
        toast(following ? 'Has dejado de seguir a esta persona' : 'Ahora sigues a esta persona');
        await loadMe();
      };
    }

    const messageButton = content.querySelector('[data-message-profile]');
    if (messageButton) {
      messageButton.onclick = async () => {
        const { r, d } = await api('/api/messages/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: profile.username })
        });
        if (!r.ok) {
          const message = d.error === 'message_privacy_denied'
            ? 'Esta persona no acepta nuevas conversaciones.'
            : d.error === 'message_privacy_following_only'
              ? 'Solo acepta mensajes de personas que sigue.'
              : d.error === 'messaging_blocked'
                ? 'No puedes iniciar esta conversación.'
                : 'No se pudo abrir la conversación.';
          return toast(message);
        }
        modal.classList.add('hidden');
        showView('messages');
        await loadConversations(d.conversationId);
      };
    }

    const shareButton = content.querySelector('[data-share-profile]');
    if (shareButton) {
      shareButton.onclick = () => shareProfile(profile);
    }

    const muteButton = content.querySelector('[data-mute-profile]');
    if (muteButton) {
      muteButton.onclick = async () => {
        const muted = muteButton.dataset.muted === '1';
        const { r } = await api(`/api/profiles/${profile.id}/mute`, {
          method: muted ? 'DELETE' : 'POST'
        });
        if (!r.ok) return toast('No se pudo actualizar el silencio.');

        muteButton.dataset.muted = muted ? '0' : '1';
        muteButton.textContent = muted ? 'Silenciar' : 'Silenciado';
        muteButton.classList.toggle('active-control', !muted);
        toast(muted ? 'Volverás a ver su actividad' : 'Has silenciado a esta persona');
        await Promise.all([loadFeed(currentMode),loadStories(),loadNotifications(),loadHomeMomentum()]);
      };
    }

    const blockButton = content.querySelector('[data-block-profile]');
    if (blockButton) {
      blockButton.onclick = async () => {
        const blocked = blockButton.dataset.blocked === '1';

        if (!blocked && !window.confirm('¿Bloquear a esta persona? Dejaréis de seguiros y no podréis interactuar mientras siga bloqueada.')) {
          return;
        }

        const { r } = await api(`/api/profiles/${profile.id}/block`, {
          method: blocked ? 'DELETE' : 'POST'
        });
        if (!r.ok) return toast('No se pudo actualizar el bloqueo.');

        toast(blocked ? 'Usuario desbloqueado' : 'Usuario bloqueado');
        if (!blocked) modal.classList.add('hidden');
        await loadMe();
        await Promise.all([loadFeed(currentMode),loadStories(),loadNotifications(),loadHomeSuggestions(),loadActivePeople(),loadHomeMomentum()]);
        if (blocked) await openPublicProfile(profile.username);
      };
    }
  } catch (error) {
    content.innerHTML = '<div class="info-card"><b>No se pudo abrir el perfil.</b><p>Puede que esta cuenta ya no esté disponible.</p></div>';
  }
}

async function openPostFocus(postId) {
  const modal = $('#postFocusModal');
  const root = $('#postFocusContent');
  if (!modal || !root || !postId) return;

  modal.classList.remove('hidden');
  root.innerHTML = '<div class="public-profile-loading">Cargando publicación...</div>';

  const { r, d } = await api(`/api/posts/detail/${encodeURIComponent(postId)}`);
  if (!r.ok || !d.post) {
    root.innerHTML = '<div class="info-card"><b>La publicación ya no está disponible.</b><p>Puede haberse eliminado o no ser visible para tu cuenta.</p></div>';
    return;
  }

  root.innerHTML = postHTML(d.post);
  bindPostActions(root);
}

function closePostFocus() {
  $('#postFocusModal')?.classList.add('hidden');
  const root = $('#postFocusContent');
  if (root) root.innerHTML = '';
}

$('#closePostFocusModal')?.addEventListener('click', closePostFocus);
$('#postFocusModal')?.addEventListener('click', event => {
  if (event.target === $('#postFocusModal')) closePostFocus();
});

document.addEventListener('click', async event => {
  const growthStep = event.target.closest('[data-growth-action]');
  if (growthStep) {
    event.preventDefault();
    if (!growthStep.disabled) await handleGrowthAction(growthStep.dataset.growthAction);
    return;
  }

  const openPostButton = event.target.closest('[data-open-post]');
  if (openPostButton) {
    event.preventDefault();
    event.stopPropagation();
    await openPostFocus(openPostButton.dataset.openPost);
    return;
  }

  const ownProfileModeButton = event.target.closest('[data-own-profile-mode]');
  if (ownProfileModeButton) {
    event.preventDefault();
    setOwnProfileMode(ownProfileModeButton.dataset.ownProfileMode);
    await loadProfile(ownProfileMode);
    return;
  }

  const publicProfileModeButton = event.target.closest('[data-public-profile-mode]');
  if (publicProfileModeButton) {
    event.preventDefault();
    await loadPublicProfileContent(
      publicProfileModeButton.dataset.profileUsername,
      publicProfileModeButton.dataset.publicProfileMode
    );
    return;
  }

  const socialListButton = event.target.closest('[data-social-list]');
  if (socialListButton) {
    event.preventDefault();
    event.stopPropagation();
    await openSocialList(socialListButton.dataset.socialUsername, socialListButton.dataset.socialList);
    return;
  }

  const hashtagButton = event.target.closest('[data-hashtag]');
  if (hashtagButton) {
    event.preventDefault();
    event.stopPropagation();
    const tag = String(hashtagButton.dataset.hashtag || '').replace(/^#/, '');
    if (!tag) return;
    showView('explore');
    $('#postSearchInput').value = `#${tag}`;
    await searchPosts(`#${tag}`);
    return;
  }

  const followButton = event.target.closest('[data-suggest-follow]');
  if (followButton) {
    event.preventDefault();
    event.stopPropagation();
    await toggleSuggestedFollow(followButton);
    return;
  }

  const interestButton = event.target.closest('[data-interest-filter]');
  if (interestButton) {
    event.preventDefault();
    activeExploreInterest = interestButton.dataset.interestFilter || '';
    $('#peopleSearchInput').value = '';
    $('#peopleDiscoveryTitle').textContent = activeExploreInterest
      ? `Personas · ${activeExploreInterest}`
      : 'Personas que podrías conocer';
    $('#clearPeopleSearch').classList.add('hidden');
    await loadPeopleSuggestions(activeExploreInterest);
    return;
  }

  const modeJump = event.target.closest('[data-mode-jump]');
  if (modeJump) {
    event.preventDefault();
    showView('feed');
    await loadFeed(modeJump.dataset.modeJump || 'latest');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const jump = event.target.closest('[data-view-jump]');
  if (jump) {
    event.preventDefault();
    showView(jump.dataset.viewJump);
    return;
  }

  const create = event.target.closest('[data-open-create]');
  if (create) {
    event.preventDefault();
    openModal();
    return;
  }
});

document.addEventListener('click', event => {
  const target = event.target.closest('[data-profile]');
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  closePostFocus();
  closeSocialList();
  openPublicProfile(target.dataset.profile);
});

function socialListPersonHTML(user) {
  const self = me && String(me.id) === String(user.id);
  return `<article class="social-list-person">
    ${profileLink(user.username, `<span class="person-avatar">${avatarHTML(user)}</span>`, 'person-avatar-link')}
    <div class="social-list-person-copy">
      ${profileLink(user.username, `<b>${esc(user.display_name)} ${user.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`, 'person-name-link')}
      <small>@${esc(user.username)}${user.location_label ? ` · ${esc(user.location_label)}` : ''}</small>
      ${user.bio ? `<p>${esc(user.bio)}</p>` : ''}
    </div>
    ${self
      ? '<span class="social-self-label">Tú</span>'
      : `<button type="button" class="person-follow ${user.following ? 'following' : ''}" data-suggest-follow="${user.id}" data-following="${user.following ? '1' : '0'}">${user.following ? 'Siguiendo' : 'Seguir'}</button>`}
  </article>`;
}

async function openSocialList(username, kind) {
  const clean = String(username || '').replace(/^@/,'').trim();
  if (!clean || !['followers','following'].includes(kind)) return;

  const modal = $('#socialListModal');
  const root = $('#socialListContent');
  const title = $('#socialListTitle');
  if (!modal || !root || !title) return;

  title.textContent = kind === 'followers' ? 'Seguidores' : 'Siguiendo';
  root.innerHTML = '<div class="mini-loading">Cargando personas...</div>';
  modal.classList.remove('hidden');

  const { r, d } = await api(`/api/profiles/${encodeURIComponent(clean)}/${kind}`);
  if (!r.ok) {
    root.innerHTML = '<div class="info-card"><b>No se pudo cargar la lista.</b><p>Inténtalo de nuevo.</p></div>';
    return;
  }

  root.innerHTML = d.users?.length
    ? d.users.map(socialListPersonHTML).join('')
    : `<div class="info-card"><b>${kind === 'followers' ? 'Todavía no tiene seguidores.' : 'Todavía no sigue a nadie.'}</b></div>`;
}

function closeSocialList() {
  $('#socialListModal')?.classList.add('hidden');
  const root = $('#socialListContent');
  if (root) root.innerHTML = '';
}

$('#closeSocialListModal')?.addEventListener('click', closeSocialList);
$('#socialListModal')?.addEventListener('click', event => {
  if (event.target === $('#socialListModal')) closeSocialList();
});

function privacyPersonHTML(user, kind) {
  const action = kind === 'muted' ? 'Dejar de silenciar' : 'Desbloquear';
  return `<article class="privacy-person">
    ${profileLink(user.username, `<span class="privacy-person-avatar">${avatarHTML(user)}</span>`, 'privacy-profile-link')}
    <div>
      ${profileLink(user.username, `<b>${esc(user.display_name)}</b>`, 'privacy-profile-link')}
      <small>@${esc(user.username)}</small>
    </div>
    <button type="button" class="secondary" data-privacy-remove="${kind}" data-user-id="${user.id}">${action}</button>
  </article>`;
}

async function loadPrivacyLists() {
  const [mutedResponse,blockedResponse] = await Promise.all([
    api('/api/profiles/me/muted'),
    api('/api/profiles/me/blocked')
  ]);

  const muted = mutedResponse.r.ok && Array.isArray(mutedResponse.d.users) ? mutedResponse.d.users : [];
  const blocked = blockedResponse.r.ok && Array.isArray(blockedResponse.d.users) ? blockedResponse.d.users : [];

  $('#mutedCountBadge').textContent = muted.length;
  $('#blockedCountBadge').textContent = blocked.length;
  $('#mutedList').innerHTML = muted.length
    ? muted.map(user => privacyPersonHTML(user,'muted')).join('')
    : '<div class="privacy-list-empty">No has silenciado a nadie.</div>';
  $('#blockedList').innerHTML = blocked.length
    ? blocked.map(user => privacyPersonHTML(user,'blocked')).join('')
    : '<div class="privacy-list-empty">No has bloqueado a nadie.</div>';
}

function creatorLinkFieldsHTML(links = [], limit = 5) {
  const items = Array.from({length:limit},(_,index)=>links[index] || null);
  return items.map((link,index)=>`<div class="creator-link-row" data-creator-link-row>
    <input type="hidden" name="linkId" value="${link?.id ? esc(link.id) : ''}">
    <label>Texto ${index + 1}<input name="linkLabel" maxlength="40" value="${esc(link?.label || '')}" placeholder="Mi web"></label>
    <label>URL ${index + 1}<input name="linkUrl" type="url" maxlength="2048" value="${esc(link?.url || '')}" placeholder="https://..."></label>
    <small>${link ? `${Number(link.click_count || 0)} clics` : 'Opcional'}</small>
  </div>`).join('');
}

function creatorProfilePayload(form) {
  const links=[];
  for (const row of form.querySelectorAll('[data-creator-link-row]')) {
    const id=Number(row.querySelector('[name="linkId"]')?.value || 0);
    const label=String(row.querySelector('[name="linkLabel"]')?.value || '').trim();
    const url=String(row.querySelector('[name="linkUrl"]')?.value || '').trim();
    if(!label && !url) continue;
    if(!label || !url) return {error:'Completa el texto y la URL de cada enlace.'};
    links.push({...(id ? {id} : {}),label,url});
  }
  return {
    headline:String(form.headline?.value || '').trim(),
    links
  };
}

function creatorEngagementSummaryHTML(engagement = {}) {
  return [
    creatorMetric('Seguidores activos',engagement.activeFollowers30d || 0),
    creatorMetric('% audiencia activa',`${Number(engagement.activeFollowerRate30d || 0).toLocaleString('es-ES')}%`),
    creatorMetric('Interacciones 30d',engagement.interactions30d || 0)
  ].join('');
}

function creatorTopFansHTML(fans = []) {
  if (!fans.length) return '<div class="creator-empty compact">Todavía no hay interacciones de seguidores en los últimos 30 días.</div>';
  return fans.map((fan,index)=>`<article class="creator-fan-row ${fan.is_vip ? 'is-vip' : ''}">
    <span class="creator-fan-rank">${index + 1}</span>
    ${profileLink(fan.username,`<span class="creator-audience-avatar">${avatarHTML(fan)}</span>`,'creator-audience-profile')}
    <div class="creator-fan-copy">
      ${profileLink(fan.username,`<b>${esc(fan.display_name)} ${fan.creator_verified ? '<span class="verified">✓</span>' : ''}${fan.is_vip ? ' <span class="creator-vip-badge">VIP</span>' : ''}</b>`,'creator-audience-profile')}
      <small>@${esc(fan.username)}</small>
      <span>♥ ${Number(fan.like_count || 0)} · ◯ ${Number(fan.comment_count || 0)} · ⟳ ${Number(fan.repost_count || 0)}</span>
    </div>
    <strong>${Number(fan.interaction_count || 0)}</strong>
    <button type="button" class="tiny-action creator-vip-toggle" data-creator-vip="${fan.id}" data-vip="${fan.is_vip ? '1' : '0'}">${fan.is_vip ? 'Quitar VIP' : 'Añadir VIP'}</button>
  </article>`).join('');
}

function creatorTopContentHTML(posts = []) {
  if (!posts.length) return '<div class="creator-empty compact">Todavía no hay contenido con actividad reciente.</div>';
  return posts.map((post,index)=>`<button type="button" class="creator-top-content-row" data-open-post="${post.id}">
    <span class="creator-top-content-rank">${index + 1}</span>
    <span class="creator-top-content-media">${tileContentHTML(post)}</span>
    <span class="creator-top-content-copy">
      <b>${post.audience === 'vip' ? '★ VIP · ' : ''}${post.post_kind === 'reel' ? 'Reel' : 'Publicación'} · ${Number(post.engagement_count_30d || 0)} interacciones</b>
      <small>♥ ${Number(post.like_count_30d || 0)} · ◯ ${Number(post.comment_count_30d || 0)} · ⟳ ${Number(post.repost_count_30d || 0)} · ★ ${Number(post.save_count_30d || 0)} guardados</small>
    </span>
  </button>`).join('');
}

function creatorAudienceHTML(users = []) {
  if (!users.length) return '<div class="creator-empty">Todavía no tienes seguidores.</div>';
  return users.map(user=>`<article class="creator-audience-person ${user.is_vip ? 'is-vip' : ''}">
    ${profileLink(user.username,`<span class="creator-audience-avatar">${avatarHTML(user)}</span>`,'creator-audience-profile')}
    <div>
      ${profileLink(user.username,`<b>${esc(user.display_name)} ${user.creator_verified ? '<span class="verified">✓</span>' : ''}${user.is_vip ? ' <span class="creator-vip-badge">VIP</span>' : ''}</b>`,'creator-audience-profile')}
      <small>@${esc(user.username)} · te sigue desde ${timeAgo(user.followed_at)}</small>
    </div>
    <button type="button" class="tiny-action creator-vip-toggle" data-creator-vip="${user.id}" data-vip="${user.is_vip ? '1' : '0'}">${user.is_vip ? 'Quitar VIP' : 'Añadir VIP'}</button>
  </article>`).join('');
}

function creatorVipMembersHTML(members = []) {
  if (!members.length) return '<div class="creator-empty compact">Tu círculo VIP está vacío. Añade seguidores desde Tu audiencia o Fans más activos.</div>';
  return members.map(member=>`<article class="creator-vip-member ${member.still_follows ? '' : 'inactive'}">
    ${profileLink(member.username,`<span class="creator-audience-avatar">${avatarHTML(member)}</span>`,'creator-audience-profile')}
    <div>
      ${profileLink(member.username,`<b>${esc(member.display_name)} ${member.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`,'creator-audience-profile')}
      <small>@${esc(member.username)} · VIP desde ${timeAgo(member.vip_since)}${member.still_follows ? '' : ' · ya no te sigue'}</small>
    </div>
    <button type="button" class="tiny-action" data-creator-vip="${member.id}" data-vip="1">Quitar VIP</button>
  </article>`).join('');
}

function creatorBroadcastHistoryHTML(items = []) {
  if (!items.length) return '<div class="creator-empty compact">Todavía no has enviado avisos.</div>';
  return items.map(item=>`<article class="creator-broadcast-item">
    <p>${esc(item.body)}</p>
    <small>${timeAgo(item.created_at)} · ${Number(item.recipient_count || 0)} destinatarios</small>
  </article>`).join('');
}

function creatorBroadcastAvailability(nextBroadcastAt) {
  const next = nextBroadcastAt ? new Date(nextBroadcastAt) : null;
  const blocked = !!next && Number.isFinite(next.getTime()) && next.getTime() > Date.now();
  return {
    blocked,
    label: blocked
      ? `Próximo aviso disponible: ${next.toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`
      : 'Puedes enviar un aviso de texto cada 24 horas.'
  };
}

function creatorMetric(label,total,recent=null) {
  const numeric=typeof total==='number' || (typeof total==='string' && total.trim()!=='' && Number.isFinite(Number(total)));
  const value=numeric ? Number(total || 0).toLocaleString('es-ES') : esc(total || '0');
  return `<article class="creator-metric"><span>${esc(label)}</span><b>${value}</b>${recent === null ? '' : `<small>+${Number(recent || 0).toLocaleString('es-ES')} · últimos 30 días</small>`}</article>`;
}

function creatorPostHTML(post) {
  const interactions = Number(post.like_count || 0) + Number(post.comment_count || 0) + Number(post.repost_count || 0);
  return `<article class="creator-post-item ${post.featured ? 'featured' : ''}">
    <button type="button" class="creator-post-preview" data-open-post="${post.id}">
      <span class="creator-post-media">${tileContentHTML(post)}</span>
      <span class="creator-post-copy">
        <b>${post.audience === 'vip' ? '★ Solo VIP · ' : ''}${post.featured ? 'Destacada' : (post.post_kind === 'reel' ? 'Reel' : 'Publicación')}</b>
        <small>${compactTimeAgo(post.created_at)} · ${interactions} interacciones · ${Number(post.save_count || 0)} guardados</small>
      </span>
    </button>
    <button type="button" class="${post.featured ? 'secondary' : 'primary'} creator-feature-action" data-creator-feature="${post.id}" data-featured="${post.featured ? '1' : '0'}">
      ${post.featured ? 'Quitar destacado' : 'Destacar'}
    </button>
  </article>`;
}

function toLocalDateTimeInput(value) {
  const date=value ? new Date(value) : null;
  if(!date || !Number.isFinite(date.getTime()))return '';
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

function creatorPublishingStateLabel(post) {
  if(post.creator_state==='scheduled'){
    return `Programada · ${new Date(post.scheduled_for).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`;
  }
  return 'Borrador';
}

function creatorPublishingHTML(posts = []) {
  if(!posts.length){
    return '<div class="creator-empty compact">No tienes borradores ni publicaciones programadas.</div>';
  }

  return posts.map(post=>`<article class="creator-publishing-item ${post.creator_state}">
    <div class="creator-publishing-preview">${tileContentHTML(post)}</div>
    <div class="creator-publishing-copy">
      <div class="creator-publishing-title">
        <b>${creatorPublishingStateLabel(post)}</b>
        <span>${post.audience==='vip' ? '★ VIP' : 'Público'}</span>
      </div>
      <p>${esc(String(post.caption || '').trim() || (post.post_kind==='reel' ? 'Reel sin texto' : 'Publicación sin texto'))}</p>
      <small>${post.content_level==='normal' ? 'Normal' : post.content_level==='sensitive' ? 'Sensible' : 'Desnudez'}${Number(post.pending_consent_count || 0)>0 ? ` · ${Number(post.pending_consent_count)} consentimientos pendientes` : ''}</small>
      <div class="creator-publishing-schedule">
        <input type="datetime-local" data-publishing-date="${post.id}" value="${toLocalDateTimeInput(post.scheduled_for)}">
        <button type="button" class="secondary" data-publishing-schedule="${post.id}">${post.creator_state==='scheduled' ? 'Reprogramar' : 'Programar'}</button>
      </div>
      <div class="creator-publishing-actions-row">
        <button type="button" class="primary" data-publishing-now="${post.id}">Publicar ahora</button>
        ${post.creator_state==='scheduled' ? `<button type="button" class="secondary" data-publishing-draft="${post.id}">Volver a borrador</button>` : ''}
        <button type="button" class="danger-outline" data-publishing-delete="${post.id}">Eliminar</button>
      </div>
    </div>
  </article>`).join('');
}

function renderCreatorPublishing(data = {}) {
  const summary=data.summary || {};
  if($('#creatorPublishingSummary')){
    $('#creatorPublishingSummary').innerHTML=[
      creatorMetric('Borradores',summary.draft_count || 0),
      creatorMetric('Programadas',summary.scheduled_count || 0)
    ].join('');
  }
  if($('#creatorPublishingList')){
    $('#creatorPublishingList').innerHTML=creatorPublishingHTML(Array.isArray(data.posts) ? data.posts : []);
  }
  if($('#creatorPublishingHint')){
    $('#creatorPublishingHint').textContent='Guarda borradores o programa publicaciones entre 5 minutos y 90 días.';
  }
}

async function loadCreatorCenter() {
  const metricsRoot = $('#creatorMetrics');
  const postsRoot = $('#creatorPosts');
  if (!metricsRoot || !postsRoot) return false;

  const [centerResponse,publishingResponse]=await Promise.all([
    api('/api/profiles/me/creator-center'),
    api('/api/posts/creator/publishing')
  ]);
  const { r, d }=centerResponse;
  if (!r.ok) {
    metricsRoot.innerHTML = '<div class="creator-empty">El Centro de creador requiere una cuenta de creador verificada.</div>';
    postsRoot.innerHTML = '';
    return false;
  }

  const creator = d.creator || {};
  metricsRoot.innerHTML = [
    creatorMetric('Seguidores',creator.follower_count,creator.followers_30d),
    creatorMetric('Publicaciones',creator.post_count),
    creatorMetric('Reels',creator.reel_count),
    creatorMetric('Me gusta',creator.like_count,creator.likes_30d),
    creatorMetric('Comentarios',creator.comment_count,creator.comments_30d),
    creatorMetric('Republicaciones',creator.repost_count,creator.reposts_30d),
    creatorMetric('Guardados',creator.save_count,creator.saves_30d),
    creatorMetric('Destacadas',creator.featured_count),
    creatorMetric('Clics en enlaces',creator.link_click_count),
    creatorMetric('Avisos enviados',creator.broadcast_count),
    creatorMetric('Miembros VIP',creator.vip_count),
    creatorMetric('Avisos VIP',creator.vip_broadcast_count),
    creatorMetric('Contenido VIP',creator.vip_post_count),
    creatorMetric('Stories VIP activas',creator.vip_story_count)
  ].join('');

  const creatorForm=$('#creatorProfileForm');
  if(creatorForm){
    creatorForm.headline.value=creator.creator_headline || '';
    $('#creatorLinksFields').innerHTML=creatorLinkFieldsHTML(Array.isArray(d.links) ? d.links : [],Number(d.linkLimit || 5));
    $('#creatorProfileStatus').textContent='';
  }

  const posts = Array.isArray(d.posts) ? d.posts : [];
  postsRoot.innerHTML = posts.length
    ? posts.map(creatorPostHTML).join('')
    : '<div class="creator-empty">Publica contenido para empezar a usar tu Centro de creador.</div>';

  const hint = $('#creatorFeaturedHint');
  if (hint) hint.textContent = `${Number(creator.featured_count || 0)} de ${Number(d.featuredLimit || 3)} publicaciones destacadas.`;

  const audienceRoot=$('#creatorAudience');
  if(audienceRoot){
    audienceRoot.innerHTML=creatorAudienceHTML(Array.isArray(d.audience) ? d.audience : []);
  }

  const engagement=d.engagement || {};
  if($('#creatorEngagementSummary')){
    $('#creatorEngagementSummary').innerHTML=creatorEngagementSummaryHTML(engagement);
  }
  if($('#creatorTopFans')){
    $('#creatorTopFans').innerHTML=creatorTopFansHTML(Array.isArray(engagement.topFans) ? engagement.topFans : []);
  }
  if($('#creatorTopContent')){
    $('#creatorTopContent').innerHTML=creatorTopContentHTML(Array.isArray(engagement.topContent) ? engagement.topContent : []);
  }

  const historyRoot=$('#creatorBroadcastHistory');
  if(historyRoot){
    historyRoot.innerHTML=creatorBroadcastHistoryHTML(Array.isArray(d.broadcasts) ? d.broadcasts : []);
  }

  const availability=creatorBroadcastAvailability(d.nextBroadcastAt);
  const broadcastHint=$('#creatorBroadcastHint');
  const broadcastSubmit=$('#creatorBroadcastSubmit');
  const broadcastForm=$('#creatorBroadcastForm');
  if(broadcastHint)broadcastHint.textContent=availability.label;
  if(broadcastSubmit)broadcastSubmit.disabled=availability.blocked;
  if(broadcastForm?.body)broadcastForm.body.disabled=availability.blocked;

  const vip=d.vip || {};
  if($('#creatorVipMembers'))$('#creatorVipMembers').innerHTML=creatorVipMembersHTML(Array.isArray(vip.members) ? vip.members : []);
  if($('#creatorVipBroadcastHistory'))$('#creatorVipBroadcastHistory').innerHTML=creatorBroadcastHistoryHTML(Array.isArray(vip.broadcasts) ? vip.broadcasts : []);
  if($('#creatorVipHint'))$('#creatorVipHint').textContent=`${Array.isArray(vip.members) ? vip.members.length : Number(creator.vip_count || 0)} de ${Number(vip.limit || 50)} miembros VIP.`;
  const vipAvailability=creatorBroadcastAvailability(vip.nextBroadcastAt);
  const vipForm=$('#creatorVipBroadcastForm');
  const vipSubmit=$('#creatorVipBroadcastSubmit');
  if(vipSubmit)vipSubmit.disabled=vipAvailability.blocked || Number(creator.vip_count || 0)===0;
  if(vipForm?.body)vipForm.body.disabled=vipAvailability.blocked || Number(creator.vip_count || 0)===0;
  if($('#creatorVipBroadcastStatus') && vipAvailability.blocked)$('#creatorVipBroadcastStatus').textContent=vipAvailability.label;

  if(publishingResponse.r.ok){
    renderCreatorPublishing(publishingResponse.d);
  }else{
    if($('#creatorPublishingList'))$('#creatorPublishingList').innerHTML='<div class="creator-empty compact">No se pudo cargar la cola de publicación.</div>';
  }
  return true;
}

async function openCreatorModal() {
  const modal = $('#creatorModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  $('#creatorMetrics').innerHTML = '<div class="mini-loading">Cargando métricas...</div>';
  $('#creatorPosts').innerHTML = '';
  if($('#creatorAudience'))$('#creatorAudience').innerHTML='<div class="mini-loading">Cargando audiencia...</div>';
  if($('#creatorEngagementSummary'))$('#creatorEngagementSummary').innerHTML='<div class="mini-loading">Calculando engagement...</div>';
  if($('#creatorTopFans'))$('#creatorTopFans').innerHTML='';
  if($('#creatorTopContent'))$('#creatorTopContent').innerHTML='';
  if($('#creatorBroadcastHistory'))$('#creatorBroadcastHistory').innerHTML='';
  if($('#creatorBroadcastStatus'))$('#creatorBroadcastStatus').textContent='';
  if($('#creatorVipMembers'))$('#creatorVipMembers').innerHTML='<div class="mini-loading">Cargando círculo VIP...</div>';
  if($('#creatorVipBroadcastHistory'))$('#creatorVipBroadcastHistory').innerHTML='';
  if($('#creatorVipBroadcastStatus'))$('#creatorVipBroadcastStatus').textContent='';
  if($('#creatorPublishingSummary'))$('#creatorPublishingSummary').innerHTML='<div class="mini-loading">Cargando cola...</div>';
  if($('#creatorPublishingList'))$('#creatorPublishingList').innerHTML='';
  await loadCreatorCenter();
}

function closeCreatorModal() {
  $('#creatorModal')?.classList.add('hidden');
}

$('#creatorBroadcastForm textarea[name="body"]')?.addEventListener('input',event=>{
  const count=$('#creatorBroadcastCount');
  if(count)count.textContent=`${String(event.currentTarget.value || '').length} / 280`;
});

$('#creatorBroadcastForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const body=String(form.body?.value || '').trim();
  const status=$('#creatorBroadcastStatus');
  const submit=$('#creatorBroadcastSubmit');
  if(!body){
    status.textContent='Escribe un aviso antes de enviarlo.';
    return;
  }

  submit.disabled=true;
  status.textContent='Enviando aviso...';
  try{
    const { r, d }=await api('/api/profiles/me/creator-broadcasts',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({body})
    });
    if(!r.ok){
      if(d.error==='broadcast_cooldown'){
        const availability=creatorBroadcastAvailability(d.nextBroadcastAt);
        status.textContent=availability.label;
        if($('#creatorBroadcastHint'))$('#creatorBroadcastHint').textContent=availability.label;
        if(form.body)form.body.disabled=true;
        return;
      }
      status.textContent=d.error==='invalid_broadcast'
        ? 'El aviso debe tener entre 1 y 280 caracteres.'
        : 'No se pudo enviar el aviso.';
      submit.disabled=false;
      return;
    }

    form.reset();
    if($('#creatorBroadcastCount'))$('#creatorBroadcastCount').textContent='0 / 280';
    status.textContent=`Aviso enviado a ${Number(d.broadcast?.recipient_count || 0)} seguidores.`;
    toast('Aviso enviado a tus seguidores');
    await Promise.all([loadCreatorCenter(),loadNotifications()]);
  }catch(_){
    status.textContent='No se pudo enviar el aviso.';
    submit.disabled=false;
  }
});

$('#creatorVipBroadcastForm textarea[name="body"]')?.addEventListener('input',event=>{
  const count=$('#creatorVipBroadcastCount');
  if(count)count.textContent=`${String(event.currentTarget.value || '').length} / 280`;
});

$('#creatorVipBroadcastForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const body=String(form.body?.value || '').trim();
  const status=$('#creatorVipBroadcastStatus');
  const submit=$('#creatorVipBroadcastSubmit');
  if(!body){
    status.textContent='Escribe un aviso VIP antes de enviarlo.';
    return;
  }
  submit.disabled=true;
  status.textContent='Enviando aviso VIP...';
  const { r, d }=await api('/api/profiles/me/creator-vip-broadcasts',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({body})
  });
  if(!r.ok){
    if(d.error==='vip_broadcast_cooldown'){
      status.textContent=creatorBroadcastAvailability(d.nextBroadcastAt).label;
      return;
    }
    status.textContent='No se pudo enviar el aviso VIP.';
    submit.disabled=false;
    return;
  }
  form.reset();
  if($('#creatorVipBroadcastCount'))$('#creatorVipBroadcastCount').textContent='0 / 280';
  status.textContent=`Aviso VIP enviado a ${Number(d.broadcast?.recipient_count || 0)} miembros.`;
  toast('Aviso enviado a tu círculo VIP');
  await Promise.all([loadCreatorCenter(),loadNotifications()]);
});

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-creator-vip]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  const active=button.dataset.vip==='1';
  button.disabled=true;
  const { r, d }=await api(`/api/profiles/me/creator-vips/${encodeURIComponent(button.dataset.creatorVip)}`,{
    method:active ? 'DELETE' : 'POST'
  });
  if(!r.ok){
    button.disabled=false;
    return toast(
      d.error==='vip_limit_reached' ? 'Tu círculo VIP admite hasta 50 personas.' :
      d.error==='vip_requires_current_follower' ? 'Solo puedes añadir seguidores actuales.' :
      'No se pudo actualizar el círculo VIP.'
    );
  }
  toast(active ? 'Persona retirada del círculo VIP' : 'Persona añadida al círculo VIP');
  await loadCreatorCenter();
});

document.addEventListener('click',async event=>{
  const publishNow=event.target.closest('[data-publishing-now]');
  const schedule=event.target.closest('[data-publishing-schedule]');
  const toDraft=event.target.closest('[data-publishing-draft]');
  const remove=event.target.closest('[data-publishing-delete]');
  const button=publishNow || schedule || toDraft || remove;
  if(!button)return;

  event.preventDefault();
  event.stopPropagation();
  button.disabled=true;

  try{
    if(publishNow){
      const { r,d }=await api(`/api/posts/creator/publishing/${encodeURIComponent(publishNow.dataset.publishingNow)}/publish`,{method:'POST'});
      if(!r.ok)throw new Error('No se pudo publicar ahora.');
      toast(d.awaitingConsent ? 'Esperando consentimientos antes de publicar' : 'Publicación publicada');
    }else if(schedule){
      const id=schedule.dataset.publishingSchedule;
      const input=document.querySelector(`[data-publishing-date="${CSS.escape(String(id))}"]`);
      const localValue=String(input?.value || '');
      if(!localValue)throw new Error('Elige una fecha y hora.');
      const date=new Date(localValue);
      if(!Number.isFinite(date.getTime()))throw new Error('Fecha no válida.');
      const { r,d }=await api(`/api/posts/creator/publishing/${encodeURIComponent(id)}/schedule`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({scheduledFor:date.toISOString()})
      });
      if(!r.ok){
        throw new Error(d.error==='invalid_scheduled_time'
          ? 'Programa entre 5 minutos y 90 días.'
          : 'No se pudo programar.');
      }
      toast('Publicación programada');
    }else if(toDraft){
      const { r }=await api(`/api/posts/creator/publishing/${encodeURIComponent(toDraft.dataset.publishingDraft)}/draft`,{method:'POST'});
      if(!r.ok)throw new Error('No se pudo volver a borrador.');
      toast('Publicación devuelta a borrador');
    }else if(remove){
      if(!window.confirm('¿Eliminar este borrador o publicación programada?'))return;
      const { r }=await api(`/api/posts/${encodeURIComponent(remove.dataset.publishingDelete)}`,{method:'DELETE'});
      if(!r.ok)throw new Error('No se pudo eliminar.');
      toast('Contenido eliminado');
    }

    await Promise.all([loadCreatorCenter(),loadFeed(currentMode),loadMe()]);
  }catch(error){
    toast(error.message || 'No se pudo actualizar la publicación.');
  }finally{
    button.disabled=false;
  }
});

$('#creatorProfileForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const status=$('#creatorProfileStatus');
  const payload=creatorProfilePayload(form);
  if(payload.error){
    status.textContent=payload.error;
    return;
  }

  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  status.textContent='Guardando...';
  try{
    const { r, d }=await api('/api/profiles/me/creator-profile',{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!r.ok){
      status.textContent=d.error==='invalid_creator_profile'
        ? 'Revisa los enlaces. Deben usar http:// o https://.'
        : 'No se pudo guardar el perfil de creador.';
      return;
    }
    status.textContent='Perfil de creador actualizado.';
    toast('Perfil de creador actualizado');
    me={...me,creator_headline:d.headline || ''};
    await Promise.all([loadCreatorCenter(),loadProfile(ownProfileMode)]);
  }finally{
    button.disabled=false;
  }
});

$('#closeCreatorModal')?.addEventListener('click',closeCreatorModal);
$('#creatorModal')?.addEventListener('click',event=>{
  if(event.target === $('#creatorModal')) closeCreatorModal();
});

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-creator-feature]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  const featured=button.dataset.featured==='1';
  button.disabled=true;
  const { r, d }=await api(`/api/profiles/me/creator/featured/${button.dataset.creatorFeature}`,{
    method:featured ? 'DELETE' : 'POST'
  });
  if(!r.ok){
    button.disabled=false;
    return toast(d.error==='featured_limit_reached'
      ? 'Solo puedes destacar 3 publicaciones.'
      : 'No se pudo actualizar el contenido destacado.');
  }
  toast(featured ? 'Publicación retirada de destacados' : 'Publicación destacada');
  await Promise.all([loadCreatorCenter(),loadProfile(ownProfileMode)]);
});

document.addEventListener('click',event=>{
  const link=event.target.closest('[data-creator-link-click]');
  if(!link)return;
  const id=link.dataset.creatorLinkClick;
  if(!id)return;
  fetch(`/api/profiles/creator-links/${encodeURIComponent(id)}/click`,{
    method:'POST',
    credentials:'same-origin',
    keepalive:true
  }).catch(()=>{});
});

function trustStatusLabel(value) {
  return ({
    pending:'Pendiente',
    approved:'Aprobada',
    rejected:'No aprobada',
    cancelled:'Cancelada'
  })[value] || 'Sin solicitud';
}

function trustStatusCard(type, verified, latest) {
  const isAge = type === 'age';
  const title = isAge ? 'Mayoría de edad' : 'Perfil de creador';
  const verifiedText = isAge ? '+18 verificado' : 'Creador verificado';
  const pending = latest?.status === 'pending';
  const state = verified ? 'verified' : pending ? 'pending' : latest?.status || 'none';
  const detail = verified
    ? (isAge ? 'Tu mayoría de edad figura como verificada.' : 'Tu perfil figura como creador verificado.')
    : pending
      ? 'Tu solicitud está en revisión.'
      : latest?.status === 'rejected'
        ? (latest.review_note || 'La última solicitud no fue aprobada.')
        : 'Todavía no tienes esta verificación.';

  return `<article class="trust-status-card ${state}">
    <div class="trust-status-icon">${verified ? '✓' : pending ? '…' : '○'}</div>
    <div><span>${title}</span><b>${verified ? verifiedText : trustStatusLabel(latest?.status)}</b><small>${esc(detail)}</small></div>
  </article>`;
}

function trustHistoryHTML(items = []) {
  if (!items.length) return '<div class="trust-empty">Todavía no has enviado solicitudes de verificación.</div>';
  return items.map(item => `<article class="trust-history-item">
    <div><b>${item.type === 'age' ? 'Verificación +18' : 'Verificación de creador'}</b><span class="trust-history-state ${esc(item.status)}">${trustStatusLabel(item.status)}</span></div>
    <small>${timeAgo(item.created_at)}</small>
    ${item.request_note ? `<p>${esc(item.request_note)}</p>` : ''}
    ${item.review_note ? `<p class="trust-review-note"><b>Revisión:</b> ${esc(item.review_note)}</p>` : ''}
    ${item.status === 'pending' ? `<button type="button" class="secondary" data-cancel-verification="${item.id}">Cancelar solicitud</button>` : ''}
  </article>`).join('');
}

async function loadTrustCenter() {
  const { r, d } = await api('/api/trust/me');
  if (!r.ok) return false;

  const user = d.user || {};
  $('#trustStatusCards').innerHTML = [
    trustStatusCard('age', !!user.age_verified, d.latest?.age),
    trustStatusCard('creator', !!user.creator_verified, d.latest?.creator)
  ].join('');
  $('#trustHistory').innerHTML = trustHistoryHTML(Array.isArray(d.history) ? d.history : []);

  const form = $('#trustRequestForm');
  if (form) {
    const agePending = d.latest?.age?.status === 'pending';
    const creatorPending = d.latest?.creator?.status === 'pending';
    const type = form.type.value;
    const blocked = type === 'age'
      ? !!user.age_verified || agePending
      : !!user.creator_verified || creatorPending;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = blocked;
      submit.textContent = blocked
        ? (type === 'age' ? 'Verificación +18 no disponible' : 'Verificación de creador no disponible')
        : 'Enviar solicitud';
    }
  }

  me = {
    ...me,
    age_verified:!!user.age_verified,
    creator_verified:!!user.creator_verified
  };
  return true;
}

async function openTrustModal() {
  const modal = $('#trustModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  $('#trustRequestStatus').textContent = '';
  $('#trustStatusCards').innerHTML = '<div class="mini-loading">Cargando estado...</div>';
  $('#trustHistory').innerHTML = '';
  await loadTrustCenter();
}

function closeTrustModal() {
  $('#trustModal')?.classList.add('hidden');
}

$('#closeTrustModal')?.addEventListener('click', closeTrustModal);
$('#trustModal')?.addEventListener('click', event => {
  if (event.target === $('#trustModal')) closeTrustModal();
});

$('#trustRequestForm')?.addEventListener('change', event => {
  if (event.target.name === 'type') loadTrustCenter();
});

$('#trustRequestForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fd = new FormData(form);
  const status = $('#trustRequestStatus');
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = 'Enviando solicitud...';

  try {
    const { r, d } = await api('/api/trust/request', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        type:fd.get('type'),
        note:String(fd.get('note') || '').trim()
      })
    });

    if (!r.ok) {
      status.textContent = d.error === 'request_already_pending'
        ? 'Ya tienes una solicitud de este tipo pendiente.'
        : d.error === 'already_verified'
          ? 'Esta verificación ya está aprobada.'
          : 'No se pudo enviar la solicitud.';
      return;
    }

    form.note.value = '';
    status.textContent = 'Solicitud enviada para revisión.';
    toast('Solicitud de verificación enviada');
    await loadTrustCenter();
  } finally {
    if (!submit.disabled || status.textContent.startsWith('Solicitud')) return;
    submit.disabled = false;
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-cancel-verification]');
  if (!button) return;
  event.preventDefault();
  button.disabled = true;
  const { r } = await api(`/api/trust/request/${button.dataset.cancelVerification}`, { method:'DELETE' });
  if (!r.ok) {
    button.disabled = false;
    return toast('No se pudo cancelar la solicitud.');
  }
  toast('Solicitud cancelada');
  await loadTrustCenter();
});

function accountDate(value) {
  if (!value) return 'No registrado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No registrado';
  return date.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
}

function accountSummaryHTML(account) {
  return `<div class="account-identity">
    <span class="account-avatar">${avatarHTML(me)}</span>
    <div><b>${esc(account.display_name || me?.display_name || account.username)}</b><span>@${esc(account.username)}</span></div>
  </div>
  <div class="account-summary-grid">
    <div><span>Email</span><b>${esc(account.email)}</b></div>
    <div><span>Miembro desde</span><b>${accountDate(account.created_at)}</b></div>
    <div><span>Publicaciones</span><b>${Number(account.post_count || 0)}</b></div>
    <div><span>Comentarios</span><b>${Number(account.comment_count || 0)}</b></div>
    <div><span>Seguidores</span><b>${Number(account.follower_count || 0)}</b></div>
    <div><span>Siguiendo</span><b>${Number(account.following_count || 0)}</b></div>
  </div>
  <div class="account-security-note">
    <span>Contraseña</span>
    <b>${account.password_changed_at ? 'Actualizada ' + accountDate(account.password_changed_at) : 'Sin cambios recientes registrados'}</b>
  </div>`;
}

async function openAccountModal() {
  const modal = $('#accountModal');
  if (!modal) return;

  modal.classList.remove('hidden');
  $('#accountSummary').classList.add('skeleton');
  $('#accountSummary').innerHTML = '<div class="mini-loading">Cargando cuenta...</div>';
  $('#changePasswordStatus').textContent = '';
  $('#accountToolsStatus').textContent = '';
  $('#deleteAccountStatus').textContent = '';
  $('#changePasswordForm')?.reset();
  $('#deleteAccountForm')?.reset();

  const { r, d } = await api('/api/auth/account');
  if (!r.ok || !d.account) {
    $('#accountSummary').classList.remove('skeleton');
    $('#accountSummary').innerHTML = '<div class="info-card"><b>No se pudo cargar la cuenta.</b></div>';
    return;
  }

  const account = d.account;
  $('#accountSummary').classList.remove('skeleton');
  $('#accountSummary').innerHTML = accountSummaryHTML(account);

  const usernameInput = $('#deleteAccountUsername');
  if (usernameInput) usernameInput.placeholder = `@${account.username}`;

  const deleteForm = $('#deleteAccountForm');
  const deleteButton = $('#deleteAccountButton');
  const deleteStatus = $('#deleteAccountStatus');
  if (account.is_admin) {
    all('input', deleteForm).forEach(input => input.disabled = true);
    deleteButton.disabled = true;
    deleteStatus.textContent = 'La cuenta administradora principal está protegida frente al borrado desde la app.';
  } else {
    all('input', deleteForm).forEach(input => input.disabled = false);
    deleteButton.disabled = false;
  }
}

function closeAccountModal() {
  $('#accountModal')?.classList.add('hidden');
}

$('#closeAccountModal')?.addEventListener('click', closeAccountModal);
$('#accountModal')?.addEventListener('click', event => {
  if (event.target === $('#accountModal')) closeAccountModal();
});

$('#changePasswordForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $('#changePasswordStatus');
  const fd = new FormData(form);
  const currentPassword = String(fd.get('currentPassword') || '');
  const newPassword = String(fd.get('newPassword') || '');
  const repeatPassword = String(fd.get('repeatPassword') || '');

  if (newPassword !== repeatPassword) {
    status.textContent = 'Las nuevas contraseñas no coinciden.';
    return;
  }

  status.textContent = 'Actualizando contraseña...';
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;

  try {
    const { r, d } = await api('/api/auth/account/change-password', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({currentPassword,newPassword})
    });

    if (!r.ok) {
      status.textContent = d.error === 'current_password_incorrect'
        ? 'La contraseña actual no es correcta.'
        : d.error === 'password_unchanged'
          ? 'La nueva contraseña debe ser diferente.'
          : 'No se pudo cambiar la contraseña.';
      return;
    }

    form.reset();
    status.textContent = 'Contraseña actualizada. Las demás sesiones han quedado cerradas.';
    toast('Contraseña actualizada');
    await openAccountModal();
  } finally {
    if (submit) submit.disabled = false;
  }
});

$('#exportAccountData')?.addEventListener('click', async () => {
  const button = $('#exportAccountData');
  const status = $('#accountToolsStatus');
  button.disabled = true;
  status.textContent = 'Preparando tu archivo...';

  try {
    const response = await fetch('/api/auth/account/export');
    if (response.status === 401) {
      location.href = '/';
      return;
    }
    if (!response.ok) throw new Error('export_failed');

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/i);
    const filename = match?.[1] || `redlibertad-${me?.username || 'cuenta'}-datos.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Copia de tus datos descargada.';
    toast('Datos preparados');
  } catch (_) {
    status.textContent = 'No se pudo preparar la descarga.';
  } finally {
    button.disabled = false;
  }
});

$('#logoutAllSessions')?.addEventListener('click', async () => {
  if (!window.confirm('¿Cerrar todas las sesiones de RedLibertad, incluida esta? Tendrás que volver a iniciar sesión.')) return;

  const button = $('#logoutAllSessions');
  const status = $('#accountToolsStatus');
  button.disabled = true;
  status.textContent = 'Cerrando sesiones...';

  const { r } = await api('/api/auth/account/logout-all', { method:'POST' });
  if (!r.ok) {
    button.disabled = false;
    status.textContent = 'No se pudieron cerrar las sesiones.';
    return;
  }

  location.href = '/';
});

$('#deleteAccountForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $('#deleteAccountStatus');
  const fd = new FormData(form);
  const confirmUsername = String(fd.get('confirmUsername') || '').trim().replace(/^@/,'');
  const password = String(fd.get('password') || '');

  if (confirmUsername.toLowerCase() !== String(me?.username || '').toLowerCase()) {
    status.textContent = `Escribe exactamente @${me?.username || 'usuario'} para confirmar.`;
    return;
  }

  if (!window.confirm('Esta acción eliminará definitivamente tu cuenta y su contenido. ¿Quieres continuar?')) return;

  const button = $('#deleteAccountButton');
  button.disabled = true;
  status.textContent = 'Eliminando cuenta...';

  try {
    const { r, d } = await api('/api/auth/account', {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password,confirmUsername})
    });

    if (!r.ok) {
      status.textContent = d.error === 'current_password_incorrect'
        ? 'La contraseña actual no es correcta.'
        : d.error === 'username_confirmation_mismatch'
          ? 'El @usuario de confirmación no coincide.'
          : d.error === 'admin_account_protected'
            ? 'La cuenta administradora está protegida.'
            : 'No se pudo eliminar la cuenta.';
      button.disabled = false;
      return;
    }

    location.href = '/';
  } catch (_) {
    button.disabled = false;
    status.textContent = 'No se pudo eliminar la cuenta.';
  }
});

async function openPrivacyModal() {
  const modal = $('#privacyModal');
  const status = $('#privacyStatus');
  if (!modal) return;

  status.textContent = 'Cargando...';
  modal.classList.remove('hidden');

  const { r, d } = await api('/api/profiles/me/privacy');
  if (!r.ok) {
    status.textContent = 'No se pudieron cargar tus ajustes.';
    return;
  }

  const form = $('#privacyForm');
  form.messagePrivacy.value = d.settings?.messagePrivacy || 'everyone';
  form.discoverable.checked = d.settings?.discoverable !== false;
  form.showActivity.checked = d.settings?.showActivity !== false;
  $('#mutedCountBadge').textContent = Number(d.mutedCount || 0);
  $('#blockedCountBadge').textContent = Number(d.blockedCount || 0);
  status.textContent = '';
  await loadPrivacyLists();
}

function closePrivacyModal() {
  $('#privacyModal')?.classList.add('hidden');
}

$('#closePrivacyModal')?.addEventListener('click', closePrivacyModal);
$('#privacyModal')?.addEventListener('click', event => {
  if (event.target === $('#privacyModal')) closePrivacyModal();
});

$('#privacyForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $('#privacyStatus');
  status.textContent = 'Guardando...';

  const { r, d } = await api('/api/profiles/me/privacy', {
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      messagePrivacy:form.messagePrivacy.value,
      discoverable:form.discoverable.checked,
      showActivity:form.showActivity.checked
    })
  });

  if (!r.ok) {
    status.textContent = 'No se pudieron guardar los ajustes.';
    return;
  }

  me = {
    ...me,
    message_privacy:d.settings.messagePrivacy,
    discoverable:d.settings.discoverable,
    show_activity:d.settings.showActivity
  };
  status.textContent = 'Privacidad actualizada.';
  toast('Privacidad actualizada');
  await Promise.all([loadHomeSuggestions(),loadActivePeople()]);
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-privacy-remove]');
  if (!button) return;
  event.preventDefault();

  const kind = button.dataset.privacyRemove;
  const userId = button.dataset.userId;
  button.disabled = true;

  try {
    const endpoint = kind === 'muted'
      ? `/api/profiles/${userId}/mute`
      : `/api/profiles/${userId}/block`;
    const { r } = await api(endpoint,{method:'DELETE'});
    if (!r.ok) throw new Error('privacy_remove_failed');
    toast(kind === 'muted' ? 'Usuario visible de nuevo' : 'Usuario desbloqueado');
    await loadPrivacyLists();
    await Promise.all([loadFeed(currentMode),loadStories(),loadNotifications(),loadHomeSuggestions(),loadActivePeople()]);
  } catch (_) {
    toast('No se pudo actualizar este ajuste.');
  } finally {
    button.disabled = false;
  }
});

async function openProfileModal() {
  const form = $('#profileForm');
  form.displayName.value = me.display_name || '';
  form.bio.value = me.bio || '';
  form.locationLabel.value = me.location_label || '';
  form.websiteUrl.value = me.website_url || '';

  const catalog = await loadInterestCatalog();
  const selected = new Set(Array.isArray(me.interests) ? me.interests : []);
  $('#profileInterests').innerHTML = catalog.map(interest => `
    <label class="interest-option">
      <input type="checkbox" name="interest" value="${esc(interest)}" ${selected.has(interest) ? 'checked' : ''}>
      <span>${esc(interest)}</span>
    </label>
  `).join('');

  $('#profileMessage').textContent = '';
  $('#profileModal').classList.remove('hidden');
}
$('#closeProfileModal').onclick = () => $('#profileModal').classList.add('hidden');
$('#closePublicProfileModal').onclick = () => $('#publicProfileModal').classList.add('hidden');
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#profileMessage');
  msg.textContent = 'Guardando...';
  try {
    const fd = new FormData(e.target);
    const avatar = await uploadFile($('#avatarFile').files[0]);
    const cover = await uploadFile($('#coverFile').files[0]);
    const interests = all('input[name="interest"]:checked', e.target).map(x => x.value).slice(0, 8);
    const payload = {
      displayName: fd.get('displayName'),
      bio: fd.get('bio'),
      locationLabel: fd.get('locationLabel'),
      websiteUrl: fd.get('websiteUrl'),
      interests,
      ...(avatar ? { avatarUrl: avatar.url } : {}),
      ...(cover ? { coverUrl: cover.url } : {})
    };
    const { r, d } = await api('/api/profiles/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('No se pudo guardar el perfil.');
    me = { ...me, ...d.profile };
    $('#profileModal').classList.add('hidden');
    toast('Perfil actualizado');
    await loadMe(); await loadProfile(); await loadGrowthPanel();
  } catch (err) { msg.textContent = err.message; }
});

async function loadConsents() {
  const { d } = await api('/api/posts/consents/pending');
  const root = $('#consentRequests');
  if (!d.requests.length) { root.innerHTML = '<div class="info-card"><b>No tienes solicitudes pendientes.</b><p>Cuando alguien indique que apareces en una publicación, podrás revisarla aquí.</p></div>'; return; }
  root.innerHTML = d.requests.map(x => `<article class="consent-card"><div class="consent-head">${profileLink(x.username, `<span class="avatar">${x.avatar_url ? `<img src="${esc(x.avatar_url)}">` : initials(x.display_name)}</span>`, 'post-avatar-link')}<div>${profileLink(x.username, `<b>${esc(x.display_name)}</b>`, 'post-name-link')}<small>${profileLink(x.username, `@${esc(x.username)}`, 'post-username-link')} solicita tu consentimiento</small></div></div><div class="consent-media">${x.gated ? `<div class="gate"><span class="badge">18+</span><b>Verificación necesaria</b><p>${gateText(x.gate_reason)}</p></div>` : mediaHTML(x)}</div>${x.caption ? `<p>${esc(x.caption)}</p>` : ''}<div class="consent-actions">${x.consent_status === 'pending' ? `<button class="primary" data-consent="approved" data-post="${x.id}">Autorizar</button><button class="danger-outline" data-consent="rejected" data-post="${x.id}">Rechazar</button>` : `<span class="approved-label">✓ Autorizado</span><button class="danger-outline" data-consent="revoked" data-post="${x.id}">Retirar autorización</button>`}</div></article>`).join('');
  all('[data-consent]', root).forEach(b => b.onclick = async () => {
    if (b.dataset.consent === 'approved' && !d.ageVerified && b.closest('.consent-card').querySelector('.gate')) return toast('Primero necesitas verificar tu mayoría de edad.');
    const { r } = await api(`/api/posts/${b.dataset.post}/consent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: b.dataset.consent }) });
    if (r.ok) { toast(b.dataset.consent === 'revoked' ? 'Consentimiento retirado' : 'Decisión guardada'); await loadConsents(); }
  });
}


function commentHTML(comment) {
  return `<article class="comment-item">
    ${profileLink(
      comment.username,
      `<span class="comment-avatar">${comment.avatar_url ? `<img src="${esc(comment.avatar_url)}">` : initials(comment.display_name)}</span>`,
      'comment-avatar-link'
    )}
    <div class="comment-copy">
      <div class="comment-meta">
        <div>
          ${profileLink(
            comment.username,
            `<b>${esc(comment.display_name)} ${comment.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`,
            'comment-name-link'
          )}
          <small>${new Date(comment.created_at).toLocaleString()}</small>
        </div>
        ${comment.can_delete ? `
          <button
            type="button"
            class="comment-delete-button"
            data-delete-comment="${comment.id}"
            data-delete-comment-post="${activeCommentsPostId}"
            aria-label="Eliminar comentario"
            title="Eliminar comentario">Eliminar</button>
        ` : ''}
      </div>
      <p>${captionHTML(comment.body)}</p>
    </div>
  </article>`;
}

async function loadComments(postId) {
  const list = $('#commentsList');
  list.innerHTML = '<div class="comments-loading">Cargando comentarios...</div>';

  const { r, d } = await api(`/api/posts/${postId}/comments`);
  if (!r.ok) {
    list.innerHTML = '<div class="info-card"><b>No se pudieron cargar los comentarios.</b></div>';
    return;
  }

  list.innerHTML = d.comments?.length
    ? d.comments.map(commentHTML).join('')
    : '<div class="comments-empty"><b>Todavía no hay comentarios.</b><p>Sé la primera persona en comentar.</p></div>';

  list.scrollTop = list.scrollHeight;
}

async function openComments(postId) {
  activeCommentsPostId = Number(postId);
  $('#commentBody').value = '';
  $('#commentStatus').textContent = '';
  $('#commentsModal').classList.remove('hidden');
  await loadComments(activeCommentsPostId);
}

function openReport(postId) {
  activeReportPostId = Number(postId);
  $('#reportForm').reset();
  $('#reportStatus').textContent = '';
  $('#reportModal').classList.remove('hidden');
}

let activeSharePostId = null;
function shareUrl(postId) { return `${location.origin}/p/${encodeURIComponent(postId)}`; }
function shareText() { return 'Mira mi post en RedLibertad, donde la libertad es lo primero.'; }
function openShare(postId) {
  activeSharePostId = Number(postId);
  const modal = $('#shareModal');
  if (modal) modal.classList.remove('hidden');
  const status = $('#shareStatus'); if (status) status.textContent = '';
  const internalUsername = $('#shareInternalUsername');
  if (internalUsername) internalUsername.value = '';
}
function closeShare() { const modal=$('#shareModal'); if(modal) modal.classList.add('hidden'); activeSharePostId=null; }
async function writeClipboardText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.style.top = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);

  let copied = false;
  try { copied = document.execCommand('copy'); } catch (_) {}
  area.remove();

  if (!copied) throw new Error('clipboard_unavailable');
  return true;
}

async function copyShareLink() {
  if (!activeSharePostId) return;
  const value = `${shareText()} ${shareUrl(activeSharePostId)}`;
  try {
    await writeClipboardText(value);
    toast('Texto y enlace copiados');
  } catch (_) {
    window.prompt('Copia este texto y enlace:', value);
  }
}
async function shareInsideRedLibertad(username) {
  if (!activeSharePostId) return;
  const clean = String(username || '').trim().replace(/^@/,'');
  const status = $('#shareStatus');

  if (!clean) {
    if (status) status.textContent = 'Escribe un @usuario.';
    return;
  }

  if (status) status.textContent = 'Abriendo conversación...';

  const conversation = await api('/api/messages/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: clean })
  });

  if (!conversation.r.ok) {
    if (status) {
      status.textContent = conversation.d.error === 'cannot_message_self'
        ? 'No puedes enviártelo a ti mismo.'
        : conversation.d.error === 'message_privacy_denied'
          ? 'Esta persona no acepta nuevas conversaciones.'
          : conversation.d.error === 'message_privacy_following_only'
            ? 'Solo acepta mensajes de personas que sigue.'
            : conversation.d.error === 'messaging_blocked'
              ? 'No puedes iniciar esta conversación.'
              : 'No se pudo abrir la conversación.';
    }
    return;
  }

  const message = await api(`/api/messages/conversations/${conversation.d.conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: `${shareText()} ${shareUrl(activeSharePostId)}`,
      contentLevel: 'normal'
    })
  });

  if (!message.r.ok) {
    if (status) status.textContent = 'No se pudo enviar la publicación.';
    return;
  }

  closeShare();
  toast(`Publicación enviada a @${clean}`);
  await loadConversations();
}

async function nativeShare() {
  if (!activeSharePostId) return;
  const url=shareUrl(activeSharePostId), text=shareText();
  if (navigator.share) { try { await navigator.share({title:'RedLibertad',text,url}); closeShare(); return; } catch(e){ if(e?.name==='AbortError') return; } }
  await copyShareLink();
}

function updatePostEditCounter() {
  const field = $('#postEditCaption');
  const counter = $('#postEditCharCount');
  if (field && counter) counter.textContent = `${field.value.length} / 2200`;
}

function closePostManage() {
  $('#postManageModal')?.classList.add('hidden');
  activeManagePost = null;
  deletePostArmed = false;
  const button = $('#deletePostButton');
  if (button) button.textContent = 'Eliminar publicación';
  const status = $('#postEditStatus');
  if (status) status.textContent = '';
}

function openPostManage(postId, caption = '') {
  activeManagePost = Number(postId);
  deletePostArmed = false;
  $('#postEditCaption').value = caption;
  $('#postEditStatus').textContent = '';
  $('#deletePostButton').textContent = 'Eliminar publicación';
  updatePostEditCounter();
  $('#postManageModal').classList.remove('hidden');
  setTimeout(() => $('#postEditCaption')?.focus(), 100);
}

function bindPostActions(root) {
  all('[data-like]', root).forEach(b => {
    b.onclick = async () => {
      if (b.disabled) return;
      const liked = b.dataset.liked === '1';
      b.disabled = true;
      try {
        const { r, d } = await api(`/api/posts/${b.dataset.like}/like`, {
          method: liked ? 'DELETE' : 'POST'
        });
        if (!r.ok) throw new Error('like_failed');
        b.dataset.liked = d.liked ? '1' : '0';
        b.classList.toggle('liked', !!d.liked);
        b.innerHTML = `${d.liked ? '♥' : '♡'} <span>${d.likeCount || 0}</span>`;
        pulseAction(b);
        tapFeedback();
        if ($('#growthPanel')) loadGrowthPanel();
      } catch (_) {
        toast('No se pudo actualizar el Me gusta.');
      } finally {
        b.disabled = false;
      }
    };
  });

  all('[data-comments]', root).forEach(b => {
    b.onclick = () => openComments(b.dataset.comments);
  });

  all('[data-repost]', root).forEach(b => {
    b.onclick = async () => {
      if (b.disabled) return;
      const reposted = b.dataset.reposted === '1';
      b.disabled = true;
      try {
        const { r, d } = await api(`/api/posts/${b.dataset.repost}/repost`, {
          method: reposted ? 'DELETE' : 'POST'
        });
        if (!r.ok) {
          if (d.error === 'cannot_repost_own_post') throw new Error('own_repost');
          throw new Error('repost_failed');
        }
        b.dataset.reposted = d.reposted ? '1' : '0';
        b.classList.toggle('reposted', !!d.reposted);
        b.innerHTML = `⟳ <span>${d.repostCount || 0}</span>`;
        b.title = d.reposted ? 'Quitar republicación' : 'Republicar';
        pulseAction(b);
        tapFeedback();
        toast(d.reposted ? 'Publicación republicada' : 'Republicación eliminada');
        if ($('#growthPanel')) loadGrowthPanel();
      } catch (error) {
        toast(error.message === 'own_repost' ? 'No puedes republicar tu propia publicación.' : 'No se pudo actualizar la republicación.');
      } finally {
        b.disabled = false;
      }
    };
  });

  all('[data-save-post]', root).forEach(b => {
    b.onclick = async () => {
      if (b.disabled) return;
      const postId = String(b.dataset.savePost);
      const saved = b.dataset.saved === '1';
      b.disabled = true;
      try {
        const { r, d } = await api(`/api/posts/${postId}/save`, {
          method: saved ? 'DELETE' : 'POST'
        });
        if (!r.ok) throw new Error('save_failed');

        if (d.saved) savedPostIds.add(postId);
        else savedPostIds.delete(postId);

        b.dataset.saved = d.saved ? '1' : '0';
        b.classList.toggle('saved', !!d.saved);
        b.textContent = d.saved ? '★' : '☆';
        pulseAction(b);
        b.title = d.saved ? 'Quitar de guardados' : 'Guardar publicación';
        b.setAttribute('aria-label', b.title);
        toast(d.saved ? 'Publicación guardada' : 'Eliminada de guardados');

        if (!d.saved && activeContentMode === 'saved' && !$('#exploreView').classList.contains('hidden')) {
          await loadDiscoveryContent('saved');
        }
      } catch (_) {
        toast('No se pudo actualizar Guardados.');
      } finally {
        b.disabled = false;
      }
    };
  });

  all('[data-share]', root).forEach(b => {
    b.onclick = () => openShare(b.dataset.share);
  });

  all('[data-manage-post]', root).forEach(b => {
    b.onclick = () => openPostManage(b.dataset.managePost, decodeURIComponent(b.dataset.caption || ''));
  });

  all('[data-report]', root).forEach(b => {
    b.onclick = () => openReport(b.dataset.report);
  });
}



if ($('#closePostManageModal')) $('#closePostManageModal').onclick = closePostManage;
if ($('#postEditCaption')) $('#postEditCaption').addEventListener('input', updatePostEditCounter);
if ($('#postManageModal')) $('#postManageModal').addEventListener('click', event => {
  if (event.target === $('#postManageModal')) closePostManage();
});

if ($('#postEditForm')) $('#postEditForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeManagePost) return;

  const caption = $('#postEditCaption').value.trim();
  const status = $('#postEditStatus');
  status.textContent = 'Guardando...';

  const { r, d } = await api(`/api/posts/${activeManagePost}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption })
  });

  if (!r.ok) {
    status.textContent = d.error === 'empty_post'
      ? 'Una publicación sin multimedia necesita texto.'
      : d.error === 'post_edit_not_allowed'
        ? 'No tienes permiso para editar esta publicación.'
        : 'No se pudo guardar la publicación.';
    return;
  }

  closePostManage();
  toast('Publicación actualizada');
  await loadFeed(currentMode);
  if (!$('#profileView').classList.contains('hidden')) await loadProfile();
  if (!$('#reelsView').classList.contains('hidden')) await loadReels();
});

if ($('#deletePostButton')) $('#deletePostButton').onclick = async () => {
  if (!activeManagePost) return;
  const button = $('#deletePostButton');

  if (!deletePostArmed) {
    deletePostArmed = true;
    button.textContent = 'Confirmar eliminación';
    $('#postEditStatus').textContent = 'Pulsa de nuevo para eliminar definitivamente.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Eliminando...';

  try {
    const { r, d } = await api(`/api/posts/${activeManagePost}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(
      d.error === 'post_delete_not_allowed'
        ? 'No tienes permiso para eliminar esta publicación.'
        : 'No se pudo eliminar la publicación.'
    );

    closePostManage();
    toast('Publicación eliminada');
    await loadFeed(currentMode);
    await loadMe();
    if (!$('#profileView').classList.contains('hidden')) await loadProfile();
    if (!$('#reelsView').classList.contains('hidden')) await loadReels();
  } catch (error) {
    $('#postEditStatus').textContent = error.message;
    deletePostArmed = false;
    button.textContent = 'Eliminar publicación';
  } finally {
    button.disabled = false;
  }
};

function openDeleteCommentDialog(commentId, postId) {
  pendingDeleteComment = {
    commentId: Number(commentId),
    postId: Number(postId)
  };
  $('#deleteCommentStatus').textContent = '';
  $('#deleteCommentModal').classList.remove('hidden');
}

function closeDeleteCommentDialog() {
  $('#deleteCommentModal').classList.add('hidden');
  $('#deleteCommentStatus').textContent = '';
  pendingDeleteComment = null;
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-delete-comment]');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  openDeleteCommentDialog(
    button.dataset.deleteComment,
    button.dataset.deleteCommentPost
  );
});

$('#closeDeleteCommentModal').onclick = closeDeleteCommentDialog;
$('#cancelDeleteComment').onclick = closeDeleteCommentDialog;

$('#confirmDeleteComment').onclick = async () => {
  if (!pendingDeleteComment) return;

  const button = $('#confirmDeleteComment');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Eliminando...';
  $('#deleteCommentStatus').textContent = '';

  try {
    const { r, d } = await api(
      `/api/posts/${pendingDeleteComment.postId}/comments/${pendingDeleteComment.commentId}`,
      { method: 'DELETE' }
    );

    if (!r.ok) {
      const message =
        d.error === 'comment_delete_not_allowed'
          ? 'No tienes permiso para eliminar este comentario.'
          : d.error === 'comment_not_found'
            ? 'El comentario ya no existe.'
            : 'No se pudo eliminar el comentario.';
      throw new Error(message);
    }

    const deletedPostId = pendingDeleteComment.postId;
    closeDeleteCommentDialog();
    toast('Comentario eliminado');

    if (
      activeCommentsPostId &&
      Number(activeCommentsPostId) === Number(deletedPostId) &&
      !$('#commentsModal').classList.contains('hidden')
    ) {
      await loadComments(activeCommentsPostId);
    }

    await loadFeed(currentMode);

    if (!$('#reelsView').classList.contains('hidden')) {
      await loadReels();
    }

    if (!$('#profileView').classList.contains('hidden')) {
      await loadProfile();
    }
  } catch (error) {
    $('#deleteCommentStatus').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
};

$('#closeCommentsModal').onclick = () => {
  $('#commentsModal').classList.add('hidden');
  activeCommentsPostId = null;
};

$('#commentForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeCommentsPostId) return;

  const body = $('#commentBody').value.trim();
  if (!body) return;

  const button = event.currentTarget.querySelector('button[type="submit"]');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Publicando...';
  $('#commentStatus').textContent = '';

  try {
    const { r, d } = await api(`/api/posts/${activeCommentsPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });

    if (!r.ok) {
      throw new Error(d.error === 'invalid_comment'
        ? 'El comentario no es válido.'
        : 'No se pudo publicar el comentario.');
    }

    $('#commentBody').value = '';
    $('#commentStatus').textContent = 'Comentario publicado.';
    await loadComments(activeCommentsPostId);
    await loadFeed(currentMode);
    if ($('#growthPanel')) await loadGrowthPanel();
  } catch (error) {
    $('#commentStatus').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$('#closeReportModal').onclick = () => {
  $('#reportModal').classList.add('hidden');
  activeReportPostId = null;
};

$('#reportForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeReportPostId) return;

  const formData = new FormData(event.currentTarget);
  const reason = formData.get('reason');
  const details = $('#reportDetails').value.trim();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const original = button.textContent;

  button.disabled = true;
  button.textContent = 'Enviando...';
  $('#reportStatus').textContent = '';

  try {
    const { r, d } = await api('/api/moderation/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'post',
        targetId: activeReportPostId,
        reason,
        details
      })
    });

    if (!r.ok) {
      throw new Error(d.error === 'invalid_report'
        ? 'Selecciona un motivo válido.'
        : 'No se pudo enviar la denuncia.');
    }

    $('#reportStatus').textContent = 'Denuncia enviada. Gracias por avisarnos.';
    toast('Denuncia enviada');
    setTimeout(() => {
      $('#reportModal').classList.add('hidden');
      activeReportPostId = null;
    }, 700);
  } catch (error) {
    $('#reportStatus').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

function updateNotificationBadge(n) {
  const value = n > 99 ? '99+' : String(n);
  ['#notificationBadge', '#notificationBadgeMobile'].forEach(selector => {
    const b = $(selector);
    if (!b) return;
    b.textContent = value;
    b.classList.toggle('hidden', !n);
  });
}

function notificationIcon(type) {
  return ({
    like: '♥',
    comment: '◯',
    mention: '@',
    repost: '⟳',
    follow: '+',
    message: '✉',
    consent_request: '!',
    consent_approved: '✓',
    consent_rejected: '×',
    consent_revoked: '↶',
    creator_broadcast: '📣',
    creator_vip_broadcast: '★',
    system: 'R'
  })[type] || '•';
}

function notificationMatches(notification, filter) {
  if (filter === 'all') return true;
  if (filter === 'mentions') return notification.type === 'mention';
  if (filter === 'interactions') return ['like','comment','repost'].includes(notification.type);
  if (filter === 'community') return ['follow','creator_broadcast','creator_vip_broadcast'].includes(notification.type);
  if (filter === 'messages') return notification.type === 'message';
  if (filter === 'consent') return String(notification.type || '').startsWith('consent_');
  return true;
}

function renderNotifications() {
  const root = $('#notificationsList');
  if (!root) return;

  all('[data-notification-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.notificationFilter === activeNotificationFilter);
  });

  const items = notificationCache.filter(notification => notificationMatches(notification, activeNotificationFilter));

  root.innerHTML = items.length
    ? items.map(n => `<button type="button" class="notification-item notification-button ${n.read_at ? '' : 'unread'}" data-notification="${n.id}" data-notification-type="${esc(n.type)}" data-entity-type="${esc(n.entity_type || '')}" data-entity-id="${n.entity_id || ''}" data-actor-username="${esc(n.actor_username || '')}"><div class="notification-symbol" aria-hidden="true">${notificationIcon(n.type)}</div><div class="avatar">${n.actor_avatar_url ? `<img src="${esc(n.actor_avatar_url)}">` : initials(n.actor_display_name || 'RedLibertad')}</div><div class="notification-copy"><b>${n.actor_display_name ? esc(n.actor_display_name) : 'RedLibertad'}</b><p>${esc(n.text)}</p><small>${timeAgo(n.created_at)}</small></div><span class="notification-open">›</span></button>`).join('')
    : '<div class="info-card"><b>No hay actividad en este filtro.</b><p>Cuando ocurra algo nuevo aparecerá aquí.</p></div>';

  all('[data-notification]', root).forEach(item => {
    item.onclick = async () => {
      const id = item.dataset.notification;
      const notification = notificationCache.find(n => String(n.id) === String(id));

      if (notification && !notification.read_at) {
        await api(`/api/notifications/${id}/read`, { method: 'POST' });
        notification.read_at = new Date().toISOString();
        item.classList.remove('unread');
        updateNotificationBadge(notificationCache.filter(n => !n.read_at).length);
      }

      if (notification) await navigateNotification(notification);
    };
  });
}

async function navigateNotification(notification) {
  const type = String(notification.type || '');
  const entityType = String(notification.entity_type || '');
  const entityId = notification.entity_id;

  if (type === 'message' && entityType === 'conversation' && entityId) {
    showView('messages');
    await loadConversations(entityId);
    return;
  }

  if (type === 'follow' && notification.actor_username) {
    await openPublicProfile(notification.actor_username);
    return;
  }

  if (type === 'creator_broadcast' && notification.actor_username) {
    await openPublicProfile(notification.actor_username);
    return;
  }

  if (type === 'creator_vip_broadcast' && notification.actor_username) {
    await openPublicProfile(notification.actor_username);
    return;
  }

  if (type === 'system' && entityType === 'user' && notification.actor_username) {
    await openPublicProfile(notification.actor_username);
    return;
  }

  if (type === 'system' && entityType === 'verification') {
    await openTrustModal();
    return;
  }

  if (entityType === 'post' && entityId && ['like','comment','mention','repost'].includes(type)) {
    await openPostFocus(entityId);
    return;
  }

  if (type.startsWith('consent_')) {
    showView('profile');
    setTimeout(() => {
      document.querySelector('#profileView .consent-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }
}

async function loadNotifications() {
  const { d } = await api('/api/notifications');
  notificationCache = Array.isArray(d.notifications) ? d.notifications : [];
  updateNotificationBadge(Number(d.unread || 0));
  renderNotifications();
}

all('[data-notification-filter]').forEach(button => {
  button.onclick = () => {
    activeNotificationFilter = button.dataset.notificationFilter || 'all';
    renderNotifications();
  };
});

$('#readAllNotifications').onclick = async () => {
  await api('/api/notifications/read-all', { method: 'POST' });
  notificationCache = notificationCache.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
  updateNotificationBadge(0);
  renderNotifications();
  toast('Notificaciones marcadas como leídas');
};

async function loadConversations(openId = null) {
  const { d } = await api('/api/messages/conversations');
  const total = d.conversations.reduce((a, x) => a + Number(x.unread_count || 0), 0);
  const badgeValue = total > 99 ? '99+' : String(total);
  ['#messageBadge', '#messageBadgeMobile'].forEach(selector => {
    const badge = $(selector);
    if (!badge) return;
    badge.textContent = badgeValue;
    badge.classList.toggle('hidden', !total);
  });
  $('#conversationList').innerHTML = d.conversations.length ? d.conversations.map(c => `<button class="conversation-row ${String(c.id) === String(activeConversationId) ? 'active' : ''}" data-conversation="${c.id}"><div class="avatar">${c.avatar_url ? `<img src="${esc(c.avatar_url)}">` : initials(c.display_name)}</div><div class="conversation-copy"><b>${esc(c.display_name)} ${c.creator_verified ? '<span class="verified">✓</span>' : ''}</b><small>${c.last_content_level && c.last_content_level !== 'normal' ? 'Contenido sensible' : esc(c.last_body || 'Conversación nueva')}</small></div>${Number(c.unread_count) ? `<i class="count-badge">${c.unread_count}</i>` : ''}</button>`).join('') : '<div class="empty-list">Todavía no tienes conversaciones.</div>';
  all('[data-conversation]').forEach(b => b.onclick = () => openConversation(b.dataset.conversation));
  if (openId) await openConversation(openId);
}
async function openConversation(id) {
  activeConversationId = id;
  const layout = $('.messages-layout');
  if (layout) layout.classList.add('chat-open');
  const { d } = await api(`/api/messages/conversations/${id}/messages`);
  activeConversationOther = d.other;
  const messages = d.messages.map(m => messageHTML(m, d.other)).join('');
  $('#chatPanel').className = 'chat-panel';
  $('#chatPanel').innerHTML = `<header class="chat-head"><button id="mobileChatBack" class="mobile-chat-back" type="button" aria-label="Volver a conversaciones">‹</button><div class="avatar">${avatarHTML(d.other)}</div><div class="chat-person"><b>${esc(d.other.display_name)}</b><small>@${esc(d.other.username)}</small></div>${d.sensitiveAllowed ? `<button id="revokeSensitive" class="tiny-action">No recibir sensible</button>` : ''}</header><div id="messageThread" class="message-thread">${messages || '<div class="empty-state"><p>Empieza la conversación.</p></div>'}</div><form id="messageForm" class="message-form"><div class="message-options"><label>Archivo<input id="messageFile" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"></label><label>Tipo<select id="messageLevel"><option value="normal">Normal</option><option value="sensitive">Sensible</option><option value="nudity">Desnudez</option></select></label></div><div id="messagePreview" class="message-preview hidden"></div><div class="message-compose"><textarea id="messageBody" maxlength="4000" placeholder="Escribe un mensaje..."></textarea><button class="primary" type="submit">Enviar</button></div><small class="message-hint">El destinatario tendrá que aceptar antes de ver archivos sensibles enviados por ti.</small></form>`;
  const mobileBack = $('#mobileChatBack');
  if (mobileBack) mobileBack.onclick = () => {
    const messagesLayout = $('.messages-layout');
    if (messagesLayout) messagesLayout.classList.remove('chat-open');
    activeConversationId = null;
    loadConversations();
  };
  $('#messageForm').onsubmit = sendMessage;
  $('#messageFile').addEventListener('change', renderMessagePreview);
  $('#messageLevel').addEventListener('change', updateMessagePreviewLevel);
  all('[data-accept-sensitive]').forEach(b => b.onclick = acceptSensitiveMessages);
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

let messagePreviewUrl = null;

function clearMessagePreview() {
  if (messagePreviewUrl) {
    URL.revokeObjectURL(messagePreviewUrl);
    messagePreviewUrl = null;
  }
  const preview = $('#messagePreview');
  if (preview) {
    preview.innerHTML = '';
    preview.classList.add('hidden');
  }
  const fileInput = $('#messageFile');
  if (fileInput) fileInput.value = '';
}

function messageLevelLabel(level) {
  return ({ normal: 'Normal', sensitive: 'Sensible', nudity: 'Desnudez' })[level] || 'Normal';
}

function updateMessagePreviewLevel() {
  const badge = $('#messagePreview .message-preview-badge');
  if (badge) badge.textContent = messageLevelLabel($('#messageLevel').value);
}

function renderMessagePreview() {
  const input = $('#messageFile');
  const preview = $('#messagePreview');
  if (!input || !preview) return;

  const file = input.files?.[0];
  if (!file) {
    clearMessagePreview();
    return;
  }

  if (messagePreviewUrl) URL.revokeObjectURL(messagePreviewUrl);
  messagePreviewUrl = URL.createObjectURL(file);

  const isVideo = file.type.startsWith('video/');
  const media = isVideo
    ? `<video src="${messagePreviewUrl}" controls muted playsinline></video>`
    : `<img src="${messagePreviewUrl}" alt="Vista previa del archivo seleccionado">`;

  preview.innerHTML = `
    <div class="message-preview-head">
      <div>
        <b>Vista previa · todavía no enviado</b>
        <small>${esc(file.name)}</small>
      </div>
      <div class="message-preview-actions">
        <span class="message-preview-badge">${messageLevelLabel($('#messageLevel').value)}</span>
        <button type="button" id="removeMessageFile" class="tiny-action">Quitar</button>
      </div>
    </div>
    <div class="message-preview-media">${media}</div>
  `;
  preview.classList.remove('hidden');
  $('#removeMessageFile').onclick = clearMessagePreview;
}

let messageSendInFlight = false;

async function sendMessage(e) {
  e.preventDefault();
  if (messageSendInFlight) return;

  const form = e.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const originalText = submit?.textContent || 'Enviar';

  messageSendInFlight = true;
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Enviando...';
  }

  try {
    const file = $('#messageFile').files[0];
    const media = await uploadFile(file);

    const payload = {
      body: $('#messageBody').value,
      contentLevel: $('#messageLevel').value,
      ...(media ? {
        mediaUrl: media.url,
        mediaType: media.mediaType,
        mediaProvider: media.provider,
        externalId: media.externalId,
        playbackUrl: media.playbackUrl
      } : {})
    };

    const { r, d } = await api(
      `/api/messages/conversations/${activeConversationId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!r.ok) {
      const message =
        d.error === 'verified_creator_required_for_nudity'
          ? 'Necesitas ser creador adulto verificado para enviar desnudez.'
          : d.error === 'messaging_blocked'
            ? 'No puedes enviar mensajes a esta persona.'
            : d.error === 'invalid_message'
              ? 'Escribe un mensaje o selecciona un archivo.'
              : 'No se pudo enviar el mensaje.';
      throw new Error(message);
    }

    // The server has confirmed persistence at this point.
    toast('Mensaje enviado');
    clearMessagePreview();

    try {
      await openConversation(activeConversationId);
    } catch (refreshError) {
      console.error('Message sent, but chat refresh failed:', refreshError);
      toast('Mensaje enviado. Recarga la conversación para verlo.');
    }
  } catch (err) {
    toast(err.message);
  } finally {
    messageSendInFlight = false;
    const currentSubmit = $('#messageForm button[type="submit"]');
    if (currentSubmit) {
      currentSubmit.disabled = false;
      currentSubmit.textContent = originalText;
    }
  }
}
$('#newConversation').onclick = () => $('#newMessageModal').classList.remove('hidden');
$('#closeNewMessage').onclick = () => $('#newMessageModal').classList.add('hidden');
$('#newMessageForm').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target); const status = $('#newMessageStatus'); status.textContent = 'Abriendo...';
  const username = String(fd.get('username') || '').replace(/^@/, '');
  const { r, d } = await api('/api/messages/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  if (!r.ok) {
    status.textContent = d.error === 'user_not_found'
      ? 'No encuentro ese usuario.'
      : d.error === 'message_privacy_denied'
        ? 'Esta persona no acepta nuevas conversaciones.'
        : d.error === 'message_privacy_following_only'
          ? 'Solo acepta mensajes de personas que sigue.'
          : d.error === 'messaging_blocked'
            ? 'No puedes iniciar esta conversación.'
            : 'No se pudo abrir la conversación.';
    return;
  }
  $('#newMessageModal').classList.add('hidden'); e.target.reset(); showView('messages'); await loadConversations(d.conversationId);
});


$('#postSearchForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  await searchPosts($('#postSearchInput').value);
});

all('[data-content-mode]').forEach(button => {
  button.onclick = async () => {
    $('#postSearchInput').value = '';
    await loadDiscoveryContent(button.dataset.contentMode);
  };
});

$('#peopleSearchForm').addEventListener('submit', async event => {
  event.preventDefault();
  await searchPeople($('#peopleSearchInput').value);
});

$('#clearPeopleSearch').onclick = async () => {
  $('#peopleSearchInput').value = '';
  $('#clearPeopleSearch').classList.add('hidden');
  $('#peopleDiscoveryTitle').textContent = activeExploreInterest
    ? `Personas · ${activeExploreInterest}`
    : 'Personas que podrías conocer';
  await loadPeopleSuggestions(activeExploreInterest);
};

function showView(name) {
  all('.view').forEach(v => v.classList.add('hidden'));
  const view = document.querySelector('#' + name + 'View');
  if (!view) return;
  view.classList.remove('hidden');
  animateView(view);
  all('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'feed') { loadHomeMomentum(); loadGrowthPanel(); }
  if (name === 'explore') loadExplore();
  if (name === 'reels') loadReels();
  if (name === 'profile') loadProfile();
  if (name === 'messages') { const layout = $('.messages-layout'); if (layout) layout.classList.remove('chat-open'); activeConversationId = null; loadConversations(); }
  if (name === 'notifications') loadNotifications();
}
all('[data-view]').forEach(b => b.onclick = () => { tapFeedback(); showView(b.dataset.view); });
all('[data-mode]').forEach(b => b.onclick = () => { all('[data-mode]').forEach(x => x.classList.remove('active')); b.classList.add('active'); loadFeed(b.dataset.mode); });

function openModal() {
  tapFeedback();
  const audience=$('#createForm [name="audience"]');
  const storyAudience=$('#storyForm [name="audience"]');
  for(const field of [audience,storyAudience]){
    if(!field)continue;
    const vipOption=field.querySelector('option[value="vip"]');
    if(vipOption)vipOption.disabled=!me?.creator_verified;
    if(!me?.creator_verified && field.value==='vip')field.value='public';
    field.title=me?.creator_verified
      ? 'Elige quién puede ver este contenido.'
      : 'El contenido Solo VIP requiere una cuenta de creador verificada.';
  }

  const publishingControls=$('#creatorPublishingControls');
  if(publishingControls){
    publishingControls.classList.toggle('hidden',!me?.creator_verified);
    const scheduledInput=publishingControls.querySelector('[name="scheduledFor"]');
    if(scheduledInput && me?.creator_verified){
      const now=new Date();
      const min=new Date(now.getTime()+5*60*1000);
      const max=new Date(now.getTime()+90*24*60*60*1000);
      scheduledInput.min=toLocalDateTimeInput(min);
      scheduledInput.max=toLocalDateTimeInput(max);
    }
  }
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#createForm textarea')?.focus(), 120);
}
function bindCreateButtons() { all('[data-action="create"]').forEach(b => b.onclick = openModal); }
bindCreateButtons();
$('#closeModal').onclick = () => $('#modal').classList.add('hidden');
function clearPostMedia() {
  const file = $('#mediaFile');
  if (file) file.value = '';
  currentFileMedia = null;
  const preview = $('#preview');
  if (preview) {
    preview.innerHTML = '';
    preview.classList.add('hidden');
  }
  $('#uploadText')?.classList.remove('hidden');
  $('#removePostMedia')?.classList.add('hidden');
}

$('#mediaFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return clearPostMedia();
  currentFileMedia = null;
  const u = URL.createObjectURL(f);
  $('#uploadText').classList.add('hidden');
  $('#removePostMedia')?.classList.remove('hidden');
  const p = $('#preview');
  p.classList.remove('hidden');
  p.innerHTML = f.type.startsWith('image/') ? `<img src="${u}">` : `<video src="${u}" controls></video>`;
});
$('#removePostMedia')?.addEventListener('click', clearPostMedia);

const createCaption = $('#createForm [name="caption"]');
function updateCreateCounter() {
  if (createCaption && $('#createCharCount')) {
    $('#createCharCount').textContent = `${createCaption.value.length} / 2200`;
  }
}
createCaption?.addEventListener('input', updateCreateCounter);
updateCreateCounter();
async function ensureUpload() {
  if (currentFileMedia) return currentFileMedia;
  const f = $('#mediaFile').files[0]; if (!f) throw new Error('Selecciona un archivo.');
  currentFileMedia = await uploadFile(f); return currentFileMedia;
}
$('#createForm').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('#createMessage');
  try {
    const fd = new FormData(e.target);
    const file = $('#mediaFile').files[0];
    const caption = String(fd.get('caption') || '').trim();
    const kind = String(fd.get('kind') || 'post');
    const publishMode=String(e.submitter?.dataset?.publishMode || 'now');

    if (!file && !caption) throw new Error('Escribe algo o selecciona una foto o vídeo.');
    if (kind === 'reel' && !file) throw new Error('Los Reels necesitan una foto o vídeo.');

    if(publishMode!=='now' && !me?.creator_verified){
      throw new Error('Los borradores y la programación requieren una cuenta de creador verificada.');
    }

    let scheduledFor=null;
    if(publishMode==='scheduled'){
      const localValue=String(fd.get('scheduledFor') || '');
      if(!localValue)throw new Error('Elige una fecha y hora para programar.');
      const date=new Date(localValue);
      if(!Number.isFinite(date.getTime()))throw new Error('Fecha de programación no válida.');
      scheduledFor=date.toISOString();
    }

    let media = null;
    if (file) {
      msg.textContent = 'Subiendo archivo...';
      media = await ensureUpload();
    }

    msg.textContent = publishMode==='draft'
      ? 'Guardando borrador...'
      : publishMode==='scheduled'
        ? 'Programando...'
        : 'Publicando...';
    const participants = String(fd.get('participants') || '').split(',').map(x => x.trim()).filter(Boolean);
    const payload = {
      caption,
      kind,
      contentLevel: fd.get('contentLevel'),
      audience: fd.get('audience') || 'public',
      publishMode,
      scheduledFor,
      participantUsernames: participants,
      mediaUrl: media?.url || '',
      mediaType: media?.mediaType || 'image',
      mediaProvider: media?.provider || 'local',
      externalId: media?.externalId || null,
      playbackUrl: media?.playbackUrl || null
    };

    const { r, d } = await api('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!r.ok) throw new Error(
      d.error === 'verified_creator_required_for_nudity'
        ? 'Necesitas verificación de creador adulto para publicar desnudez.'
        : d.error === 'verified_creator_required_for_vip_content'
          ? 'Solo los creadores verificados pueden publicar contenido Solo VIP.'
        : d.error === 'verified_creator_required_for_publishing_tools'
          ? 'Los borradores y la programación requieren una cuenta de creador verificada.'
        : d.error === 'invalid_scheduled_time'
          ? 'La programación debe estar entre 5 minutos y 90 días.'
        : d.error === 'participant_not_found'
          ? `No encontramos: ${(d.missing || []).join(', ')}`
          : d.error === 'empty_post'
            ? 'Escribe algo o selecciona una foto o vídeo.'
            : d.error === 'reel_media_required'
              ? 'Los Reels necesitan una foto o vídeo.'
              : 'No se pudo publicar.'
    );

    const successMessage=publishMode==='draft'
      ? 'Borrador guardado'
      : publishMode==='scheduled'
        ? (d.consentRequired ? 'Programada. Esperando consentimientos.' : 'Publicación programada')
        : (d.consentRequired ? 'Publicación guardada. Esperando consentimientos.' : 'Publicado');

    toast(successMessage);
    $('#modal').classList.add('hidden');
    e.target.reset();
    clearPostMedia();
    updateCreateCounter();
    await loadFeed(publishMode==='now' ? 'latest' : currentMode);
    await loadMe();
    await loadGrowthPanel();
  } catch (err) { msg.textContent = err.message; }
});
$('#storyForm').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('#storyMessage');
  try {
    msg.textContent = 'Publicando Story...'; const media = await ensureUpload(); const level = $('#createForm [name="contentLevel"]').value;
    const audience=$('#storyForm [name="audience"]')?.value || 'public';
    const { r, d } = await api('/api/stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentLevel: level, audience, mediaUrl: media.url, mediaType: media.mediaType, mediaProvider: media.provider, externalId: media.externalId, playbackUrl: media.playbackUrl }) });
    if (!r.ok) throw new Error(
      d.error === 'verified_creator_required_for_nudity'
        ? 'Necesitas verificación de creador adulto para esta Story.'
        : d.error === 'verified_creator_required_for_vip_content'
          ? 'Solo los creadores verificados pueden publicar Stories Solo VIP.'
          : 'No se pudo publicar.'
    );
    toast(audience==='vip' ? 'Story VIP publicada durante 24 h' : 'Story publicada durante 24 h'); $('#modal').classList.add('hidden'); currentFileMedia = null; await loadStories();
  } catch (err) { msg.textContent = err.message; }
});
$('#shareInternalForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  await shareInsideRedLibertad($('#shareInternalUsername')?.value);
});
if ($('#closeShareModal')) $('#closeShareModal').onclick = closeShare;
if ($('#shareNative')) $('#shareNative').onclick = nativeShare;
if ($('#shareCopy')) $('#shareCopy').onclick = copyShareLink;
if ($('#shareFacebook')) $('#shareFacebook').onclick = () => {
  if (!activeSharePostId) return;
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl(activeSharePostId))}`, '_blank', 'noopener,noreferrer');
};
if ($('#shareWhatsApp')) $('#shareWhatsApp').onclick = () => {
  if (!activeSharePostId) return;
  window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText()} ${shareUrl(activeSharePostId)}`)}`, '_blank', 'noopener,noreferrer');
};
$('#shareModal')?.addEventListener('click', e => { if (e.target === $('#shareModal')) closeShare(); });

$('#growthInviteNative')?.addEventListener('click', () => shareGrowthInvite('native'));
$('#growthInviteWhatsApp')?.addEventListener('click', () => shareGrowthInvite('whatsapp'));
$('#growthInviteCopy')?.addEventListener('click', () => shareGrowthInvite('copy'));

$('#logout').onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; };

window.addEventListener('redlibertad-install-ready', e => {
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

async function handleInitialDeepLink() {
  const params = new URLSearchParams(location.search);
  const profile = params.get('profile');
  const post = params.get('post');

  if (profile) {
    await openPublicProfile(profile);
    return;
  }

  if (post) {
    await openPostFocus(post);
  }
}

(async () => {
  try {
    await loadMe();
    await loadSavedPostIds();
    await Promise.all([loadStories(), loadFeed('foryou'), loadConversations(), loadNotifications(), loadHomeSuggestions(), loadHomeMomentum(), loadGrowthPanel()]);
    await handleInitialDeepLink();
  } catch (e) { console.error(e); }
})();
