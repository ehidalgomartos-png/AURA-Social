'use strict';
// Installed PWA badges only: no prompts, timers, tracking or browser storage.
(function initPwaBadgeV3323(){
 const installed=()=>navigator.standalone===true ||
  window.matchMedia?.('(display-mode: standalone)')?.matches===true ||
  window.matchMedia?.('(display-mode: fullscreen)')?.matches===true;
 let owner=null,count=null,revision=0,lastRefresh=0,inflight=null,operations=Promise.resolve();
 const safe=n=>Number.isSafeInteger(n)&&n>=0?Math.min(9999,n):null;
 function schedule(value){
  const token=++revision;
  operations=operations.catch(()=>{}).then(async()=>{
   if(token!==revision||!installed())return;
   try{
    if(value>0&&typeof navigator.setAppBadge==='function')await navigator.setAppBadge(value);
    else if(value===0&&typeof navigator.clearAppBadge==='function')await navigator.clearAppBadge();
   }catch(_){/* Unsupported platform or denied icon permission. */}
  });
  return operations;
 }
 function setUser(id){
  const key=id==null?null:String(id);
  if(owner===key)return;
  owner=key;count=null;lastRefresh=0;
  void schedule(0); // Never inherit another account's badge.
 }
 function sync(id,value){
  setUser(id);
  const next=safe(value);
  if(owner===null||next===null||!installed())return false;
  if(count===next)return true;
  count=next;void schedule(next);return true;
 }
 async function refresh({force=false}={}){
  if(owner===null||!installed()||document.visibilityState!=='visible'||
    navigator.onLine===false)return false;
  if(inflight)return inflight;
  const now=Date.now();
  if(!force&&now-lastRefresh<20000)return false;
  lastRefresh=now;
  const expectedOwner=owner,expectedRevision=revision;
  const task=(async()=>{
   try{
    const r=await fetch('/api/live/badge',{
      credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(!r.ok)return false;
    const d=await r.json();
    if(owner!==expectedOwner||revision!==expectedRevision)return false;
    return sync(expectedOwner,d.badgeUnread);
   }catch(_){return false;}
  })().finally(()=>{if(inflight===task)inflight=null;});
  inflight=task;return task;
 }
 function clear(){owner=null;count=null;lastRefresh=0;return schedule(0);}
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')void refresh();
 });
 window.addEventListener('pageshow',()=>{void refresh();});
 window.RedLibertadPwaBadgeV3323={setUser,sync,refresh,clear};
})();
