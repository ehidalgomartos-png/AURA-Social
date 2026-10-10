'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {safeSourceIdV3219,removalSnapshotV3219,confirmRemovalV3219,
  deleteSourceV3219,lookupSourceRemovalV3219}=require('../src/services/editorial-source-removal-v3219');
const source={id:'7',name:'Periódico autorizado',status:'approved',category:'actualidad'};
const counts={candidates:11,pending:5,approved:4,rejected:2,publications:3,live_publications:2};
const preview=()=>removalSnapshotV3219(source,counts);
const body=()=>({confirm:true,name:source.name,expectedCandidates:11,
  expectedPublications:3,expectedLivePublications:2});
function fakePool({exists=true,count=counts,failAudit=false}={}){
  const calls=[];
  let released=false;
  const client={query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT id,name,status,category FROM editorial_sources')){
      return {rowCount:exists?1:0,rows:exists?[source]:[]};
    }
    if(sql.startsWith('SELECT count(*)::int AS candidates')){
      return {rowCount:1,rows:[count]};
    }
    if(sql.startsWith('DELETE FROM editorial_sources')){
      return {rowCount:1,rows:[{id:source.id}]};
    }
    if(sql.startsWith('INSERT INTO editorial_audit')){
      if(failAudit)throw Error('audit unavailable');
      return {rowCount:1};
    }
    return {rowCount:0,rows:[]};
  },release:()=>{released=true;}};
  return {pool:{connect:async()=>client},calls,wasReleased:()=>released};
}
test('borrado admite IDs de fuente estrictos y rechaza entradas malformadas',()=>{
 assert.equal(safeSourceIdV3219(7),'7');
 for(const bad of [0,-1,'','1 OR 1=1','7/abc',null,'0','1'.repeat(16)]){
  assert.equal(safeSourceIdV3219(bad),null,String(bad));
 }
});
test('la vista previa cuenta pendientes, aprobadas y publicaciones sin alterar datos',()=>{
 const p=preview();
 assert.equal(p.status,'approved');
 assert.equal(p.impact.candidates,11);
 assert.equal(p.impact.live_publications,2);
 assert.equal(p.candidatesPreserved,true);
 assert.equal(p.publicationsPreserved,true);
 assert.equal(p.manualOnly,true);
 assert.ok(!JSON.stringify(p).includes('rights_reference'));
});
test('confirmación exige nombre exacto y contadores que no hayan cambiado',()=>{
 assert.equal(confirmRemovalV3219(body(),preview()),true);
 for(const changed of [{confirm:false},{name:'Un medio distinto'},
   {expectedCandidates:10},{expectedPublications:2},
   {expectedLivePublications:1},{expectedLivePublications:'2'}]){
  assert.equal(confirmRemovalV3219({...body(),...changed},preview()),false);
 }
});
test('deletion executes one locked transaction, audited, without deleting candidates or publications',async()=>{
 const f=fakePool();
 const result=await deleteSourceV3219(f.pool,5,'7',body());
 assert.equal(result.ok,true);assert.equal(result.deleted,true);
 assert.equal(result.impact.candidates,11);
 assert.equal(result.candidatesPreserved,true);
 assert.equal(result.publicationsPreserved,true);
 assert.equal(f.wasReleased(),true);
 const sql=f.calls.map(c=>c.sql);
 assert.equal(sql[0],'BEGIN');
 assert.ok(sql[1].includes('FROM editorial_sources WHERE id=$1 FOR UPDATE'));
 assert.ok(sql[2].includes('LEFT JOIN editorial_publications'));
 assert.ok(sql[3].startsWith('UPDATE editorial_candidates SET source_name_snapshot='));
 assert.ok(sql[3].includes('removed_source_id=$1::bigint'));
 assert.deepEqual(f.calls[3].params,['7',source.name]);
 assert.ok(sql[4].startsWith('DELETE FROM editorial_sources WHERE id=$1 RETURNING id'));
 assert.ok(sql[5].includes('INSERT INTO editorial_audit'));
 assert.equal(sql[6],'COMMIT');
 assert.ok(!sql.some(q=>/DELETE FROM editorial_(?:candidates|publications)/.test(q)));
});
test('stale counts reject deletion and roll back safely',async()=>{
 const f=fakePool({count:{...counts,candidates:12}});
 await assert.rejects(deleteSourceV3219(f.pool,5,'7',body()),{status:409,code:'editorial_source_removal_confirmation_stale'});
 assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));
 assert.equal(f.calls.some(x=>x.sql.startsWith('DELETE FROM editorial_sources')),false);
 assert.equal(f.wasReleased(),true);
});
test('missing source safely rejected with no destructive query',async()=>{
 const f=fakePool({exists:false});
 await assert.rejects(deleteSourceV3219(f.pool,5,'7',body()),{status:404,code:'editorial_source_not_found'});
 assert.equal(f.calls.some(x=>x.sql.startsWith('DELETE FROM editorial_sources')),false);
 assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));
});
test('audit failure rolls back deletion in same transaction',async()=>{
 const f=fakePool({failAudit:true});
 await assert.rejects(deleteSourceV3219(f.pool,5,'7',body()),/audit unavailable/);
 assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));
 assert.ok(!f.calls.some(x=>x.sql==='COMMIT'));
 assert.equal(f.wasReleased(),true);
});
test('una fuente aprobada es eliminable; vista previa y DELETE son solo para admins',()=>{
 const route=read('src/routes/admin-editorial-v320.js');
 const schema=read('src/services/editorial-v320.js');
 const inbox=read('src/routes/admin-editorial-inbox-v321.js');
 const publication=read('src/routes/editorial-publication-v323.js');
 assert.ok(route.includes('router.use(requireAdmin)'));
 assert.ok(route.includes("router.get('/sources/:id/deletion-preview'"));
 assert.ok(route.includes("router.delete('/sources/:id'"));
 assert.ok(route.includes('removalInputV3219.safeParse(req.body)'));
 assert.ok(route.includes('await ensurePublicationSchema()'));
 assert.ok(inbox.includes('source_id BIGINT REFERENCES editorial_sources(id) ON DELETE SET NULL'));
 assert.ok(publication.includes('source_name VARCHAR(100) NOT NULL'));
 assert.ok(publication.includes('source_url TEXT NOT NULL'));
 assert.ok(inbox.includes("current.rows[0].status!=='approved'"));
 assert.ok(schema.includes('CHECK(NOT auto_publish_enabled)'));
});
test('el panel muestra las consecuencias y requiere confirmación escrita, también en móvil',()=>{
 const js=read('public/admin.js'),html=read('public/admin.html'),css=read('public/admin.css');
 for(const id of ['editorialSourceRemovalV3219','editorialSourceRemovalNameV3219',
 'editorialSourceRemovalConfirmV3219','editorialSourceRemovalCancelV3219',
 'editorialSourceRemovalDetailsV3219'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(js.includes('data-editorial-source-delete'));
 assert.ok(js.includes("field.value!==state.name"));
 assert.ok(js.includes("method:'DELETE'"));
 assert.ok(js.includes('expectedLivePublications'));
 assert.ok(js.includes('window.confirm('));
 assert.ok(js.includes('loadEditorialV320()'));
 assert.ok(css.includes('editorial-source-removal-v3219'));
 assert.ok(css.includes('@media(max-width:620px)'));
 assert.ok(html.includes('/admin.js?v=3.2.25'));
 assert.ok(read('server.js').includes("APP_VERSION='3.2.29'"));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.29');
});
