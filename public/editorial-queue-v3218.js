'use strict';
// V3.2.18 — Read-only, local triage for the already-loaded editorial queue.
// Filters NEVER query other users, modify the candidate, approve or publish.
// The backend review endpoint currently returns a maximum of 100 per status.
const CATEGORIES=['actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento'];
const VIEWS=['all','high','related','needs-draft','needs-attention'];
function normalize(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9ñ]+/g,' ').replace(/\s+/g,' ').trim();
}
function filterEditorialQueueV3218(items=[],filters={}){
  const loaded=Array.isArray(items)?items:[];
  const query=normalize(filters.query).slice(0,140);
  const words=query?query.split(' ').filter(Boolean):[];
  const category=CATEGORIES.includes(filters.category)?filters.category:'all';
  const source=/^[0-9]{1,18}$/.test(String(filters.source??''))?String(filters.source):'all';
  const view=VIEWS.includes(filters.view)?filters.view:'all';
  const visible=loaded.filter(item=>{
    if(!item||typeof item!=='object')return false;
    if(category!=='all'&&item.category!==category)return false;
    if(source!=='all'&&String(item.source_id??'')!==source)return false;
    if(words.length){
      const content=normalize([item.source_title,item.editorial_title,item.source_name,item.source_excerpt,item.editorial_summary].join(' '));
      if(!words.every(word=>content.includes(word)))return false;
    }
    if(view==='high'&&!(item.status==='pending'&&item.advice?.priority_label==='alta'))return false;
    if(view==='related'&&!(item.status==='pending'&&
      ((item.advice?.possible_duplicates?.length||0)>0||(Number(item.advice?.related_in_selection)||0)>0)))return false;
    if(view==='needs-draft'&&!(item.status==='pending'&&(!item.editorial_title||!item.editorial_summary)))return false;
    if(view==='needs-attention'&&!(item.status==='pending'&&
      ((item.provenance?.warningCount||0)>0||item.advice?.category_suggestion?.changeSuggested)))return false;
    return true;
  });
  return {items:visible,shown:visible.length,loaded:loaded.length,
    filters:{query,category,source,view},limited:loaded.length>=100};
}
function editorialQueueSourcesV3218(items=[]){
  const sources=new Map();
  for(const item of Array.isArray(items)?items:[]){
    if(item?.source_id==null)continue;
    const id=String(item.source_id);
    if(!/^[0-9]{1,18}$/.test(id))continue;
    if(!sources.has(id))sources.set(id,{
      id,name:String(item.source_name||'Medio no disponible').slice(0,100)
    });
  }
  return [...sources.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
if(typeof module!=='undefined'&&module.exports)module.exports={
  filterEditorialQueueV3218,editorialQueueSourcesV3218
};
if(typeof window!=='undefined')window.editorialQueueV3218={
  filter:filterEditorialQueueV3218,sources:editorialQueueSourcesV3218
};
