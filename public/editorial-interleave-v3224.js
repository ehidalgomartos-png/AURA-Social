'use strict';
// V3.2.24. The Home feed must privilege real people's posts:
// 2 original feed posts, then at most 1 reviewed editorial card.
// These functions have no side effects and are safe to test without a browser.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RedLibertadNewsMixV3224=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  const allowedMode=mode=>mode==='foryou'||mode==='latest';
  function slots(postCount,availableCount,maxNews=3){
    const posts=Number.isSafeInteger(postCount)&&postCount>0?postCount:0;
    const news=Number.isSafeInteger(availableCount)&&availableCount>0?availableCount:0;
    const max=Number.isSafeInteger(maxNews)&&maxNews>0?maxNews:0;
    const count=Math.min(Math.floor(posts/2),news,max);
    return Array.from({length:count},(_,index)=>(index+1)*2);
  }
  function unseenNews(items,usedIds){
    const seen=new Set(Array.isArray(usedIds)?usedIds.map(String):[]);
    const ids=new Set();
    return (Array.isArray(items)?items:[]).filter(item=>{
      const id=String(item?.id||'');
      if(!/^[1-9][0-9]{0,14}$/.test(id)||seen.has(id)||ids.has(id))return false;
      ids.add(id);return true;
    });
  }
  return {allowedMode,slots,unseenNews};
});
