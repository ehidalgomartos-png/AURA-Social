/* Consentimiento publicitario de RedLibertad (Meta Pixel + Google Ads).
 * Google Ads: consentimiento basico v2, sin cargar su etiqueta antes de aceptar.
 * Un consentimiento anterior de Meta NO implica consentimiento para Google.
 */
(function () {
  'use strict';

  var META_PIXEL_ID = '2349464439156555';
  var GOOGLE_ADS_ID = 'AW-18535212811';
  var META_CONSENT_KEY = 'redlibertad-meta-pixel-consent-v1';
  var GOOGLE_CONSENT_KEY = 'redlibertad-google-ads-consent-v1';
  var metaDecision = readDecision(META_CONSENT_KEY);
  var googleDecision = readDecision(GOOGLE_CONSENT_KEY);
  var metaLoaded = false;
  var googleLoaded = false;
  var banner = null;

  function readDecision(key) {
    try {
      var value = window.localStorage.getItem(key);
      if (value === 'accepted' || value === 'rejected') return value;
    } catch (_) {}
    return null;
  }

  function storeDecision(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }

  function loadMetaPixel() {
    if (metaDecision !== 'accepted' || metaLoaded) return false;
    metaLoaded = true;
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;
      n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
      t=b.createElement(e);t.async=!0;t.src=v;
      s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
    return true;
  }

  function loadGoogleAds() {
    if (googleDecision !== 'accepted' || googleLoaded) return false;
    googleLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    // Consent Mode v2: los cuatro estados se definen ANTES de config/event.
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('consent', 'update', {
      ad_storage: 'granted',
      analytics_storage: 'denied',
      ad_user_data: 'granted',
      ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', GOOGLE_ADS_ID);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GOOGLE_ADS_ID);
    document.head.appendChild(script);
    return true;
  }

  function clearCookies(names) {
    names.forEach(function (name) {
      document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax';
      if (/^(?:.+\.)?redlibertad\.com$/.test(window.location.hostname)) {
        document.cookie = name + '=; Max-Age=0; Path=/; Domain=.redlibertad.com; SameSite=Lax';
      }
    });
  }

  function saveDecision(next) {
    if (next !== 'accepted' && next !== 'rejected') return;
    var previousMeta = metaDecision;
    var previousGoogle = googleDecision;
    metaDecision = next;
    googleDecision = next;
    storeDecision(META_CONSENT_KEY, next);
    storeDecision(GOOGLE_CONSENT_KEY, next);
    if (banner) banner.hidden = true;
    if (next === 'accepted') {
      loadMetaPixel();
      loadGoogleAds();
      return;
    }
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: 'denied',
        analytics_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    }
    clearCookies(['_fbp','_fbc','_gcl_au','_gcl_aw','_gcl_dc','_gcl_gb','_gcl_gs']);
    // Una etiqueta descargada no puede retirarse sin recargar.
    if ((previousMeta === 'accepted' && metaLoaded) ||
        (previousGoogle === 'accepted' && googleLoaded)) window.location.reload();
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
          '<p>Con tu permiso, RedLibertad utiliza Meta Pixel y Google Ads para medir ' +
          'las visitas y los registros de publicidad. Google y Meta pueden tratar identificadores ' +
          'técnicos de publicidad. No enviamos tu correo, nombre ni contraseña en los eventos. ' +
          'Puedes rechazar sin perder funciones. ' +
          '<a href="/cookies/">Leer la política de cookies</a>.</p></div>' +
          '<div class="meta-consent-actions">' +
            '<button type="button" data-meta-consent="rejected">Rechazar</button>' +
            '<button type="button" data-meta-consent="accepted">Aceptar</button>' +
          '</div></div>';
      document.body.appendChild(banner);
      banner.querySelectorAll('[data-meta-consent]').forEach(function (button) {
        button.addEventListener('click', function () {
          saveDecision(button.getAttribute('data-meta-consent'));
        });
      });
    }
    banner.hidden = false;
  }

  // Conservamos el comportamiento de Meta para no romper la campana existente.
  window.RedLibertadMeta = Object.freeze({
    trackRegistration: function () {
      if (metaDecision !== 'accepted') return false;
      loadMetaPixel();
      if (typeof window.fbq !== 'function') return false;
      window.fbq('track', 'CompleteRegistration');
      return true;
    },
    openPreferences: showPreferences
  });

  // La accion Registro confirmado se deja intencionadamente INACTIVA.
  // Solo se habilitara cuando exista un evento del servidor autentico,
  // generado tras verificar el correo y resistente a duplicados.
  // El registro actual /api/auth/register NO garantiza verificacion.

  var manage = document.getElementById('metaCookieSettings');
  if (manage) manage.addEventListener('click', showPreferences);

  if (metaDecision === 'accepted') loadMetaPixel();
  if (googleDecision === 'accepted') loadGoogleAds();

  var params = new URLSearchParams(window.location.search);
  if (params.get('cookies') === 'manage' ||
      metaDecision === null || googleDecision === null) showPreferences();
})();
