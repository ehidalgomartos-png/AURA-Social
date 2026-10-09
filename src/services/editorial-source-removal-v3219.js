'use strict';
// V3.2.19 — deliberate administrator-only RSS source removal.
// Existing editorial candidates survive via the source_id ON DELETE SET NULL FK.
// Published snapshots remain intact; removing a source does NOT unpublish news.
function sourceRemovalError(status,code){
  const e=new Error(code);e.status=status;e.code=code;return e;
}
function safeSourceIdV3219(value){
  const v=String(value??'');
  return /^[1-9][0-9]{0,14}$/.test(v)?v:null;
}
function normalizeCounts(row={}){
  const keys=['candidates','pending','approved','rejected','publications','live_publications'];
  const out={};
  for(const key of keys){
    const n=Number(row[key]??0);
    out[key]=Number.isSafeInteger(n)&&n>=0?n:0;
  }
  return out;
}
function removalSnapshotV3219(source,counts){
  return {id:String(source.id),name:String(source.name),status:String(source.status),
    category:String(source.category),impact:normalizeCounts(counts),
    candidatesPreserved:true,publicationsPreserved:true,manualOnly:true};
}
function confirmRemovalV3219(body={},snapshot={}){
  const i=snapshot.impact||{};
  return body.confirm===true &&
    body.name===snapshot.name &&
    body.expectedCandidates===i.candidates &&
    body.expectedPublications===i.publications &&
    body.expectedLivePublications===i.live_publications;
}
async function lookupSourceRemovalV3219(client,id,{lock=false}={}){
  const source=await client.query(
    'SELECT id,name,status,category FROM editorial_sources WHERE id=$1'+(lock?' FOR UPDATE':''),[id]
  );
  if(!source.rowCount)throw sourceRemovalError(404,'editorial_source_not_found');
  const counts=await client.query(
    "SELECT count(*)::int AS candidates, "+
    "count(*) FILTER (WHERE c.status='pending')::int AS pending, "+
    "count(*) FILTER (WHERE c.status='approved')::int AS approved, "+
    "count(*) FILTER (WHERE c.status='rejected')::int AS rejected, "+
    "count(pub.id)::int AS publications, "+
    "count(pub.id) FILTER (WHERE pub.unpublished_at IS NULL)::int AS live_publications "+
    "FROM editorial_candidates c LEFT JOIN editorial_publications pub ON pub.candidate_id=c.id "+
    "WHERE c.source_id=$1",[id]
  );
  return removalSnapshotV3219(source.rows[0],counts.rows[0]);
}
async function deleteSourceV3219(pool,adminId,id,body){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const snapshot=await lookupSourceRemovalV3219(client,id,{lock:true});
    if(!confirmRemovalV3219(body,snapshot)){
      throw sourceRemovalError(409,'editorial_source_removal_confirmation_stale');
    }
    // V3.2.20: snapshot the original medium name and deleted-source ID
    // before ON DELETE SET NULL drops the FK. Keep the MOST RECENT\n    // source after a later manual re-link and deletion; never rewrite title/summary.
    await client.query(
      "UPDATE editorial_candidates SET source_name_snapshot=$2, "+
      "removed_source_id=$1::bigint WHERE source_id=$1",
      [id,snapshot.name]
    );
    // Database enforces ON DELETE SET NULL on candidate.source_id,
    // preserving candidate texts, revisions and approved publication snapshots.
    const deleted=await client.query('DELETE FROM editorial_sources WHERE id=$1 RETURNING id',[id]);
    if(deleted.rowCount!==1)throw sourceRemovalError(409,'editorial_source_removal_stale');
    await client.query(
      "INSERT INTO editorial_audit(admin_id,action,entity_type,entity_id,details) "+
      "VALUES($1,'delete','source',$2,$3::jsonb)",
      [adminId,id,JSON.stringify({
        name:snapshot.name,status:snapshot.status,category:snapshot.category,
        impact:snapshot.impact,candidatesPreserved:true,publicationsPreserved:true,sourceAttributionPreserved:true
      })]
    );
    await client.query('COMMIT');
    return {ok:true,deleted:true,id:snapshot.id,impact:snapshot.impact,
      candidatesPreserved:true,publicationsPreserved:true,manualOnly:true};
  }catch(error){
    try{await client.query('ROLLBACK');}catch(rollbackErr){
      console.error('Editorial source removal rollback failed:',rollbackErr);
    }
    throw error;
  }finally{client.release();}
}
module.exports={
  sourceRemovalError,safeSourceIdV3219,normalizeCounts,removalSnapshotV3219,
  confirmRemovalV3219,lookupSourceRemovalV3219,deleteSourceV3219
};
