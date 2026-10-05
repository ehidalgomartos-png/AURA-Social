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
  const liked = p.liked_by_me === true;
  const reposted = p.reposted_by_me === true;
  const repostBanner = p.repost_actor_username
    ? `<div class="repost-banner">⟳ ${profileLink(
        p.repost_actor_username,
        `${esc(p.repost_actor_display_name || p.repost_actor_username)} republicó esto`,
        'repost-profile-link'
      )}</div>`
    : '';
  return `<article class="post ${textOnly ? 'text-only-post' : ''}" data-id="${p.id}">
    ${repostBanner}
    <div class="post-head">
      ${profileLink(p.username, `<span class="avatar">${avatarHTML(p)}</span>`, 'post-avatar-link')}
      <div class="post-user">
        ${profileLink(p.username, `<b>${esc(p.display_name)} ${p.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`, 'post-name-link')}
        <small>${profileLink(p.username, `@${esc(p.username)}`, 'post-username-link')} · ${p.post_kind === 'reel' ? 'Reel' : 'Publicación'} · <span class="post-time">${timeAgo(p.created_at)}</span></small>
        ${participantsHTML(p)}
      </div>
    </div>
    ${media ? `<div class="post-media">${media}</div>` : ''}
    ${p.caption ? `<div class="post-caption">${profileLink(p.username, `<b>${esc(p.username)}</b>`, 'caption-profile-link')} <span class="post-caption-text">${captionHTML(p.caption)}</span></div>` : ''}
    <div class="post-actions">
      <button class="${liked ? 'liked' : ''}" data-like="${p.id}" data-liked="${liked ? '1' : '0'}">${liked ? '♥' : '♡'} <span>${p.like_count || 0}</span></button>
      <button data-comments="${p.id}">◯ ${p.comment_count || 0}</button>
      <button class="${reposted ? 'reposted' : ''}" ${ownPost ? 'disabled' : `data-repost="${p.id}" data-reposted="${reposted ? '1' : '0'}"`} title="${ownPost ? 'No puedes republicar tu propia publicación' : reposted ? 'Quitar republicación' : 'Republicar'}">⟳ <span>${p.repost_count || 0}</span></button>
      <button class="${savedPostIds.has(String(p.id)) ? 'saved' : ''}" data-save-post="${p.id}" data-saved="${savedPostIds.has(String(p.id)) ? '1' : '0'}" title="${savedPostIds.has(String(p.id)) ? 'Quitar de guardados' : 'Guardar publicación'}" aria-label="${savedPostIds.has(String(p.id)) ? 'Quitar de guardados' : 'Guardar publicación'}">${savedPostIds.has(String(p.id)) ? '★' : '☆'}</button>
      <button class="share-action" data-share="${p.id}">↗ <span class="share-label">Compartir</span></button>
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
async function loadFeed(mode = currentMode) {
  currentMode = mode;
  all('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  const { d } = await api(`/api/posts/feed?mode=${mode}`);

  $('#feed').innerHTML = d.posts.length
    ? d.posts.map(postHTML).join('')
    : `<div class="empty-feed-card">
        <span class="empty-feed-icon">A</span>
        <h2>${mode === 'following' ? 'Tu feed de Siguiendo empieza aquí.' : 'Todavía hay poco por aquí.'}</h2>
        <p>${mode === 'following' ? 'Sigue a personas que te interesen y sus publicaciones aparecerán aquí.' : 'Descubre personas, sigue perfiles o publica algo para poner RedLibertad en movimiento.'}</p>
        <div class="empty-feed-actions">
          <button type="button" class="primary" data-view-jump="explore">Descubrir personas</button>
          <button type="button" class="secondary" data-open-create="1">Crear publicación</button>
        </div>
      </div>`;

  bindPostActions($('#feed'));
}
async function loadStories() {
  const { d } = await api('/api/stories');
  const users = [], seen = new Set();
  for (const s of d.stories) if (!seen.has(s.user_id)) { seen.add(s.user_id); users.push(s); }
  $('#stories').innerHTML = `<button class="story" data-action="create"><div class="story-ring"><div>＋</div></div><small>Tu Story</small></button>` + users.map(s => `<div class="story" title="${s.gated ? gateText(s.gate_reason) : 'Story activa'}"><div class="story-ring"><div>${s.avatar_url ? `<img src="${esc(s.avatar_url)}">` : initials(s.display_name)}</div></div><small>${esc(s.username)}</small></div>`).join('');
  bindCreateButtons();
}
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
    return `<button type="button" class="tile tile-button profile-content-tile" data-open-post="${p.id}">${tileContentHTML(p)}${p.post_kind === 'reel' ? '<span class="tile-label">REEL</span>' : ''}${participantBadge}</button>`;
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

  $('#profileFull').innerHTML = `<div class="cover" ${me.cover_url ? `style="background-image:url('${esc(me.cover_url)}')"` : ''}></div><div class="profile-body"><div class="profile-avatar">${avatarHTML(me)}</div><div class="profile-title"><div><h2>${esc(me.display_name)} ${me.creator_verified ? '<span class="verified">✓</span>' : ''}</h2><p>@${esc(me.username)}</p></div><div class="profile-buttons"><button id="editProfile" class="secondary">Editar perfil</button><button id="sensitiveToggle" class="secondary">${me.show_sensitive ? 'Ocultar' : 'Mostrar'} contenido sensible</button></div></div><p class="profile-bio">${esc(me.bio || 'Todavía no has escrito una biografía.')}</p>${interestPillsHTML(me.interests)}<div class="profile-meta">${me.location_label ? `<span>⌖ ${esc(me.location_label)}</span>` : ''}${web}</div><div class="profile-stats"><span><b>${me.post_count}</b> publicaciones</span><button type="button" data-social-list="followers" data-social-username="${esc(me.username)}"><b>${me.follower_count}</b> seguidores</button><button type="button" data-social-list="following" data-social-username="${esc(me.username)}"><b>${me.following_count}</b> siguiendo</button></div><p class="muted">Edad: ${me.age_verified ? '✓ verificada' : 'pendiente de verificación'} · Creador: ${me.creator_verified ? '✓ verificado' : 'no verificado'}</p></div>`;

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
  await loadConsents();
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
    const [{ r: profileResponse, d: profileData }, { d: postsData }] = await Promise.all([
      api(`/api/profiles/${encodeURIComponent(clean)}`),
      api(`/api/posts/user/${encodeURIComponent(clean)}`)
    ]);

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
          data-following="${profileData.following ? '1' : '0'}">
          ${profileData.following ? 'Siguiendo' : 'Seguir'}
        </button>
        <button type="button" class="secondary" data-message-profile="${esc(profile.username)}">Mensaje</button>
      </div>
    `;

    const posts = Array.isArray(postsData.posts) ? postsData.posts : [];

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
      <div class="public-profile-posts explore-grid">
        ${posts.map(p => `<div class="tile">${tileContentHTML(p)}${p.post_kind === 'reel' ? '<span class="tile-label">REEL</span>' : ''}</div>`).join('') || '<p class="muted">Todavía no tiene publicaciones visibles.</p>'}
      </div>
    `;

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
        if (!r.ok) return toast('No se pudo abrir la conversación.');
        modal.classList.add('hidden');
        showView('messages');
        await loadConversations(d.conversationId);
      };
    }
  } catch (error) {
    content.innerHTML = '<div class="info-card"><b>No se pudo abrir el perfil.</b><p>Puede que esta cuenta ya no esté disponible.</p></div>';
  }
}

document.addEventListener('click', async event => {
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
    await loadMe(); await loadProfile();
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
    if (status) status.textContent = conversation.d.error === 'cannot_message_self'
      ? 'No puedes enviártelo a ti mismo.'
      : 'No se pudo abrir la conversación.';
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
async function loadNotifications() {
  const { d } = await api('/api/notifications');
  updateNotificationBadge(d.unread);
  $('#notificationsList').innerHTML = d.notifications.length ? d.notifications.map(n => `<article class="notification-item ${n.read_at ? '' : 'unread'}" data-notification="${n.id}"><div class="avatar">${n.actor_avatar_url ? `<img src="${esc(n.actor_avatar_url)}">` : initials(n.actor_display_name || 'RedLibertad')}</div><div><b>${n.actor_display_name ? esc(n.actor_display_name) : 'RedLibertad'}</b><p>${esc(n.text)}</p><small>${new Date(n.created_at).toLocaleString()}</small></div></article>`).join('') : '<div class="info-card"><b>Todo al día.</b><p>Aquí aparecerán mensajes, follows, likes, comentarios y solicitudes de consentimiento.</p></div>';
  all('[data-notification]').forEach(x => x.onclick = async () => { await api(`/api/notifications/${x.dataset.notification}/read`, { method: 'POST' }); x.classList.remove('unread'); });
}
$('#readAllNotifications').onclick = async () => { await api('/api/notifications/read-all', { method: 'POST' }); toast('Notificaciones marcadas como leídas'); await loadNotifications(); };

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
  if (!r.ok) { status.textContent = d.error === 'user_not_found' ? 'No encuentro ese usuario.' : 'No se pudo abrir la conversación.'; return; }
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
  if (name === 'explore') loadExplore();
  if (name === 'reels') loadReels();
  if (name === 'profile') loadProfile();
  if (name === 'messages') { const layout = $('.messages-layout'); if (layout) layout.classList.remove('chat-open'); activeConversationId = null; loadConversations(); }
  if (name === 'notifications') loadNotifications();
}
all('[data-view]').forEach(b => b.onclick = () => { tapFeedback(); showView(b.dataset.view); });
all('[data-mode]').forEach(b => b.onclick = () => { all('[data-mode]').forEach(x => x.classList.remove('active')); b.classList.add('active'); loadFeed(b.dataset.mode); });

function openModal() { tapFeedback(); $('#modal').classList.remove('hidden'); setTimeout(() => $('#createForm textarea')?.focus(), 120); }
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

    if (!file && !caption) throw new Error('Escribe algo o selecciona una foto o vídeo.');
    if (kind === 'reel' && !file) throw new Error('Los Reels necesitan una foto o vídeo.');

    let media = null;
    if (file) {
      msg.textContent = 'Subiendo archivo...';
      media = await ensureUpload();
    }

    msg.textContent = 'Publicando...';
    const participants = String(fd.get('participants') || '').split(',').map(x => x.trim()).filter(Boolean);
    const payload = {
      caption,
      kind,
      contentLevel: fd.get('contentLevel'),
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
        : d.error === 'participant_not_found'
          ? `No encontramos: ${(d.missing || []).join(', ')}`
          : d.error === 'empty_post'
            ? 'Escribe algo o selecciona una foto o vídeo.'
            : d.error === 'reel_media_required'
              ? 'Los Reels necesitan una foto o vídeo.'
              : 'No se pudo publicar.'
    );

    toast(d.consentRequired ? 'Publicación guardada. Esperando consentimientos.' : 'Publicado');
    $('#modal').classList.add('hidden');
    e.target.reset();
    clearPostMedia();
    updateCreateCounter();
    await loadFeed('latest');
    await loadMe();
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

(async () => {
  try {
    await loadMe();
    await loadSavedPostIds();
    await Promise.all([loadStories(), loadFeed('foryou'), loadConversations(), loadNotifications(), loadHomeSuggestions()]);
  } catch (e) { console.error(e); }
})();
