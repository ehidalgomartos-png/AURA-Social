'use strict';
(()=>{
 const root=document.getElementById('editorialHomeBlock');
 const list=document.getElementById('editorialHomeItems');
 if(!root||!list)return;
 let requestId=0;
 const make=(tag,cls,text)=>{
   const node=document.createElement(tag);
   if(cls)node.className=cls;
   if(text!==undefined)node.textContent=String(text);
   return node;
 };
 const open=async()=>{
  const current=++requestId;
  try{
   const r=await fetch('/api/editorial-social/discover',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('editorial_discovery_unavailable');
   const d=await r.json();
   if(current!==requestId)return;
   const rows=Array.isArray(d.items)?d.items:[];
   list.replaceChildren();
   for(const item of rows){
    const id=String(item.id||'');if(!/^[1-9][0-9]{0,14}$/.test(id))continue;
    const url='/noticias/p/'+encodeURIComponent(id);
    const card=make('article','editorial-home-card');
    const header=make('div','editorial-home-profile');
    const avatar=make('span','editorial-home-avatar');
    const logo=document.createElement('img');
    logo.src='/assets/logo-mark.svg';logo.alt='';logo.loading='lazy';logo.width=26;logo.height=26;
    avatar.append(logo);
    const profile=make('div','editorial-home-profile-copy');
    const name=make('b','',item.profile_name||'RedLibertad Noticias');
    const meta=make('small','',String(item.category||'Actualidad')+' · Perfil editorial revisado');
    profile.append(name,meta);
    const badge=make('span','editorial-home-badge','NOTICIAS');
    header.append(avatar,profile,badge);
    const heading=make('h3','editorial-home-title');
    heading.textContent=String(item.title||'');
    const headline=document.createElement('a');headline.href=url;headline.className='editorial-home-headline';
    headline.append(heading);
    const summary=make('p','editorial-home-summary',String(item.summary||'').slice(0,270));
    const source=make('small','editorial-home-source','Fuente original: '+String(item.source_name||'Medio identificado'));
    const footer=make('div','editorial-home-engagement');
    const likes=make('span','',String(Math.max(0,Number(item.like_count)||0))+' Me gusta');
    const comments=make('span','',String(Math.max(0,Number(item.comment_count)||0))+' comentarios');
    const go=document.createElement('a');go.href=url;go.className='editorial-home-open';
    go.textContent='Ver noticia y conversar →';
    footer.append(likes,comments,go);
    card.append(header,headline,summary,source,footer);
    list.append(card);
   }
   root.classList.toggle('hidden',list.children.length===0);
  }catch(_){if(current===requestId)root.classList.add('hidden');}
 };
 open();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)open();});
})();
