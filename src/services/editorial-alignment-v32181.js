'use strict';
// V3.2.18.1 — Human-readable explanation of the strict publication identity gate.
// No database writes, no guesses about which category an article should have.
function editorialAlignmentV32181(row={}){
  const issues=[];
  const add=(code,message)=>issues.push({code,message});
  const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
  const sourceTargetReady=Boolean(row.source_profile_id)&&
    row.source_profile_status==='ready' &&
    Boolean(row.source_profile_category) &&
    row.source_profile_category===row.source_category;
  if(!row.source_profile_id)add('source_profile_missing','La fuente RSS no tiene un perfil editorial asignado.');
  else if(row.source_profile_status!=='ready')add('source_profile_not_ready','El perfil asignado a la fuente RSS no está preparado.');
  if(row.source_profile_id&&row.source_profile_category!==row.source_category){
    add('source_category_mismatch','La categoría de la fuente RSS no coincide con la categoría de su perfil.');
  }
  if(!same(row.profile_id,row.source_profile_id)){
    add('candidate_profile_mismatch','La noticia conserva un perfil distinto al que tiene asignado actualmente la fuente RSS.');
  }
  if(!row.profile_id||row.profile_status!=='ready'){
    add('candidate_profile_not_ready','El perfil de la noticia no está preparado.');
  }
  if(row.category!==row.profile_category){
    add('candidate_category_mismatch','La categoría de la noticia no coincide con la de su perfil.');
  }
  if(row.category!==row.source_category){
    add('candidate_source_category_mismatch','La categoría de la noticia es distinta a la asignada actualmente a la fuente RSS.');
  }
  return {
    ok:issues.length===0,issues,
    // Reconciliation invalidates human approval and quality by incrementing revision.
    canReconcile:issues.length>0&&sourceTargetReady&&
      row.source_status==='approved'&&row.status==='approved'&&
      !(row.publication_id&&!row.unpublished_at)
  };
}
module.exports={editorialAlignmentV32181};
