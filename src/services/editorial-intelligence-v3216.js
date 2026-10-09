'use strict';
// V3.2.16: deterministic newsroom triage. Advisory only; NEVER removes,
// rejects, approves or publishes a candidate. No AI provider or DB mutations.
const previous=require('./editorial-intelligence-v3215');
const {CATEGORIES,advise,tokens}=previous;
const DAY=86400000;
function topicOverlap(a,b){
  const first=tokens(a?.source_title),second=tokens(b?.source_title);
  if(first.length<3||second.length<3)return 0;
  const x=new Date(a.published_at||a.fetched_at).getTime();
  const y=new Date(b.published_at||b.fetched_at).getTime();
  if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x-y)>7*DAY)return 0;
  const shared=first.filter(t=>second.includes(t)).length;
  const union=new Set([...first,...second]).size;
  return shared>=3&&union?shared/union:0;
}
function sourceCoverage(sources=[]){
  const counts=Object.fromEntries(CATEGORIES.map(category=>[category,0]));
  const unique=new Set();
  for(const source of sources){
    if(source?.status!=='approved'||!Object.hasOwn(counts,source.category))continue;
    const key=String(source.id||source.feed_url||source.name||'').trim();
    if(!key||unique.has(key))continue;
    unique.add(key);
    counts[source.category]++;
  }
  return {
    approvedSources:unique.size,
    byCategory:counts,
    categoriesWithoutApprovedSources:CATEGORIES.filter(cat=>!counts[cat]),
    notice:'Cobertura orientativa de fuentes ya registradas. Nuevas fuentes requieren alta, derechos y aprobación manual.'
  };
}
function enrich(items=[],pool=[],now=new Date()){
  const remaining=items.map((item,index)=>({...item,_order:index,advice:advise(item,pool,now)}));
  const chosen=[],categories=new Map(),sources=new Map();
  while(remaining.length){
    let bestIndex=0,best=-Infinity;
    for(let i=0;i<remaining.length;i++){
      const row=remaining[i],cat=row.advice.category_suggestion.category;
      const source=row.source_id==null?null:String(row.source_id);
      const overlap=chosen.reduce((max,item)=>Math.max(max,topicOverlap(row,item)),0);
      // Treat repeated topic separately from repeated category or source.
      // All penalties are soft: no candidate is ever discarded.
      const score=row.advice.priority_score
        -Math.min(30,(categories.get(cat)||0)*8)
        -(source?Math.min(24,(sources.get(source)||0)*10):0)
        -(overlap>=0.43?Math.min(50,27+Math.round(overlap*19)):0);
      if(score>best){best=score;bestIndex=i;}
    }
    const [row]=remaining.splice(bestIndex,1);
    const category=row.advice.category_suggestion.category;
    const source=row.source_id==null?null:String(row.source_id);
    const similar=chosen.filter(other=>topicOverlap(row,other)>=0.43);
    const categoryCount=categories.get(category)||0;
    categories.set(category,categoryCount+1);
    if(source)sources.set(source,(sources.get(source)||0)+1);
    const { _order, ...cleanRow }=row;
    chosen.push({...cleanRow,advice:{
      ...row.advice,
      topic_note:similar.length
        ?'Tema parecido a otras noticias ya incluidas en esta selección; comparar antes de elegir.'
        :'Tema diferenciado en la muestra seleccionada; comprobar antes de publicar.',
      selection_note:similar.length?'Se muestra después para facilitar la diversidad temática.'
        :categoryCount?'Se alterna con otras categorías y fuentes cuando es posible.':'Se prioriza diversidad sin ocultar noticias.',
      related_in_selection:similar.length,
      diversity_note:categoryCount>=3?'varias noticias de esta categoría':'selección temática variada'
    }});
  }
  return chosen;
}
module.exports={...previous,topicOverlap,sourceCoverage,enrich};
