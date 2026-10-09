'use strict';

// V3.2.6: advisory, explainable queue ordering and an admin-only manual calendar.
// This service never schedules jobs, fetches feeds or publishes articles.
const {z}=require('zod');
const {ageDays}=require('./editorial-quality-v325');
const CATEGORIES=['actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento'];
const planSchema=z.object({
  revision:z.number().int().min(0).safe(),
  plannedFor:z.string().datetime({offset:true}).nullable(),
  priority:z.number().int().min(1).max(3),
  note:z.string().trim().max(500).default('')
}).strict();

let ready=null;
async function ensurePlanningSchema(db){
  if(!ready)ready=(async()=>{
    await db.query(
      "CREATE TABLE IF NOT EXISTS editorial_plans ("+
      "candidate_id BIGINT PRIMARY KEY REFERENCES editorial_candidates(id) ON DELETE CASCADE,"+
      "planned_for TIMESTAMPTZ, priority SMALLINT NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),"+
      "note VARCHAR(500) NOT NULL DEFAULT '',candidate_revision INTEGER NOT NULL CHECK(candidate_revision>=0),"+
      "updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,"+
      "created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
    await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_plans_calendar ON editorial_plans(planned_for,candidate_id) WHERE planned_for IS NOT NULL');
  })().catch(e=>{ready=null;throw e;});
  return ready;
}

function selectionScore(item,now=new Date()){
  const reasons=[];
  let value=0;
  const days=ageDays(item.published_at||item.fetched_at,now);
  if(days!==null){
    if(days<=1){value+=25;reasons.push('noticia_reciente');}
    else if(days<=3){value+=15;reasons.push('menos_de_3_dias');}
    else if(days<=7){value+=5;}
    else reasons.push('noticia_antigua');
  }
  if(item.quality_decision==='clear' && Number(item.quality_revision)===Number(item.revision)){
    value+=40;reasons.push('calidad_validada');
  }else reasons.push('calidad_pendiente');
  if(item.source_status==='approved')value+=10;else reasons.push('fuente_no_preparada');
  if(item.profile_status==='ready')value+=10;else reasons.push('perfil_no_preparado');
  if(item.editorial_title&&item.editorial_summary)value+=5;
  const priority=[0,4,9,15][Math.min(3,Math.max(1,Number(item.priority)||2))];
  value+=priority;
  if(Number(item.category_recent_count||0)>=3){value-=8;reasons.push('categoria_repetida');}
  if(Number(item.source_recent_count||0)>=2){value-=10;reasons.push('fuente_repetida');}
  const plannedTime=item.planned_for?new Date(item.planned_for).getTime():NaN;
  if(Number.isFinite(plannedTime)){
    reasons.push('fecha_objetivo_manual');
    if(plannedTime<=now.getTime())reasons.push('fecha_objetivo_vencida');
  }
  return {score:Math.max(0,value),reasons};
}

function shortlist(items,{category='',sourceId='',search='',quality='all'}={},now=new Date()){
  const term=String(search||'').trim().toLocaleLowerCase('es').slice(0,100);
  const filtered=items.filter(item=>{
    if(category&&item.category!==category)return false;
    if(sourceId&&String(item.source_id)!==String(sourceId))return false;
    if(term&&![
      item.editorial_title,item.source_title,item.source_name,item.category
    ].some(v=>String(v||'').toLocaleLowerCase('es').includes(term)))return false;
    const ready=item.quality_decision==='clear'&&Number(item.quality_revision)===Number(item.revision);
    if(quality==='clear'&&!ready)return false;
    if(quality==='pending'&&ready)return false;
    return true;
  });
  return filtered.map(item=>({...item,...selectionScore(item,now)}))
    .sort((a,b)=>b.score-a.score||
      (new Date(b.published_at||b.fetched_at).getTime()||0)-(new Date(a.published_at||a.fetched_at).getTime()||0)||
      Number(b.id)-Number(a.id));
}
module.exports={planSchema,ensurePlanningSchema,selectionScore,shortlist,CATEGORIES};
