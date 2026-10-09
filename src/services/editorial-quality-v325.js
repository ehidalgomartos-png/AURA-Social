'use strict';

// V3.2.5: explicit human quality gate; not a factual truth score or automated classifier.
const {z}=require('zod');
const ASSESSMENTS=['clear','hold'];
const REASONS=['source','accuracy','rights','context','other'];
const qualitySchema=z.object({
  revision:z.number().int().nonnegative().safe(),
  decision:z.enum(ASSESSMENTS),
  reason:z.enum(REASONS),
  note:z.string().trim().min(12).max(500),
  sourceChecked:z.boolean(),
  contextChecked:z.boolean(),
  rightsChecked:z.boolean()
}).strict().superRefine((value,ctx)=>{
  if(value.decision==='clear'&&(!value.sourceChecked||!value.contextChecked||!value.rightsChecked)){
    ctx.addIssue({code:'custom',path:['sourceChecked'],message:'Hay que confirmar la fuente, el contexto y los derechos'});
  }
});
let ready=null;
async function ensureQualitySchema(db){
  if(!ready){
    ready=(async()=>{
      await db.query("CREATE TABLE IF NOT EXISTS editorial_quality_assessments (candidate_id BIGINT PRIMARY KEY REFERENCES editorial_candidates(id) ON DELETE CASCADE,decision VARCHAR(8) NOT NULL CHECK(decision IN ('clear','hold')),reason VARCHAR(16) NOT NULL CHECK(reason IN ('source','accuracy','rights','context','other')),note VARCHAR(500) NOT NULL CHECK(length(btrim(note))>=12),candidate_revision INTEGER NOT NULL CHECK(candidate_revision>=0),assessed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,assessed_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      await db.query('CREATE INDEX IF NOT EXISTS idx_editorial_quality_decision ON editorial_quality_assessments(decision,assessed_at DESC)');
    })().catch(error=>{ready=null;throw error;});
  }
  return ready;
}
function qualityReady(row){
  return row.quality_decision==='clear' && Number.isInteger(Number(row.quality_candidate_revision)) &&
    Number(row.quality_candidate_revision)===Number(row.revision);
}
function ageDays(date,now=new Date()){
  const t=new Date(date).getTime();
  return Number.isFinite(t)?Math.max(0,Math.floor((now.getTime()-t)/86400000)):null;
}
function reviewSignals(item,now=new Date()){
  const signals=[];
  const days=ageDays(item.published_at||item.fetched_at,now);
  if(days!==null&&days>7)signals.push('noticia_antigua');
  if(item.source_status!=='approved')signals.push('fuente_no_aprobada');
  if(item.profile_status!=='ready')signals.push('perfil_no_preparado');
  if(!item.editorial_title||!item.editorial_summary)signals.push('texto_editorial_incompleto');
  if(!item.canonical_url||!/^https:\/\//i.test(item.canonical_url))signals.push('enlace_no_https');
  return signals;
}
module.exports={qualitySchema,ensureQualitySchema,qualityReady,reviewSignals,ageDays};
