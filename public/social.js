const $ = (s, r = document) => r.querySelector(s);
const all = (s, r = document) => [...r.querySelectorAll(s)];
let me = null;
let currentMode = 'foryou';
let activeViewName='feed';
const viewScrollPositions=new Map();
let connectivityHideTimer=null;
let currentFileMedia = null;
let activeConversationId = null;
let activeConversationOther = null;
let activeConversationMeta = null;
let activeConversationSettings = null;
let activeMessageReply = null;
let messageConversationFilter = 'all';
let messageConversationSearch = '';
let messageConversationSearchTimer = null;
let communityConversationsData=null;
let communityConversationsLoading=false;
let communityDirectoryItems=[];
let communityScope='all';
let communitySearch='';
let communitySearchTimer=null;
let communityDiscoveryMode='recommended';
let communityDiscoveryCategory='';
let communityDiscoverySearch='';
let communityDiscoverySearchTimer=null;
let communityDiscoveryItems=[];
let activeCommunityId=null;
let activeCommunityData=null;
let eventScope='upcoming';
let eventItems=[];
let activeEventId=null;
let activeEventData=null;
let interestCatalog = [];
let activeExploreInterest = '';
let connectionCircles=[];
let activeConnectionCircleId=null;
let activeCircleConnection=null;
let activeConnectionContext=null;
let connectionsCenterItems=[];
let connectionsCenterFilter='all';
let connectionsCenterSearch='';
let connectionsCenterSearchTimer=null;
let activeCommentsPostId = null;
let activeCommentReply = null;
let activeReportPostId = null;
let pendingDeleteComment = null;
let activeManagePost = null;
let deletePostArmed = false;
let activeContentMode = 'foryou';
let activePostSearch = '';
let savedPostIds = new Set();
let toastTimer = null;
let ownProfileMode = 'posts';
let activeNotificationFilter = 'all';
let notificationCache = [];
let liveActivitySource = null;
let liveActivityState = {
  notificationUnread:null,
  latestNotificationId:'0',
  messageUnread:null,
  latestIncomingMessageId:'0',
  latestReactionAt:null,
  conversationPresence:[]
};
let liveConversationPresence=new Map();
let presenceHeartbeatTimer=null;
let typingClearTimer=null;
let lastTypingPingAt=0;
let liveActivityRefreshing = false;
let returnPulseLoaded = false;
const HOME_LAST_VISIT_KEY = 'redlibertad:last-home-visit';
const VIP_LAST_VISIT_KEY = 'redlibertad:last-vip-visit';
let visibleStories = [];
let storyGroups = new Map();
let activeStoryGroup = [];
let activeStoryIndex = 0;
let recordedReelViews = new Set();
let creatorCalendarMonth = new Date(new Date().getFullYear(),new Date().getMonth(),1);
let creatorCalendarPosts = [];
let creatorCommunityStatus = 'active';
let creatorCommunityStarredOnly = false;
let creatorCommunityData = null;
let creatorCommunityActivityStatus = 'pending';
let creatorCommunityActivityFocus = 'all';
let creatorCommunityActivityData = null;
let creatorFollowUpStatus = 'active';
let creatorFollowUpWindow = 'all';
let creatorFollowUpPriority = 'all';
let creatorFollowUpSearch = '';
let creatorFollowUpData = null;
let creatorFollowUpSearchTimer = null;


function syncVisualViewport(){
  const viewport=window.visualViewport;
  const height=Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
  const offsetTop=Math.round(viewport?.offsetTop || 0);
  const keyboardInset=Math.max(0,Math.round((window.innerHeight || height)-height-offsetTop));
  document.documentElement.style.setProperty('--visual-vh',height ? `${height}px` : '100dvh');
  document.documentElement.style.setProperty('--keyboard-inset',`${keyboardInset}px`);
  document.body.classList.toggle('keyboard-open',keyboardInset>120);
}

function setConnectivityStatus(online,{initial=false}={}){
  const banner=$('#connectivityBanner');
  if(!banner)return;
  clearTimeout(connectivityHideTimer);
  document.body.classList.toggle('is-offline',!online);

  if(!online){
    banner.textContent='Sin conexión · Puedes seguir viendo contenido ya cargado.';
    banner.classList.remove('hidden','reconnected');
    banner.classList.add('offline');
    return;
  }

  if(initial){
    banner.classList.add('hidden');
    banner.classList.remove('offline','reconnected');
    return;
  }

  banner.textContent='Conexión recuperada';
  banner.classList.remove('hidden','offline');
  banner.classList.add('reconnected');
  connectivityHideTimer=setTimeout(()=>{
    banner.classList.add('hidden');
    banner.classList.remove('reconnected');
  },2200);
}

function saveCurrentViewScroll(){
  if(!activeViewName)return;
  viewScrollPositions.set(activeViewName,Math.max(0,window.scrollY || 0));
}

function restoreViewScroll(name){
  const top=Number(viewScrollPositions.get(name) || 0);
  const apply=()=>{
    if(activeViewName===name)window.scrollTo({top,behavior:'auto'});
  };
  requestAnimationFrame(()=>requestAnimationFrame(apply));
  setTimeout(apply,120);
}

function autosizeMessageBody(){
  const field=$('#messageBody');
  if(!field)return;
  field.style.height='auto';
  field.style.height=`${Math.min(140,Math.max(46,field.scrollHeight))}px`;
}

syncVisualViewport();
window.visualViewport?.addEventListener('resize',syncVisualViewport);
window.visualViewport?.addEventListener('scroll',syncVisualViewport);
window.addEventListener('resize',syncVisualViewport);
window.addEventListener('online',()=>setConnectivityStatus(true));
window.addEventListener('offline',()=>setConnectivityStatus(false));
setConnectivityStatus(navigator.onLine,{initial:true});

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
  return p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" decoding="async">` : initials(p?.display_name || p?.username || 'A');
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
  if (p.media_type === 'image') return `<img src="${esc(url)}" loading="lazy" decoding="async" alt="Contenido de ${esc(p.username || '')}">`;
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

function collaboratorsHTML(p) {
  const collaborators=Array.isArray(p.collaborators)?p.collaborators:[];
  if(!collaborators.length)return '';
  const visible=collaborators.slice(0,3).map(x=>profileLink(x.username,`@${esc(x.username)}`,'collaborator-link'));
  const extra=collaborators.length>3?` <span class="participants-extra">y ${collaborators.length-3} más</span>`:'';
  const collaboratingMe=me&&collaborators.some(x=>String(x.id)===String(me.id));
  return `<div class="post-collaborators"><span class="collaborators-label">🤝 Colaboración con ${visible.join(', ')}${extra}</span>${collaboratingMe?'<span class="collaborating-me">✓ Colaboras</span>':''}</div>`;
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
  const communityText=String(p.community_poll?.question || p.community_question?.prompt || p.community_prompt || '').trim();
  const text = String(p.caption || communityText || '').trim();
  if (!text) return '<div class="text-tile"><span>Publicación</span></div>';
  const shortText = text.length > 150 ? text.slice(0, 147) + '…' : text;
  return `<div class="text-tile"><span>${esc(shortText)}</span></div>`;
}

function communityPollHTML(postId,poll) {
  if(!poll)return '';
  const total=Number(poll.total_votes || 0);
  const selected=poll.options?.find(option=>option.voted_by_me);
  const closed=poll.is_open===false;
  return `<section class="community-tool community-poll ${closed ? 'closed' : ''}" data-community-poll-container="${postId}">
    <div class="community-tool-head">
      <span>ENCUESTA${closed ? ' · CERRADA' : ''}</span>
      <small>${total} ${total===1 ? 'voto' : 'votos'} · resultados agregados</small>
    </div>
    <h4>${esc(poll.question)}</h4>
    <div class="community-poll-options">
      ${(poll.options || []).map(option=>{
        const count=Number(option.vote_count || 0);
        const pct=total ? Math.round((count/total)*100) : 0;
        return `<button type="button" class="community-poll-option ${option.voted_by_me ? 'selected' : ''}" ${closed ? 'disabled title="Encuesta cerrada"' : `data-poll-vote="${postId}" data-poll-option="${option.id}"`}>
          <span class="community-poll-option-bar" style="width:${pct}%"></span>
          <span class="community-poll-option-copy"><b>${esc(option.label)}</b><small>${pct}% · ${count}</small></span>
        </button>`;
      }).join('')}
    </div>
    ${selected ? `<button type="button" class="tiny-action community-remove-vote" data-poll-remove="${postId}">Quitar mi voto</button>` : ''}
  </section>`;
}

function communityQuestionHTML(postId,question) {
  if(!question)return '';
  const response=String(question.my_response || '');
  const closed=question.is_open===false;
  return `<section class="community-tool community-question ${closed ? 'closed' : ''}" data-community-question-container="${postId}">
    <div class="community-tool-head">
      <span>PREGUNTA ABIERTA${closed ? ' · CERRADA' : ''}</span>
      <small>${Number(question.response_count || 0)} ${Number(question.response_count || 0)===1 ? 'respuesta' : 'respuestas'} · privadas para el creador</small>
    </div>
    <h4>${esc(question.prompt)}</h4>
    <form class="community-question-form" data-question-response="${postId}">
      <textarea maxlength="1000" placeholder="${closed ? 'Pregunta cerrada' : 'Escribe tu respuesta...'}" ${closed ? 'disabled' : ''}>${esc(response)}</textarea>
      <div class="community-question-actions">
        <button class="secondary" type="submit" ${closed ? 'disabled' : ''}>${response ? 'Actualizar respuesta' : 'Responder'}</button>
        ${response ? `<button class="tiny-action" type="button" data-question-remove="${postId}">Retirar mi respuesta</button>` : ''}
      </div>
    </form>
  </section>`;
}

function communityToolHTML(p) {
  if(p.community_poll)return communityPollHTML(p.id,p.community_poll);
  if(p.community_question)return communityQuestionHTML(p.id,p.community_question);
  return '';
}

function postHTML(p, options = {}) {
  const media = mediaHTML(p);
  const textOnly = !media;
  const ownPost = !!me && String(me.id) === String(p.user_id);
  const collaboratingMe=!!me && Array.isArray(p.collaborators) && p.collaborators.some(x=>String(x.id)===String(me.id));
  const canManage = !!me && (ownPost || me.is_admin === true);
  const vipOnly = p.audience === 'vip';
  const privateAudience = p.audience && p.audience !== 'public';
  const audienceBadge = p.audience === 'vip'
    ? '★ SOLO VIP'
    : p.audience === 'connections'
      ? '◎ SOLO CONEXIONES'
      : p.audience === 'circles'
        ? '◉ CÍRCULOS PRIVADOS'
        : '';
  const liked = p.liked_by_me === true;
  const reposted = p.reposted_by_me === true;
  const repostBanner = p.repost_actor_username
    ? `<div class="repost-banner">⟳ ${profileLink(
        p.repost_actor_username,
        `${esc(p.repost_actor_display_name || p.repost_actor_username)} republicó esto`,
        'repost-profile-link'
      )}</div>`
    : '';
  return `<article class="post ${textOnly ? 'text-only-post' : ''} ${vipOnly ? 'vip-exclusive-post' : privateAudience ? 'private-audience-post' : ''} ${options.immersive ? 'immersive-reel-post' : ''}" data-id="${p.id}" ${p.post_kind==='reel' ? `data-reel-observe="${p.id}"` : ''}>
    ${repostBanner}
    <div class="post-head">
      ${profileLink(p.username, `<span class="avatar">${avatarHTML(p)}</span>`, 'post-avatar-link')}
      <div class="post-user">
        ${profileLink(p.username, `<b>${esc(p.display_name)} ${p.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`, 'post-name-link')}
        <small>${profileLink(p.username, `@${esc(p.username)}`, 'post-username-link')} · ${p.community_poll ? 'Encuesta' : p.community_question ? 'Pregunta' : p.post_kind === 'reel' ? 'Reel' : 'Publicación'} · <span class="post-time">${timeAgo(p.created_at)}</span>${p.post_kind==='reel' && p.view_count!=null ? ` · <span class="reel-view-count">▶ ${Number(p.view_count||0)} vistas</span>` : ''}</small>
        ${audienceBadge ? `<span class="vip-content-badge private-audience-badge ${esc(p.audience)}">${esc(audienceBadge)}</span>` : ''}
        ${collaboratorsHTML(p)}
        ${participantsHTML(p)}
      </div>
    </div>
    ${media ? `<div class="post-media">${media}</div>` : ''}
    ${p.caption ? `<div class="post-caption">${profileLink(p.username, `<b>${esc(p.username)}</b>`, 'caption-profile-link')} <span class="post-caption-text">${captionHTML(p.caption)}</span></div>` : ''}
    ${communityToolHTML(p)}
    <div class="post-actions">
      <button class="${liked ? 'liked' : ''}" data-like="${p.id}" data-liked="${liked ? '1' : '0'}">${liked ? '♥' : '♡'} <span>${p.like_count || 0}</span></button>
      <button data-comments="${p.id}">◯ ${p.comment_count || 0}</button>
      <button class="${reposted ? 'reposted' : ''}" ${ownPost || collaboratingMe || privateAudience ? 'disabled' : `data-repost="${p.id}" data-reposted="${reposted ? '1' : '0'}"`} title="${privateAudience ? 'El contenido de audiencia privada no se puede republicar' : ownPost ? 'No puedes republicar tu propia publicación' : collaboratingMe ? 'Ya apareces como colaborador en esta publicación' : reposted ? 'Quitar republicación' : 'Republicar'}">⟳ <span>${p.repost_count || 0}</span></button>
      <button class="${savedPostIds.has(String(p.id)) ? 'saved' : ''}" data-save-post="${p.id}" data-saved="${savedPostIds.has(String(p.id)) ? '1' : '0'}" title="${savedPostIds.has(String(p.id)) ? 'Quitar de guardados' : 'Guardar publicación'}" aria-label="${savedPostIds.has(String(p.id)) ? 'Quitar de guardados' : 'Guardar publicación'}">${savedPostIds.has(String(p.id)) ? '★' : '☆'}</button>
      <button class="share-action" ${privateAudience ? 'disabled title="El contenido de audiencia privada no se puede compartir"' : `data-share="${p.id}"`}>↗ <span class="share-label">${privateAudience ? 'Privado' : 'Compartir'}</span></button>
      ${options.discovery && !ownPost ? `<button class="discovery-hide-action" data-discovery-hide-post="${p.id}" title="No me interesa" aria-label="No me interesa">−</button>` : ''}
      ${canManage
        ? `<button class="post-more" data-manage-post="${p.id}" data-caption="${encodeURIComponent(p.caption || '')}" aria-label="Gestionar publicación">⋯</button>`
        : `<button class="post-more" data-report="${p.id}" aria-label="Denunciar publicación">⋯</button>`}
    </div>
    ${options.immersive ? '' : inlineCommentsHTML(p)}
  </article>`;
}


function interestPillsHTML(interests = [], compact = false) {
  if (!Array.isArray(interests) || !interests.length) return '';
  const shown = interests.slice(0, compact ? 3 : 8);
  return `<div class="interest-pills ${compact ? 'compact' : ''}">${shown.map(i => `<span>${esc(i)}</span>`).join('')}</div>`;
}

function connectionCircleNamesHTML(user){
  const names=Array.isArray(user.circle_names) ? user.circle_names : [];
  if(!names.length)return '';
  return `<div class="connection-circle-tags">${names.slice(0,3).map(name=>`<span>${esc(name)}</span>`).join('')}${names.length>3 ? `<span>+${names.length-3}</span>` : ''}</div>`;
}

function connectionCardHTML(user) {
  const shared=Number(user.shared_interest_count || 0);
  const activity=user.last_activity_at && new Date(user.last_activity_at).getFullYear()>1971
    ? `Activo ${timeAgo(user.last_activity_at)}`
    : '';
  const reason=shared
    ? `${shared} ${shared===1 ? 'interés' : 'intereses'} en común`
    : activity || 'Seguimiento mutuo';

  return `<article class="connection-card" data-connection-card="${user.id}">
    <button type="button" class="connection-favorite ${user.favorite ? 'active' : ''}" data-connection-favorite="${user.id}" aria-label="${user.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}">${user.favorite ? '★' : '☆'}</button>
    ${profileLink(user.username,`<span class="connection-avatar">${avatarHTML(user)}</span>`,'connection-profile')}
    <div class="connection-copy">
      ${profileLink(user.username,`<b>${esc(user.display_name)} ${user.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`,'connection-name')}
      <small>@${esc(user.username)}${user.location_label ? ` · ${esc(user.location_label)}` : ''}</small>
      ${user.profile_status ? `<p>${esc(user.profile_status)}</p>` : ''}
      <span>${esc(reason)}</span>
      ${connectionCircleNamesHTML(user)}
    </div>
    <div class="connection-card-actions">
      <button type="button" class="connection-close-toggle ${user.close_connection ? 'active' : ''}" data-close-connection="${user.id}" data-close="${user.close_connection ? '1' : '0'}">${user.close_connection ? '♥ Cercana' : '♡ Cercana'}</button>
      <button type="button" class="connection-organize" data-connection-organize="${user.id}" data-connection-display="${esc(user.display_name || user.username)}" data-connection-username="${esc(user.username)}">Círculos</button>
      <button type="button" class="connection-message" data-connection-message="${esc(user.username)}">Mensaje</button>
    </div>
  </article>`;
}

function renderConnectionCircleFilters(){
  const root=$('#connectionCircleFilters');
  if(!root)return;
  root.innerHTML=`
    <button type="button" class="${activeConnectionCircleId===null ? 'active' : ''}" data-connection-circle-filter="">Todas</button>
    ${connectionCircles.map(circle=>`
      <button type="button" class="${String(activeConnectionCircleId)===String(circle.id) ? 'active' : ''}" data-connection-circle-filter="${circle.id}">
        ${circle.is_favorites ? '★ ' : circle.is_close ? '♥ ' : ''}${esc(circle.name)} <span>${Number(circle.member_count || 0)}</span>
      </button>
    `).join('')}
  `;
}

async function loadConnectionCircles(){
  const {r,d}=await api('/api/profiles/connections/circles');
  connectionCircles=r.ok && Array.isArray(d.circles) ? d.circles : [];
  if(activeConnectionCircleId!==null && !connectionCircles.some(circle=>String(circle.id)===String(activeConnectionCircleId))){
    activeConnectionCircleId=null;
  }
  renderConnectionCircleFilters();
  return connectionCircles;
}

async function loadConnections() {
  const section=$('#connectionsSection');
  const list=$('#connectionsList');
  if(!section || !list)return [];

  await loadConnectionCircles();
  const query=new URLSearchParams({limit:'50'});
  if(activeConnectionCircleId!==null)query.set('circleId',String(activeConnectionCircleId));
  const {r,d}=await api(`/api/profiles/connections?${query.toString()}`);
  const connections=r.ok && Array.isArray(d.connections) ? d.connections : [];

  if(!connections.length && activeConnectionCircleId===null){
    section.classList.add('hidden');
    list.innerHTML='';
    if($('#connectionsCount'))$('#connectionsCount').textContent='0';
    return [];
  }

  section.classList.remove('hidden');
  list.innerHTML=connections.length ? connections.map(connectionCardHTML).join('') : '<div class="connections-empty">Este círculo todavía no tiene conexiones.</div>';
  if($('#connectionsCount'))$('#connectionsCount').textContent=String(connections.length);
  renderConnectionCircleFilters();
  return connections;
}


function connectionsCenterReason(user){
  if(Number(user.unread_message_count || 0)>0)return `${Number(user.unread_message_count)} ${Number(user.unread_message_count)===1?'mensaje pendiente':'mensajes pendientes'}`;
  if(user.has_recent_conversation && user.last_message_at)return `Conversación ${timeAgo(user.last_message_at)}`;
  if(user.is_new_connection)return 'Nueva conexión';
  if(user.has_common_interests)return `${Number(user.shared_interest_count || 0)} ${Number(user.shared_interest_count || 0)===1?'interés en común':'intereses en común'}`;
  if(user.is_active_connection && user.last_activity_at)return `Activo ${timeAgo(user.last_activity_at)}`;
  return 'Seguimiento mutuo';
}

function connectionCenterCardHTML(user){
  const unread=Number(user.unread_message_count || 0);
  const shared=Number(user.shared_interest_count || 0);
  const signals=[
    user.is_new_connection ? '<span class="connection-center-signal">Nueva</span>' : '',
    user.is_active_connection ? '<span class="connection-center-signal">Activa</span>' : '',
    shared ? `<span class="connection-center-signal">${shared} ${shared===1?'interés':'intereses'}</span>` : '',
    user.favorite ? '<span class="connection-center-signal favorite">★ Favorita</span>' : '',
    user.close_connection ? '<span class="connection-center-signal close">♥ Cercana</span>' : '',
    unread ? `<span class="connection-center-signal unread">${unread} pendiente${unread===1?'':'s'}</span>` : ''
  ].filter(Boolean).join('');
  return `<article class="connection-center-card" data-connection-card="${user.id}">
    <button type="button" class="connection-favorite ${user.favorite ? 'active' : ''}" data-connection-favorite="${user.id}" aria-label="${user.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}">${user.favorite ? '★' : '☆'}</button>
    ${profileLink(user.username,`<span class="connection-center-avatar">${avatarHTML(user)}</span>`,'connection-profile')}
    <div class="connection-center-copy">
      <div class="connection-center-name">${profileLink(user.username,`<b>${esc(user.display_name)} ${user.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`,'connection-name')}<small>@${esc(user.username)}${user.location_label ? ` · ${esc(user.location_label)}` : ''}</small></div>
      ${user.profile_status ? `<p>${esc(user.profile_status)}</p>` : ''}
      <div class="connection-center-signals">${signals}</div>
      <span class="connection-center-context">${esc(connectionsCenterReason(user))}</span>
      ${connectionCircleNamesHTML(user)}
    </div>
    <div class="connection-center-actions">
      <button type="button" class="secondary connection-close-toggle ${user.close_connection ? 'active' : ''}" data-close-connection="${user.id}" data-close="${user.close_connection ? '1' : '0'}">${user.close_connection ? '♥ Cercana' : '♡ Cercana'}</button>
      <button type="button" class="secondary" data-connection-context="${user.id}">Contexto</button>
      <button type="button" class="secondary" data-connection-organize="${user.id}" data-connection-display="${esc(user.display_name || user.username)}" data-connection-username="${esc(user.username)}">Círculos</button>
      <button type="button" class="primary" data-connection-message="${esc(user.username)}">Mensaje</button>
    </div>
  </article>`;
}


function closeConnectionContextModal(){
  $('#connectionContextModal')?.classList.add('hidden');
  activeConnectionContext=null;
  const root=$('#connectionContextContent');
  if(root)root.innerHTML='';
}

function connectionContextPersonHTML(person){
  return profileLink(
    person.username,
    `<span class="connection-context-person-avatar">${avatarHTML(person)}</span><span><b>${esc(person.display_name)} ${person.creator_verified ? '<span class="verified">✓</span>' : ''}</b><small>@${esc(person.username)}</small></span>`,
    'connection-context-person'
  );
}

function renderConnectionContext(data){
  const root=$('#connectionContextContent');
  if(!root)return;
  const connection=data.connection || {};
  const interests=Array.isArray(data.shared_interests)?data.shared_interests:[];
  const mutuals=Array.isArray(data.mutual_connections)?data.mutual_connections:[];
  const posts=Array.isArray(data.recent_public_posts)?data.recent_public_posts:[];
  const starters=Array.isArray(data.starters)?data.starters:[];

  const sections=[];
  if(interests.length || data.same_location){
    sections.push(`<section class="connection-context-section">
      <div class="connection-context-section-head"><b>Lo que tenéis en común</b><small>Solo información visible para ti</small></div>
      ${interests.length ? `<div class="connection-context-pills">${interests.map(interest=>`<span>${esc(interest)}</span>`).join('')}</div>` : ''}
      ${data.same_location && connection.location_label ? `<div class="connection-context-location">⌖ Misma zona · ${esc(connection.location_label)}</div>` : ''}
    </section>`);
  }

  if(mutuals.length){
    sections.push(`<section class="connection-context-section">
      <div class="connection-context-section-head"><b>Conexiones mutuas</b><small>${mutuals.length} visible${mutuals.length===1?'':'s'}</small></div>
      <div class="connection-context-people">${mutuals.map(connectionContextPersonHTML).join('')}</div>
    </section>`);
  }

  if(posts.length){
    sections.push(`<section class="connection-context-section">
      <div class="connection-context-section-head"><b>Actividad pública reciente</b><small>Solo publicaciones públicas normales</small></div>
      <div class="connection-context-posts">${posts.map(post=>`
        <button type="button" class="connection-context-post" data-open-post="${post.id}">
          <span>${post.post_kind==='reel'?'Reel':'Publicación'} · ${timeAgo(post.created_at)}</span>
          <b>${esc(post.caption || 'Ver publicación')}</b>
        </button>`).join('')}</div>
    </section>`);
  }

  sections.push(`<section class="connection-context-section connection-context-starters">
    <div class="connection-context-section-head"><b>Ideas para conversar</b><small>Se preparan como borrador, nunca se envían solas</small></div>
    <div class="connection-starter-list">${starters.map(starter=>`
      <button type="button" class="connection-starter" data-connection-starter="${encodeURIComponent(starter.text || '')}" data-connection-starter-username="${esc(connection.username || '')}">
        <span>${esc(starter.label || 'Idea')}</span>
        <b>${esc(starter.text || '')}</b>
      </button>`).join('')}</div>
  </section>`);

  root.innerHTML=sections.join('');
}

async function openConnectionContext(userId){
  const modal=$('#connectionContextModal');
  const root=$('#connectionContextContent');
  if(!modal || !root)return;
  modal.classList.remove('hidden');
  root.innerHTML='<div class="mini-loading">Cargando contexto…</div>';
  const {r,d}=await api(`/api/profiles/connections/${encodeURIComponent(userId)}/context`);
  if(!r.ok){
    root.innerHTML='<div class="info-card"><b>No se pudo cargar el contexto de esta conexión.</b></div>';
    return;
  }
  activeConnectionContext=d;
  if($('#connectionContextTitle'))$('#connectionContextTitle').textContent=d.connection?.display_name || 'Conexión';
  renderConnectionContext(d);
}

function renderConnectionsCenterCircleFilters(){
  const root=$('#connectionsCenterCircleFilters');
  if(!root)return;
  root.innerHTML=`
    <button type="button" class="${activeConnectionCircleId===null ? 'active' : ''}" data-connection-center-circle="">Todas</button>
    ${connectionCircles.map(circle=>`
      <button type="button" class="${String(activeConnectionCircleId)===String(circle.id) ? 'active' : ''}" data-connection-center-circle="${circle.id}">
        ${circle.is_favorites ? '★ ' : circle.is_close ? '♥ ' : ''}${esc(circle.name)} <span>${Number(circle.member_count || 0)}</span>
      </button>
    `).join('')}
  `;
}

function filteredConnectionsCenterItems(){
  const q=connectionsCenterSearch.trim().toLowerCase();
  return connectionsCenterItems.filter(user=>{
    if(connectionsCenterFilter==='new' && !user.is_new_connection)return false;
    if(connectionsCenterFilter==='active' && !user.is_active_connection)return false;
    if(connectionsCenterFilter==='interests' && !user.has_common_interests)return false;
    if(connectionsCenterFilter==='recent' && !user.has_recent_conversation)return false;
    if(connectionsCenterFilter==='unread' && Number(user.unread_message_count || 0)<=0)return false;
    if(!q)return true;
    const haystack=[
      user.display_name,user.username,user.location_label,user.profile_status,
      ...(Array.isArray(user.interests)?user.interests:[]),
      ...(Array.isArray(user.circle_names)?user.circle_names:[])
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

function renderConnectionsCenter(){
  const list=$('#connectionsCenterList');
  if(!list)return;
  const visible=filteredConnectionsCenterItems();
  list.innerHTML=visible.length
    ? visible.map(connectionCenterCardHTML).join('')
    : '<div class="connections-center-empty"><b>No hay conexiones con este filtro.</b><p>Prueba otro filtro, círculo o término de búsqueda.</p></div>';
  if($('#connectionsCenterVisibleCount'))$('#connectionsCenterVisibleCount').textContent=String(visible.length);
  const headings={
    all:'Todas tus conexiones',
    new:'Conexiones nuevas',
    active:'Conexiones activas',
    interests:'Con intereses en común',
    recent:'Con conversación reciente',
    unread:'Mensajes pendientes'
  };
  if($('#connectionsCenterHeading'))$('#connectionsCenterHeading').textContent=headings[connectionsCenterFilter] || headings.all;
  all('[data-connection-center-filter]').forEach(button=>button.classList.toggle('active',button.dataset.connectionCenterFilter===connectionsCenterFilter));
  renderConnectionsCenterCircleFilters();
}

async function refreshConnectionSurfaces(){
  await loadConnections();
  if(activeViewName==='connections')await loadConnectionsCenter();
}

async function loadConnectionsCenter(){
  await loadConnectionCircles();
  const query=new URLSearchParams({limit:'100'});
  if(activeConnectionCircleId!==null)query.set('circleId',String(activeConnectionCircleId));
  const {r,d}=await api(`/api/profiles/connections?${query.toString()}`);
  connectionsCenterItems=r.ok && Array.isArray(d.connections) ? d.connections : [];
  if($('#connectionsCenterTotal'))$('#connectionsCenterTotal').textContent=String(connectionsCenterItems.length);
  if($('#connectionsCenterNew'))$('#connectionsCenterNew').textContent=String(connectionsCenterItems.filter(user=>user.is_new_connection).length);
  if($('#connectionsCenterActive'))$('#connectionsCenterActive').textContent=String(connectionsCenterItems.filter(user=>user.is_active_connection).length);
  if($('#connectionsCenterUnread'))$('#connectionsCenterUnread').textContent=String(connectionsCenterItems.filter(user=>Number(user.unread_message_count || 0)>0).length);
  renderConnectionsCenter();
  return connectionsCenterItems;
}

function closeConnectionCirclesModal(){
  $('#connectionCirclesModal')?.classList.add('hidden');
  activeCircleConnection=null;
  $('#newCircleForm')?.reset();
  if($('#newCircleStatus'))$('#newCircleStatus').textContent='';
}

function renderConnectionCircleManageList(){
  const root=$('#connectionCircleManageList');
  if(!root)return;
  root.innerHTML=connectionCircles.map(circle=>`
    <article class="connection-circle-manage-row">
      <div><b>${circle.is_favorites ? '★ ' : circle.is_close ? '♥ ' : ''}${esc(circle.name)}</b><small>${Number(circle.member_count || 0)} conexiones</small></div>
      ${circle.is_favorites || circle.is_close ? `<span class="connection-circle-fixed">${circle.is_close ? 'Privado · fijo' : 'Fijo'}</span>` : `
        <div class="connection-circle-manage-actions">
          <button type="button" class="tiny-action" data-circle-rename="${circle.id}" data-circle-name="${esc(circle.name)}">Renombrar</button>
          <button type="button" class="tiny-action danger-outline" data-circle-delete="${circle.id}" data-circle-name="${esc(circle.name)}">Eliminar</button>
        </div>
      `}
    </article>
  `).join('');
}

async function loadConnectionMemberships(){
  const root=$('#connectionCircleMemberships');
  if(!root)return;
  if(!activeCircleConnection){
    root.innerHTML='<div class="connection-circle-neutral"><b>Crea y gestiona tus círculos.</b><p>Para asignar una persona, pulsa “Círculos” en su tarjeta.</p></div>';
    renderConnectionCircleManageList();
    return;
  }

  root.innerHTML='<div class="mini-loading">Cargando círculos…</div>';
  const {r,d}=await api(`/api/profiles/connections/${activeCircleConnection.id}/circles`);
  if(!r.ok){
    root.innerHTML='<div class="info-card"><b>No se pudieron cargar los círculos.</b></div>';
    return;
  }
  const memberships=Array.isArray(d.circles) ? d.circles : [];
  root.innerHTML=memberships.map(circle=>`
    <label class="connection-circle-membership">
      <input type="checkbox" data-circle-membership="${circle.id}" ${circle.selected ? 'checked' : ''}>
      <span><b>${circle.is_favorites ? '★ ' : circle.is_close ? '♥ ' : ''}${esc(circle.name)}</b><small>${circle.is_favorites ? 'Tu lista rápida de favoritas.' : circle.is_close ? 'Solo tú sabes quién está en Cercanas.' : 'Círculo privado.'}</small></span>
    </label>
  `).join('');
  all('[data-circle-membership]',root).forEach(input=>{
    input.onchange=async()=>{
      const selected=input.checked;
      input.disabled=true;
      const {r:response}=await api(
        `/api/profiles/connections/circles/${input.dataset.circleMembership}/members/${activeCircleConnection.id}`,
        {method:selected?'PUT':'DELETE'}
      );
      if(!response.ok){
        input.checked=!selected;
        toast('No se pudo actualizar el círculo.');
      }else{
        await loadConnectionCircles();
        renderConnectionCircleManageList();
        await refreshConnectionSurfaces();
      }
      input.disabled=false;
    };
  });
  renderConnectionCircleManageList();
}

async function openConnectionCirclesModal(connection=null){
  activeCircleConnection=connection;
  const modal=$('#connectionCirclesModal');
  if(!modal)return;
  modal.classList.remove('hidden');
  $('#connectionCirclesModalTitle').textContent=connection ? `Organizar a ${connection.displayName}` : 'Gestionar círculos';
  $('#connectionCirclesModalIntro').textContent=connection ? `Elige dónde guardar a @${connection.username}. Esta organización es privada.` : 'Crea, renombra o elimina círculos privados para ordenar tus conexiones.';
  await loadConnectionCircles();
  await loadConnectionMemberships();
}

async function createConnectionCircle(name){
  const {r,d}=await api('/api/profiles/connections/circles',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name})
  });
  if(!r.ok){
    return {ok:false,message:d.error==='circle_limit_reached' ? 'Puedes tener hasta 12 círculos personalizados.' : d.error==='circle_name_exists' ? 'Ya tienes un círculo con ese nombre.' : 'No se pudo crear el círculo.'};
  }
  await loadConnectionCircles();
  await loadConnectionMemberships();
  if(activeViewName==='connections')await loadConnectionsCenter();
  return {ok:true};
}

async function toggleFavoriteConnection(userId){
  await loadConnectionCircles();
  const favorite=connectionCircles.find(circle=>circle.is_favorites);
  if(!favorite)return toast('No se pudo cargar Favoritas.');
  const card=$(`[data-connection-card="${userId}"]`);
  const button=card?.querySelector('[data-connection-favorite]');
  const active=button?.classList.contains('active')===true;
  if(button)button.disabled=true;
  const {r}=await api(`/api/profiles/connections/circles/${favorite.id}/members/${userId}`,{method:active?'DELETE':'PUT'});
  if(!r.ok){
    if(button)button.disabled=false;
    return toast('No se pudo actualizar Favoritas.');
  }
  toast(active ? 'Quitada de Favoritas' : 'Añadida a Favoritas');
  await refreshConnectionSurfaces();
}

async function toggleCloseConnection(userId,button=null){
  const active=button ? button.dataset.close==='1' : connectionsCenterItems.some(user=>String(user.id)===String(userId) && user.close_connection===true);
  if(button)button.disabled=true;
  const {r}=await api(`/api/profiles/connections/${encodeURIComponent(userId)}/close`,{method:active?'DELETE':'PUT'});
  if(!r.ok){
    if(button)button.disabled=false;
    return toast('No se pudo actualizar Cercanas.');
  }
  if(button){
    button.dataset.close=active?'0':'1';
    button.classList.toggle('active',!active);
    button.textContent=active ? '♡ Cercana' : '♥ Cercana';
    button.disabled=false;
  }
  toast(active ? 'Quitada de Cercanas' : 'Añadida a Cercanas');
  await refreshConnectionSurfaces();
}

async function openConnectionMessage(username,draft='') {
  const clean=String(username || '').replace(/^@/,'').trim();
  if(!clean)return;
  const {r,d}=await api('/api/messages/conversations',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:clean})
  });
  if(!r.ok){
    return toast(
      d.error==='message_privacy_denied' ? 'Esta persona no acepta nuevas conversaciones.' :
      d.error==='message_privacy_following_only' ? 'Esta persona solo acepta mensajes de personas que sigue.' :
      d.error==='messaging_blocked' ? 'No puedes iniciar esta conversación.' :
      'No se pudo abrir la conversación.'
    );
  }
  showView('messages');
  await loadConversations(d.conversationId);
  if(draft){
    const field=$('#messageBody');
    if(field){
      field.value=String(draft).slice(0,4000);
      autosizeMessageBody();
      field.focus();
    }
  }
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
    <div class="person-card-actions">
      <button type="button" class="person-follow ${user.following ? 'following' : ''}" data-suggest-follow="${user.id}" data-following="${user.following ? '1' : '0'}">${user.following ? 'Siguiendo' : 'Seguir'}</button>
      ${compact ? '' : `<button type="button" class="person-hide-suggestion" data-discovery-hide-person="${user.id}" title="Ocultar sugerencia" aria-label="Ocultar sugerencia">×</button>`}
    </div>
  </article>`;
}

async function hideDiscoveryPerson(button) {
  const card=button.closest('[data-person-card]');
  button.disabled=true;
  const {r}=await api(`/api/profiles/${button.dataset.discoveryHidePerson}/discovery-hide`,{method:'POST'});
  if(!r.ok){button.disabled=false;return toast('No se pudo ocultar esta sugerencia.');}
  card?.remove();
  toast('Sugerencia ocultada');
}
async function hideDiscoveryPost(button) {
  const article=button.closest('[data-id]');
  button.disabled=true;
  const {r}=await api(`/api/posts/${button.dataset.discoveryHidePost}/discovery-hide`,{method:'POST'});
  if(!r.ok){button.disabled=false;return toast('No se pudo ajustar Explorar.');}
  article?.remove();
  toast('Ajustaremos tus recomendaciones');
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

function returnPulseCard(label,value,action,detail='') {
  const count=Number(value || 0);
  if(!count)return '';
  return `<button type="button" class="return-pulse-card" data-return-pulse-action="${esc(action)}">
    <b>${count>99?'99+':count}</b>
    <span>${esc(label)}</span>
    ${detail ? `<small>${esc(detail)}</small>` : ''}
    <i>›</i>
  </button>`;
}

async function loadReturnPulse(force=false) {
  const section=$('#returnPulse');
  const grid=$('#returnPulseGrid');
  if(!section || !grid)return;
  if(returnPulseLoaded && !force)return;

  const {r,d}=await api('/api/growth/pulse');
  if(!r.ok){
    section.classList.add('hidden');
    return;
  }

  returnPulseLoaded=true;
  const counts=d.counts || {};
  const cards=[
    returnPulseCard('Mensajes sin leer',counts.unread_messages,'messages','Continuar conversaciones'),
    returnPulseCard('Notificaciones',counts.unread_notifications,'notifications','Actividad pendiente'),
    returnPulseCard('Nuevos de personas que sigues',counts.following_posts,'following','Publicaciones desde tu última visita'),
    returnPulseCard('Stories sin ver',counts.unseen_stories,'stories','Stories disponibles ahora'),
    returnPulseCard('Reels sin ver',counts.unseen_reels,'reels','Vídeos que aún no has visto'),
    returnPulseCard('Nuevos seguidores',counts.new_followers,'followers','Personas que han empezado a seguirte')
  ].filter(Boolean);

  const since=new Date(d.since || '');
  if($('#returnPulseSince') && Number.isFinite(since.getTime())){
    $('#returnPulseSince').textContent=`Desde ${since.toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`;
  }

  grid.innerHTML=cards.join('');
  section.classList.toggle('hidden',cards.length===0);

  try{
    await api('/api/growth/pulse/seen',{method:'POST'});
  }catch(_){}
}

async function handleReturnPulseAction(action) {
  if(action==='messages'){showView('messages');return;}
  if(action==='notifications'){showView('notifications');return;}
  if(action==='following'){
    showView('feed');
    await loadFeed('following');
    window.scrollTo({top:0,behavior:'smooth'});
    return;
  }
  if(action==='stories'){
    showView('feed');
    document.querySelector('#stories')?.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  if(action==='reels'){showView('reels');return;}
  if(action==='followers'){
    showView('profile');
    if(!me)await loadMe();
    await openSocialList(me.username,'followers');
  }
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
    : mode==='close'
      ? 'Todavía no hay contenido de tus conexiones cercanas.'
    : mode==='following'
      ? 'Tu feed de Siguiendo empieza aquí.'
      : 'Todavía hay poco por aquí.';
  const emptyCopy=mode==='vip'
    ? 'Cuando un creador te añada a su círculo VIP y publique contenido exclusivo, aparecerá aquí.'
    : mode==='close'
      ? 'Marca conexiones como Cercanas desde sus perfiles o desde el Centro de conexiones. Nadie recibe una notificación.'
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
  const storyAudienceBadge=story.audience==='vip'
    ? '★ SOLO VIP'
    : story.audience==='connections'
      ? '◎ SOLO CONEXIONES'
      : story.audience==='circles'
        ? '◉ CÍRCULOS PRIVADOS'
        : '';
  root.innerHTML=`<article class="story-viewer-story ${story.audience==='vip' ? 'vip-story' : story.audience!=='public' ? 'private-story' : ''}">
    <header>
      <span class="story-viewer-avatar">${avatarHTML(story)}</span>
      <div><b>${esc(story.display_name)}</b><small>@${esc(story.username)} · ${timeAgo(story.created_at)}${story.view_count!=null ? ` · ${Number(story.view_count||0)} vistas` : ''}</small></div>
      ${storyAudienceBadge ? `<span class="vip-content-badge private-audience-badge ${esc(story.audience)}">${esc(storyAudienceBadge)}</span>` : ''}
    </header>
    <div class="story-viewer-media">${media || '<div class="gate"><b>Story no disponible</b></div>'}</div>
  </article>`;
  if(!story.gated && me && String(story.user_id)!==String(me.id) && !story.viewed_by_me){
    markStoryViewed(story);
  }

  if($('#storyPrev'))$('#storyPrev').disabled=activeStoryIndex<=0;
  if($('#storyNext'))$('#storyNext').disabled=activeStoryIndex>=activeStoryGroup.length-1;
  if(story.audience==='vip')markVipSeen();
}

async function markStoryViewed(story){
  if(!story || story.gated || story.viewed_by_me)return;
  const {r}=await api(`/api/stories/${encodeURIComponent(story.id)}/view`,{method:'POST'});
  if(!r.ok)return;
  story.viewed_by_me=true;
  const group=storyGroups.get(String(story.user_id)) || [];
  const allSeen=group.every(item=>item.gated || item.viewed_by_me || (me && String(item.user_id)===String(me.id)));
  const button=document.querySelector(`[data-story-user="${CSS.escape(String(story.user_id))}"]`);
  button?.classList.toggle('seen',allSeen);
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
    const hasPrivate=group.some(item=>item.audience==='connections' || item.audience==='circles');
    const allSeen=group.every(item=>item.gated || item.viewed_by_me || (me && String(item.user_id)===String(me.id)));
    const storyTitle=story.gated
      ? gateText(story.gate_reason)
      : hasVip
        ? 'Story VIP disponible'
        : hasPrivate
          ? 'Story para audiencia privada'
          : 'Story activa';
    return `<button type="button" class="story ${hasVip ? 'has-vip-story' : ''} ${hasPrivate ? 'has-private-story' : ''} ${allSeen ? 'seen' : ''}" data-story-user="${story.user_id}" title="${storyTitle}"><div class="story-ring"><div>${story.avatar_url ? `<img src="${esc(story.avatar_url)}">` : initials(story.display_name)}</div>${hasVip ? '<span class="story-vip-star">★</span>' : hasPrivate ? '<span class="story-private-mark">◎</span>' : ''}</div><small>${esc(story.username)}</small></button>`;
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
    ? posts.map(post=>postHTML(post,{discovery:true})).join('')
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
          : mode === 'trending'
            ? '/api/posts/trending?sort=score'
            : '/api/posts/discover';

  if (title) {
    title.textContent = mode === 'saved'
      ? 'Tus guardados'
      : mode === 'latest'
        ? 'Lo más nuevo'
        : mode === 'liked'
          ? 'Lo más gustado'
          : mode === 'commented'
            ? 'Lo más comentado'
            : mode === 'trending'
              ? 'Tendencias'
              : 'Para ti';
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
    loadConnections(),
    loadPeopleSuggestions(activeExploreInterest),
    loadTrendChips(),
    loadDiscoveryContent(activeContentMode)
  ]);
}
async function loadReels() {
  const { r,d } = await api('/api/posts/reels');
  const reels = r.ok && Array.isArray(d.posts) ? d.posts : [];
  const root=$('#reelsFeed');
  root.innerHTML = reels.map(reel=>postHTML(reel,{immersive:true})).join('') || '<div class="info-card"><b>Todavía no hay Reels.</b><p>Publica el primero usando Crear → Reel.</p></div>';
  root.scrollTop=0;
  bindPostActions(root);
  observeReelExperience();
}

function pauseReelVideos(except=null){
  all('#reelsFeed video').forEach(video=>{
    if(video!==except && !video.paused)video.pause();
  });
}

function observeReelExperience(){
  const root=$('#reelsFeed');
  if(!root || !('IntersectionObserver' in window))return;

  const cards=all('[data-reel-observe]',root);
  const viewObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting || entry.intersectionRatio<0.65)return;
      const id=entry.target.dataset.reelObserve;
      if(!id || recordedReelViews.has(String(id)))return;
      recordedReelViews.add(String(id));
      api(`/api/posts/${encodeURIComponent(id)}/reel-view`,{method:'POST'})
        .catch(()=>{recordedReelViews.delete(String(id));});
      viewObserver.unobserve(entry.target);
    });
  },{root,threshold:[0.65]});

  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const playbackObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const card=entry.target;
      const video=card.querySelector('.post-media video');
      if(!video)return;

      if(entry.isIntersecting && entry.intersectionRatio>=0.72){
        card.classList.add('is-active-reel');
        pauseReelVideos(video);
        video.muted=true;
        video.playsInline=true;
        if(!reducedMotion){
          video.play().catch(()=>{});
        }
      }else{
        card.classList.remove('is-active-reel');
        if(!video.paused)video.pause();
      }
    });
  },{root,threshold:[0,0.35,0.72]});

  cards.forEach(card=>{
    viewObserver.observe(card);
    playbackObserver.observe(card);
  });
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

  $('#profileFull').innerHTML = `<div class="cover" ${me.cover_url ? `style="background-image:url('${esc(me.cover_url)}')"` : ''}></div><div class="profile-body"><div class="profile-avatar">${avatarHTML(me)}</div><div class="profile-title"><div><h2>${esc(me.display_name)} ${me.creator_verified ? '<span class="verified">✓</span>' : ''}</h2><p>@${esc(me.username)}</p>${me.profile_status ? `<span class="profile-status-line">${esc(me.profile_status)}</span>` : ''}</div><div class="profile-buttons"><button id="editProfile" class="secondary">Editar perfil</button>${me.creator_verified ? '<button id="creatorCenter" class="secondary creator-center-button">Centro de creador</button>' : ''}<button id="trustSettings" class="secondary">Confianza</button><button id="privacySettings" class="secondary">Privacidad</button><button id="accountSettings" class="secondary">Cuenta</button><button id="sensitiveToggle" class="secondary">${me.show_sensitive ? 'Ocultar' : 'Mostrar'} contenido sensible</button></div></div><p class="profile-bio">${esc(me.bio || 'Todavía no has escrito una biografía.')}</p>${me.creator_verified && me.creator_headline ? `<div class="own-creator-headline"><span>CREADOR</span><b>${esc(me.creator_headline)}</b></div>` : ''}${interestPillsHTML(me.interests)}<div class="profile-meta">${me.location_label ? `<span>⌖ ${esc(me.location_label)}</span>` : ''}${web}</div><div class="profile-stats"><span><b>${me.post_count}</b> publicaciones</span><button type="button" data-social-list="followers" data-social-username="${esc(me.username)}"><b>${me.follower_count}</b> seguidores</button><button type="button" data-social-list="following" data-social-username="${esc(me.username)}"><b>${me.following_count}</b> siguiendo</button><button type="button" data-view-jump="explore"><b>${me.connection_count || 0}</b> conexiones</button></div><p class="muted">Edad: ${me.age_verified ? '✓ verificada' : 'pendiente de verificación'} · Creador: ${me.creator_verified ? '✓ verificado' : 'no verificado'}</p></div>`;

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
    return profileData.connected
      ? '<div class="profile-relationship-note connected">✓ Conexión · os seguís mutuamente</div>'
      : profileData.followsYou
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

  return `<div class="profile-mutuals"><div class="mutual-avatars">${shown}</div><span>${copy}</span>${profileData.connected ? '<b>✓ Conexión</b>' : profileData.followsYou ? '<b>Te sigue</b>' : ''}</div>`;
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
        ${profileData.connected ? `<button type="button" class="secondary connection-close-toggle ${profileData.closeConnection ? 'active' : ''}" data-close-connection="${profile.id}" data-close="${profileData.closeConnection ? '1' : '0'}">${profileData.closeConnection ? '♥ Cercana' : '♡ Cercana'}</button>` : ''}
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
              ${profile.profile_status ? `<span class="profile-status-line">${esc(profile.profile_status)}</span>` : ''}
              ${profileData.connected ? '<span class="profile-relationship-signal">✓ Conexión</span>' : profileData.followsYou ? '<span class="profile-relationship-signal">Te sigue</span>' : ''}
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
            ${profile.last_activity_at ? `<span>Activo ${timeAgo(profile.last_activity_at)}</span>` : ''}
            <span>En RedLibertad desde ${new Date(profile.created_at).toLocaleDateString('es-ES',{month:'short',year:'numeric'})}</span>
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

$('#refreshCommunityConversations')?.addEventListener('click',loadCommunityConversations);
$('#closeConnectionContextModal')?.addEventListener('click',closeConnectionContextModal);
$('#connectionContextModal')?.addEventListener('click',event=>{
  if(event.target===$('#connectionContextModal'))closeConnectionContextModal();
});
$('#newConnectionCircle')?.addEventListener('click',()=>openConnectionCirclesModal(null));
$('#connectionsCenterNewCircle')?.addEventListener('click',()=>openConnectionCirclesModal(null));
$('#connectionsCenterSearch')?.addEventListener('input',event=>{
  connectionsCenterSearch=event.currentTarget.value || '';
  clearTimeout(connectionsCenterSearchTimer);
  connectionsCenterSearchTimer=setTimeout(renderConnectionsCenter,120);
});
$('#closeConnectionCirclesModal')?.addEventListener('click',closeConnectionCirclesModal);
$('#connectionCirclesModal')?.addEventListener('click',event=>{
  if(event.target===$('#connectionCirclesModal'))closeConnectionCirclesModal();
});
$('#newCircleForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const status=$('#newCircleStatus');
  const name=String(new FormData(form).get('name') || '').trim();
  if(!name)return;
  status.textContent='Creando…';
  const result=await createConnectionCircle(name);
  if(!result.ok){status.textContent=result.message;return;}
  form.reset();
  status.textContent='Círculo creado.';
  await refreshConnectionSurfaces();
});

$('#closePostFocusModal')?.addEventListener('click', closePostFocus);
$('#postFocusModal')?.addEventListener('click', event => {
  if (event.target === $('#postFocusModal')) closePostFocus();
});

document.addEventListener('click', async event => {
  const eventScopeButton=event.target.closest('[data-event-scope]');
  if(eventScopeButton){event.preventDefault();eventScope=eventScopeButton.dataset.eventScope||'upcoming';await loadEvents();return;}
  const eventOpen=event.target.closest('[data-event-open]');
  if(eventOpen){event.preventDefault();await openEventDetail(eventOpen.dataset.eventOpen);return;}
  const eventRespond=event.target.closest('[data-event-respond]');
  if(eventRespond){event.preventDefault();event.stopPropagation();await respondToEvent(eventRespond.dataset.eventRespond,eventRespond.dataset.eventStatus);return;}
  const eventReminder=event.target.closest('[data-event-reminder]');
  if(eventReminder){
    event.preventDefault();
    const enabled=eventReminder.dataset.reminderEnabled!=='1';
    const {r}=await api(`/api/events/${eventReminder.dataset.eventReminder}/respond`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:eventReminder.dataset.eventStatus,reminderEnabled:enabled})});
    if(r.ok){toast(enabled?'Recordatorio activado':'Recordatorio desactivado');await loadEvents();if(activeEventId)await openEventDetail(activeEventId);}
    return;
  }
  const eventClear=event.target.closest('[data-event-clear-response]');
  if(eventClear){event.preventDefault();const {r}=await api(`/api/events/${eventClear.dataset.eventClearResponse}/respond`,{method:'DELETE'});if(r.ok){toast('Respuesta eliminada');await loadEvents();if(activeEventId)await openEventDetail(activeEventId);}return;}
  const eventCancel=event.target.closest('[data-event-cancel]');
  if(eventCancel){event.preventDefault();if(!window.confirm('¿Cancelar este evento?'))return;const {r}=await api(`/api/events/${eventCancel.dataset.eventCancel}`,{method:'DELETE'});if(r.ok){toast('Evento cancelado');closeEventDetail();await loadEvents();}return;}

  const discoveryMode=event.target.closest('[data-community-discovery-mode]');
  if(discoveryMode){
    event.preventDefault();
    communityDiscoveryMode=discoveryMode.dataset.communityDiscoveryMode || 'recommended';
    await loadCommunityDiscovery();
    return;
  }
  const discoveryHide=event.target.closest('[data-community-discovery-hide]');
  if(discoveryHide){
    event.preventDefault();
    event.stopPropagation();
    const id=Number(discoveryHide.dataset.communityDiscoveryHide);
    if(Number.isInteger(id) && id>0){
      const {r}=await api(`/api/communities/discover/${id}/hide`,{method:'POST'});
      if(r.ok){
        communityDiscoveryItems=communityDiscoveryItems.filter(item=>Number(item.id)!==id);
        renderCommunityDiscovery();
        toast('Sugerencia ocultada');
      }else toast('No se pudo ocultar la sugerencia.');
    }
    return;
  }
  const communityConversation=event.target.closest('[data-community-conversation]');
  if(communityConversation){
    event.preventDefault();
    showView('messages');
    await openConversation(communityConversation.dataset.communityConversation);
    return;
  }

  const closeConnectionButton=event.target.closest('[data-close-connection]');
  if(closeConnectionButton){
    event.preventDefault();
    event.stopPropagation();
    await toggleCloseConnection(Number(closeConnectionButton.dataset.closeConnection),closeConnectionButton);
    return;
  }

  const contextButton=event.target.closest('[data-connection-context]');
  if(contextButton){
    event.preventDefault();
    event.stopPropagation();
    await openConnectionContext(Number(contextButton.dataset.connectionContext));
    return;
  }

  const starterButton=event.target.closest('[data-connection-starter]');
  if(starterButton){
    event.preventDefault();
    const draft=decodeURIComponent(starterButton.dataset.connectionStarter || '');
    const username=starterButton.dataset.connectionStarterUsername || '';
    closeConnectionContextModal();
    await openConnectionMessage(username,draft);
    return;
  }

  const centerFilter=event.target.closest('[data-connection-center-filter]');
  if(centerFilter){
    event.preventDefault();
    connectionsCenterFilter=centerFilter.dataset.connectionCenterFilter || 'all';
    renderConnectionsCenter();
    return;
  }

  const centerCircle=event.target.closest('[data-connection-center-circle]');
  if(centerCircle){
    event.preventDefault();
    activeConnectionCircleId=centerCircle.dataset.connectionCenterCircle ? Number(centerCircle.dataset.connectionCenterCircle) : null;
    await loadConnectionsCenter();
    return;
  }

  const circleFilter=event.target.closest('[data-connection-circle-filter]');
  if(circleFilter){
    event.preventDefault();
    activeConnectionCircleId=circleFilter.dataset.connectionCircleFilter ? Number(circleFilter.dataset.connectionCircleFilter) : null;
    await loadConnections();
    return;
  }

  const favoriteButton=event.target.closest('[data-connection-favorite]');
  if(favoriteButton){
    event.preventDefault();
    event.stopPropagation();
    await toggleFavoriteConnection(Number(favoriteButton.dataset.connectionFavorite));
    return;
  }

  const organizeButton=event.target.closest('[data-connection-organize]');
  if(organizeButton){
    event.preventDefault();
    event.stopPropagation();
    await openConnectionCirclesModal({
      id:Number(organizeButton.dataset.connectionOrganize),
      displayName:organizeButton.dataset.connectionDisplay,
      username:organizeButton.dataset.connectionUsername
    });
    return;
  }

  const renameCircle=event.target.closest('[data-circle-rename]');
  if(renameCircle){
    event.preventDefault();
    const next=window.prompt('Nuevo nombre del círculo:',renameCircle.dataset.circleName || '');
    if(next===null)return;
    const name=String(next).trim();
    if(!name)return toast('Escribe un nombre.');
    const {r,d}=await api(`/api/profiles/connections/circles/${renameCircle.dataset.circleRename}`,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name})
    });
    if(!r.ok)return toast(d.error==='circle_name_exists' ? 'Ya existe un círculo con ese nombre.' : 'No se pudo renombrar.');
    await loadConnectionCircles();
    await loadConnectionMemberships();
    await refreshConnectionSurfaces();
    toast('Círculo renombrado');
    return;
  }

  const deleteCircle=event.target.closest('[data-circle-delete]');
  if(deleteCircle){
    event.preventDefault();
    if(!window.confirm(`¿Eliminar el círculo “${deleteCircle.dataset.circleName || ''}”? Las conexiones no se eliminarán.`))return;
    const {r}=await api(`/api/profiles/connections/circles/${deleteCircle.dataset.circleDelete}`,{method:'DELETE'});
    if(!r.ok)return toast('No se pudo eliminar el círculo.');
    if(String(activeConnectionCircleId)===String(deleteCircle.dataset.circleDelete))activeConnectionCircleId=null;
    await loadConnectionCircles();
    await loadConnectionMemberships();
    await refreshConnectionSurfaces();
    toast('Círculo eliminado');
    return;
  }

  const connectionMessage=event.target.closest('[data-connection-message]');
  if(connectionMessage){event.preventDefault();event.stopPropagation();await openConnectionMessage(connectionMessage.dataset.connectionMessage);return;}

  const pulseAction=event.target.closest('[data-return-pulse-action]');
  if(pulseAction){event.preventDefault();await handleReturnPulseAction(pulseAction.dataset.returnPulseAction);return;}

  const hidePerson=event.target.closest('[data-discovery-hide-person]');
  if(hidePerson){event.preventDefault();event.stopPropagation();await hideDiscoveryPerson(hidePerson);return;}

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
      <b>${post.audience === 'vip' ? '★ VIP · ' : post.audience === 'connections' ? '◎ Conexiones · ' : post.audience === 'circles' ? '◉ Círculos · ' : ''}${post.post_kind === 'reel' ? 'Reel' : 'Publicación'} · ${Number(post.engagement_count_30d || 0)} interacciones</b>
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
        <b>${post.audience === 'vip' ? '★ Solo VIP · ' : post.audience === 'connections' ? '◎ Solo conexiones · ' : post.audience === 'circles' ? '◉ Círculos privados · ' : ''}${post.featured ? 'Destacada' : (post.post_kind === 'reel' ? 'Reel' : 'Publicación')}</b>
        <small>${compactTimeAgo(post.created_at)} · ${interactions} interacciones · ${Number(post.save_count || 0)} guardados</small>
      </span>
    </button>
    <div class="creator-published-editorial">
      <input type="date" data-editorial-date="${post.id}" value="${esc(post.editorial_date || '')}" title="Fecha editorial privada">
      <input type="text" maxlength="40" data-editorial-label="${post.id}" value="${esc(post.editorial_label || '')}" placeholder="Etiqueta interna">
      <button type="button" class="tiny-action" data-editorial-save="${post.id}">Guardar organización</button>
    </div>
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
      <p>${esc(String(post.caption || post.community_prompt || '').trim() || (post.post_kind==='reel' ? 'Reel sin texto' : 'Publicación sin texto'))}</p>
      <small>${post.community_type==='poll' ? 'Encuesta · ' : post.community_type==='question' ? 'Pregunta · ' : ''}${post.content_level==='normal' ? 'Normal' : post.content_level==='sensitive' ? 'Sensible' : 'Desnudez'}${Number(post.pending_consent_count || 0)>0 ? ` · ${Number(post.pending_consent_count)} consentimientos pendientes` : ''}</small>
      <div class="creator-editorial-fields">
        <input type="date" data-editorial-date="${post.id}" value="${esc(post.editorial_date || '')}" title="Fecha editorial privada">
        <input type="text" maxlength="40" data-editorial-label="${post.id}" value="${esc(post.editorial_label || '')}" placeholder="Etiqueta interna">
        <button type="button" class="tiny-action" data-editorial-save="${post.id}">Guardar organización</button>
      </div>
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


function localYmd(value) {
  if(value instanceof Date){
    const y=value.getFullYear();
    const m=String(value.getMonth()+1).padStart(2,'0');
    const d=String(value.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const date=value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? localYmd(date) : '';
}

function creatorCalendarRange() {
  const start=new Date(creatorCalendarMonth.getFullYear(),creatorCalendarMonth.getMonth(),1);
  const end=new Date(creatorCalendarMonth.getFullYear(),creatorCalendarMonth.getMonth()+1,1);
  return {
    start,
    end,
    from:start.toISOString(),
    to:end.toISOString(),
    dateFrom:localYmd(start),
    dateTo:localYmd(end)
  };
}

function creatorCalendarEffectiveDate(post) {
  if(post.editorial_date)return String(post.editorial_date).slice(0,10);
  if(post.creator_state==='scheduled' && post.scheduled_for)return localYmd(post.scheduled_for);
  if(post.creator_state==='live' && post.created_at)return localYmd(post.created_at);
  return '';
}

function creatorCalendarState(post) {
  return post.creator_state==='draft'
    ? 'draft'
    : post.creator_state==='scheduled'
      ? 'scheduled'
      : 'live';
}

function renderCreatorCalendar() {
  const grid=$('#creatorCalendarGrid');
  if(!grid)return;

  const range=creatorCalendarRange();
  const audience=$('#creatorCalendarAudience')?.value || 'all';
  const label=$('#creatorCalendarLabel')?.value || '';
  const filtered=creatorCalendarPosts.filter(post=>
    (audience==='all' || post.audience===audience) &&
    (!label || String(post.editorial_label || '')===label)
  );

  const byDate=new Map();
  for(const post of filtered){
    const date=creatorCalendarEffectiveDate(post);
    if(!date)continue;
    if(!byDate.has(date))byDate.set(date,[]);
    byDate.get(date).push(post);
  }

  if($('#creatorCalendarMonth')){
    $('#creatorCalendarMonth').textContent=range.start.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  }

  const firstOffset=(range.start.getDay()+6)%7;
  const gridStart=new Date(range.start);
  gridStart.setDate(gridStart.getDate()-firstOffset);

  const today=localYmd(new Date());
  const cells=[];
  for(let i=0;i<42;i++){
    const day=new Date(gridStart);
    day.setDate(gridStart.getDate()+i);
    const key=localYmd(day);
    const posts=byDate.get(key) || [];
    const inMonth=day.getMonth()===range.start.getMonth();
    const visible=posts.slice(0,3);
    cells.push(`<div class="creator-calendar-day ${inMonth ? '' : 'outside'} ${key===today ? 'today' : ''}">
      <span class="creator-calendar-day-number">${day.getDate()}</span>
      <div class="creator-calendar-events">
        ${visible.map(post=>{
          const state=creatorCalendarState(post);
          const labelText=String(post.editorial_label || '').trim();
          const title=String(post.caption || post.community_prompt || '').trim() || (post.post_kind==='reel' ? 'Reel' : 'Publicación');
          return `<button type="button" class="creator-calendar-event ${state} ${post.audience==='vip' ? 'vip' : ''}" data-calendar-post="${post.id}" data-calendar-state="${state}" title="${esc(title)}">
            <b>${post.audience==='vip' ? '★ ' : ''}${esc(title.slice(0,34))}</b>
            ${labelText ? `<small>${esc(labelText)}</small>` : ''}
          </button>`;
        }).join('')}
        ${posts.length>3 ? `<small class="creator-calendar-more">+${posts.length-3} más</small>` : ''}
      </div>
    </div>`);
  }
  grid.innerHTML=cells.join('');

  all('[data-calendar-post]',grid).forEach(button=>{
    button.onclick=async()=>{
      const id=button.dataset.calendarPost;
      if(button.dataset.calendarState==='live'){
        await openPostFocus(id);
        return;
      }
      const item=document.querySelector(`[data-publishing-now="${CSS.escape(String(id))}"]`)?.closest('.creator-publishing-item');
      item?.scrollIntoView({behavior:'smooth',block:'center'});
      item?.classList.add('calendar-focus');
      setTimeout(()=>item?.classList.remove('calendar-focus'),1200);
    };
  });
}

async function loadCreatorCalendar() {
  const grid=$('#creatorCalendarGrid');
  if(!grid)return;
  grid.innerHTML='<div class="mini-loading creator-calendar-loading">Cargando calendario...</div>';

  const range=creatorCalendarRange();
  const qs=new URLSearchParams({
    from:range.from,
    to:range.to,
    dateFrom:range.dateFrom,
    dateTo:range.dateTo
  });
  const { r,d }=await api(`/api/posts/creator/calendar?${qs.toString()}`);
  if(!r.ok){
    grid.innerHTML='<div class="creator-empty compact">No se pudo cargar el calendario editorial.</div>';
    return;
  }

  creatorCalendarPosts=Array.isArray(d.posts) ? d.posts : [];
  const select=$('#creatorCalendarLabel');
  if(select){
    const current=select.value;
    select.innerHTML='<option value="">Todas las etiquetas</option>' +
      (Array.isArray(d.labels) ? d.labels : []).map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
    if([...select.options].some(option=>option.value===current))select.value=current;
  }
  renderCreatorCalendar();
}

function creatorActivityActorHTML(actor = {}) {
  const name=actor.display_name || actor.username || 'Cuenta eliminada';
  const avatar=actor.avatar_url ? `<img src="${esc(actor.avatar_url)}" alt="">` : initials(name);
  if(actor.username){
    return `<button type="button" class="creator-activity-actor" data-profile-username="${esc(actor.username)}">
      <span class="creator-activity-avatar">${avatar}</span>
      <span><b>${esc(name)} ${actor.creator_verified ? '<span class="verified">✓</span>' : ''}</b><small>@${esc(actor.username)}</small></span>
    </button>`;
  }
  return `<div class="creator-activity-actor">
    <span class="creator-activity-avatar">${avatar}</span>
    <span><b>${esc(name)}</b><small>Cuenta no disponible</small></span>
  </div>`;
}

function creatorActivityItemHTML(group,item) {
  const isPoll=group.kind==='poll';
  const management=item.management || {};
  const priority=management.priority==='high' ? 'high' : 'normal';
  const followUp=management.follow_up===true;
  const followUpValue=management.follow_up_at ? toLocalDateTimeInput(management.follow_up_at) : '';
  let detail='';
  if(isPoll){
    detail=item.interaction?.withdrawn
      ? '<span class="creator-activity-withdrawn">Voto retirado</span>'
      : `Votó: <b>${esc(item.interaction?.option_label || 'Opción')}</b>`;
  }else{
    detail=item.interaction?.withdrawn
      ? '<span class="creator-activity-withdrawn">Respuesta retirada</span>'
      : `<span class="creator-activity-response-copy">${esc(item.interaction?.body || '')}</span>`;
  }
  return `<div class="creator-activity-item ${item.reviewed_at ? 'reviewed' : 'pending'} ${priority==='high' ? 'high-priority' : ''} ${followUp ? 'follow-up' : ''}">
    ${creatorActivityActorHTML(item.actor)}
    <div class="creator-activity-item-copy">
      <div class="creator-activity-private-flags">
        ${priority==='high' ? '<span class="creator-activity-priority-badge">Prioridad alta</span>' : ''}
        ${followUp ? `<span class="creator-activity-followup-badge">Seguimiento${followUpValue ? ` · ${esc(new Date(management.follow_up_at).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}))}` : ''}</span>` : ''}
      </div>
      <p>${detail}</p>
      <small>${timeAgo(item.created_at)}${item.reviewed_at ? ' · Revisado' : ' · Pendiente'}${management.note ? ' · Nota privada' : ''}</small>
    </div>
    <div class="creator-activity-item-actions">
      ${item.reviewed_at ? '' : `<button type="button" class="tiny-action" data-creator-activity-review-id="${item.notification_id}">Revisado</button>`}
      <details class="creator-activity-private-editor">
        <summary>Gestionar</summary>
        <div class="creator-activity-private-form">
          <label>Prioridad
            <select data-activity-priority="${item.notification_id}">
              <option value="normal" ${priority==='normal' ? 'selected' : ''}>Normal</option>
              <option value="high" ${priority==='high' ? 'selected' : ''}>Alta</option>
            </select>
          </label>
          <label class="creator-activity-followup-toggle">
            <input type="checkbox" data-activity-followup="${item.notification_id}" ${followUp ? 'checked' : ''}>
            Dejar en seguimiento
          </label>
          <label>Recordar para
            <input type="datetime-local" data-activity-followup-at="${item.notification_id}" value="${esc(followUpValue)}" ${followUp ? '' : 'disabled'}>
          </label>
          <label>Nota privada
            <textarea maxlength="1000" data-activity-note="${item.notification_id}" placeholder="Solo tú puedes ver esta nota...">${esc(management.note || '')}</textarea>
          </label>
          <button type="button" class="tiny-action primary-soft" data-activity-meta-save="${item.notification_id}">Guardar seguimiento</button>
        </div>
      </details>
    </div>
  </div>`;
}

function renderCreatorCommunityActivity(data = {}) {
  creatorCommunityActivityData=data;
  const pending=Number(data.pendingCount || 0);
  const badge=$('#creatorActivityPendingBadge');
  if(badge){
    badge.textContent=`${pending} ${pending===1 ? 'pendiente' : 'pendientes'}`;
    badge.classList.toggle('hidden',pending===0);
  }
  const reviewAll=$('#creatorActivityReviewAll');
  if(reviewAll)reviewAll.disabled=pending===0;
  if($('#creatorActivityHighCount')){
    const count=Number(data.highPriorityCount || 0);
    $('#creatorActivityHighCount').textContent=`${count} ${count===1 ? 'alta' : 'altas'}`;
  }
  if($('#creatorActivityFollowUpCount')){
    const count=Number(data.followUpCount || 0);
    $('#creatorActivityFollowUpCount').textContent=`${count} seguimiento`;
  }
  if($('#creatorActivityFocus'))$('#creatorActivityFocus').value=creatorCommunityActivityFocus;

  all('[data-creator-activity-status]').forEach(button=>{
    button.classList.toggle('active',button.dataset.creatorActivityStatus===creatorCommunityActivityStatus);
  });

  const root=$('#creatorActivityGroups');
  if(!root)return;
  const groups=Array.isArray(data.groups) ? data.groups : [];
  if(!groups.length){
    root.innerHTML=creatorCommunityActivityStatus==='pending'
      ? '<div class="creator-empty compact">No tienes participación pendiente de revisar.</div>'
      : '<div class="creator-empty compact">No hay actividad en este filtro.</div>';
    return;
  }

  root.innerHTML=groups.map(group=>{
    const items=Array.isArray(group.items) ? group.items : [];
    const visible=items.slice(0,6);
    const extra=Math.max(0,items.length-visible.length);
    const state=group.tool_status==='archived'
      ? 'Archivada'
      : group.tool_is_open ? 'Abierta' : 'Cerrada';
    return `<article class="creator-activity-group ${group.pending_count ? 'has-pending' : 'reviewed'}">
      <div class="creator-activity-group-head">
        <div>
          <span class="eyebrow">${group.kind==='poll' ? 'ENCUESTA' : 'PREGUNTA ABIERTA'} · ${group.audience==='vip' ? '★ VIP' : 'PÚBLICO'}</span>
          <b>${esc(group.prompt || 'Actividad de comunidad')}</b>
          <small>${state} · ${Number(group.total_count || 0)} participaciones · ${Number(group.pending_count || 0)} pendientes</small>
        </div>
        <div class="creator-activity-group-actions">
          <button type="button" class="tiny-action" data-open-post="${group.post_id}">Ver publicación</button>
          ${group.pending_count ? `<button type="button" class="tiny-action primary-soft" data-creator-activity-review-group="${esc(group.key)}">Marcar grupo revisado</button>` : ''}
        </div>
      </div>
      <div class="creator-activity-items">
        ${visible.map(item=>creatorActivityItemHTML(group,item)).join('')}
        ${extra ? `<small class="creator-activity-more">+${extra} participaciones agrupadas</small>` : ''}
      </div>
    </article>`;
  }).join('');
}

async function loadCreatorCommunityActivity() {
  const root=$('#creatorActivityGroups');
  if(root)root.innerHTML='<div class="mini-loading">Cargando actividad...</div>';
  const qs=new URLSearchParams({
    status:creatorCommunityActivityStatus,
    focus:creatorCommunityActivityFocus
  });
  const { r,d }=await api(`/api/posts/creator/community-activity?${qs.toString()}`);
  if(!r.ok){
    if(root)root.innerHTML='<div class="creator-empty compact">No se pudo cargar el centro de actividad.</div>';
    return false;
  }
  renderCreatorCommunityActivity(d);
  return true;
}

function creatorFollowUpWindowLabel(value) {
  return ({
    overdue:'Vencido',
    today:'Hoy',
    week:'Próximos 7 días',
    later:'Más adelante',
    undated:'Sin fecha',
    completed:'Completado'
  })[value] || 'Seguimiento';
}

function creatorFollowUpPresetIso(preset) {
  const date=new Date();
  if(preset==='hour'){
    date.setTime(date.getTime()+60*60*1000);
    return date.toISOString();
  }
  if(preset==='tomorrow'){
    date.setDate(date.getDate()+1);
    date.setHours(9,0,0,0);
    return date.toISOString();
  }
  if(preset==='week'){
    date.setDate(date.getDate()+7);
    return date.toISOString();
  }
  if(preset==='undated')return null;
  return undefined;
}

function syncCreatorFollowUpBulkOptions() {
  const select=$('#creatorFollowUpBulkAction');
  if(!select)return;
  const completed=creatorFollowUpStatus==='completed';
  select.innerHTML=completed
    ? `<option value="">Acción masiva…</option>
       <option value="priority_high">Prioridad alta</option>
       <option value="priority_normal">Prioridad normal</option>
       <option value="mark_reviewed">Marcar revisado</option>
       <option value="reopen">Reabrir seguimiento</option>`
    : `<option value="">Acción masiva…</option>
       <option value="priority_high">Prioridad alta</option>
       <option value="priority_normal">Prioridad normal</option>
       <option value="mark_reviewed">Marcar revisado</option>
       <option value="reschedule_hour">Reprogramar +1 hora</option>
       <option value="reschedule_tomorrow">Reprogramar mañana 09:00</option>
       <option value="reschedule_week">Reprogramar +7 días</option>
       <option value="reschedule_undated">Dejar sin fecha</option>
       <option value="close_follow_up">Completar seguimiento</option>`;
}

async function patchCreatorFollowUps(notificationIds,action,followUpAt=undefined) {
  const body={notificationIds,action};
  if(action==='reschedule')body.followUpAt=followUpAt;
  return api('/api/posts/creator/community-follow-ups/bulk',{
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
}

function creatorFollowUpItemHTML(item) {
  const completed=Boolean(item.completed_at);
  const due=item.follow_up_at ? new Date(item.follow_up_at) : null;
  const completedAt=item.completed_at ? new Date(item.completed_at) : null;
  const dueLabel=due && Number.isFinite(due.getTime())
    ? due.toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
    : 'Sin fecha';
  const completedLabel=completedAt && Number.isFinite(completedAt.getTime())
    ? completedAt.toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
    : '';
  const timing=completed
    ? `Programado: ${esc(dueLabel)} · Completado: ${esc(completedLabel)}`
    : `${esc(dueLabel)}${item.reviewed_at ? ' · Revisado' : ' · Pendiente'}`;
  const workflowActions=completed
    ? `<button type="button" class="tiny-action primary-soft" data-followup-reopen="${item.notification_id}">Reabrir seguimiento</button>`
    : `<select class="creator-followup-reschedule" data-followup-reschedule="${item.notification_id}" aria-label="Reprogramar seguimiento">
         <option value="">Reprogramar…</option>
         <option value="hour">+1 hora</option>
         <option value="tomorrow">Mañana 09:00</option>
         <option value="week">+7 días</option>
         <option value="undated">Sin fecha</option>
       </select>
       <button type="button" class="tiny-action primary-soft" data-followup-complete="${item.notification_id}">Completar seguimiento</button>`;

  return `<article class="creator-followup-item ${item.priority==='high' ? 'high-priority' : ''} ${item.follow_up_window==='overdue' ? 'overdue' : ''} ${completed ? 'completed' : ''}">
    <label class="creator-followup-check">
      <input type="checkbox" data-followup-select="${item.notification_id}">
    </label>
    <div class="creator-followup-main">
      <div class="creator-followup-item-head">
        <div>
          <span class="eyebrow">${item.type==='creator_poll_vote' ? 'ENCUESTA' : 'PREGUNTA'} · ${item.audience==='vip' ? '★ VIP' : 'PÚBLICO'}</span>
          <b>${esc(item.prompt || 'Actividad de comunidad')}</b>
        </div>
        <div class="creator-followup-badges">
          ${item.priority==='high' ? '<span class="creator-activity-priority-badge">Prioridad alta</span>' : ''}
          <span class="creator-followup-window-badge ${esc(item.follow_up_window || 'undated')}">${esc(creatorFollowUpWindowLabel(item.follow_up_window))}</span>
        </div>
      </div>
      <div class="creator-followup-actor-row">
        ${creatorActivityActorHTML(item.actor)}
        <span class="creator-followup-due">${timing}</span>
      </div>
      <div class="creator-followup-note">
        <small>Nota privada</small>
        <p>${item.private_note ? esc(item.private_note) : '<span class="creator-followup-note-empty">Sin nota privada</span>'}</p>
      </div>
      <div class="creator-followup-item-actions">
        <button type="button" class="tiny-action" data-open-post="${item.post_id}">Ver publicación</button>
        <button type="button" class="tiny-action" data-followup-open-activity="${item.notification_id}">Abrir en actividad</button>
        ${workflowActions}
      </div>
    </div>
  </article>`;
}

function updateCreatorFollowUpBulkState() {
  const selected=all('[data-followup-select]:checked',$('#creatorFollowUpList'));
  const count=selected.length;
  if($('#creatorFollowUpSelectedCount'))$('#creatorFollowUpSelectedCount').textContent=`${count} ${count===1 ? 'seleccionado' : 'seleccionados'}`;
  const action=$('#creatorFollowUpBulkAction')?.value || '';
  const apply=$('#creatorFollowUpBulkApply');
  if(apply)apply.disabled=!count || !action;
  const allBoxes=all('[data-followup-select]',$('#creatorFollowUpList'));
  const selectAll=$('#creatorFollowUpSelectAll');
  if(selectAll){
    selectAll.checked=Boolean(allBoxes.length && count===allBoxes.length);
    selectAll.indeterminate=Boolean(count && count<allBoxes.length);
  }
}

function renderCreatorFollowUps(data = {}) {
  creatorFollowUpData=data;
  const summary=data.summary || {};
  if($('#creatorFollowUpSummary')){
    $('#creatorFollowUpSummary').innerHTML=(creatorFollowUpStatus==='completed'
      ? [
          creatorMetric('Completados',summary.completed_total || 0),
          creatorMetric('Últimos 30 días',summary.completed_30d || 0),
          creatorMetric('Activos',summary.total || 0),
          creatorMetric('Vencidos',summary.overdue || 0),
          creatorMetric('Hoy',summary.today || 0)
        ]
      : [
          creatorMetric('Seguimientos',summary.total || 0),
          creatorMetric('Vencidos',summary.overdue || 0),
          creatorMetric('Hoy',summary.today || 0),
          creatorMetric('Próximos 7 días',summary.week || 0),
          creatorMetric('Prioridad alta',summary.high_priority || 0)
        ]).join('');
  }

  all('[data-followup-status]').forEach(button=>{
    button.classList.toggle('active',button.dataset.followupStatus===creatorFollowUpStatus);
  });
  all('[data-followup-window]').forEach(button=>{
    button.classList.toggle('active',creatorFollowUpStatus==='active' && button.dataset.followupWindow===creatorFollowUpWindow);
    button.disabled=creatorFollowUpStatus==='completed';
  });
  $('#creatorFollowUpWindowTabs')?.classList.toggle('is-disabled',creatorFollowUpStatus==='completed');
  if($('#creatorFollowUpSearch') && $('#creatorFollowUpSearch').value!==creatorFollowUpSearch){
    $('#creatorFollowUpSearch').value=creatorFollowUpSearch;
  }
  if($('#creatorFollowUpPriority'))$('#creatorFollowUpPriority').value=creatorFollowUpPriority;
  syncCreatorFollowUpBulkOptions();

  const root=$('#creatorFollowUpList');
  if(!root)return;
  const items=Array.isArray(data.items) ? data.items : [];
  root.innerHTML=items.length
    ? items.map(creatorFollowUpItemHTML).join('')
    : `<div class="creator-empty compact">${creatorFollowUpStatus==='completed' ? 'Todavía no hay seguimientos completados.' : 'No hay seguimientos para este filtro.'}</div>`;
  updateCreatorFollowUpBulkState();
}

async function loadCreatorFollowUps() {
  const root=$('#creatorFollowUpList');
  if(root)root.innerHTML='<div class="mini-loading">Cargando seguimientos...</div>';
  const dayEnd=new Date();
  dayEnd.setHours(24,0,0,0);
  const qs=new URLSearchParams({
    status:creatorFollowUpStatus,
    window:creatorFollowUpStatus==='completed' ? 'all' : creatorFollowUpWindow,
    priority:creatorFollowUpPriority,
    q:creatorFollowUpSearch,
    dayEnd:dayEnd.toISOString()
  });
  const { r,d }=await api(`/api/posts/creator/community-follow-ups?${qs.toString()}`);
  if(!r.ok){
    if(root)root.innerHTML='<div class="creator-empty compact">No se pudo cargar el dashboard de seguimiento.</div>';
    return false;
  }
  renderCreatorFollowUps(d);
  return true;
}

all('[data-followup-status]').forEach(button=>{
  button.addEventListener('click',async()=>{
    creatorFollowUpStatus=button.dataset.followupStatus || 'active';
    creatorFollowUpWindow='all';
    await loadCreatorFollowUps();
  });
});

all('[data-followup-window]').forEach(button=>{
  button.addEventListener('click',async()=>{
    if(creatorFollowUpStatus!=='active')return;
    creatorFollowUpWindow=button.dataset.followupWindow || 'all';
    await loadCreatorFollowUps();
  });
});

$('#creatorFollowUpPriority')?.addEventListener('change',async event=>{
  creatorFollowUpPriority=event.currentTarget.value || 'all';
  await loadCreatorFollowUps();
});

$('#creatorFollowUpSearch')?.addEventListener('input',event=>{
  creatorFollowUpSearch=String(event.currentTarget.value || '').trim();
  if(creatorFollowUpSearchTimer)clearTimeout(creatorFollowUpSearchTimer);
  creatorFollowUpSearchTimer=setTimeout(()=>loadCreatorFollowUps(),280);
});

$('#creatorFollowUpSelectAll')?.addEventListener('change',event=>{
  all('[data-followup-select]',$('#creatorFollowUpList')).forEach(box=>{
    box.checked=event.currentTarget.checked;
  });
  updateCreatorFollowUpBulkState();
});

$('#creatorFollowUpBulkAction')?.addEventListener('change',updateCreatorFollowUpBulkState);

document.addEventListener('change',async event=>{
  if(event.target.matches('[data-followup-select]')){
    updateCreatorFollowUpBulkState();
    return;
  }
  const reschedule=event.target.closest('[data-followup-reschedule]');
  if(!reschedule || !reschedule.value)return;
  const preset=reschedule.value;
  const followUpAt=creatorFollowUpPresetIso(preset);
  reschedule.disabled=true;
  try{
    const { r }=await patchCreatorFollowUps([reschedule.dataset.followupReschedule],'reschedule',followUpAt);
    if(!r.ok)throw new Error('No se pudo reprogramar el seguimiento.');
    toast(preset==='undated' ? 'Seguimiento sin fecha' : 'Seguimiento reprogramado');
    await Promise.all([loadCreatorFollowUps(),loadCreatorCommunityActivity()]);
  }catch(error){
    toast(error.message || 'No se pudo reprogramar el seguimiento.');
    reschedule.disabled=false;
    reschedule.value='';
  }
});

$('#creatorFollowUpBulkApply')?.addEventListener('click',async()=>{
  const button=$('#creatorFollowUpBulkApply');
  const selectedAction=$('#creatorFollowUpBulkAction')?.value || '';
  const ids=all('[data-followup-select]:checked',$('#creatorFollowUpList')).map(box=>box.dataset.followupSelect);
  if(!button || !selectedAction || !ids.length)return;
  if(selectedAction==='close_follow_up' && !window.confirm(`¿Completar ${ids.length} seguimientos seleccionados?`))return;

  let action=selectedAction;
  let followUpAt;
  if(selectedAction.startsWith('reschedule_')){
    action='reschedule';
    followUpAt=creatorFollowUpPresetIso(selectedAction.replace('reschedule_',''));
  }

  button.disabled=true;
  try{
    const { r,d }=await patchCreatorFollowUps(ids,action,followUpAt);
    if(!r.ok)throw new Error(d.error==='invalid_follow_up_bulk_action' ? 'Acción masiva no válida.' : 'No se pudo aplicar la acción.');
    const labels={
      priority_high:'Prioridad alta aplicada',
      priority_normal:'Prioridad normal aplicada',
      mark_reviewed:'Actividad marcada como revisada',
      close_follow_up:'Seguimientos completados',
      reopen:'Seguimientos reabiertos',
      reschedule:'Seguimientos reprogramados'
    };
    toast(labels[action] || 'Seguimientos actualizados');
    if($('#creatorFollowUpBulkAction'))$('#creatorFollowUpBulkAction').value='';
    await Promise.all([loadCreatorFollowUps(),loadCreatorCommunityActivity()]);
  }catch(error){
    toast(error.message || 'No se pudo actualizar el seguimiento.');
  }finally{
    button.disabled=false;
    updateCreatorFollowUpBulkState();
  }
});

document.addEventListener('click',async event=>{
  const workflowButton=event.target.closest('[data-followup-complete],[data-followup-reopen]');
  if(workflowButton){
    event.preventDefault();
    event.stopPropagation();
    const reopening=workflowButton.hasAttribute('data-followup-reopen');
    const notificationId=reopening ? workflowButton.dataset.followupReopen : workflowButton.dataset.followupComplete;
    workflowButton.disabled=true;
    try{
      const { r }=await patchCreatorFollowUps([notificationId],reopening ? 'reopen' : 'close_follow_up');
      if(!r.ok)throw new Error(reopening ? 'No se pudo reabrir el seguimiento.' : 'No se pudo completar el seguimiento.');
      toast(reopening ? 'Seguimiento reabierto' : 'Seguimiento completado');
      await Promise.all([loadCreatorFollowUps(),loadCreatorCommunityActivity()]);
    }catch(error){
      toast(error.message || 'No se pudo actualizar el seguimiento.');
      workflowButton.disabled=false;
    }
    return;
  }

  const button=event.target.closest('[data-followup-open-activity]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  creatorCommunityActivityStatus='all';
  creatorCommunityActivityFocus=creatorFollowUpStatus==='completed' ? 'all' : 'followup';
  if($('#creatorActivityFocus'))$('#creatorActivityFocus').value=creatorCommunityActivityFocus;
  await loadCreatorCommunityActivity();
  document.querySelector('.creator-activity-center')?.scrollIntoView({behavior:'smooth',block:'start'});
});

function communityStateBadge(status,isOpen) {
  if(status==='archived')return '<span class="creator-community-state archived">Archivada</span>';
  return isOpen
    ? '<span class="creator-community-state open">Abierta</span>'
    : '<span class="creator-community-state closed">Cerrada</span>';
}

function creatorQuestionResponsesHTML(items = []) {
  if(!items.length)return '<div class="creator-empty compact">No hay respuestas para este filtro.</div>';
  return items.map(item=>`<article class="creator-community-response ${item.creator_starred ? 'starred' : ''}">
    <div class="creator-community-response-head">
      ${profileLink(item.username,`<span class="creator-audience-avatar">${avatarHTML(item)}</span>`,'creator-audience-profile')}
      <div>
        ${profileLink(item.username,`<b>${esc(item.display_name)} ${item.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`,'creator-audience-profile')}
        <small>@${esc(item.username)} · ${timeAgo(item.updated_at || item.created_at)}</small>
      </div>
      <span class="creator-community-audience">${item.audience==='vip' ? '★ VIP' : 'Público'}</span>
    </div>
    <div class="creator-community-response-state">
      ${communityStateBadge(item.question_status,item.question_is_open)}
      ${item.creator_starred ? '<span class="creator-community-star">★ Destacada</span>' : ''}
    </div>
    <strong>${esc(item.prompt)}</strong>
    <p>${esc(item.body)}</p>
    <div class="creator-community-actions">
      <button type="button" class="tiny-action" data-community-star-response="${item.id}" data-starred="${item.creator_starred ? '1' : '0'}">${item.creator_starred ? 'Quitar destacada' : '★ Destacar'}</button>
      <button type="button" class="tiny-action" data-open-post="${item.post_id}">Ver publicación</button>
    </div>
  </article>`).join('');
}

function creatorPollSummariesHTML(items = []) {
  if(!items.length)return '<div class="creator-empty compact">No hay encuestas para este filtro.</div>';
  return items.map(item=>{
    const total=Number(item.total_votes || 0);
    const archived=item.status==='archived';
    return `<article class="creator-poll-summary ${archived ? 'archived' : ''}">
      <div class="creator-poll-summary-head">
        <b>${esc(item.question)}</b>
        <span>${item.audience==='vip' ? '★ VIP' : 'Público'}</span>
      </div>
      <div class="creator-community-response-state">
        ${communityStateBadge(item.status,item.is_open)}
        <small>${total} ${total===1 ? 'voto' : 'votos'} · ${timeAgo(item.created_at)}</small>
      </div>
      <div class="creator-poll-summary-options">
        ${(item.options || []).map(option=>{
          const count=Number(option.vote_count || 0);
          const pct=total ? Math.round((count/total)*100) : 0;
          return `<div><span><b>${esc(option.label)}</b><small>${pct}% · ${count}</small></span><i><em style="width:${pct}%"></em></i></div>`;
        }).join('')}
      </div>
      <div class="creator-community-actions">
        ${archived
          ? `<button type="button" class="tiny-action" data-community-poll-action="restore" data-community-poll-id="${item.id}">Restaurar</button>`
          : `<button type="button" class="tiny-action" data-community-poll-action="${item.is_open ? 'close' : 'reopen'}" data-community-poll-id="${item.id}">${item.is_open ? 'Cerrar' : 'Reabrir'}</button>
             <button type="button" class="tiny-action danger-soft" data-community-poll-action="archive" data-community-poll-id="${item.id}">Archivar</button>`}
        <button type="button" class="tiny-action" data-open-post="${item.post_id}">Ver publicación</button>
      </div>
    </article>`;
  }).join('');
}

function creatorQuestionSummariesHTML(items = []) {
  if(!items.length)return '<div class="creator-empty compact">No hay preguntas para este filtro.</div>';
  return items.map(item=>{
    const archived=item.status==='archived';
    return `<article class="creator-question-summary ${archived ? 'archived' : ''}">
      <div class="creator-poll-summary-head">
        <b>${esc(item.prompt)}</b>
        <span>${item.audience==='vip' ? '★ VIP' : 'Público'}</span>
      </div>
      <div class="creator-community-response-state">
        ${communityStateBadge(item.status,item.is_open)}
        <small>${Number(item.response_count || 0)} respuestas · ★ ${Number(item.starred_count || 0)}</small>
      </div>
      <div class="creator-community-actions">
        ${archived
          ? `<button type="button" class="tiny-action" data-community-question-action="restore" data-community-question-id="${item.question_id}">Restaurar</button>`
          : `<button type="button" class="tiny-action" data-community-question-action="${item.is_open ? 'close' : 'reopen'}" data-community-question-id="${item.question_id}">${item.is_open ? 'Cerrar' : 'Reabrir'}</button>
             <button type="button" class="tiny-action danger-soft" data-community-question-action="archive" data-community-question-id="${item.question_id}">Archivar</button>`}
        <button type="button" class="tiny-action" data-open-post="${item.post_id}">Ver publicación</button>
      </div>
    </article>`;
  }).join('');
}

function renderCreatorCommunity(data = {}) {
  creatorCommunityData=data;
  const summary=data.summary || {};

  if($('#creatorCommunitySummary')){
    $('#creatorCommunitySummary').innerHTML=[
      creatorMetric('Activas',Number(summary.active_poll_count || 0)+Number(summary.active_question_count || 0)),
      creatorMetric('Archivadas',Number(summary.archived_poll_count || 0)+Number(summary.archived_question_count || 0)),
      creatorMetric('Participaciones',Number(summary.vote_count || 0)+Number(summary.response_count || 0)),
      creatorMetric('Respuestas destacadas',summary.starred_response_count || 0)
    ].join('');
  }

  const status=creatorCommunityStatus;
  const statusMatch=item=>status==='all' || item.status===status;
  const responseStatusMatch=item=>status==='all' || item.question_status===status;

  const responses=(Array.isArray(data.responses) ? data.responses : [])
    .filter(item=>responseStatusMatch(item))
    .filter(item=>!creatorCommunityStarredOnly || item.creator_starred===true);
  const polls=(Array.isArray(data.polls) ? data.polls : []).filter(statusMatch);
  const questions=(Array.isArray(data.questions) ? data.questions : []).filter(statusMatch);

  if($('#creatorQuestionResponses'))$('#creatorQuestionResponses').innerHTML=creatorQuestionResponsesHTML(responses);
  if($('#creatorPollSummaries'))$('#creatorPollSummaries').innerHTML=creatorPollSummariesHTML(polls);
  if($('#creatorQuestionSummaries'))$('#creatorQuestionSummaries').innerHTML=creatorQuestionSummariesHTML(questions);
}


function renderCreatorCommunityInsights(data = {}) {
  const summary=data.summary || {};
  const votes7=Number(summary.votes_7d || 0);
  const votes30=Number(summary.votes_30d || 0);
  const responses7=Number(summary.responses_7d || 0);
  const responses30=Number(summary.responses_30d || 0);
  const activity7=votes7+responses7;
  const activity30=votes30+responses30;

  if($('#creatorCommunityInsights')){
    $('#creatorCommunityInsights').innerHTML=[
      creatorMetric('Participación · 7 días',activity7),
      creatorMetric('Participación · 30 días',activity30),
      creatorMetric('Personas únicas · 30 días',summary.participants_30d || 0),
      creatorMetric('Votos / respuestas · 30 días',`${votes30} / ${responses30}`)
    ].join('');
  }

  const trend=Array.isArray(data.trend) ? data.trend : [];
  if($('#creatorCommunityTrend')){
    if(!trend.length){
      $('#creatorCommunityTrend').innerHTML='<div class="creator-empty compact">Todavía no hay suficiente actividad para mostrar evolución.</div>';
    }else{
      const max=Math.max(1,...trend.map(item=>Number(item.votes || 0)+Number(item.responses || 0)));
      $('#creatorCommunityTrend').innerHTML=trend.map(item=>{
        const votes=Number(item.votes || 0);
        const responses=Number(item.responses || 0);
        const total=votes+responses;
        const height=Math.max(total ? 8 : 2,Math.round((total/max)*100));
        const voteShare=total ? Math.round((votes/total)*100) : 0;
        const day=new Date(`${String(item.day).slice(0,10)}T12:00:00`);
        const label=Number.isFinite(day.getTime())
          ? day.toLocaleDateString('es-ES',{day:'2-digit',month:'short'})
          : String(item.day || '').slice(5,10);
        return `<div class="creator-community-trend-day" title="${esc(label)} · ${votes} votos · ${responses} respuestas">
          <div class="creator-community-trend-bar" style="height:${height}%">
            <i class="votes" style="height:${voteShare}%"></i>
            <i class="responses" style="height:${100-voteShare}%"></i>
          </div>
          <small>${esc(label)}</small>
        </div>`;
      }).join('');
    }
  }

  const tools=Array.isArray(data.topTools) ? data.topTools : [];
  if($('#creatorCommunityTopTools')){
    $('#creatorCommunityTopTools').innerHTML=tools.length
      ? tools.map((item,index)=>`<button type="button" class="creator-community-top-tool" data-open-post="${item.post_id}">
          <span class="creator-community-top-rank">${index+1}</span>
          <span class="creator-community-top-copy">
            <b>${item.kind==='poll' ? 'Encuesta' : 'Pregunta'} · ${esc(String(item.prompt || '').slice(0,70))}</b>
            <small>${item.audience==='vip' ? '★ VIP · ' : ''}${item.status==='archived' ? 'Archivada · ' : item.is_open ? 'Abierta · ' : 'Cerrada · '}${Number(item.activity_7d || 0)} en 7d · ${Number(item.activity_30d || 0)} en 30d</small>
          </span>
        </button>`).join('')
      : '<div class="creator-empty compact">Todavía no hay herramientas con actividad reciente.</div>';
  }
}

async function loadCreatorCenter() {
  const metricsRoot = $('#creatorMetrics');
  const postsRoot = $('#creatorPosts');
  if (!metricsRoot || !postsRoot) return false;

  const [centerResponse,publishingResponse,communityResponse,communityInsightsResponse]=await Promise.all([
    api('/api/profiles/me/creator-center'),
    api('/api/posts/creator/publishing'),
    api('/api/posts/creator/community-inbox'),
    api('/api/posts/creator/community-insights')
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

  if(communityResponse.r.ok){
    renderCreatorCommunity(communityResponse.d);
  }else{
    if($('#creatorQuestionResponses'))$('#creatorQuestionResponses').innerHTML='<div class="creator-empty compact">No se pudo cargar la bandeja de comunidad.</div>';
    if($('#creatorPollSummaries'))$('#creatorPollSummaries').innerHTML='';
    if($('#creatorQuestionSummaries'))$('#creatorQuestionSummaries').innerHTML='';
  }

  if(communityInsightsResponse.r.ok){
    renderCreatorCommunityInsights(communityInsightsResponse.d);
  }else{
    if($('#creatorCommunityInsights'))$('#creatorCommunityInsights').innerHTML='<div class="creator-empty compact">No se pudieron cargar los insights.</div>';
    if($('#creatorCommunityTrend'))$('#creatorCommunityTrend').innerHTML='';
    if($('#creatorCommunityTopTools'))$('#creatorCommunityTopTools').innerHTML='';
  }

  await Promise.all([loadCreatorFollowUps(),loadCreatorCommunityActivity(),loadCreatorCalendar()]);
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
  if($('#creatorCommunitySummary'))$('#creatorCommunitySummary').innerHTML='<div class="mini-loading">Cargando comunidad...</div>';
  if($('#creatorFollowUpList'))$('#creatorFollowUpList').innerHTML='<div class="mini-loading">Cargando seguimientos...</div>';
  if($('#creatorActivityGroups'))$('#creatorActivityGroups').innerHTML='<div class="mini-loading">Cargando actividad...</div>';
  if($('#creatorCommunityInsights'))$('#creatorCommunityInsights').innerHTML='<div class="mini-loading">Calculando insights...</div>';
  if($('#creatorCommunityTrend'))$('#creatorCommunityTrend').innerHTML='';
  if($('#creatorCommunityTopTools'))$('#creatorCommunityTopTools').innerHTML='';
  if($('#creatorQuestionResponses'))$('#creatorQuestionResponses').innerHTML='';
  if($('#creatorPollSummaries'))$('#creatorPollSummaries').innerHTML='';
  if($('#creatorQuestionSummaries'))$('#creatorQuestionSummaries').innerHTML='';
  if($('#creatorCalendarGrid'))$('#creatorCalendarGrid').innerHTML='<div class="mini-loading creator-calendar-loading">Cargando calendario...</div>';
  await loadCreatorCenter();
}

function closeCreatorModal() {
  $('#creatorModal')?.classList.add('hidden');
}

$('#creatorCalendarPrev')?.addEventListener('click',async()=>{
  creatorCalendarMonth=new Date(creatorCalendarMonth.getFullYear(),creatorCalendarMonth.getMonth()-1,1);
  await loadCreatorCalendar();
});
$('#creatorCalendarNext')?.addEventListener('click',async()=>{
  creatorCalendarMonth=new Date(creatorCalendarMonth.getFullYear(),creatorCalendarMonth.getMonth()+1,1);
  await loadCreatorCalendar();
});
$('#creatorCalendarToday')?.addEventListener('click',async()=>{
  const now=new Date();
  creatorCalendarMonth=new Date(now.getFullYear(),now.getMonth(),1);
  await loadCreatorCalendar();
});
$('#creatorCalendarAudience')?.addEventListener('change',renderCreatorCalendar);
$('#creatorCalendarLabel')?.addEventListener('change',renderCreatorCalendar);

$('#creatorCommunityStatus')?.addEventListener('change',event=>{
  creatorCommunityStatus=event.currentTarget.value || 'active';
  if(creatorCommunityData)renderCreatorCommunity(creatorCommunityData);
});
$('#creatorCommunityStarredOnly')?.addEventListener('change',event=>{
  creatorCommunityStarredOnly=event.currentTarget.checked===true;
  if(creatorCommunityData)renderCreatorCommunity(creatorCommunityData);
});

all('[data-creator-activity-status]').forEach(button=>{
  button.addEventListener('click',async()=>{
    creatorCommunityActivityStatus=button.dataset.creatorActivityStatus || 'pending';
    await loadCreatorCommunityActivity();
  });
});

$('#creatorActivityFocus')?.addEventListener('change',async event=>{
  creatorCommunityActivityFocus=event.currentTarget.value || 'all';
  await loadCreatorCommunityActivity();
});

document.addEventListener('change',event=>{
  const checkbox=event.target.closest('[data-activity-followup]');
  if(!checkbox)return;
  const item=checkbox.closest('.creator-activity-item');
  const dateInput=item?.querySelector('[data-activity-followup-at]');
  if(dateInput)dateInput.disabled=!checkbox.checked;
});

$('#creatorActivityReviewAll')?.addEventListener('click',async()=>{
  const button=$('#creatorActivityReviewAll');
  if(!button || button.disabled)return;
  button.disabled=true;
  try{
    const { r }=await api('/api/posts/creator/community-activity/review-all',{method:'POST'});
    if(!r.ok)throw new Error('No se pudo marcar la actividad.');
    toast('Actividad marcada como revisada');
    await Promise.all([loadCreatorCommunityActivity(),loadCreatorFollowUps()]);
  }catch(error){
    toast(error.message || 'No se pudo actualizar la actividad.');
  }finally{
    button.disabled=false;
  }
});

document.addEventListener('click',async event=>{
  const single=event.target.closest('[data-creator-activity-review-id]');
  const groupButton=event.target.closest('[data-creator-activity-review-group]');
  const button=single || groupButton;
  if(!button)return;

  event.preventDefault();
  event.stopPropagation();
  if(button.disabled)return;
  button.disabled=true;

  try{
    let ids=[];
    if(single){
      ids=[single.dataset.creatorActivityReviewId];
    }else{
      const group=(creatorCommunityActivityData?.groups || []).find(item=>item.key===groupButton.dataset.creatorActivityReviewGroup);
      ids=group ? group.pending_notification_ids : [];
    }
    if(!ids.length)throw new Error('No hay actividad pendiente en este grupo.');

    const { r }=await api('/api/posts/creator/community-activity/review',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({notificationIds:ids})
    });
    if(!r.ok)throw new Error('No se pudo marcar la actividad como revisada.');
    toast(ids.length===1 ? 'Actividad revisada' : 'Grupo revisado');
    await Promise.all([loadCreatorCommunityActivity(),loadCreatorFollowUps()]);
  }catch(error){
    toast(error.message || 'No se pudo actualizar la actividad.');
  }finally{
    button.disabled=false;
  }
});

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-activity-meta-save]');
  if(!button)return;

  event.preventDefault();
  event.stopPropagation();
  if(button.disabled)return;
  button.disabled=true;

  try{
    const id=button.dataset.activityMetaSave;
    const item=button.closest('.creator-activity-item');
    const priority=item?.querySelector(`[data-activity-priority="${CSS.escape(String(id))}"]`)?.value || 'normal';
    const followUp=item?.querySelector(`[data-activity-followup="${CSS.escape(String(id))}"]`)?.checked===true;
    const followUpRaw=String(item?.querySelector(`[data-activity-followup-at="${CSS.escape(String(id))}"]`)?.value || '');
    const privateNote=String(item?.querySelector(`[data-activity-note="${CSS.escape(String(id))}"]`)?.value || '').trim();
    let followUpAt=null;

    if(followUp && followUpRaw){
      const date=new Date(followUpRaw);
      if(!Number.isFinite(date.getTime()))throw new Error('La fecha de seguimiento no es válida.');
      followUpAt=date.toISOString();
    }

    const { r,d }=await api(`/api/posts/creator/community-activity/${encodeURIComponent(id)}/meta`,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        priority,
        privateNote,
        followUp,
        followUpAt
      })
    });
    if(!r.ok){
      throw new Error(
        d.error==='invalid_activity_meta' ? 'Revisa prioridad, nota o seguimiento.' :
        d.error==='activity_not_found' ? 'Esta actividad ya no está disponible.' :
        'No se pudo guardar el seguimiento.'
      );
    }

    toast('Seguimiento privado guardado');
    await Promise.all([loadCreatorCommunityActivity(),loadCreatorFollowUps()]);
  }catch(error){
    toast(error.message || 'No se pudo guardar el seguimiento.');
  }finally{
    button.disabled=false;
  }
});

document.addEventListener('click',async event=>{
  const pollButton=event.target.closest('[data-community-poll-action]');
  const questionButton=event.target.closest('[data-community-question-action]');
  const starButton=event.target.closest('[data-community-star-response]');
  const button=pollButton || questionButton || starButton;
  if(!button)return;

  event.preventDefault();
  event.stopPropagation();
  if(button.disabled)return;
  button.disabled=true;

  try{
    if(pollButton){
      const action=pollButton.dataset.communityPollAction;
      const id=pollButton.dataset.communityPollId;
      const { r,d }=await api(`/api/posts/creator/community/polls/${encodeURIComponent(id)}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action})
      });
      if(!r.ok)throw new Error(d.error==='poll_not_found' ? 'Encuesta no encontrada.' : 'No se pudo actualizar la encuesta.');
      toast(action==='archive' ? 'Encuesta archivada' : action==='restore' ? 'Encuesta restaurada como cerrada' : action==='close' ? 'Encuesta cerrada' : 'Encuesta reabierta');
    }else if(questionButton){
      const action=questionButton.dataset.communityQuestionAction;
      const id=questionButton.dataset.communityQuestionId;
      const { r,d }=await api(`/api/posts/creator/community/questions/${encodeURIComponent(id)}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action})
      });
      if(!r.ok)throw new Error(d.error==='question_not_found' ? 'Pregunta no encontrada.' : 'No se pudo actualizar la pregunta.');
      toast(action==='archive' ? 'Pregunta archivada' : action==='restore' ? 'Pregunta restaurada como cerrada' : action==='close' ? 'Pregunta cerrada' : 'Pregunta reabierta');
    }else if(starButton){
      const starred=starButton.dataset.starred==='1';
      const { r,d }=await api(`/api/posts/creator/community/responses/${encodeURIComponent(starButton.dataset.communityStarResponse)}/star`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({starred:!starred})
      });
      if(!r.ok)throw new Error(d.error==='response_not_found' ? 'Respuesta no encontrada.' : 'No se pudo actualizar la respuesta.');
      toast(starred ? 'Respuesta quitada de destacadas' : 'Respuesta destacada');
    }

    await Promise.all([
      loadCreatorCenter(),
      loadFeed(currentMode)
    ]);
    if(!$('#exploreView')?.classList.contains('hidden'))await loadDiscoveryContent(activeContentMode);
  }catch(error){
    toast(error.message || 'No se pudo actualizar la comunidad.');
  }finally{
    button.disabled=false;
  }
});

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
  const editorial=event.target.closest('[data-editorial-save]');
  const publishNow=event.target.closest('[data-publishing-now]');
  const schedule=event.target.closest('[data-publishing-schedule]');
  const toDraft=event.target.closest('[data-publishing-draft]');
  const remove=event.target.closest('[data-publishing-delete]');
  const button=editorial || publishNow || schedule || toDraft || remove;
  if(!button)return;

  event.preventDefault();
  event.stopPropagation();
  button.disabled=true;

  try{
    if(editorial){
      const id=editorial.dataset.editorialSave;
      const dateInput=document.querySelector(`[data-editorial-date="${CSS.escape(String(id))}"]`);
      const labelInput=document.querySelector(`[data-editorial-label="${CSS.escape(String(id))}"]`);
      const editorialDate=String(dateInput?.value || '') || null;
      const editorialLabel=String(labelInput?.value || '').trim();
      const { r,d }=await api(`/api/posts/creator/editorial/${encodeURIComponent(id)}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({editorialDate,editorialLabel})
      });
      if(!r.ok)throw new Error(d.error==='invalid_editorial_metadata' ? 'Revisa la fecha o etiqueta.' : 'No se pudo guardar la organización.');
      toast('Organización editorial guardada');
    }else if(publishNow){
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

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
}

async function localPushSubscription(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window))return null;
  const registration=await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function loadPushSettings(){
  const button=$('#pushNotificationsToggle');
  const state=$('#pushNotificationsState');
  const status=$('#pushNotificationsStatus');
  if(!button || !state)return;

  if(!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)){
    state.innerHTML='<b>No disponible en este navegador</b><small>Tu navegador o modo actual no admite Web Push.</small>';
    button.disabled=true;
    button.textContent='No disponible';
    return;
  }

  const {r,d}=await api('/api/push/config');
  if(!r.ok){
    state.innerHTML='<b>No se pudo comprobar</b><small>Prueba de nuevo más tarde.</small>';
    button.disabled=true;
    return;
  }

  if(!d.enabled){
    state.innerHTML='<b>Preparado, pendiente de configuración del servidor</b><small>Faltan las claves VAPID en el entorno de producción.</small>';
    button.disabled=true;
    button.textContent='Pendiente';
    if(status)status.textContent='';
    return;
  }

  const subscription=await localPushSubscription();
  const active=!!subscription;
  state.innerHTML=active
    ? '<b>Activadas en este dispositivo</b><small>Los avisos pueden llegar aunque RedLibertad no esté abierta.</small>'
    : '<b>Desactivadas en este dispositivo</b><small>Actívalas solo si quieres recibir avisos del sistema.</small>';
  button.disabled=false;
  button.textContent=active ? 'Desactivar' : 'Activar';
  button.dataset.pushPublicKey=d.publicKey || '';
  if(status)status.textContent=Notification.permission==='denied'
    ? 'El navegador tiene bloqueadas las notificaciones para este sitio.'
    : '';
}

async function togglePushNotifications(){
  const button=$('#pushNotificationsToggle');
  const status=$('#pushNotificationsStatus');
  if(!button || button.disabled)return;
  button.disabled=true;
  if(status)status.textContent='Actualizando…';

  try{
    const current=await localPushSubscription();
    if(current){
      await api('/api/push/subscribe',{
        method:'DELETE',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({endpoint:current.endpoint})
      });
      await current.unsubscribe();
      if(status)status.textContent='Notificaciones push desactivadas en este dispositivo.';
      await loadPushSettings();
      return;
    }

    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      if(status)status.textContent=permission==='denied'
        ? 'Has bloqueado las notificaciones en el navegador.'
        : 'No se activaron las notificaciones.';
      return;
    }

    const publicKey=String(button.dataset.pushPublicKey || '');
    if(!publicKey)throw new Error('push_public_key_missing');

    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(publicKey)
    });
    const json=subscription.toJSON();
    const {r}=await api('/api/push/subscribe',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        endpoint:subscription.endpoint,
        keys:{
          p256dh:json.keys?.p256dh || '',
          auth:json.keys?.auth || ''
        },
        userAgent:String(navigator.userAgent || '').slice(0,500)
      })
    });
    if(!r.ok){
      await subscription.unsubscribe().catch(()=>{});
      throw new Error('push_subscription_failed');
    }

    if(status)status.textContent='Notificaciones push activadas en este dispositivo.';
    await loadPushSettings();
  }catch(error){
    if(status)status.textContent='No se pudieron actualizar las notificaciones push.';
  }finally{
    button.disabled=false;
  }
}

$('#pushNotificationsToggle')?.addEventListener('click',togglePushNotifications);

async function openAccountModal() {
  const modal = $('#accountModal');
  if (!modal) return;

  modal.classList.remove('hidden');
  $('#accountSummary').classList.add('skeleton');
  $('#accountSummary').innerHTML = '<div class="mini-loading">Cargando cuenta...</div>';
  $('#changePasswordStatus').textContent = '';
  $('#accountToolsStatus').textContent = '';
  $('#deleteAccountStatus').textContent = '';
  $('#pushNotificationsStatus').textContent = '';
  loadPushSettings().catch(()=>{});
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
  form.profileStatus.value = me.profile_status || '';
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
      profileStatus: fd.get('profileStatus'),
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
  const consentRequests=Array.isArray(d.requests)?d.requests:[];
  const collaborations=Array.isArray(d.collaborations)?d.collaborations:[];
  if (!consentRequests.length && !collaborations.length) {
    root.innerHTML = '<div class="info-card"><b>No tienes solicitudes pendientes.</b><p>Los consentimientos de imagen y las invitaciones para colaborar aparecerán aquí.</p></div>';
    return;
  }

  const consentCards=consentRequests.map(x => `<article class="consent-card"><div class="consent-head">${profileLink(x.username, `<span class="avatar">${x.avatar_url ? `<img src="${esc(x.avatar_url)}">` : initials(x.display_name)}</span>`, 'post-avatar-link')}<div>${profileLink(x.username, `<b>${esc(x.display_name)}</b>`, 'post-name-link')}<small>${profileLink(x.username, `@${esc(x.username)}`, 'post-username-link')} solicita tu consentimiento</small></div></div><div class="consent-media">${x.gated ? `<div class="gate"><span class="badge">18+</span><b>Verificación necesaria</b><p>${gateText(x.gate_reason)}</p></div>` : mediaHTML(x)}</div>${x.caption ? `<p>${esc(x.caption)}</p>` : ''}<div class="consent-actions">${x.consent_status === 'pending' ? `<button class="primary" data-consent="approved" data-post="${x.id}">Autorizar</button><button class="danger-outline" data-consent="rejected" data-post="${x.id}">Rechazar</button>` : `<span class="approved-label">✓ Autorizado</span><button class="danger-outline" data-consent="revoked" data-post="${x.id}">Retirar autorización</button>`}</div></article>`).join('');

  const collaborationCards=collaborations.map(x=>`<article class="consent-card collaboration-request-card">
    <div class="consent-head">${profileLink(x.username,`<span class="avatar">${x.avatar_url?`<img src="${esc(x.avatar_url)}">`:initials(x.display_name)}</span>`,'post-avatar-link')}<div>${profileLink(x.username,`<b>${esc(x.display_name)}</b>`,'post-name-link')}<small>${profileLink(x.username,`@${esc(x.username)}`,'post-username-link')} te invita a colaborar</small></div></div>
    <div class="collaboration-request-label">🤝 PUBLICACIÓN COLABORATIVA · ${x.post_kind==='reel'?'REEL':'POST'}</div>
    <div class="consent-media">${x.gated?`<div class="gate"><span class="badge">18+</span><b>Verificación necesaria</b><p>${gateText(x.gate_reason)}</p></div>`:mediaHTML(x)}</div>
    ${x.caption?`<p>${esc(x.caption)}</p>`:''}
    <div class="consent-actions">${x.collaboration_status==='pending'
      ? `<button class="primary" data-collaboration="approved" data-post="${x.id}">Aceptar colaboración</button><button class="danger-outline" data-collaboration="rejected" data-post="${x.id}">Rechazar</button>`
      : `<span class="approved-label">✓ Colaboración activa</span><button class="danger-outline" data-collaboration="revoked" data-post="${x.id}">Dejar colaboración</button>`}</div>
  </article>`).join('');

  root.innerHTML=collaborationCards+consentCards;
  all('[data-consent]', root).forEach(b => b.onclick = async () => {
    if (b.dataset.consent === 'approved' && !d.ageVerified && b.closest('.consent-card').querySelector('.gate')) return toast('Primero necesitas verificar tu mayoría de edad.');
    const { r } = await api(`/api/posts/${b.dataset.post}/consent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: b.dataset.consent }) });
    if (r.ok) { toast(b.dataset.consent === 'revoked' ? 'Consentimiento retirado' : 'Decisión guardada'); await loadConsents(); await loadProfile(); }
  });
  all('[data-collaboration]',root).forEach(b=>b.onclick=async()=>{
    if(b.dataset.collaboration==='approved'&&!d.ageVerified&&b.closest('.consent-card').querySelector('.gate'))return toast('Primero necesitas verificar tu mayoría de edad.');
    const {r,d:response}=await api(`/api/posts/${b.dataset.post}/collaboration`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:b.dataset.collaboration})});
    if(!r.ok){
      return toast(response.error==='verified_creator_required_for_nudity_collaboration'?'La colaboración con desnudez requiere cuenta de creador adulto verificada.':'No se pudo guardar la colaboración.');
    }
    toast(b.dataset.collaboration==='approved'?'Colaboración aceptada':b.dataset.collaboration==='revoked'?'Has dejado la colaboración':'Invitación rechazada');
    await loadConsents();await loadProfile();await loadFeed(currentMode);
  });
}


function commentHTML(comment) {
  const reply=!!comment.parent_comment_id;
  const replyCount=Number(comment.reply_count || 0);
  return `<article class="comment-item ${reply ? 'comment-reply' : 'comment-root'}" data-comment-id="${comment.id}">
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
          <small>${reply ? 'Respuesta · ' : ''}${timeAgo(comment.created_at)}</small>
        </div>
        ${comment.can_delete ? `
          <button type="button" class="comment-delete-button" data-delete-comment="${comment.id}" data-delete-comment-post="${activeCommentsPostId}" aria-label="Eliminar comentario" title="Eliminar comentario">Eliminar</button>
        ` : ''}
      </div>
      <p>${captionHTML(comment.body)}</p>
      <div class="comment-thread-actions">
        ${!reply ? `<button type="button" data-reply-comment="${comment.id}" data-reply-username="${esc(comment.username)}" data-reply-display="${esc(comment.display_name)}">Responder</button>` : ''}
        ${!reply && replyCount ? `<span>${replyCount} ${replyCount===1 ? 'respuesta' : 'respuestas'}</span>` : ''}
      </div>
    </div>
  </article>`;
}

function clearCommentReply() {
  activeCommentReply=null;
  $('#commentReplyContext')?.classList.add('hidden');
  if($('#commentReplyName'))$('#commentReplyName').textContent='';
  if($('#commentBody'))$('#commentBody').placeholder='Escribe un comentario...';
  const submit=$('#commentForm button[type="submit"]');
  if(submit && !submit.disabled)submit.textContent='Comentar';
}

function startCommentReply(button) {
  activeCommentReply={
    id:Number(button.dataset.replyComment),
    username:String(button.dataset.replyUsername || ''),
    displayName:String(button.dataset.replyDisplay || button.dataset.replyUsername || '')
  };
  if($('#commentReplyName'))$('#commentReplyName').textContent=`@${activeCommentReply.username}`;
  $('#commentReplyContext')?.classList.remove('hidden');
  if($('#commentBody')){
    $('#commentBody').placeholder=`Responde a ${activeCommentReply.displayName}...`;
    $('#commentBody').focus();
  }
  const submit=$('#commentForm button[type="submit"]');
  if(submit)submit.textContent='Responder';
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

  all('[data-reply-comment]',list).forEach(button=>button.onclick=()=>startCommentReply(button));
  list.scrollTop = list.scrollHeight;
}

async function openComments(postId) {
  activeCommentsPostId = Number(postId);
  $('#commentBody').value = '';
  $('#commentStatus').textContent = '';
  clearCommentReply();
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

async function loadShareConversations(){
  const root=$('#shareConversationList');
  if(!root || !activeSharePostId)return;
  root.innerHTML='<div class="share-chat-loading">Cargando conversaciones…</div>';

  const {r,d}=await api('/api/messages/conversations?filter=all&q=');
  if(!r.ok){
    root.innerHTML='<div class="share-chat-empty">No se pudieron cargar tus conversaciones.</div>';
    return;
  }

  const conversations=(Array.isArray(d.conversations) ? d.conversations : []).slice(0,12);
  if(!conversations.length){
    root.innerHTML='<div class="share-chat-empty">Todavía no tienes conversaciones activas.</div>';
    return;
  }

  root.innerHTML=conversations.map(conversation=>{
    const identity=conversationListIdentity(conversation);
    const subtitle=identity.isGroup
      ? `${Number(conversation.member_count || 0)} miembros`
      : identity.subtitle;
    return `<button type="button" class="share-chat-option" data-share-conversation="${conversation.id}" data-share-label="${esc(identity.title)}">
      <span class="share-chat-avatar ${identity.isGroup ? 'group-avatar' : ''}">${identity.avatar}</span>
      <span class="share-chat-copy"><b>${esc(identity.title)}</b><small>${esc(subtitle || '')}</small></span>
      <span class="share-chat-send">Enviar</span>
    </button>`;
  }).join('');

  all('[data-share-conversation]',root).forEach(button=>{
    button.onclick=()=>sendSharedPostToConversation(
      button.dataset.shareConversation,
      button.dataset.shareLabel
    );
  });
}

function openShare(postId) {
  activeSharePostId = Number(postId);
  const modal = $('#shareModal');
  if (modal) modal.classList.remove('hidden');
  const status = $('#shareStatus');
  if (status) status.textContent = '';
  const internalUsername = $('#shareInternalUsername');
  if (internalUsername) internalUsername.value = '';
  loadShareConversations().catch(()=>{});
}

function closeShare() {
  const modal=$('#shareModal');
  if(modal)modal.classList.add('hidden');
  const list=$('#shareConversationList');
  if(list)list.innerHTML='';
  activeSharePostId=null;
}

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
async function sendSharedPostToConversation(conversationId,label='chat'){
  if(!activeSharePostId)return;
  const status=$('#shareStatus');
  if(status)status.textContent='Enviando publicación…';

  const message=await api(
    `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        body:'',
        contentLevel:'normal',
        sharedPostId:activeSharePostId
      })
    }
  );

  if(!message.r.ok){
    if(status){
      status.textContent=message.d.error==='post_not_shareable'
        ? 'Esta publicación ya no se puede compartir.'
        : 'No se pudo enviar la publicación.';
    }
    return;
  }

  const currentId=activeConversationId;
  closeShare();
  toast(`Publicación enviada a ${label}`);
  await loadConversations();
  if(currentId && String(currentId)===String(conversationId) && !$('#messagesView')?.classList.contains('hidden')){
    await refreshActiveConversationLive();
  }
}

async function shareInsideRedLibertad(username) {
  if (!activeSharePostId) return;
  const clean=String(username || '').trim().replace(/^@/,'');
  const status=$('#shareStatus');

  if(!clean){
    if(status)status.textContent='Escribe un @usuario.';
    return;
  }

  if(status)status.textContent='Abriendo conversación…';

  const conversation=await api('/api/messages/conversations',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:clean})
  });

  if(!conversation.r.ok){
    if(status){
      status.textContent=conversation.d.error==='cannot_message_self'
        ? 'No puedes enviártelo a ti mismo.'
        : conversation.d.error==='message_privacy_denied'
          ? 'Esta persona no acepta nuevas conversaciones.'
          : conversation.d.error==='message_privacy_following_only'
            ? 'Solo acepta mensajes de personas que sigue.'
            : conversation.d.error==='messaging_blocked'
              ? 'No puedes iniciar esta conversación.'
              : 'No se pudo abrir la conversación.';
    }
    return;
  }

  await sendSharedPostToConversation(conversation.d.conversationId,`@${clean}`);
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

async function refreshPostArticle(postId) {
  const { r,d }=await api(`/api/posts/detail/${encodeURIComponent(postId)}`);
  if(!r.ok || !d.post)return false;
  const selector=`article.post[data-id="${CSS.escape(String(postId))}"]`;
  const matches=[...document.querySelectorAll(selector)];
  for(const current of matches){
    const holder=document.createElement('div');
    holder.innerHTML=postHTML(d.post);
    const next=holder.firstElementChild;
    if(!next)continue;
    current.replaceWith(next);
    bindPostActions(next);
  }
  return true;
}

function bindPostActions(root) {
  all('[data-discovery-hide-post]',root).forEach(button=>button.onclick=()=>hideDiscoveryPost(button));

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


  all('[data-poll-vote]',root).forEach(button=>{
    button.onclick=async()=>{
      if(button.disabled)return;
      button.disabled=true;
      try{
        const { r,d }=await api(`/api/posts/${encodeURIComponent(button.dataset.pollVote)}/poll-vote`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({optionId:button.dataset.pollOption})
        });
        if(!r.ok)throw new Error(
          d.error==='poll_closed' ? 'Esta encuesta está cerrada.' :
          d.error==='poll_archived' ? 'Esta encuesta ya no está disponible.' :
          d.error==='poll_vote_locked' ? 'Esta encuesta no permite cambiar el voto.' :
          'No se pudo registrar el voto.'
        );
        await refreshPostArticle(button.dataset.pollVote);
        tapFeedback();
      }catch(error){
        toast(error.message || 'No se pudo registrar el voto.');
      }finally{
        button.disabled=false;
      }
    };
  });

  all('[data-poll-remove]',root).forEach(button=>{
    button.onclick=async()=>{
      if(button.disabled)return;
      button.disabled=true;
      try{
        const { r }=await api(`/api/posts/${encodeURIComponent(button.dataset.pollRemove)}/poll-vote`,{method:'DELETE'});
        if(!r.ok)throw new Error('No se pudo retirar el voto.');
        await refreshPostArticle(button.dataset.pollRemove);
        toast('Voto retirado');
      }catch(error){
        toast(error.message || 'No se pudo retirar el voto.');
      }finally{
        button.disabled=false;
      }
    };
  });

  all('[data-question-response]',root).forEach(form=>{
    form.onsubmit=async event=>{
      event.preventDefault();
      const textarea=form.querySelector('textarea');
      const body=String(textarea?.value || '').trim();
      if(!body)return toast('Escribe una respuesta.');
      const submit=form.querySelector('button[type="submit"]');
      if(submit)submit.disabled=true;
      try{
        const { r,d }=await api(`/api/posts/${encodeURIComponent(form.dataset.questionResponse)}/question-response`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({body})
        });
        if(!r.ok)throw new Error(
          d.error==='question_closed' ? 'Esta pregunta está cerrada.' :
          d.error==='question_archived' ? 'Esta pregunta ya no está disponible.' :
          d.error==='invalid_question_response' ? 'La respuesta debe tener entre 1 y 1000 caracteres.' :
          'No se pudo guardar la respuesta.'
        );
        await refreshPostArticle(form.dataset.questionResponse);
        toast('Respuesta guardada para el creador');
      }catch(error){
        toast(error.message || 'No se pudo guardar la respuesta.');
      }finally{
        if(submit)submit.disabled=false;
      }
    };
  });

  all('[data-question-remove]',root).forEach(button=>{
    button.onclick=async()=>{
      if(button.disabled)return;
      button.disabled=true;
      try{
        const { r }=await api(`/api/posts/${encodeURIComponent(button.dataset.questionRemove)}/question-response`,{method:'DELETE'});
        if(!r.ok)throw new Error('No se pudo retirar la respuesta.');
        await refreshPostArticle(button.dataset.questionRemove);
        toast('Respuesta retirada');
      }catch(error){
        toast(error.message || 'No se pudo retirar la respuesta.');
      }finally{
        button.disabled=false;
      }
    };
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
  clearCommentReply();
};
$('#cancelCommentReply')?.addEventListener('click',clearCommentReply);

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
      body: JSON.stringify({
        body,
        parentCommentId:activeCommentReply?.id || null
      })
    });

    if (!r.ok) {
      throw new Error(d.error === 'invalid_comment'
        ? 'El comentario no es válido.'
        : 'No se pudo publicar el comentario.');
    }

    const wasReply=!!activeCommentReply;
    $('#commentBody').value = '';
    clearCommentReply();
    $('#commentStatus').textContent = wasReply ? 'Respuesta publicada.' : 'Comentario publicado.';
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

const MESSAGE_REACTIONS={
  heart:'❤️',
  like:'👍',
  laugh:'😂',
  fire:'🔥',
  wow:'😮',
  sad:'😢'
};

function reactionEmoji(key){
  return MESSAGE_REACTIONS[key] || '•';
}

function clearMessageReply(){
  activeMessageReply=null;
  const box=$('#messageReplyComposer');
  if(box){
    box.classList.add('hidden');
    box.innerHTML='';
  }
}

function setMessageReply(messageId,label,text){
  activeMessageReply={
    id:Number(messageId),
    label:String(label || 'Mensaje'),
    text:String(text || 'Mensaje')
  };
  const box=$('#messageReplyComposer');
  if(box){
    box.innerHTML=`<div><small>RESPONDIENDO A</small><b>${esc(activeMessageReply.label)}</b><p>${esc(activeMessageReply.text)}</p></div><button type="button" id="cancelMessageReply" class="tiny-action">Cancelar</button>`;
    box.classList.remove('hidden');
    $('#cancelMessageReply')?.addEventListener('click',clearMessageReply);
  }
  $('#messageBody')?.focus();
}

async function toggleMessageReaction(button){
  if(!activeConversationId)return;
  const messageId=button.dataset.messageReact;
  const reaction=button.dataset.reaction;
  const active=button.dataset.reacted==='1';
  button.disabled=true;
  try{
    const {r}=await api(`/api/messages/conversations/${encodeURIComponent(activeConversationId)}/messages/${encodeURIComponent(messageId)}/reaction`,{
      method:active?'DELETE':'PUT',
      headers:active ? undefined : {'Content-Type':'application/json'},
      body:active ? undefined : JSON.stringify({reaction})
    });
    if(!r.ok)return toast('No se pudo guardar la reacción.');
    await refreshActiveConversationLive();
  }finally{
    button.disabled=false;
  }
}

function bindMessageActions(root=$('#messageThread')){
  if(!root)return;
  all('[data-message-reply]',root).forEach(button=>{
    button.onclick=()=>setMessageReply(
      button.dataset.messageReply,
      button.dataset.replyLabel,
      button.dataset.replyText
    );
  });
  all('[data-message-react]',root).forEach(button=>{
    button.onclick=()=>toggleMessageReaction(button);
  });
  all('[data-accept-sensitive]',root).forEach(button=>button.onclick=acceptSensitiveMessages);
  all('[data-open-shared-post]',root).forEach(button=>{
    button.onclick=()=>openPostFocus(button.dataset.openSharedPost);
  });
}

function conversationPresence(id) {
  return liveConversationPresence.get(String(id)) || null;
}

function presenceLabel(state,fallback=null) {
  if(state?.isGroup){
    const typingNames=Array.isArray(state.typingNames) ? state.typingNames.filter(Boolean) : [];
    if(typingNames.length===1)return `${typingNames[0]} está escribiendo…`;
    if(typingNames.length>1)return `${typingNames.slice(0,2).join(' y ')} están escribiendo…`;
    if(Number(state.onlineCount || 0)>0){
      const n=Number(state.onlineCount || 0);
      return `${n} ${n===1 ? 'persona en línea' : 'personas en línea'}`;
    }
    return '';
  }
  if(state?.typing)return 'Escribiendo…';
  if(state?.online)return 'En línea';
  const last=state?.lastSeenAt || fallback?.last_seen_at;
  return last ? `Activo ${timeAgo(last)}` : '';
}

function updateConversationPresenceBadges() {
  all('[data-conversation]').forEach(row=>{
    const state=conversationPresence(row.dataset.conversation);
    const dot=row.querySelector('.conversation-presence-dot');
    const label=row.querySelector('.conversation-presence-label');
    if(dot)dot.classList.toggle('online',state?.online===true);
    if(label)label.textContent=state?.isGroup
      ? presenceLabel(state)
      : state?.typing ? 'Escribiendo…' : state?.online ? 'En línea' : '';
  });
}

function updateActiveChatPresence() {
  if(!activeConversationId)return;
  const state=conversationPresence(activeConversationId);
  const label=$('#chatPresence');
  if(label){
    const text=presenceLabel(state,activeConversationMeta?.is_group ? null : activeConversationOther);
    label.textContent=text;
    label.classList.toggle('typing',state?.typing===true);
    label.classList.toggle('online',state?.online===true && !state?.typing);
  }

  if(!activeConversationMeta?.is_group){
    const readAt=state?.otherLastReadAt ? new Date(state.otherLastReadAt).getTime() : 0;
    if(readAt){
      all('#messageThread .message-bubble.mine[data-message-created]').forEach(bubble=>{
        const created=new Date(bubble.dataset.messageCreated).getTime();
        if(Number.isFinite(created) && created<=readAt){
          const receipt=bubble.querySelector('.message-receipt');
          if(receipt)receipt.textContent='Visto';
        }
      });
    }
  }
}

async function sendChatPresence({typing=false,conversationId=activeConversationId}={}) {
  if(document.visibilityState==='hidden' && !typing)return;
  try{
    await api('/api/messages/presence',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        conversationId:conversationId ? Number(conversationId) : null,
        typing:typing===true
      })
    });
  }catch(_){}
}

function startPresenceHeartbeat() {
  if(presenceHeartbeatTimer)return;
  sendChatPresence({typing:false});
  presenceHeartbeatTimer=setInterval(()=>{
    if(document.visibilityState==='visible')sendChatPresence({typing:false});
  },20000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')sendChatPresence({typing:false});
  });
}

function bindTypingPresence() {
  const input=$('#messageBody');
  if(!input)return;
  input.addEventListener('input',()=>{
    autosizeMessageBody();
    if(!activeConversationId)return;
    const now=Date.now();
    if(now-lastTypingPingAt>2500){
      lastTypingPingAt=now;
      sendChatPresence({typing:true});
    }
    clearTimeout(typingClearTimer);
    typingClearTimer=setTimeout(()=>sendChatPresence({typing:false}),4200);
  });
  input.addEventListener('blur',()=>{
    clearTimeout(typingClearTimer);
    sendChatPresence({typing:false});
  });
}

function updateMessageBadge(n) {
  const safe=Math.max(0,Number(n || 0));
  const value=safe>99 ? '99+' : String(safe);
  ['#messageBadge','#messageBadgeMobile'].forEach(selector=>{
    const badge=$(selector);
    if(!badge)return;
    badge.textContent=value;
    badge.classList.toggle('hidden',!safe);
  });
}

async function refreshActiveConversationLive() {
  if(!activeConversationId || liveActivityRefreshing)return;
  const conversationId=String(activeConversationId);
  liveActivityRefreshing=true;
  try{
    const {r,d}=await api(`/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`);
    if(!r.ok || String(activeConversationId)!==conversationId)return;
    activeConversationOther=d.other;
    activeConversationMeta=d.conversation || activeConversationMeta;
    activeConversationSettings=d.settings || activeConversationSettings;
    const thread=$('#messageThread');
    if(thread){
      const nearBottom=(thread.scrollHeight-thread.scrollTop-thread.clientHeight)<120;
      thread.innerHTML=(Array.isArray(d.messages)?d.messages:[]).map(m=>messageHTML(m,d.other,d.conversation)).join('') || '<div class="empty-state"><p>Empieza la conversación.</p></div>';
      bindMessageActions(thread);
      if(nearBottom)thread.scrollTop=thread.scrollHeight;
    }
    await loadConversations();
  }catch(_){}
  finally{liveActivityRefreshing=false;}
}

async function handleLiveActivity(payload,initial=false) {
  const previous={...liveActivityState};
  const previousPresence=new Map(
    (Array.isArray(previous.conversationPresence) ? previous.conversationPresence : [])
      .map(item=>[String(item.conversationId),item])
  );
  liveActivityState={
    notificationUnread:Number(payload.notificationUnread || 0),
    latestNotificationId:String(payload.latestNotificationId || '0'),
    messageUnread:Number(payload.messageUnread || 0),
    latestIncomingMessageId:String(payload.latestIncomingMessageId || '0'),
    latestReactionAt:payload.latestReactionAt || null,
    conversationPresence:Array.isArray(payload.conversationPresence) ? payload.conversationPresence : []
  };
  liveConversationPresence=new Map(
    liveActivityState.conversationPresence.map(item=>[String(item.conversationId),item])
  );

  updateNotificationBadge(liveActivityState.notificationUnread);
  updateMessageBadge(liveActivityState.messageUnread);
  updateConversationPresenceBadges();
  updateActiveChatPresence();
  if(initial)return;

  const notificationChanged=
    previous.latestNotificationId!==liveActivityState.latestNotificationId ||
    previous.notificationUnread!==liveActivityState.notificationUnread;
  const messageChanged=
    previous.latestIncomingMessageId!==liveActivityState.latestIncomingMessageId ||
    previous.messageUnread!==liveActivityState.messageUnread ||
    previous.latestReactionAt!==liveActivityState.latestReactionAt;

  const previousActivePresence=activeConversationId
    ? previousPresence.get(String(activeConversationId))
    : null;
  const nextActivePresence=activeConversationId
    ? liveConversationPresence.get(String(activeConversationId))
    : null;
  const groupReadChanged=!!(
    activeConversationMeta?.is_group &&
    String(previousActivePresence?.readSignature || '')!==String(nextActivePresence?.readSignature || '')
  );

  if(notificationChanged && !$('#notificationsView')?.classList.contains('hidden')){
    await loadNotifications();
  }
  if((messageChanged || groupReadChanged) && !$('#messagesView')?.classList.contains('hidden')){
    if(activeConversationId)await refreshActiveConversationLive();
    else await loadConversations();
  }
  if(notificationChanged || messageChanged){
    returnPulseLoaded=false;
  }
}

function startLiveActivity() {
  if(liveActivitySource || !('EventSource' in window))return;
  const source=new EventSource('/api/live/stream');
  liveActivitySource=source;

  source.addEventListener('snapshot',event=>{
    try{handleLiveActivity(JSON.parse(event.data),true);}catch(_){}
  });
  source.addEventListener('activity',event=>{
    try{handleLiveActivity(JSON.parse(event.data),false);}catch(_){}
  });
  source.addEventListener('stream-error',()=>{});
  source.onerror=()=>{
    if(source.readyState===EventSource.CLOSED){
      liveActivitySource=null;
      setTimeout(startLiveActivity,5000);
    }
  };
}

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
    creator_poll_vote: '▥',
    creator_question_response: '?',
    event_reminder: '🗓',
    collaboration_request: '🤝',
    collaboration_approved: '✓',
    collaboration_rejected: '×',
    collaboration_revoked: '↶',
    system: 'R'
  })[type] || '•';
}

function notificationMatches(notification, filter) {
  if (filter === 'all') return true;
  if (filter === 'mentions') return notification.type === 'mention';
  if (filter === 'interactions') return ['like','comment','repost'].includes(notification.type);
  if (filter === 'community') return ['follow','creator_broadcast','creator_vip_broadcast','creator_poll_vote','creator_question_response','event_reminder'].includes(notification.type);
  if (filter === 'messages') return notification.type === 'message';
  if (filter === 'consent') return String(notification.type || '').startsWith('consent_') || String(notification.type || '').startsWith('collaboration_');
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

  if (type === 'collaboration_request') {
    showView('profile');
    setTimeout(() => document.querySelector('.consent-section')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
    return;
  }

  if (type.startsWith('collaboration_') && entityType === 'post' && entityId) {
    await openPostFocus(entityId);
    return;
  }

  if (type === 'event_reminder' && entityType === 'event' && entityId) {
    showView('events');
    await loadEvents(entityId);
    return;
  }

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

  if (['creator_poll_vote','creator_question_response'].includes(type)) {
    creatorCommunityActivityStatus='pending';
    await openCreatorModal();
    setTimeout(() => {
      document.querySelector('.creator-activity-center')?.scrollIntoView({behavior:'smooth',block:'start'});
    },120);
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
  liveActivityState.notificationUnread=Number(d.unread || 0);
  if(notificationCache.length)liveActivityState.latestNotificationId=String(notificationCache[0].id || liveActivityState.latestNotificationId);
  renderNotifications();
}

all('[data-notification-filter]').forEach(button => {
  button.onclick = () => {
    activeNotificationFilter = button.dataset.notificationFilter || 'all';
    renderNotifications();
  };
});

all('[data-message-filter]').forEach(button=>{
  button.onclick=async()=>{
    messageConversationFilter=button.dataset.messageFilter || 'all';
    activeConversationId=null;
    activeConversationMeta=null;
    activeConversationOther=null;
    $('.messages-layout')?.classList.remove('chat-open');
    await loadConversations();
  };
});
$('#messageConversationSearch')?.addEventListener('input',event=>{
  messageConversationSearch=String(event.currentTarget.value||'').trim();
  clearTimeout(messageConversationSearchTimer);
  messageConversationSearchTimer=setTimeout(()=>loadConversations(),260);
});

$('#readAllNotifications').onclick = async () => {
  await api('/api/notifications/read-all', { method: 'POST' });
  notificationCache = notificationCache.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
  updateNotificationBadge(0);
  renderNotifications();
  toast('Notificaciones marcadas como leídas');
};

function conversationListIdentity(conversation){
  const isGroup=conversation.is_group===true || conversation.conversation_type==='group';
  if(isGroup){
    const title=String(conversation.title || 'Grupo');
    const participants=Array.isArray(conversation.participants) ? conversation.participants : [];
    return {
      isGroup:true,
      title,
      subtitle:`${Number(conversation.member_count || participants.length || 0)} miembros`,
      avatar:`<span class="group-avatar-mark">${esc(initials(title))}</span>`,
      verified:false
    };
  }
  return {
    isGroup:false,
    title:String(conversation.display_name || conversation.username || 'Conversación'),
    subtitle:conversation.username ? `@${conversation.username}` : '',
    avatar:conversation.avatar_url
      ? `<img src="${esc(conversation.avatar_url)}" alt="" decoding="async">`
      : esc(initials(conversation.display_name || conversation.username || 'R')),
    verified:conversation.creator_verified===true
  };
}

function conversationPreviewText(conversation){
  if(conversation.last_content_level && conversation.last_content_level!=='normal'){
    return conversation.is_group && conversation.last_sender_display_name
      ? `${conversation.last_sender_display_name}: Contenido sensible`
      : 'Contenido sensible';
  }
  const body=String(conversation.last_body || '').trim();
  if(!body)return 'Conversación nueva';
  if(conversation.is_group && conversation.last_sender_display_name){
    return `${conversation.last_sender_display_name}: ${body}`;
  }
  return body;
}


function communityConversationIdentity(item){
  if(item.is_group){
    const title=String(item.title || 'Grupo');
    return {
      title,
      subtitle:`${Number(item.member_count || 0)} miembros`,
      avatar:`<span class="group-avatar-mark">${esc(initials(title))}</span>`
    };
  }
  return {
    title:String(item.display_name || item.username || 'Conexión'),
    subtitle:item.username ? `@${item.username}` : '',
    avatar:item.avatar_url
      ? `<img src="${esc(item.avatar_url)}" alt="" decoding="async">`
      : esc(initials(item.display_name || item.username || 'R'))
  };
}

function communityConversationLabel(item){
  if(item.kind==='pending'){
    const count=Number(item.unread_count || 0);
    return count===1 ? 'Tienes 1 mensaje pendiente' : `Tienes ${count} mensajes pendientes`;
  }
  if(item.kind==='unanswered')return 'Tu último mensaje sigue sin respuesta';
  return item.last_message_at ? `Podrías retomar esta conversación · ${timeAgo(item.last_message_at)}` : 'Podrías retomar esta conversación';
}

function communityPersonCardHTML(user,{activity=false}={}){
  const when=activity && user.last_activity_at ? `Actividad ${timeAgo(user.last_activity_at)}` :
    user.connection_since ? `Conexión ${timeAgo(user.connection_since)}` : '';
  return `<article class="community-person-card">
    ${profileLink(user.username,`<span class="community-person-avatar">${avatarHTML(user)}</span>`,'community-person-profile')}
    <div class="community-person-copy">
      ${profileLink(user.username,`<b>${esc(user.display_name)} ${user.creator_verified ? '<span class="verified">✓</span>' : ''}</b>`,'community-person-name')}
      <small>@${esc(user.username)}${user.location_label ? ` · ${esc(user.location_label)}` : ''}</small>
      ${when ? `<span>${esc(when)}</span>` : ''}
    </div>
    <button type="button" class="tiny-action" data-connection-message="${esc(user.username)}">Mensaje</button>
  </article>`;
}

function renderCommunityConversations(){
  const section=$('#communityConversations');
  if(!section || !communityConversationsData)return;
  const data=communityConversationsData;
  const conversations=Array.isArray(data.conversations)?data.conversations:[];
  const newConnections=Array.isArray(data.new_connections)?data.new_connections:[];
  const relevantActivity=Array.isArray(data.relevant_activity)?data.relevant_activity:[];
  const hasAnything=conversations.length || newConnections.length || relevantActivity.length;
  section.classList.toggle('hidden',!hasAnything);
  if(!hasAnything)return;

  const summary=data.summary || {};
  const summaryRoot=$('#communityConversationSummary');
  if(summaryRoot){
    const chips=[];
    if(Number(summary.pending||0))chips.push(`<span><b>${Number(summary.pending)}</b> pendientes</span>`);
    if(Number(summary.unanswered||0))chips.push(`<span><b>${Number(summary.unanswered)}</b> sin respuesta</span>`);
    if(Number(summary.resume||0))chips.push(`<span><b>${Number(summary.resume)}</b> para retomar</span>`);
    if(Number(summary.new_connections||0))chips.push(`<span><b>${Number(summary.new_connections)}</b> conexiones nuevas</span>`);
    summaryRoot.innerHTML=chips.join('');
  }

  const conversationBlock=$('#communityConversationSuggestions');
  const conversationList=$('#communityConversationList');
  conversationBlock?.classList.toggle('hidden',!conversations.length);
  if(conversationList){
    conversationList.innerHTML=conversations.map(item=>{
      const identity=communityConversationIdentity(item);
      return `<button type="button" class="community-conversation-card" data-community-conversation="${item.id}">
        <span class="community-conversation-avatar ${item.is_group?'group-avatar':''}">${identity.avatar}</span>
        <span class="community-conversation-copy">
          <b>${esc(identity.title)} ${item.creator_verified ? '<span class="verified">✓</span>' : ''}</b>
          <small>${esc(identity.subtitle)}</small>
          <em class="community-conversation-kind ${esc(item.kind)}">${esc(communityConversationLabel(item))}</em>
        </span>
        <span class="community-conversation-open">Abrir</span>
      </button>`;
    }).join('');
  }

  const newBlock=$('#communityNewConnectionsBlock');
  const newRoot=$('#communityNewConnections');
  newBlock?.classList.toggle('hidden',!newConnections.length);
  if(newRoot)newRoot.innerHTML=newConnections.map(user=>communityPersonCardHTML(user)).join('');

  const activityBlock=$('#communityRelevantActivityBlock');
  const activityRoot=$('#communityRelevantActivity');
  activityBlock?.classList.toggle('hidden',!relevantActivity.length);
  if(activityRoot)activityRoot.innerHTML=relevantActivity.map(user=>communityPersonCardHTML(user,{activity:true})).join('');
}

async function loadCommunityConversations(){
  if(communityConversationsLoading)return;
  communityConversationsLoading=true;
  try{
    const {r,d}=await api('/api/messages/community-conversations');
    if(!r.ok)return;
    communityConversationsData=d;
    renderCommunityConversations();
  }finally{
    communityConversationsLoading=false;
  }
}

async function loadConversations(openId = null) {
  const params=new URLSearchParams({filter:messageConversationFilter,q:messageConversationSearch});
  const {r,d}=await api('/api/messages/conversations?'+params.toString());
  if(!r.ok)return;
  const conversations=Array.isArray(d.conversations)?d.conversations:[];
  const total=conversations.reduce((a,x)=>a+Number(x.unread_count || 0),0);
  updateMessageBadge(total);
  liveActivityState.messageUnread=total;

  all('[data-message-filter]').forEach(button=>{
    button.classList.toggle('active',button.dataset.messageFilter===messageConversationFilter);
  });
  const summary=d.summary || {};
  if($('#messageInboxSummary')){
    $('#messageInboxSummary').textContent=`${Number(summary.unread||0)} no leídas · ${Number(summary.pinned||0)} fijadas · ${Number(summary.archived||0)} archivadas`;
  }
  if($('#messageConversationSearch') && $('#messageConversationSearch').value!==messageConversationSearch){
    $('#messageConversationSearch').value=messageConversationSearch;
  }

  $('#conversationList').innerHTML=conversations.length
    ? conversations.map(conversation=>{
        const identity=conversationListIdentity(conversation);
        const liveState=conversationPresence(conversation.id);
        const serverOnline=identity.isGroup
          ? (Array.isArray(conversation.participants) ? conversation.participants.filter(member=>member.online).length : 0)
          : (conversation.other_online ? 1 : 0);
        const presenceText=liveState
          ? presenceLabel(liveState)
          : identity.isGroup
            ? (serverOnline ? `${serverOnline} ${serverOnline===1 ? 'persona en línea' : 'personas en línea'}` : '')
            : conversation.other_online ? 'En línea' : '';

        return `<button class="conversation-row ${String(conversation.id)===String(activeConversationId) ? 'active' : ''} ${conversation.is_pinned?'pinned':''} ${identity.isGroup?'group-conversation-row':''}" data-conversation="${conversation.id}">
          <div class="avatar conversation-avatar ${identity.isGroup?'group-avatar':''}">
            ${identity.avatar}
            <i class="conversation-presence-dot ${(liveState?.online || serverOnline>0)?'online':''}"></i>
          </div>
          <div class="conversation-copy">
            <b>${conversation.is_pinned?'★ ':''}${esc(identity.title)} ${identity.verified ? '<span class="verified">✓</span>' : ''}${identity.isGroup ? '<span class="group-chip">Grupo</span>' : ''}</b>
            <small>${esc(conversationPreviewText(conversation))}</small>
            <span class="conversation-presence-label">${esc(presenceText)}</span>
            ${conversation.notifications_muted?'<em class="conversation-muted">Silenciada</em>':''}
          </div>
          ${Number(conversation.unread_count) ? `<i class="count-badge">${conversation.unread_count}</i>` : ''}
        </button>`;
      }).join('')
    : '<div class="empty-list">No hay conversaciones en este filtro.</div>';

  all('[data-conversation]').forEach(button=>{
    button.onclick=()=>openConversation(button.dataset.conversation);
  });
  updateConversationPresenceBadges();
  if(openId)await openConversation(openId);
}

function groupParticipantsSummary(group){
  const participants=Array.isArray(group?.participants) ? group.participants : [];
  const visible=participants
    .filter(member=>String(member.id)!==String(me?.id))
    .slice(0,3)
    .map(member=>member.display_name || member.username);
  if(!visible.length)return '';
  const extra=Math.max(0,participants.length-1-visible.length);
  return extra ? `${visible.join(', ')} y ${extra} más` : visible.join(', ');
}

async function openConversation(id) {
  activeConversationId=id;
  clearMessageReply();
  const layout=$('.messages-layout');
  if(layout)layout.classList.add('chat-open');

  const {r,d}=await api(`/api/messages/conversations/${encodeURIComponent(id)}/messages`);
  if(!r.ok){
    toast(
      d.error==='messaging_blocked'
        ? 'Esta conversación ya no está disponible.'
        : 'No se pudo abrir la conversación.'
    );
    return;
  }

  activeConversationOther=d.other || null;
  activeConversationMeta=d.conversation || null;
  activeConversationSettings=d.settings || {
    member_role:activeConversationMeta?.member_role || 'member',
    is_pinned:false,
    is_archived:false,
    notifications_muted:false
  };

  const isGroup=activeConversationMeta?.is_group===true;
  const title=isGroup
    ? String(activeConversationMeta.title || 'Grupo')
    : String(d.other?.display_name || d.other?.username || 'Conversación');
  const subtitle=isGroup
    ? `${Number(activeConversationMeta.member_count || 0)} miembros${groupParticipantsSummary(activeConversationMeta) ? ` · ${groupParticipantsSummary(activeConversationMeta)}` : ''}`
    : `@${esc(d.other?.username || '')}`;
  const headerAvatar=isGroup
    ? `<span class="group-avatar-mark">${esc(initials(title))}</span>`
    : avatarHTML(d.other);
  const liveLabel=presenceLabel(
    conversationPresence(id),
    isGroup ? null : d.other
  );
  const messages=(Array.isArray(d.messages)?d.messages:[])
    .map(message=>messageHTML(message,d.other,activeConversationMeta))
    .join('');

  $('#chatPanel').className='chat-panel';
  $('#chatPanel').innerHTML=`<header class="chat-head">
    <button id="mobileChatBack" class="mobile-chat-back" type="button" aria-label="Volver a conversaciones">‹</button>
    <div class="avatar ${isGroup?'group-avatar':''}">${headerAvatar}</div>
    <div class="chat-person">
      <b>${esc(title)} ${isGroup?'<span class="group-chip">Grupo</span>':''}</b>
      <small>${subtitle}${liveLabel ? ` · <span id="chatPresence" class="chat-presence">${esc(liveLabel)}</span>` : ' · <span id="chatPresence" class="chat-presence"></span>'}</small>
    </div>
    <div class="chat-conversation-actions">
      <button type="button" class="tiny-action" data-conversation-setting="pinned">${activeConversationSettings.is_pinned?'★ Fijada':'☆ Fijar'}</button>
      <button type="button" class="tiny-action" data-conversation-setting="muted">${activeConversationSettings.notifications_muted?'Activar avisos':'Silenciar'}</button>
      <button type="button" class="tiny-action" data-conversation-setting="archived">${activeConversationSettings.is_archived?'Desarchivar':'Archivar'}</button>
      ${isGroup
        ? activeConversationMeta?.community_managed
          ? `<button id="openChatCommunity" type="button" class="tiny-action">Ver comunidad</button>`
          : '<button id="manageGroup" type="button" class="tiny-action">Participantes</button>'
        : ''}
      ${!isGroup && d.sensitiveAllowed ? '<button id="revokeSensitive" class="tiny-action">No recibir sensible</button>' : ''}
    </div>
  </header>
  <div id="messageThread" class="message-thread">${messages || '<div class="empty-state"><p>Empieza la conversación.</p></div>'}</div>
  <form id="messageForm" class="message-form">
    <div id="messageReplyComposer" class="message-reply-composer hidden"></div>
    <div class="message-options">
      <label>Archivo<input id="messageFile" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"></label>
      <label>Tipo<select id="messageLevel"><option value="normal">Normal</option><option value="sensitive">Sensible</option><option value="nudity">Desnudez</option></select></label>
    </div>
    <div id="messagePreview" class="message-preview hidden"></div>
    <div class="message-compose"><textarea id="messageBody" maxlength="4000" placeholder="${isGroup ? 'Escribe al grupo…' : 'Escribe un mensaje…'}"></textarea><button class="primary" type="submit">Enviar</button></div>
    <small class="message-hint">${isGroup ? 'Cada persona decide si acepta el contenido sensible de cada remitente.' : 'El destinatario tendrá que aceptar antes de ver archivos sensibles enviados por ti.'}</small>
  </form>`;

  const mobileBack=$('#mobileChatBack');
  if(mobileBack)mobileBack.onclick=()=>{
    $('.messages-layout')?.classList.remove('chat-open');
    sendChatPresence({typing:false,conversationId:null});
    activeConversationId=null;
    activeConversationMeta=null;
    activeConversationOther=null;
    loadConversations();
  };

  $('#messageForm').onsubmit=sendMessage;
  bindMessageActions($('#messageThread'));
  bindTypingPresence();
  autosizeMessageBody();
  sendChatPresence({typing:false,conversationId:id});
  updateActiveChatPresence();

  $('#messageFile').addEventListener('change',renderMessagePreview);
  $('#messageLevel').addEventListener('change',updateMessagePreviewLevel);
  if($('#manageGroup'))$('#manageGroup').onclick=openGroupManage;
  if($('#openChatCommunity'))$('#openChatCommunity').onclick=async()=>{
    const communityId=activeConversationMeta?.community_id;
    if(!communityId)return;
    showView('communities');
    await openCommunityDetail(communityId);
  };

  if($('#revokeSensitive') && d.other){
    $('#revokeSensitive').onclick=async()=>{
      await api(`/api/messages/users/${d.other.id}/sensitive-permission`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({allow:false})
      });
      toast('Ya no recibirás contenido sensible visible de esta persona');
      await openConversation(activeConversationId);
    };
  }

  all('[data-conversation-setting]',$('#chatPanel')).forEach(button=>{
    button.onclick=async()=>{
      const key=button.dataset.conversationSetting;
      const payload=key==='pinned'
        ? {pinned:!activeConversationSettings.is_pinned}
        : key==='archived'
          ? {archived:!activeConversationSettings.is_archived}
          : {muted:!activeConversationSettings.notifications_muted};

      button.disabled=true;
      const {r:settingsResponse,d:settingsData}=await api(
        `/api/messages/conversations/${activeConversationId}/settings`,
        {
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        }
      );
      if(!settingsResponse.ok){
        button.disabled=false;
        return toast('No se pudo actualizar la conversación.');
      }

      activeConversationSettings=settingsData.settings || activeConversationSettings;
      toast(
        key==='pinned'
          ? (activeConversationSettings.is_pinned?'Conversación fijada':'Conversación desfijada')
          : key==='archived'
            ? (activeConversationSettings.is_archived?'Conversación archivada':'Conversación recuperada')
            : (activeConversationSettings.notifications_muted?'Avisos silenciados':'Avisos activados')
      );

      if(key==='archived' && activeConversationSettings.is_archived){
        activeConversationId=null;
        activeConversationMeta=null;
        activeConversationOther=null;
        $('.messages-layout')?.classList.remove('chat-open');
        $('#chatPanel').className='chat-panel empty-chat';
        $('#chatPanel').innerHTML='<div class="empty-state"><b>Conversación archivada</b><p>Puedes recuperarla desde la pestaña Archivadas.</p></div>';
        await loadConversations();
      }else{
        await openConversation(activeConversationId);
      }
    };
  });

  const thread=$('#messageThread');
  thread.scrollTop=thread.scrollHeight;
  await loadConversations();
}

function sharedPostMessageHTML(post){
  if(!post)return '';
  if(post.unavailable){
    return `<div class="shared-post-message unavailable"><b>Publicación no disponible</b><span>Puede haberse eliminado, cambiado de audiencia o ya no ser accesible para ti.</span></div>`;
  }

  if(post.gated){
    return `<div class="shared-post-message gated"><div class="shared-post-message-head"><span class="shared-post-kind">18+</span><b>Contenido sensible compartido</b></div><p>${esc(gateText(post.gate_reason))}</p></div>`;
  }

  const kind=post.post_kind==='reel' ? 'Reel' : 'Publicación';
  const media=(post.media_url || post.playback_url)
    ? `<div class="shared-post-message-media">${mediaHTML(post)}</div>`
    : '';
  const caption=String(post.caption || '').trim();

  return `<article class="shared-post-message">
    <div class="shared-post-message-head">
      <span class="shared-post-author-avatar">${avatarHTML(post)}</span>
      <div><b>${esc(post.display_name || post.username || 'RedLibertad')}</b><small>@${esc(post.username || '')}</small></div>
      <span class="shared-post-kind">${kind}</span>
    </div>
    ${media}
    ${caption ? `<p class="shared-post-message-caption">${esc(caption)}</p>` : ''}
    <button type="button" class="shared-post-open" data-open-shared-post="${post.id}">Ver ${kind.toLowerCase()}</button>
  </article>`;
}

function messageHTML(m,other,conversation=activeConversationMeta) {
  const mine=String(m.sender_id)===String(me.id);
  const isGroup=conversation?.is_group===true;
  const senderName=String(m.display_name || m.username || 'Persona');
  const senderLabel=isGroup && !mine
    ? `<button type="button" class="message-sender-link" data-profile="${esc(m.username || '')}">${esc(senderName)}</button>`
    : '';

  let body=m.body ? `<p>${esc(m.body)}</p>` : '';
  let media='';
  if(m.gated){
    const canAccept=m.gate_reason==='permission_required' && m.sender_id;
    media=`<div class="message-gate"><b>Contenido sensible oculto</b><span>${gateText(m.gate_reason)}</span>${canAccept ? `<button class="secondary" data-accept-sensitive="${m.sender_id}">Aceptar contenido sensible de @${esc(m.username || '')}</button>` : ''}</div>`;
  }else if(m.media_url || m.playback_url){
    media=`<div class="message-media">${mediaHTML(m)}</div>`;
  }

  const sharedCard=sharedPostMessageHTML(m.shared_post);

  const reply=m.reply_preview
    ? `<div class="message-reply-preview ${m.reply_preview.gated ? 'gated' : ''}"><small>↩ ${esc(m.reply_preview.display_name || m.reply_preview.username || 'Mensaje')}</small><p>${esc(m.reply_preview.text || 'Mensaje')}</p></div>`
    : '';

  const reactions=Array.isArray(m.reactions) ? m.reactions : [];
  const reactionCounts=new Map(reactions.map(item=>[item.reaction,item]));
  const reactionBar=`<div class="message-reaction-bar">${Object.entries(MESSAGE_REACTIONS).map(([key,emoji])=>{
    const item=reactionCounts.get(key);
    return `<button type="button" class="${item?.reacted_by_me ? 'active' : ''}" data-message-react="${m.id}" data-reaction="${key}" data-reacted="${item?.reacted_by_me ? '1' : '0'}" aria-label="Reaccionar ${emoji}">${emoji}${item?.count ? ` <span>${item.count}</span>` : ''}</button>`;
  }).join('')}</div>`;

  const receipt=mine
    ? isGroup
      ? m.seen_by_all
        ? 'Visto por todos'
        : Number(m.seen_count || 0)>0
          ? `Visto por ${Number(m.seen_count)}`
          : 'Enviado'
      : (m.seen_by_other ? 'Visto' : 'Enviado')
    : '';

  const replyLabel=mine ? 'Tú' : senderName;
  const replyText=m.gated
    ? 'Contenido sensible'
    : String(m.body || '').trim()
      ? String(m.body).trim().slice(0,160)
      : m.media_type==='image'
        ? 'Foto'
        : m.media_type==='video'
          ? 'Vídeo'
          : m.shared_post
            ? 'Publicación compartida'
            : 'Mensaje';

  return `<div class="message-bubble ${mine ? 'mine' : 'theirs'} ${isGroup?'group-message':''}" data-message-created="${esc(m.created_at)}" data-message-id="${m.id}">
    ${senderLabel}
    ${reply}
    ${body}
    ${media}
    ${sharedCard}
    <div class="message-bubble-meta">
      <small><span class="message-time">${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}${m.content_level!=='normal' ? ' · 18+' : ''}</span>${mine ? ` · <span class="message-receipt">${receipt}</span>` : ''}</small>
      <button type="button" class="message-reply-button" data-message-reply="${m.id}" data-reply-label="${esc(replyLabel)}" data-reply-text="${esc(replyText)}">Responder</button>
    </div>
    ${reactionBar}
  </div>`;
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
      replyToMessageId:activeMessageReply?.id || null,
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
    clearTimeout(typingClearTimer);
    sendChatPresence({typing:false});
    toast('Mensaje enviado');
    clearMessageReply();
    clearMessagePreview();

    try {
      await openConversation(activeConversationId);
      loadCommunityConversations();
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
function setNewConversationMode(mode){
  const group=mode==='group';
  all('[data-new-conversation-mode]').forEach(button=>{
    button.classList.toggle('active',button.dataset.newConversationMode===mode);
  });
  $('#newMessageForm')?.classList.toggle('hidden',group);
  $('#newGroupForm')?.classList.toggle('hidden',!group);
  $('#newMessageStatus').textContent='';
  $('#newGroupStatus').textContent='';
}

function openNewConversationModal(){
  $('#newMessageModal').classList.remove('hidden');
  setNewConversationMode('direct');
  setTimeout(()=>$('#newMessageForm input[name="username"]')?.focus(),100);
}

function closeNewConversationModal(){
  $('#newMessageModal').classList.add('hidden');
  $('#newMessageForm')?.reset();
  $('#newGroupForm')?.reset();
  setNewConversationMode('direct');
}

function groupRoleLabel(role){
  return role==='owner' ? 'Propietario' : role==='admin' ? 'Administrador' : 'Miembro';
}

function renderGroupManage(){
  const group=activeConversationMeta;
  if(!group?.is_group)return;

  const canManage=group.can_manage_group===true;
  const ownRole=String(group.member_role || 'member');
  $('#groupManageTitle').textContent=group.title || 'Grupo';
  $('#groupManageSummary').innerHTML=`<b>${Number(group.member_count || 0)} miembros</b><small>${canManage ? 'Puedes gestionar este grupo.' : 'Solo propietarios y administradores pueden cambiar participantes.'}</small>`;
  $('#groupManageStatus').textContent='';

  const renameForm=$('#groupRenameForm');
  const addForm=$('#groupAddMemberForm');
  renameForm?.classList.toggle('hidden',!canManage);
  addForm?.classList.toggle('hidden',!canManage);
  if(renameForm)renameForm.title.value=group.title || '';
  addForm?.reset();

  const participants=Array.isArray(group.participants) ? group.participants : [];
  $('#groupMemberList').innerHTML=participants.map(member=>{
    const self=String(member.id)===String(me?.id);
    const removable=canManage &&
      !self &&
      member.member_role!=='owner' &&
      !(ownRole==='admin' && member.member_role==='admin');
    return `<article class="group-member-row">
      <span class="group-member-avatar">${avatarHTML(member)}</span>
      <div>
        <b>${esc(member.display_name || member.username)} ${member.creator_verified ? '<span class="verified">✓</span>' : ''}</b>
        <small>@${esc(member.username)} · ${groupRoleLabel(member.member_role)}${self ? ' · Tú' : ''}${member.blocked_with_viewer ? ' · Bloqueado' : ''}</small>
      </div>
      <div class="group-member-actions">
        ${member.sensitive_allowed && !self ? `<button type="button" class="tiny-action" data-revoke-group-sensitive="${member.id}" data-revoke-group-name="${esc(member.display_name || member.username)}">No sensible</button>` : ''}
        ${removable ? `<button type="button" class="tiny-action" data-remove-group-member="${member.id}" data-remove-group-name="${esc(member.display_name || member.username)}">Quitar</button>` : ''}
      </div>
    </article>`;
  }).join('');

  all('[data-revoke-group-sensitive]',$('#groupMemberList')).forEach(button=>{
    button.onclick=async()=>{
      button.disabled=true;
      const {r}=await api(`/api/messages/users/${button.dataset.revokeGroupSensitive}/sensitive-permission`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({allow:false})
      });
      if(!r.ok){
        $('#groupManageStatus').textContent='No se pudo revocar el contenido sensible.';
        button.disabled=false;
        return;
      }
      toast(`Contenido sensible de ${button.dataset.revokeGroupName || 'esta persona'} desactivado`);
      await openConversation(activeConversationId);
      renderGroupManage();
    };
  });

  all('[data-remove-group-member]',$('#groupMemberList')).forEach(button=>{
    button.onclick=async()=>{
      const name=button.dataset.removeGroupName || 'esta persona';
      if(!window.confirm(`¿Quitar a ${name} del grupo?`))return;
      button.disabled=true;
      const {r,d}=await api(
        `/api/messages/conversations/${activeConversationId}/group/members/${button.dataset.removeGroupMember}`,
        {method:'DELETE'}
      );
      if(!r.ok){
        $('#groupManageStatus').textContent=d.error==='owner_required'
          ? 'Solo el propietario puede quitar a otro administrador.'
          : 'No se pudo quitar a esta persona.';
        button.disabled=false;
        return;
      }
      toast('Persona retirada del grupo');
      await openConversation(activeConversationId);
      renderGroupManage();
    };
  });

  $('#leaveGroup').classList.toggle('hidden',ownRole==='owner');
  $('#deleteGroup').classList.toggle('hidden',group.can_delete_group!==true);
}

function openGroupManage(){
  if(!activeConversationMeta?.is_group)return;
  $('#groupManageModal').classList.remove('hidden');
  renderGroupManage();
}

function closeGroupManage(){
  $('#groupManageModal').classList.add('hidden');
}

$('#newConversation').onclick=openNewConversationModal;
$('#closeNewMessage').onclick=closeNewConversationModal;
$('#newMessageModal')?.addEventListener('click',event=>{
  if(event.target===$('#newMessageModal'))closeNewConversationModal();
});
all('[data-new-conversation-mode]').forEach(button=>{
  button.onclick=()=>setNewConversationMode(button.dataset.newConversationMode);
});

$('#newMessageForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const fd=new FormData(event.target);
  const status=$('#newMessageStatus');
  status.textContent='Abriendo…';
  const username=String(fd.get('username') || '').replace(/^@/,'');
  const {r,d}=await api('/api/messages/conversations',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username})
  });
  if(!r.ok){
    status.textContent=d.error==='user_not_found'
      ? 'No encuentro ese usuario.'
      : d.error==='message_privacy_denied'
        ? 'Esta persona no acepta nuevas conversaciones.'
        : d.error==='message_privacy_following_only'
          ? 'Solo acepta mensajes de personas que sigue.'
          : d.error==='messaging_blocked'
            ? 'No puedes iniciar esta conversación.'
            : 'No se pudo abrir la conversación.';
    return;
  }
  closeNewConversationModal();
  showView('messages');
  await loadConversations(d.conversationId);
});

$('#newGroupForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const fd=new FormData(event.currentTarget);
  const status=$('#newGroupStatus');
  const title=String(fd.get('title') || '').trim();
  const usernames=[...new Set(
    String(fd.get('usernames') || '')
      .split(/[\s,;]+/)
      .map(value=>value.replace(/^@/,'').trim())
      .filter(Boolean)
  )];

  if(usernames.length<2){
    status.textContent='Añade al menos 2 personas al grupo.';
    return;
  }

  status.textContent='Creando grupo…';
  const submit=event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled=true;
  try{
    const {r,d}=await api('/api/messages/groups',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title,usernames})
    });

    if(!r.ok){
      const label=d.username ? ` @${d.username}` : '';
      status.textContent=
        d.error==='group_user_not_found' || d.error==='user_not_found'
          ? 'No encuentro una de las personas indicadas.'
          : d.error==='messaging_blocked'
            ? `No puedes crear el grupo con${label || ' una de esas personas'} por un bloqueo activo.`
            : d.error==='message_privacy_denied'
              ? `${label || 'Una persona'} no acepta nuevas conversaciones.`
              : d.error==='message_privacy_following_only'
                ? `${label || 'Una persona'} solo acepta mensajes de personas que sigue.`
                : d.error==='group_requires_two_invitees'
                  ? 'El grupo necesita al menos 2 personas además de ti.'
                  : 'No se pudo crear el grupo.';
      return;
    }

    closeNewConversationModal();
    toast('Grupo creado');
    showView('messages');
    await loadConversations(d.conversationId);
  }finally{
    submit.disabled=false;
  }
});

$('#closeGroupManage')?.addEventListener('click',closeGroupManage);
$('#groupManageModal')?.addEventListener('click',event=>{
  if(event.target===$('#groupManageModal'))closeGroupManage();
});

$('#groupRenameForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!activeConversationId || !activeConversationMeta?.is_group)return;
  const status=$('#groupManageStatus');
  const fd=new FormData(event.currentTarget);
  const title=String(fd.get('title') || '').trim();
  status.textContent='Guardando nombre…';

  const {r,d}=await api(`/api/messages/conversations/${activeConversationId}/group`,{
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({title})
  });
  if(!r.ok){
    status.textContent=d.error==='group_admin_required'
      ? 'No tienes permisos para cambiar el grupo.'
      : 'No se pudo cambiar el nombre.';
    return;
  }

  toast('Nombre del grupo actualizado');
  await openConversation(activeConversationId);
  renderGroupManage();
});

$('#groupAddMemberForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!activeConversationId || !activeConversationMeta?.is_group)return;
  const status=$('#groupManageStatus');
  const fd=new FormData(event.currentTarget);
  const username=String(fd.get('username') || '').replace(/^@/,'').trim();
  status.textContent='Añadiendo persona…';

  const {r,d}=await api(`/api/messages/conversations/${activeConversationId}/group/members`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username})
  });

  if(!r.ok){
    status.textContent=
      d.error==='user_not_found'
        ? 'No encuentro ese usuario.'
        : d.error==='already_group_member'
          ? 'Esa persona ya forma parte del grupo.'
          : d.error==='group_member_limit'
            ? 'El grupo ya ha alcanzado el máximo de 20 miembros.'
            : d.error==='messaging_blocked'
              ? 'No puedes añadir a esa persona por un bloqueo activo.'
              : d.error==='message_privacy_denied'
                ? 'Esa persona no acepta nuevas conversaciones.'
                : d.error==='message_privacy_following_only'
                  ? 'Esa persona solo acepta mensajes de personas que sigue.'
                  : 'No se pudo añadir a la persona.';
    return;
  }

  event.currentTarget.reset();
  toast('Persona añadida al grupo');
  await openConversation(activeConversationId);
  renderGroupManage();
});

$('#leaveGroup')?.addEventListener('click',async()=>{
  if(!activeConversationId || !activeConversationMeta?.is_group)return;
  if(!window.confirm('¿Salir de este grupo? Dejarás de recibir sus mensajes y avisos.'))return;

  const id=activeConversationId;
  const {r,d}=await api(`/api/messages/conversations/${id}/group/leave`,{method:'POST'});
  if(!r.ok){
    $('#groupManageStatus').textContent=d.error==='group_owner_cannot_leave'
      ? 'El propietario no puede salir. Puede eliminar el grupo.'
      : 'No se pudo salir del grupo.';
    return;
  }

  closeGroupManage();
  activeConversationId=null;
  activeConversationMeta=null;
  activeConversationOther=null;
  $('.messages-layout')?.classList.remove('chat-open');
  $('#chatPanel').className='chat-panel empty-chat';
  $('#chatPanel').innerHTML='<div class="empty-state"><b>Has salido del grupo</b><p>Ya no recibirás nuevos mensajes de esta conversación.</p></div>';
  await loadConversations();
});

$('#deleteGroup')?.addEventListener('click',async()=>{
  if(!activeConversationId || !activeConversationMeta?.is_group)return;
  if(!window.confirm('¿Eliminar definitivamente este grupo y todos sus mensajes? Esta acción no se puede deshacer.'))return;

  const id=activeConversationId;
  const {r}=await api(`/api/messages/conversations/${id}/group`,{method:'DELETE'});
  if(!r.ok){
    $('#groupManageStatus').textContent='No se pudo eliminar el grupo.';
    return;
  }

  closeGroupManage();
  activeConversationId=null;
  activeConversationMeta=null;
  activeConversationOther=null;
  $('.messages-layout')?.classList.remove('chat-open');
  $('#chatPanel').className='chat-panel empty-chat';
  $('#chatPanel').innerHTML='<div class="empty-state"><b>Grupo eliminado</b><p>La conversación ya no está disponible.</p></div>';
  toast('Grupo eliminado');
  await loadConversations();
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

$('#returnPulseRefresh')?.addEventListener('click',async()=>{
  returnPulseLoaded=false;
  await loadReturnPulse(true);
});



function eventVisibilityLabel(event){
  return event.visibility==='connections' ? 'Solo conexiones'
    : event.visibility==='circles' ? 'Círculos privados'
      : event.visibility==='community' ? (event.community_name ? `Comunidad · ${event.community_name}` : 'Comunidad')
        : 'Público';
}
function eventTypeLabel(event){return event.event_type==='online'?'Online':'Presencial';}
function eventDateLabel(value){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  return date.toLocaleString('es-ES',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
function eventCardHTML(event){
  const mine=String(event.creator_id)===String(me?.id);
  return `<article class="event-card" data-event-card="${event.id}">
    <button type="button" class="event-card-main" data-event-open="${event.id}">
      <span class="event-card-date"><b>${new Date(event.starts_at).toLocaleDateString('es-ES',{day:'2-digit'})}</b><small>${new Date(event.starts_at).toLocaleDateString('es-ES',{month:'short'})}</small></span>
      <span class="event-card-copy">
        <span class="event-card-kicker">${esc(eventTypeLabel(event))} · ${esc(eventVisibilityLabel(event))}</span>
        <b>${esc(event.title)}</b>
        <p>${esc(event.description || 'Sin descripción.')}</p>
        <small>${esc(eventDateLabel(event.starts_at))}${event.event_type==='in_person'&&event.location_label?` · ${esc(event.location_label)}`:''}</small>
        <span class="event-card-stats">☆ ${Number(event.interested_count||0)} interesados · ✓ ${Number(event.going_count||0)} van${mine?' · Creado por ti':''}</span>
      </span>
    </button>
    <div class="event-card-actions">
      <button type="button" class="${event.my_response==='interested'?'active':''}" data-event-respond="${event.id}" data-event-status="interested">☆ Me interesa</button>
      <button type="button" class="${event.my_response==='going'?'active':''}" data-event-respond="${event.id}" data-event-status="going">✓ Voy</button>
    </div>
  </article>`;
}
function renderEvents(){
  const root=$('#eventsList');if(!root)return;
  root.innerHTML=eventItems.length?eventItems.map(eventCardHTML).join(''):'<div class="communities-empty"><b>No hay eventos en este filtro.</b><p>Crea uno o vuelve a revisar más adelante.</p></div>';
  all('[data-event-scope]').forEach(button=>button.classList.toggle('active',button.dataset.eventScope===eventScope));
}
async function loadEvents(openId=null){
  const {r,d}=await api('/api/events?'+new URLSearchParams({scope:eventScope}).toString());
  if(!r.ok)return;
  eventItems=Array.isArray(d.events)?d.events:[];
  renderEvents();
  if(openId)await openEventDetail(openId);
}
function closeEventCreate(){
  $('#eventCreateModal')?.classList.add('hidden');
  $('#eventCreateForm')?.reset();
  syncEventCreateFields();
  if($('#eventCreateStatus'))$('#eventCreateStatus').textContent='';
}
function closeEventDetail(){
  $('#eventDetailModal')?.classList.add('hidden');
  activeEventId=null;activeEventData=null;
  if($('#eventDetailContent'))$('#eventDetailContent').innerHTML='';
}
function syncEventCreateFields(){
  const type=$('#eventType')?.value||'in_person';
  const visibility=$('#eventVisibility')?.value||'public';
  $('#eventLocationField')?.classList.toggle('hidden',type!=='in_person');
  $('#eventOnlineField')?.classList.toggle('hidden',type!=='online');
  $('#eventCirclePicker')?.classList.toggle('hidden',visibility!=='circles');
  $('#eventCommunityField')?.classList.toggle('hidden',visibility!=='community');
}
async function prepareEventCreate(){
  await loadConnectionCircles();
  const circleRoot=$('#eventCircleOptions');
  if(circleRoot)circleRoot.innerHTML=connectionCircles.length?connectionCircles.map(circle=>`<label class="circle-audience-option"><input type="checkbox" value="${circle.id}"><span><b>${circle.is_close?'♥ ':circle.is_favorites?'★ ':''}${esc(circle.name)}</b><small>${Number(circle.member_count||0)} conexiones</small></span></label>`).join(''):'<div class="circle-audience-empty">No tienes círculos todavía.</div>';
  const {r,d}=await api('/api/communities?scope=joined&q=');
  const select=$('#eventCommunitySelect');
  if(select){
    const adminCommunities=r.ok?(d.communities||[]).filter(item=>['owner','admin'].includes(item.viewer_role)):[];
    select.innerHTML='<option value="">Selecciona una comunidad</option>'+adminCommunities.map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('');
  }
  const start=$('#eventCreateForm [name="startsAt"]');
  if(start){
    const min=new Date(Date.now()+5*60*1000);
    start.min=new Date(min.getTime()-min.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  syncEventCreateFields();
}
async function openEventCreate(){
  $('#eventCreateModal')?.classList.remove('hidden');
  await prepareEventCreate();
  setTimeout(()=>$('#eventCreateForm [name="title"]')?.focus(),80);
}
function eventAttendeeHTML(person){
  return `<article class="event-attendee">${profileLink(person.username,`<span class="event-attendee-avatar">${avatarHTML(person)}</span>`,'event-attendee-profile')}<div>${profileLink(person.username,`<b>${esc(person.display_name)} ${person.creator_verified?'<span class="verified">✓</span>':''}</b>`,'event-attendee-profile')}<small>@${esc(person.username)} · ${person.status==='going'?'Va':'Le interesa'}</small></div></article>`;
}
async function openEventDetail(id){
  const eventId=Number(id);if(!Number.isInteger(eventId)||eventId<=0)return;
  activeEventId=eventId;
  $('#eventDetailModal')?.classList.remove('hidden');
  const root=$('#eventDetailContent');if(root)root.innerHTML='<div class="mini-loading">Cargando evento…</div>';
  const {r,d}=await api(`/api/events/${eventId}`);
  if(!r.ok){if(root)root.innerHTML='<div class="info-card"><b>Este evento no está disponible.</b></div>';return;}
  activeEventData=d;
  const event=d.event,attendees=Array.isArray(d.attendees)?d.attendees:[];
  const mine=String(event.creator_id)===String(me?.id);
  root.innerHTML=`<section class="event-detail">
    <span class="eyebrow">${esc(eventTypeLabel(event))} · ${esc(eventVisibilityLabel(event))}</span>
    <h2>${esc(event.title)}</h2>
    <p>${esc(event.description||'Sin descripción.')}</p>
    <div class="event-detail-meta"><span>🗓 ${esc(eventDateLabel(event.starts_at))}</span>${event.ends_at?`<span>Hasta ${esc(eventDateLabel(event.ends_at))}</span>`:''}${event.event_type==='in_person'&&event.location_label?`<span>⌖ ${esc(event.location_label)}</span>`:''}${event.event_type==='online'&&event.online_url?`<a href="${esc(event.online_url)}" target="_blank" rel="noopener noreferrer">Abrir enlace online</a>`:''}</div>
    <div class="event-detail-stats"><span>☆ ${Number(event.interested_count||0)} interesados</span><span>✓ ${Number(event.going_count||0)} van</span></div>
    <div class="event-detail-actions">
      <button class="secondary ${event.my_response==='interested'?'active':''}" data-event-respond="${event.id}" data-event-status="interested">☆ Me interesa</button>
      <button class="primary ${event.my_response==='going'?'active':''}" data-event-respond="${event.id}" data-event-status="going">✓ Voy</button>
      ${event.my_response?`<button class="tiny-action" data-event-reminder="${event.id}" data-event-status="${event.my_response}" data-reminder-enabled="${event.reminder_enabled?'1':'0'}">${event.reminder_enabled?'🔔 Recordatorio activado':'🔕 Activar recordatorio'}</button><button class="tiny-action" data-event-clear-response="${event.id}">Quitar respuesta</button>`:''}
      ${mine?`<button class="danger" data-event-cancel="${event.id}">Cancelar evento</button>`:''}
    </div>
    <section class="event-attendees"><div class="community-section-head"><b>Asistentes</b><small>${d.attendees_visible?'Según su respuesta':'Lista privada según la configuración del evento'}</small></div>${d.attendees_visible?(attendees.length?attendees.map(eventAttendeeHTML).join(''):'<div class="empty-list">Todavía nadie ha respondido.</div>'):'<div class="empty-list">La lista de personas no es visible para ti.</div>'}</section>
  </section>`;
}
async function respondToEvent(id,status){
  const {r,d}=await api(`/api/events/${id}/respond`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,reminderEnabled:true})});
  if(!r.ok)return toast('No se pudo guardar tu respuesta.');
  toast(status==='going'?'Marcado: Voy':'Marcado: Me interesa');
  await loadEvents();
  if(activeEventId)await openEventDetail(activeEventId);
}
function communityAvatarHTML(community){
  return community?.avatar_url
    ? `<img src="${esc(community.avatar_url)}" alt="" loading="lazy" decoding="async">`
    : `<span>${esc(initials(community?.name || 'C'))}</span>`;
}

function communityRoleLabel(role){
  return role==='owner' ? 'Propietario' : role==='admin' ? 'Administrador' : 'Miembro';
}

function communityCardHTML(community){
  const privacy=community.privacy==='private' ? 'Privada' : 'Pública';
  const member=!!community.is_member;
  const status=member
    ? communityRoleLabel(community.viewer_role)
    : community.request_status==='pending'
      ? 'Solicitud pendiente'
      : community.privacy==='private' ? 'Requiere aprobación' : 'Abierta';
  return `<article class="community-card" data-community-card="${community.id}">
    <button type="button" class="community-card-main" data-community-open="${community.id}">
      <span class="community-card-avatar">${communityAvatarHTML(community)}</span>
      <span class="community-card-copy">
        <span class="community-card-kicker">${esc(privacy)} · ${Number(community.member_count||0)} miembros</span>
        <b>${esc(community.name)}</b>
        <p>${esc(community.description || 'Sin descripción todavía.')}</p>
        <small>${esc(status)} · ${Number(community.post_count||0)} publicaciones</small>
      </span>
    </button>
  </article>`;
}


const COMMUNITY_CATEGORY_LABELS={
  general:'General',amistad:'Amistad',ocio:'Ocio',musica:'Música',cine:'Cine',deporte:'Deporte',
  tecnologia:'Tecnología',arte:'Arte',viajes:'Viajes',local:'Local',creadores:'Creadores',debate:'Debate'
};

function parseCommunityInterests(value=''){
  return [...new Set(String(value||'').split(',').map(item=>item.normalize('NFKC').trim().toLowerCase()).filter(Boolean))].slice(0,8);
}

function communityDiscoveryCardHTML(community){
  const privacy=community.privacy==='private' ? 'Privada' : 'Pública';
  const interests=Array.isArray(community.interests)?community.interests:[];
  return `<article class="community-discovery-card" data-community-discovery-card="${community.id}">
    <button type="button" class="community-discovery-main" data-community-open="${community.id}">
      <span class="community-card-avatar">${communityAvatarHTML(community)}</span>
      <span class="community-card-copy">
        <span class="community-card-kicker">${esc(COMMUNITY_CATEGORY_LABELS[community.category] || 'General')} · ${esc(privacy)}</span>
        <b>${esc(community.name)}</b>
        <p>${esc(community.description || 'Sin descripción todavía.')}</p>
        <small>${Number(community.member_count||0)} miembros · ${Number(community.post_count||0)} publicaciones</small>
        <em class="community-discovery-reason">${esc(community.reason || 'Comunidad que podrías explorar')}</em>
        ${interests.length ? `<span class="community-discovery-interests">${interests.slice(0,4).map(item=>`<i>${esc(item)}</i>`).join('')}</span>` : ''}
      </span>
    </button>
    <button type="button" class="community-discovery-hide" data-community-discovery-hide="${community.id}" title="Ocultar sugerencia" aria-label="Ocultar sugerencia">×</button>
  </article>`;
}

function renderCommunityDiscovery(){
  const root=$('#communityDiscoveryList');
  if(!root)return;
  root.innerHTML=communityDiscoveryItems.length
    ? communityDiscoveryItems.map(communityDiscoveryCardHTML).join('')
    : '<div class="communities-empty"><b>No hay sugerencias con estos filtros.</b><p>Puedes cambiar categoría, búsqueda o modo.</p></div>';
  all('[data-community-discovery-mode]').forEach(button=>{
    button.classList.toggle('active',button.dataset.communityDiscoveryMode===communityDiscoveryMode);
  });
}

async function loadCommunityDiscovery(){
  const root=$('#communityDiscoveryList');
  if(root && !communityDiscoveryItems.length)root.innerHTML='<div class="mini-loading">Preparando sugerencias…</div>';
  const params=new URLSearchParams({mode:communityDiscoveryMode,q:communityDiscoverySearch});
  if(communityDiscoveryCategory)params.set('category',communityDiscoveryCategory);
  const {r,d}=await api('/api/communities/discover?'+params.toString());
  if(!r.ok){
    if(root)root.innerHTML='<div class="info-card"><b>No se pudieron cargar las sugerencias.</b></div>';
    return [];
  }
  communityDiscoveryItems=Array.isArray(d.communities)?d.communities:[];
  renderCommunityDiscovery();
  return communityDiscoveryItems;
}

function renderCommunityDirectory(){
  const root=$('#communityList');
  if(!root)return;
  root.innerHTML=communityDirectoryItems.length
    ? communityDirectoryItems.map(communityCardHTML).join('')
    : '<div class="communities-empty"><b>No hay comunidades en este filtro.</b><p>Prueba otra búsqueda o crea la primera.</p></div>';
  all('[data-community-scope]').forEach(button=>{
    button.classList.toggle('active',button.dataset.communityScope===communityScope);
  });
}

async function loadCommunities(){
  const root=$('#communityList');
  if(root && !communityDirectoryItems.length)root.innerHTML='<div class="mini-loading">Cargando comunidades…</div>';
  const params=new URLSearchParams({scope:communityScope,q:communitySearch});
  const {r,d}=await api('/api/communities?'+params.toString());
  if(!r.ok){
    if(root)root.innerHTML='<div class="info-card"><b>No se pudieron cargar las comunidades.</b></div>';
    return [];
  }
  communityDirectoryItems=Array.isArray(d.communities)?d.communities:[];
  renderCommunityDirectory();
  return communityDirectoryItems;
}

function showCommunityDirectory(){
  activeCommunityId=null;
  activeCommunityData=null;
  $('#communityDetail')?.classList.add('hidden');
  $('#communitiesDirectory')?.classList.remove('hidden');
  loadCommunities();
  loadCommunityDiscovery();
}

function communityHeroHTML(data){
  const community=data.community;
  const isMember=community.is_member===true;
  const pending=community.request_status==='pending';
  const joinAction=isMember
    ? community.viewer_role==='owner'
      ? '<span class="community-owner-chip">Propietario</span>'
      : '<button type="button" class="secondary" data-community-leave>Salir</button>'
    : pending
      ? '<button type="button" class="secondary" data-community-leave>Cancelar solicitud</button>'
      : `<button type="button" class="primary" data-community-join>${community.privacy==='private'?'Solicitar acceso':'Unirme'}</button>`;
  const chatAction=isMember && community.conversation_id
    ? `<button type="button" class="secondary" data-community-chat="${community.conversation_id}">Abrir chat</button>`
    : '';
  return `<div class="community-hero-main">
    <div class="community-hero-avatar">${communityAvatarHTML(community)}</div>
    <div class="community-hero-copy">
      <span class="eyebrow">${community.privacy==='private'?'COMUNIDAD PRIVADA':'COMUNIDAD PÚBLICA'}</span>
      <h2>${esc(community.name)}</h2>
      <p>${esc(community.description || 'Sin descripción todavía.')}</p>
      <div class="community-hero-meta">
        <span>${esc(COMMUNITY_CATEGORY_LABELS[community.category] || 'General')}</span>
        <span>${Number(community.member_count||0)} miembros</span>
        <span>${Number(community.post_count||0)} publicaciones</span>
        <span>Creada por @${esc(community.owner_username || '')}</span>
        ${community.viewer_role ? `<span>${esc(communityRoleLabel(community.viewer_role))}</span>` : ''}
      </div>
      ${Array.isArray(data.interests) && data.interests.length ? `<div class="community-hero-interests">${data.interests.map(item=>`<span>${esc(item)}</span>`).join('')}</div>` : ''}
    </div>
  </div>
  <div class="community-hero-actions">${joinAction}${chatAction}</div>`;
}

function renderCommunityRules(data){
  const root=$('#communityRules');
  if(!root)return;
  const rules=Array.isArray(data.rules)?data.rules:[];
  root.innerHTML=rules.length
    ? `<div class="community-section-head"><b>Reglas</b><small>${rules.length} reglas</small></div><ol>${rules.map(rule=>`<li>${esc(rule.body)}</li>`).join('')}</ol>`
    : '<div class="community-rules-empty">Esta comunidad todavía no tiene reglas propias.</div>';
}

function communityMemberHTML(member,community){
  const canManage=community.can_manage===true;
  const canRoles=community.can_manage_roles===true;
  const mine=String(member.id)===String(me?.id);
  const roleActions=canRoles && member.role!=='owner' && !mine
    ? `<button type="button" class="tiny-action" data-community-role-user="${member.id}" data-community-role="${member.role==='admin'?'member':'admin'}">${member.role==='admin'?'Quitar admin':'Hacer admin'}</button>`
    : '';
  const canRemove=canManage && !mine && member.role!=='owner' && !(community.viewer_role==='admin' && member.role==='admin');
  return `<article class="community-member-row">
    ${profileLink(member.username,`<span class="community-member-avatar">${avatarHTML(member)}</span>`,'community-member-profile')}
    <div class="community-member-copy">
      ${profileLink(member.username,`<b>${esc(member.display_name)} ${member.creator_verified?'<span class="verified">✓</span>':''}</b>`,'community-member-name')}
      <small>@${esc(member.username)} · ${esc(communityRoleLabel(member.role))}</small>
    </div>
    <div class="community-member-actions">${roleActions}${canRemove?`<button type="button" class="tiny-action danger-outline" data-community-remove-member="${member.id}">Expulsar</button>`:''}</div>
  </article>`;
}

function renderCommunityMembers(data){
  const root=$('#communityMembers');
  const section=$('#communityMembersSection');
  if(!root || !section)return;
  const members=Array.isArray(data.members)?data.members:[];
  const hidden=data.community.privacy==='private' && !data.community.is_member;
  section.classList.toggle('hidden',hidden);
  if(hidden)return;
  root.innerHTML=members.length
    ? members.map(member=>communityMemberHTML(member,data.community)).join('')
    : '<div class="empty-list">No hay miembros visibles.</div>';
  if($('#communityMemberCount'))$('#communityMemberCount').textContent=`${Number(data.community.member_count||0)} miembros`;
}

function communityPostHTML(post,community){
  const comments=Array.isArray(post.comments)?post.comments:[];
  const media=mediaHTML(post);
  return `<article class="community-feed-post" data-community-post="${post.id}">
    <header>
      ${profileLink(post.username,`<span class="community-post-avatar">${avatarHTML(post)}</span>`,'community-post-profile')}
      <div>
        ${profileLink(post.username,`<b>${esc(post.display_name)} ${post.creator_verified?'<span class="verified">✓</span>':''}</b>`,'community-post-name')}
        <small>@${esc(post.username)} · ${timeAgo(post.created_at)}${post.content_level!=='normal'?' · 18+':''}</small>
      </div>
      ${post.can_delete?`<button type="button" class="tiny-action danger-outline" data-community-delete-post="${post.id}">Eliminar</button>`:''}
    </header>
    ${post.body?`<div class="community-post-body">${captionHTML(post.body)}</div>`:''}
    ${media?`<div class="community-post-media">${media}</div>`:''}
    <div class="community-post-comments">
      <div class="community-comment-count">${Number(post.comment_count||comments.length)} comentarios</div>
      ${comments.length ? comments.map(comment=>`<div class="community-comment" data-community-comment="${comment.id}">
        <div><b>@${esc(comment.username)}</b> <span>${esc(comment.body)}</span><small>${timeAgo(comment.created_at)}</small></div>
        ${comment.can_delete?`<button type="button" class="tiny-action" data-community-delete-comment="${comment.id}" data-community-post-id="${post.id}">Eliminar</button>`:''}
      </div>`).join('') : '<div class="community-comments-empty">Sin comentarios todavía.</div>'}
      ${community.is_member?`<form class="community-comment-form" data-community-comment-form="${post.id}">
        <input name="body" maxlength="1000" placeholder="Escribe un comentario…" required>
        <button class="tiny-action" type="submit">Comentar</button>
      </form>`:''}
    </div>
  </article>`;
}

async function loadCommunityPosts(){
  const root=$('#communityPosts');
  if(!root || !activeCommunityId || !activeCommunityData)return;
  if(!activeCommunityData.can_view_content){
    root.innerHTML='<div class="community-private-gate"><b>Contenido privado</b><p>Solicita acceso para ver publicaciones y miembros de esta comunidad.</p></div>';
    if($('#communityPostCount'))$('#communityPostCount').textContent='Contenido privado';
    return;
  }
  root.innerHTML='<div class="mini-loading">Cargando publicaciones…</div>';
  const {r,d}=await api(`/api/communities/${activeCommunityId}/posts`);
  if(!r.ok){
    root.innerHTML='<div class="info-card"><b>No se pudieron cargar las publicaciones.</b></div>';
    return;
  }
  const posts=Array.isArray(d.posts)?d.posts:[];
  root.innerHTML=posts.length
    ? posts.map(post=>communityPostHTML(post,activeCommunityData.community)).join('')
    : '<div class="community-posts-empty"><b>Todavía no hay publicaciones.</b><p>Los miembros pueden iniciar la conversación.</p></div>';
  if($('#communityPostCount'))$('#communityPostCount').textContent=`${posts.length} publicaciones`;
}

async function loadCommunityAdminData(){
  const data=activeCommunityData;
  if(!data?.community?.can_manage)return;
  const communityId=activeCommunityId;
  const [requestsResult,logResult]=await Promise.all([
    api(`/api/communities/${communityId}/requests`),
    api(`/api/communities/${communityId}/moderation-log`)
  ]);
  if(String(activeCommunityId)!==String(communityId))return;
  const requests=requestsResult.r.ok && Array.isArray(requestsResult.d.requests)?requestsResult.d.requests:[];
  const logs=logResult.r.ok && Array.isArray(logResult.d.items)?logResult.d.items:[];
  const requestRoot=$('#communityRequests');
  if(requestRoot){
    requestRoot.innerHTML=requests.length ? requests.map(request=>`<article class="community-request-row">
      <div><b>${esc(request.display_name)}</b><small>@${esc(request.username)} · ${timeAgo(request.requested_at)}</small></div>
      <div><button type="button" class="tiny-action" data-community-request-user="${request.user_id}" data-community-request-decision="approved">Aprobar</button><button type="button" class="tiny-action danger-outline" data-community-request-user="${request.user_id}" data-community-request-decision="rejected">Rechazar</button></div>
    </article>`).join('') : '<div class="empty-list">No hay solicitudes pendientes.</div>';
  }
  if($('#communityRequestCount'))$('#communityRequestCount').textContent=`${requests.length} pendientes`;
  const logRoot=$('#communityModerationLog');
  if(logRoot){
    logRoot.innerHTML=logs.length ? logs.slice(0,20).map(item=>`<div class="community-moderation-row"><b>${esc(item.action.replaceAll('_',' '))}</b><small>${esc(item.actor_display_name || item.actor_username)} · ${timeAgo(item.created_at)}</small></div>`).join('') : '<div class="empty-list">Sin acciones de moderación.</div>';
  }
}

function renderCommunityAdmin(data){
  const panel=$('#communityAdminPanel');
  if(!panel)return;
  const community=data.community;
  panel.classList.toggle('hidden',!community.can_manage);
  if(!community.can_manage)return;
  const form=$('#communityEditForm');
  if(form){
    form.elements.name.value=community.name || '';
    form.elements.description.value=community.description || '';
    form.elements.privacy.value=community.privacy || 'public';
    if(form.elements.category)form.elements.category.value=community.category || 'general';
    if(form.elements.interests)form.elements.interests.value=(data.interests||[]).join(', ');
    form.elements.rules.value=(data.rules||[]).map(rule=>rule.body).join('\n');
  }
  $('#deleteCommunity')?.classList.toggle('hidden',community.viewer_role!=='owner');
  loadCommunityAdminData();
}

async function openCommunityDetail(communityId){
  const id=Number(communityId);
  if(!Number.isInteger(id)||id<=0)return;
  activeCommunityId=id;
  $('#communitiesDirectory')?.classList.add('hidden');
  $('#communityDetail')?.classList.remove('hidden');
  const hero=$('#communityHero');
  if(hero)hero.innerHTML='<div class="mini-loading">Cargando comunidad…</div>';
  const {r,d}=await api(`/api/communities/${id}`);
  if(!r.ok){
    if(hero)hero.innerHTML='<div class="info-card"><b>Esta comunidad no está disponible.</b></div>';
    return;
  }
  activeCommunityData=d;
  if(hero)hero.innerHTML=communityHeroHTML(d);
  renderCommunityRules(d);
  renderCommunityMembers(d);
  renderCommunityAdmin(d);
  $('#communityComposeSection')?.classList.toggle('hidden',!d.community.is_member);
  await loadCommunityPosts();
  window.scrollTo({top:0,behavior:'smooth'});
}

function openCommunityCreateModal(){
  $('#communityCreateModal')?.classList.remove('hidden');
  $('#communityCreateStatus').textContent='';
  setTimeout(()=>$('#communityCreateForm input[name="name"]')?.focus(),80);
}

function closeCommunityCreateModal(){
  $('#communityCreateModal')?.classList.add('hidden');
  $('#communityCreateForm')?.reset();
  if($('#communityCreateStatus'))$('#communityCreateStatus').textContent='';
}

function parseCommunityRules(value=''){
  return String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).slice(0,10);
}

async function refreshActiveCommunity(){
  if(activeCommunityId)await openCommunityDetail(activeCommunityId);
  await loadCommunities();
}

$('#newEvent')?.addEventListener('click',openEventCreate);
$('#closeEventCreate')?.addEventListener('click',closeEventCreate);
$('#eventCreateModal')?.addEventListener('click',event=>{if(event.target===$('#eventCreateModal'))closeEventCreate();});
$('#closeEventDetail')?.addEventListener('click',closeEventDetail);
$('#eventDetailModal')?.addEventListener('click',event=>{if(event.target===$('#eventDetailModal'))closeEventDetail();});
$('#eventType')?.addEventListener('change',syncEventCreateFields);
$('#eventVisibility')?.addEventListener('change',syncEventCreateFields);
$('#newCommunity')?.addEventListener('click',openCommunityCreateModal);
$('#closeCommunityCreate')?.addEventListener('click',closeCommunityCreateModal);
$('#communityCreateModal')?.addEventListener('click',event=>{
  if(event.target===$('#communityCreateModal'))closeCommunityCreateModal();
});
$('#backToCommunities')?.addEventListener('click',showCommunityDirectory);

$('#communitySearch')?.addEventListener('input',event=>{
  communitySearch=event.currentTarget.value || '';
  clearTimeout(communitySearchTimer);
  communitySearchTimer=setTimeout(loadCommunities,220);
});

$('#communityDiscoveryCategory')?.addEventListener('change',event=>{
  communityDiscoveryCategory=event.currentTarget.value || '';
  loadCommunityDiscovery();
});
$('#communityDiscoverySearch')?.addEventListener('input',event=>{
  communityDiscoverySearch=event.currentTarget.value || '';
  clearTimeout(communityDiscoverySearchTimer);
  communityDiscoverySearchTimer=setTimeout(loadCommunityDiscovery,220);
});

$('#eventCreateForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,status=$('#eventCreateStatus'),submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;status.textContent='Creando evento…';
  try{
    const fd=new FormData(form),visibility=String(fd.get('visibility')||'public');
    const circleIds=visibility==='circles'?all('input[type="checkbox"]:checked',$('#eventCircleOptions')).map(x=>Number(x.value)).filter(Number.isInteger):[];
    const starts=new Date(String(fd.get('startsAt')||''));const endsValue=String(fd.get('endsAt')||'');const ends=endsValue?new Date(endsValue):null;
    if(!Number.isFinite(starts.getTime()))throw new Error('Fecha de inicio no válida.');
    const payload={
      title:String(fd.get('title')||'').trim(),description:String(fd.get('description')||'').trim(),
      eventType:String(fd.get('eventType')||'in_person'),startsAt:starts.toISOString(),endsAt:ends&&Number.isFinite(ends.getTime())?ends.toISOString():null,
      locationLabel:String(fd.get('locationLabel')||'').trim(),onlineUrl:String(fd.get('onlineUrl')||'').trim(),
      visibility,attendeeVisibility:String(fd.get('attendeeVisibility')||'responders'),circleIds,
      communityId:visibility==='community'?Number(fd.get('communityId')||0)||null:null
    };
    const {r,d}=await api('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok)throw new Error(d.error==='invalid_start'?'El evento debe empezar al menos dentro de 5 minutos.':d.error==='location_required'?'Indica el lugar del evento.':d.error==='online_url_required'?'Indica el enlace del evento online.':d.error==='circle_audience_required'?'Selecciona al menos un círculo.':d.error==='community_admin_required'?'Solo administradores pueden crear eventos para esa comunidad.':'No se pudo crear el evento.');
    closeEventCreate();toast('Evento creado');eventScope='mine';showView('events');await loadEvents(d.event.id);
  }catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
});

$('#communityCreateForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const submit=form.querySelector('button[type="submit"]');
  const status=$('#communityCreateStatus');
  submit.disabled=true;
  status.textContent='Creando comunidad…';
  try{
    const fd=new FormData(form);
    const avatarFile=$('#communityAvatarFile')?.files?.[0] || null;
    let avatarUrl='';
    if(avatarFile){
      const media=await uploadFile(avatarFile);
      if(media?.mediaType && media.mediaType!=='image')throw new Error('El avatar debe ser una imagen.');
      avatarUrl=media?.url || '';
    }
    const {r,d}=await api('/api/communities',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:String(fd.get('name')||'').trim(),
        description:String(fd.get('description')||'').trim(),
        privacy:String(fd.get('privacy')||'public'),
        category:String(fd.get('category')||'general'),
        interests:parseCommunityInterests(fd.get('interests')),
        avatarUrl,
        rules:parseCommunityRules(fd.get('rules')),
        createChat:fd.get('createChat')==='on'
      })
    });
    if(!r.ok)throw new Error(d.error==='invalid_community'?'Revisa el nombre y los datos de la comunidad.':'No se pudo crear la comunidad.');
    closeCommunityCreateModal();
    toast('Comunidad creada');
    await loadCommunities();
    await openCommunityDetail(d.community.id);
  }catch(error){
    status.textContent=error.message;
  }finally{submit.disabled=false;}
});

$('#communityEditForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!activeCommunityId || !activeCommunityData?.community?.can_manage)return;
  const form=event.currentTarget;
  const status=$('#communityEditStatus');
  status.textContent='Guardando…';
  try{
    const fd=new FormData(form);
    const payload={
      name:String(fd.get('name')||'').trim(),
      description:String(fd.get('description')||'').trim(),
      privacy:String(fd.get('privacy')||'public'),
      category:String(fd.get('category')||'general'),
      interests:parseCommunityInterests(fd.get('interests')),
      rules:parseCommunityRules(fd.get('rules'))
    };
    const avatarFile=$('#communityEditAvatarFile')?.files?.[0] || null;
    if(avatarFile){
      const media=await uploadFile(avatarFile);
      if(media?.mediaType && media.mediaType!=='image')throw new Error('El avatar debe ser una imagen.');
      payload.avatarUrl=media?.url || '';
    }
    const {r,d}=await api(`/api/communities/${activeCommunityId}`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    if(!r.ok)throw new Error(d.error==='community_admin_required'?'No tienes permisos para editar esta comunidad.':'No se pudo guardar.');
    status.textContent='Guardado.';
    toast('Comunidad actualizada');
    await refreshActiveCommunity();
  }catch(error){status.textContent=error.message;}
});

$('#communityPostForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!activeCommunityId || !activeCommunityData?.community?.is_member)return;
  const form=event.currentTarget;
  const status=$('#communityPostStatus');
  const submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;
  status.textContent='Publicando…';
  try{
    const fd=new FormData(form);
    const file=$('#communityPostFile')?.files?.[0] || null;
    let media=null;
    if(file)media=await uploadFile(file);
    const {r,d}=await api(`/api/communities/${activeCommunityId}/posts`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        body:String(fd.get('body')||''),
        contentLevel:String(fd.get('contentLevel')||'normal'),
        mediaUrl:media?.url || '',
        mediaType:media?.mediaType || 'image',
        mediaProvider:media?.provider || 'local',
        externalId:media?.externalId || null,
        playbackUrl:media?.playbackUrl || null
      })
    });
    if(!r.ok){
      throw new Error(
        d.error==='verified_creator_required_for_nudity'
          ? 'La desnudez requiere una cuenta de creador adulto verificado.'
          : d.error==='empty_post' ? 'Escribe algo o selecciona una foto o vídeo.'
          : 'No se pudo publicar.'
      );
    }
    form.reset();
    status.textContent='';
    toast('Publicado en la comunidad');
    await refreshActiveCommunity();
  }catch(error){status.textContent=error.message;}
  finally{submit.disabled=false;}
});

$('#deleteCommunity')?.addEventListener('click',async()=>{
  if(!activeCommunityId || activeCommunityData?.community?.viewer_role!=='owner')return;
  if(!window.confirm('¿Eliminar esta comunidad? Se eliminarán sus publicaciones, miembros y el chat asociado.'))return;
  const {r}=await api(`/api/communities/${activeCommunityId}`,{method:'DELETE'});
  if(!r.ok)return toast('No se pudo eliminar la comunidad.');
  toast('Comunidad eliminada');
  showCommunityDirectory();
});

document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-community-comment-form]');
  if(!form)return;
  event.preventDefault();
  if(!activeCommunityId)return;
  const postId=form.dataset.communityCommentForm;
  const body=String(new FormData(form).get('body')||'').trim();
  if(!body)return;
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  const {r}=await api(`/api/communities/${activeCommunityId}/posts/${postId}/comments`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})
  });
  button.disabled=false;
  if(!r.ok)return toast('No se pudo comentar.');
  form.reset();
  await loadCommunityPosts();
});

document.addEventListener('click',async event=>{
  const scopeButton=event.target.closest('[data-community-scope]');
  if(scopeButton){
    event.preventDefault();
    communityScope=scopeButton.dataset.communityScope || 'all';
    await loadCommunities();
    return;
  }
  const openButton=event.target.closest('[data-community-open]');
  if(openButton){
    event.preventDefault();
    await openCommunityDetail(openButton.dataset.communityOpen);
    return;
  }
  const joinButton=event.target.closest('[data-community-join]');
  if(joinButton){
    event.preventDefault();
    if(!activeCommunityId)return;
    const {r,d}=await api(`/api/communities/${activeCommunityId}/join`,{method:'POST'});
    if(!r.ok)return toast('No se pudo actualizar la membresía.');
    toast(d.status==='pending'?'Solicitud enviada':'Ya formas parte de la comunidad');
    await refreshActiveCommunity();
    return;
  }
  const leaveButton=event.target.closest('[data-community-leave]');
  if(leaveButton){
    event.preventDefault();
    if(!activeCommunityId)return;
    const isMember=activeCommunityData?.community?.is_member;
    if(isMember && !window.confirm('¿Salir de esta comunidad?'))return;
    const {r}=await api(`/api/communities/${activeCommunityId}/join`,{method:'DELETE'});
    if(!r.ok)return toast('No se pudo actualizar la membresía.');
    toast(isMember?'Has salido de la comunidad':'Solicitud cancelada');
    await refreshActiveCommunity();
    return;
  }
  const chatButton=event.target.closest('[data-community-chat]');
  if(chatButton){
    event.preventDefault();
    showView('messages');
    await loadConversations(chatButton.dataset.communityChat);
    return;
  }
  const reviewButton=event.target.closest('[data-community-request-user]');
  if(reviewButton){
    event.preventDefault();
    const {r}=await api(`/api/communities/${activeCommunityId}/requests/${reviewButton.dataset.communityRequestUser}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({decision:reviewButton.dataset.communityRequestDecision})
    });
    if(!r.ok)return toast('No se pudo revisar la solicitud.');
    toast(reviewButton.dataset.communityRequestDecision==='approved'?'Solicitud aprobada':'Solicitud rechazada');
    await refreshActiveCommunity();
    return;
  }
  const roleButton=event.target.closest('[data-community-role-user]');
  if(roleButton){
    event.preventDefault();
    const {r}=await api(`/api/communities/${activeCommunityId}/members/${roleButton.dataset.communityRoleUser}`,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({role:roleButton.dataset.communityRole})
    });
    if(!r.ok)return toast('No se pudo cambiar el rol.');
    toast('Rol actualizado');
    await refreshActiveCommunity();
    return;
  }
  const removeMember=event.target.closest('[data-community-remove-member]');
  if(removeMember){
    event.preventDefault();
    if(!window.confirm('¿Expulsar a esta persona de la comunidad?'))return;
    const {r}=await api(`/api/communities/${activeCommunityId}/members/${removeMember.dataset.communityRemoveMember}`,{method:'DELETE'});
    if(!r.ok)return toast('No se pudo expulsar a esta persona.');
    toast('Miembro eliminado');
    await refreshActiveCommunity();
    return;
  }
  const deletePost=event.target.closest('[data-community-delete-post]');
  if(deletePost){
    event.preventDefault();
    if(!window.confirm('¿Eliminar esta publicación de la comunidad?'))return;
    const {r}=await api(`/api/communities/${activeCommunityId}/posts/${deletePost.dataset.communityDeletePost}`,{method:'DELETE'});
    if(!r.ok)return toast('No se pudo eliminar la publicación.');
    await refreshActiveCommunity();
    return;
  }
  const deleteComment=event.target.closest('[data-community-delete-comment]');
  if(deleteComment){
    event.preventDefault();
    const {r}=await api(`/api/communities/${activeCommunityId}/posts/${deleteComment.dataset.communityPostId}/comments/${deleteComment.dataset.communityDeleteComment}`,{method:'DELETE'});
    if(!r.ok)return toast('No se pudo eliminar el comentario.');
    await loadCommunityPosts();
    return;
  }
});

function showView(name) {
  const switching=name!==activeViewName;
  if(!switching){
    window.scrollTo({top:0,behavior:'smooth'});
  }else{
    saveCurrentViewScroll();
  }
  if(name!=='messages' && activeConversationId)sendChatPresence({typing:false,conversationId:null});
  if(name!=='reels')pauseReelVideos();
  all('.view').forEach(v => v.classList.add('hidden'));
  const view = document.querySelector('#' + name + 'View');
  if (!view) return;
  view.classList.remove('hidden');
  activeViewName=name;
  animateView(view);
  all('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if(switching)restoreViewScroll(name);
  if (name === 'feed') { loadReturnPulse(); loadHomeMomentum(); loadGrowthPanel(); }
  if (name === 'explore') loadExplore();
  if (name === 'connections') loadConnectionsCenter();
  if (name === 'communities') {
    if(activeCommunityId)openCommunityDetail(activeCommunityId);
    else Promise.all([loadCommunities(),loadCommunityDiscovery()]);
  }
  if (name === 'events') loadEvents();
    if (name === 'reels') loadReels();
  if (name === 'profile') loadProfile();
  if (name === 'messages') {
    const layout=$('.messages-layout');
    if(layout)layout.classList.remove('chat-open');
    activeConversationId=null;
    activeConversationMeta=null;
    activeConversationOther=null;
    loadConversations();
    loadCommunityConversations();
  }
  if (name === 'notifications') loadNotifications();
}
all('[data-view]').forEach(b => b.onclick = () => {
  tapFeedback();
  const target=b.dataset.view;
  if(target===activeViewName){
    window.scrollTo({top:0,behavior:'smooth'});
    return;
  }
  showView(target);
});
all('[data-mode]').forEach(b => b.onclick = () => { all('[data-mode]').forEach(x => x.classList.remove('active')); b.classList.add('active'); loadFeed(b.dataset.mode); });

function updateCommunityComposeFields() {
  const type=$('#communityType')?.value || 'none';
  const fields=$('#communityPromptFields');
  const options=$('#communityPollOptions');
  const label=$('#communityPromptLabel');
  const hint=$('#communityComposeHint');
  if(fields)fields.classList.toggle('hidden',type==='none');
  if(options)options.classList.toggle('hidden',type!=='poll');
  if(label){
    const input=label.querySelector('input');
    if(input)input.placeholder=type==='poll'
      ? '¿Qué quieres preguntar en la encuesta?'
      : '¿Qué quieres preguntar a tu comunidad?';
  }
  if(hint){
    hint.textContent=type==='poll'
      ? 'Los votos se muestran solo como resultados agregados.'
      : 'Cada persona verá su respuesta; el listado completo será privado para ti.';
  }
}

$('#communityType')?.addEventListener('change',updateCommunityComposeFields);

function renderAudienceCircleOptions(rootId,selectedIds=[]){
  const root=$('#'+rootId);
  if(!root)return;
  const selected=new Set((selectedIds||[]).map(String));
  const circles=Array.isArray(connectionCircles)?connectionCircles:[];
  root.innerHTML=circles.length
    ? circles.map(circle=>`
      <label class="circle-audience-option">
        <input type="checkbox" value="${circle.id}" ${selected.has(String(circle.id))?'checked':''}>
        <span><b>${circle.is_favorites ? '★ ' : circle.is_close ? '♥ ' : ''}${esc(circle.name)}</b><small>${Number(circle.member_count || 0)} conexiones</small></span>
      </label>`).join('')
    : '<div class="circle-audience-empty">Todavía no tienes círculos. Puedes crearlos desde Conexiones.</div>';
}

function syncAudienceCirclePicker(selectId,pickerId){
  const select=$('#'+selectId);
  const picker=$('#'+pickerId);
  if(!select || !picker)return;
  picker.classList.toggle('hidden',select.value!=='circles');
}

function selectedAudienceCircleIds(rootId){
  return all('input[type="checkbox"]:checked',$('#'+rootId)).map(input=>Number(input.value)).filter(Number.isInteger);
}

async function prepareAudiencePickers(){
  try{
    await loadConnectionCircles();
  }catch(_error){}
  renderAudienceCircleOptions('postCircleAudienceOptions');
  renderAudienceCircleOptions('storyCircleAudienceOptions');
  syncAudienceCirclePicker('postAudienceSelect','postCircleAudience');
  syncAudienceCirclePicker('storyAudienceSelect','storyCircleAudience');
}

$('#postAudienceSelect')?.addEventListener('change',()=>syncAudienceCirclePicker('postAudienceSelect','postCircleAudience'));
$('#storyAudienceSelect')?.addEventListener('change',()=>syncAudienceCirclePicker('storyAudienceSelect','storyCircleAudience'));

async function openModal() {
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

  await prepareAudiencePickers();

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
  updateCommunityComposeFields();
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
    const communityType=String(fd.get('communityType') || 'none');
    const communityPrompt=String(fd.get('communityPrompt') || '').trim();
    const requestedAudience=String(fd.get('audience') || 'public');
    let audience=requestedAudience;
    let audienceCircleIds=[];
    if(requestedAudience==='close'){
      const closeCircle=connectionCircles.find(circle=>circle.is_close);
      if(!closeCircle)throw new Error('No se pudo preparar el círculo Cercanas.');
      audience='circles';
      audienceCircleIds=[Number(closeCircle.id)];
    }else if(requestedAudience==='circles'){
      audienceCircleIds=selectedAudienceCircleIds('postCircleAudienceOptions');
      if(!audienceCircleIds.length)throw new Error('Selecciona al menos un círculo para esta audiencia.');
    }
    const pollOptions=[1,2,3,4].map(index=>String(fd.get(`pollOption${index}`) || '').trim()).filter(Boolean);

    if (!file && !caption && communityType==='none') throw new Error('Escribe algo, selecciona una foto o añade una herramienta de comunidad.');
    if (kind === 'reel' && !file) throw new Error('Los Reels necesitan una foto o vídeo.');
    if(communityType!=='none' && !me?.creator_verified){
      throw new Error('Las herramientas de comunidad requieren una cuenta de creador verificada.');
    }
    if(communityType==='poll'){
      const unique=[...new Set(pollOptions)];
      if(communityPrompt.length<3 || unique.length<2)throw new Error('La encuesta necesita una pregunta y al menos 2 opciones distintas.');
    }
    if(communityType==='question' && communityPrompt.length<3){
      throw new Error('Escribe la pregunta abierta para tu comunidad.');
    }

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
    const collaborators = String(fd.get('collaborators') || '').split(',').map(x => x.trim()).filter(Boolean);
    const payload = {
      caption,
      kind,
      contentLevel: fd.get('contentLevel'),
      audience,
      audienceCircleIds,
      publishMode,
      scheduledFor,
      editorialDate: fd.get('editorialDate') || null,
      editorialLabel: String(fd.get('editorialLabel') || '').trim(),
      communityType,
      communityPrompt,
      pollOptions,
      participantUsernames: participants,
      collaboratorUsernames: collaborators,
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
        : d.error === 'circle_audience_required'
          ? 'Selecciona al menos un círculo para esta publicación.'
        : d.error === 'invalid_circle_audience'
          ? 'Uno de los círculos seleccionados ya no está disponible.'
        : d.error === 'verified_creator_required_for_publishing_tools'
          ? 'Los borradores y la programación requieren una cuenta de creador verificada.'
        : d.error === 'invalid_scheduled_time'
          ? 'La programación debe estar entre 5 minutos y 90 días.'
        : d.error === 'verified_creator_required_for_community_tools'
          ? 'Las encuestas y preguntas abiertas requieren una cuenta de creador verificada.'
        : d.error === 'invalid_creator_poll'
          ? 'La encuesta necesita una pregunta y entre 2 y 4 opciones distintas.'
        : d.error === 'invalid_creator_question'
          ? 'La pregunta abierta necesita un enunciado.'
        : d.error === 'participant_not_found'
          ? `No encontramos: ${(d.missing || []).join(', ')}`
        : d.error === 'collaborator_not_found'
          ? `No encontramos estos colaboradores: ${(d.missing || []).join(', ')}`
        : d.error === 'collaborator_unavailable'
          ? `No puedes invitar a colaborar a: ${(d.usernames || []).join(', ')}`
          : d.error === 'empty_post'
            ? 'Escribe algo o selecciona una foto o vídeo.'
            : d.error === 'reel_media_required'
              ? 'Los Reels necesitan una foto o vídeo.'
              : 'No se pudo publicar.'
    );

    const waitingApprovals=d.consentRequired||d.collaborationRequired;
    const successMessage=publishMode==='draft'
      ? 'Borrador guardado'
      : publishMode==='scheduled'
        ? (waitingApprovals ? 'Programada. Esperando aprobaciones.' : 'Publicación programada')
        : (waitingApprovals ? 'Publicación guardada. Esperando aprobaciones.' : 'Publicado');

    toast(successMessage);
    $('#modal').classList.add('hidden');
    e.target.reset();
    clearPostMedia();
    updateCreateCounter();
    updateCommunityComposeFields();
    syncAudienceCirclePicker('postAudienceSelect','postCircleAudience');
    syncAudienceCirclePicker('storyAudienceSelect','storyCircleAudience');
    await loadFeed(publishMode==='now' ? 'latest' : currentMode);
    await loadMe();
    await loadGrowthPanel();
  } catch (err) { msg.textContent = err.message; }
});
$('#storyForm').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('#storyMessage');
  try {
    msg.textContent = 'Publicando Story...'; const media = await ensureUpload(); const level = $('#createForm [name="contentLevel"]').value;
    const requestedAudience=$('#storyForm [name="audience"]')?.value || 'public';
    let audience=requestedAudience;
    let audienceCircleIds=[];
    if(requestedAudience==='close'){
      const closeCircle=connectionCircles.find(circle=>circle.is_close);
      if(!closeCircle)throw new Error('No se pudo preparar el círculo Cercanas.');
      audience='circles';
      audienceCircleIds=[Number(closeCircle.id)];
    }else if(requestedAudience==='circles'){
      audienceCircleIds=selectedAudienceCircleIds('storyCircleAudienceOptions');
      if(!audienceCircleIds.length)throw new Error('Selecciona al menos un círculo para esta Story.');
    }
    const { r, d } = await api('/api/stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentLevel: level, audience, audienceCircleIds, mediaUrl: media.url, mediaType: media.mediaType, mediaProvider: media.provider, externalId: media.externalId, playbackUrl: media.playbackUrl }) });
    if (!r.ok) throw new Error(
      d.error === 'verified_creator_required_for_nudity'
        ? 'Necesitas verificación de creador adulto para esta Story.'
        : d.error === 'verified_creator_required_for_vip_content'
          ? 'Solo los creadores verificados pueden publicar Stories Solo VIP.'
        : d.error === 'circle_audience_required'
          ? 'Selecciona al menos un círculo para esta Story.'
        : d.error === 'invalid_circle_audience'
          ? 'Uno de los círculos seleccionados ya no está disponible.'
          : 'No se pudo publicar.'
    );
    toast(requestedAudience==='vip' ? 'Story VIP publicada durante 24 h' : requestedAudience==='close' ? 'Story publicada para Cercanas' : requestedAudience==='circles' ? 'Story publicada para tus círculos' : requestedAudience==='connections' ? 'Story publicada para tus conexiones' : 'Story publicada durante 24 h'); $('#modal').classList.add('hidden'); currentFileMedia = null; await loadStories();
  } catch (err) { msg.textContent = err.message; }
});
$('#shareInternalForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  await shareInsideRedLibertad($('#shareInternalUsername')?.value);
});
$('#refreshShareChats')?.addEventListener('click',()=>loadShareConversations().catch(()=>{}));
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
  const view = params.get('view');
  const conversation = params.get('conversation');
  const trust = params.get('trust');

  if (profile) {
    await openPublicProfile(profile);
    return;
  }

  if (post) {
    await openPostFocus(post);
    return;
  }

  if(view && ['feed','explore','reels','messages','notifications','profile'].includes(view)){
    showView(view);
    if(view==='messages' && conversation){
      await loadConversations(conversation);
    }
    if(view==='profile' && trust==='1'){
      await openTrustModal();
    }
  }
}

(async () => {
  try {
    await loadMe();
    await loadSavedPostIds();
    await Promise.all([loadStories(), loadFeed('foryou'), loadConversations(), loadCommunityConversations(), loadNotifications(), loadHomeSuggestions(), loadReturnPulse(), loadHomeMomentum(), loadGrowthPanel()]);
    startLiveActivity();
    startPresenceHeartbeat();
    syncVisualViewport();
    setConnectivityStatus(navigator.onLine,{initial:true});
    await handleInitialDeepLink();
  } catch (e) { console.error(e); }
})();
