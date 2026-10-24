/* Meta Pixel de RedLibertad: solo después de consentimiento publicitario. */
(function () {
  'use strict';

  var PIXEL_ID = '2349464439156555';
  var CONSENT_KEY = 'redlibertad-meta-pixel-consent-v1';
  var decision = null;
  var loaded = false;
  var banner = null;

  try {
    var saved = window.localStorage.getItem(CONSENT_KEY);
    if (saved === 'accepted' || saved === 'rejected') decision = saved;
  } catch (_) {
    // Si el almacenamiento está bloqueado se solicita consentimiento de nuevo.
  }

  function loadPixel() {
    if (decision !== 'accepted' || loaded) return false;
    loaded = true;
    // Código base oficial; NO se carga la biblioteca de Meta antes de aceptar.
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;
      n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
      t=b.createElement(e);t.async=!0;t.src=v;
      s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    return true;
  }

  function clearMetaCookies() {
    ['_fbp', '_fbc'].forEach(function(name) {
      document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax';
      if (/^(?:.+\.)?redlibertad\.com$/.test(window.location.hostname)) {
        document.cookie = name + '=; Max-Age=0; Path=/; Domain=.redlibertad.com; SameSite=Lax';
      }
    });
  }

  function saveDecision(next) {
    var previous = decision;
    decision = next;
    try { window.localStorage.setItem(CONSENT_KEY, next); } catch (_) {}
    if (banner) banner.hidden = true;

    if (next === 'accepted') {
      loadPixel();
    } else {
      clearMetaCookies();
      // La biblioteca ya cargada no se puede descargar; recargar impide nuevos eventos.
      if (previous === 'accepted' && loaded) window.location.reload();
    }
  }

  function showPreferences() {
    if (!banner) {
      banner = document.createElement('section');
      banner.className = 'meta-consent-banner';
      banner.setAttribute('role', 'region');
      banner.setAttribute('aria-label', 'Preferencias de cookies publicitarias');
      banner.innerHTML =
        '<div class="meta-consent-inner">' +
          '<div><strong>Tu privacidad importa</strong>' +
          '<p>Con tu permiso, RedLibertad utilizará Meta Pixel para medir visitas y registros de las campañas publicitarias. ' +
          'Puedes rechazarlo y seguir usando la web normalmente. ' +
          '<a href="/cookies/">Leer la política de cookies</a>.</p></div>' +
          '<div class="meta-consent-actions">' +
            '<button type="button" data-meta-consent="rejected">Rechazar</button>' +
            '<button type="button" data-meta-consent="accepted">Aceptar</button>' +
          '</div></div>';
      document.body.appendChild(banner);
      banner.querySelectorAll('[data-meta-consent]').forEach(function(button) {
        button.addEventListener('click', function () {
          saveDecision(button.getAttribute('data-meta-consent'));
        });
      });
    }
    banner.hidden = false;
  }

  // No se recopilan email, nombres, fechas de nacimiento ni contraseñas.
  window.RedLibertadMeta = Object.freeze({
    trackRegistration: function () {
      if (decision !== 'accepted') return false;
      loadPixel();
      if (typeof window.fbq !== 'function') return false;
      window.fbq('track', 'CompleteRegistration');
      return true;
    },
    openPreferences: showPreferences
  });

  var manage = document.getElementById('metaCookieSettings');
  if (manage) manage.addEventListener('click', showPreferences);

  var params = new URLSearchParams(window.location.search);
  if (params.get('cookies') === 'manage' || decision === null) {
    showPreferences();
  } else if (decision === 'accepted') {
    loadPixel();
  }
})();
