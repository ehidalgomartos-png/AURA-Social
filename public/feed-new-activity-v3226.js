'use strict';
/* V3.2.26 — Inform about real new posts without interrupting reading.
   Poll only a visible, active Home tab; no fake people, content or metrics. */
(()=>{
  const root=document.getElementById('feedNewActivityV3226');
  const button=document.getElementById('feedNewActivityButtonV3226');
  const label=document.getElementById('feedNewActivityLabelV3226');
  const feed=document.getElementById('feed');
  const view=document.getElementById('feedView');
  if(!root||!button||!label||!feed||!view)return;
  const POLL_MS=120000;
  let observedSince=new Date().toISOString();
  let lastCheckedAt=Date.now();
  let requestSequence=0,checking=false;
  const modeNow=()=>view.querySelector('[data-mode].active')?.dataset.mode||'';
  const canCheck=()=>!document.hidden&&!view.classList.contains('hidden')
    &&['foryou','latest'].includes(modeNow())
    &&feed.getAttribute('aria-busy')!=='true'
    &&navigator.onLine!==false;
  const hide=()=>root.classList.add('hidden');
  function onFeedUpdate(){
    ++requestSequence;
    observedSince=new Date().toISOString();
    lastCheckedAt=Date.now();
    hide();
  }
  async function checkNewPosts(){
    if(checking||!canCheck()||Date.now()-lastCheckedAt<POLL_MS)return;
    lastCheckedAt=Date.now();
    checking=true;
    const current=++requestSequence;
    try{
      const response=await fetch('/api/posts/new-activity?since='+encodeURIComponent(observedSince),{
        credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}
      });
      if(!response.ok)throw Error('activity_unavailable');
      const data=await response.json();
      if(current!==requestSequence||!canCheck())return;
      const count=Math.min(10,Math.max(0,Number(data?.count)||0));
      if(data?.ok!==true||!count){hide();return;}
      label.textContent=count>=10
        ? '10+ publicaciones nuevas · Ver'
        : count===1
          ? '1 publicación nueva · Ver'
          : count+' publicaciones nuevas · Ver';
      root.classList.remove('hidden');
    }catch(_){if(current===requestSequence)hide();}
    finally{checking=false;}
  }
  document.addEventListener('redlibertad:feed-updated',onFeedUpdate);
  button.addEventListener('click',()=>{
    hide();
    const latest=view.querySelector('[data-mode="latest"]');
    if(!latest)return;
    latest.click();
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    feed.scrollIntoView?.({behavior:reduced?'auto':'smooth',block:'start'});
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkNewPosts();});
  window.addEventListener('online',()=>void checkNewPosts());
  window.setInterval(()=>void checkNewPosts(),POLL_MS);
})();
