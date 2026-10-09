'use strict';
(()=>{
 const root=document.getElementById('editorialHomeBlock');
 const list=document.getElementById('editorialHomeItems');
 if(!root||!list)return;
 const open=async()=>{
  try{
   const r=await fetch('/api/editorial-social/discover',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)return;
   const d=await r.json();const rows=Array.isArray(d.items)?d.items:[];
   list.replaceChildren();
   for(const item of rows){
    const id=String(item.id||'');if(!/^[1-9][0-9]{0,14}$/.test(id))continue;
    const card=document.createElement('a');card.className='editorial-home-card';card.href='/noticias/p/'+encodeURIComponent(id);
    const label=document.createElement('span');label.className='editorial-home-label';
    label.textContent=String(item.category||'Actualidad')+' · Editorial revisado';
    const heading=document.createElement('b');heading.textContent=String(item.title||'');
    const source=document.createElement('small');source.textContent=String(item.profile_name||'RedLibertad')+' · Fuente: '+String(item.source_name||'');
    card.append(label,heading,source);list.append(card);
   }
   root.classList.toggle('hidden',list.children.length===0);
  }catch(_){root.classList.add('hidden');}
 };
 open();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)open();});
})();
