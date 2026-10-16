'use strict';
// V3.2.72 — Native mobile sharing of public Marketplace listings.
// No credentials, database writes, or automatic publication.
function safePublicListingShareUrlV3272(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.origin !== 'https://redlibertad.com' || url.search || url.hash ||
      !/^\/marketplace\/p\/[1-9]\d{0,15}\/[a-z0-9-]{1,75}$/.test(url.pathname)) return '';
    return url.href;
  } catch (_) { return ''; }
}
async function copyPublicListingV3272(url, status) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
    await navigator.clipboard.writeText(url);
    if (status) status.textContent = 'Enlace copiado para compartir.';
  } catch (_) {
    window.prompt('Copia la dirección del anuncio:', url);
  }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button[data-copy-url], button[data-market-native-share]');
  if (!button) return;
  const native = button.hasAttribute('data-market-native-share');
  const url = safePublicListingShareUrlV3272(button.getAttribute(native ? 'data-market-native-share' : 'data-copy-url'));
  if (!url) return;
  const status = document.getElementById('marketCopyNotice');
  if (native && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: String(button.getAttribute('data-market-share-title') || 'Anuncio de RedLibertad').slice(0, 120),
        text: 'Mira este anuncio en RedLibertad',
        url
      });
      if (status) status.textContent = 'Anuncio compartido.';
      return;
    } catch (error) {
      // Cancelling the share dialog must not copy anything or display an error.
      if (error?.name === 'AbortError') return;
    }
  }
  await copyPublicListingV3272(url, status);
});
