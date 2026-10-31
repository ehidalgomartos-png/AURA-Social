'use strict';
// V3.6.45 — progressive enhancement only. Every link works without JavaScript.
(()=>{
 const input=document.getElementById('sm-search');
 const status=document.getElementById('sm-search-status');
 const sections=[...document.querySelectorAll('[data-map-section]')];
 const reset=document.getElementById('sm-clear');
 const empty=document.getElementById('sm-no-results');
 if(!input||!status||!sections.length||!reset||!empty)return;
 const clean=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
 const groups=sections.map(section=>({
  section,
  cards:[...section.querySelectorAll('[data-service-id]')].map(card=>({
   card,
   text:clean(card.dataset.search||'')
  }))
 }));
 function update(){
  const phrase=clean(input.value).slice(0,100);
  const words=phrase.split(/\s+/).filter(Boolean);
  let visible=0;
  for(const {section,cards} of groups){
   let groupVisible=0;
   for(const {card,text} of cards){
    const matches=words.every(word=>text.includes(word));
    card.hidden=!matches;
    if(matches){visible++;groupVisible++;}
   }
   section.hidden=groupVisible===0;
  }
  empty.hidden=visible!==0;
  status.textContent=visible===0?
   'No hay servicios que coincidan con tu búsqueda.':
   visible===1?'Mostrando 1 servicio y acceso.':
   'Mostrando '+visible+' servicios y accesos.';
 }
 input.addEventListener('input',update);
 reset.addEventListener('click',()=>{
  input.value='';
  update();
  input.focus({preventScroll:true});
 });
 // A search query is never sent to a server or stored in the browser.
 update();
})();
