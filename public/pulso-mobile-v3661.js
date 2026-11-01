'use strict';
// V3.6.61 — Descripción desplegable sin modificar el vídeo ni realizar consultas.
(()=>{
 const feed=document.getElementById('pulsoFeed');
 if(!feed)return;
 feed.addEventListener('click',event=>{
  const toggle=event.target.closest('[data-pulso-caption-toggle]');
  if(!toggle||!feed.contains(toggle))return;
  const card=toggle.closest('[data-pulso-item]');
  if(!card)return;
  const caption=card.querySelector('.pulso-caption-clamped-v3661');
  if(!caption||toggle.getAttribute('aria-controls')!==caption.id)return;
  const expanded=toggle.getAttribute('aria-expanded')==='true';
  caption.classList.toggle('is-expanded-v3661',!expanded);
  toggle.setAttribute('aria-expanded',String(!expanded));
  toggle.textContent=expanded?'Ver descripción completa':'Ver menos';
 });
})();
