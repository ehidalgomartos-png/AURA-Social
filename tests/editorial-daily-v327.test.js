'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const {madridDay,validDay,qualityCurrent,editorialReady,triage,sourceAlerts}=require('../src/services/editorial-daily-v327');
const now=new Date('2026-10-09T14:00:00.000Z');

const item=(overrides={})=>({
  id:9,revision:4,status:'approved',source_title:'Titular RSS original con contexto',
  editorial_title:'Un nuevo análisis de la noticia de actualidad',
  editorial_summary:'Nuestro equipo ha contrastado el contexto y explicado las implicaciones de la noticia, con información consultable en el origen.',
  category:'actualidad',source_status:'approved',profile_status:'ready',
  quality_decision:'clear',quality_revision:4,planned_day:null,planned_for:null,
  plan_revision:null,priority:2,live_publication_id:null,reviewed_at:'2026-10-09T08:00:00Z',
  ...overrides
});

test('fecha editorial exacta en Madrid, incluida la hora de cambio de día',()=>{
  assert.equal(madridDay(new Date('2026-10-09T22:30:00Z')),'2026-10-10');
  assert.equal(madridDay(new Date('2026-01-09T22:30:00Z')),'2026-01-09');
  for(const d of ['2026-10-09','2028-02-29'])assert.equal(validDay(d),true);
  for(const d of ['2026-02-29','2026-13-01','2026-10-9','mañana','2026-10-09T00:00:00Z',''])assert.equal(validDay(d),false,d);
});
test('calidad solo vigente para la revisión actual, nunca autosuficiente',()=>{
  assert.equal(qualityCurrent(item()),true);
  assert.equal(qualityCurrent(item({quality_revision:3})),false);
  assert.equal(qualityCurrent(item({quality_decision:'hold'})),false);
  assert.equal(editorialReady(item()),true);
  for(const row of [
    item({status:'pending'}),item({profile_status:'draft'}),item({source_status:'paused'}),
    item({quality_decision:'hold'}),item({quality_revision:1}),item({live_publication_id:12}),
    item({editorial_title:'Corto'}),item({editorial_summary:'Corto'})
  ])assert.equal(editorialReady(row),false,JSON.stringify(row));
});
test('jornada separa previstas, vencidas, aptas, retenidas y fechas futuras sin duplicar',()=>{
  const rows=[
    item({id:1,planned_day:'2026-10-09',planned_for:'2026-10-09T08:00:00Z'}),
    item({id:2,planned_day:'2026-10-08',planned_for:'2026-10-08T07:00:00Z',quality_revision:3}),
    item({id:3}),
    item({id:4,quality_decision:'hold'}),
    item({id:5,planned_day:'2026-10-13',planned_for:'2026-10-13T10:00:00Z'}),
    item({id:6,live_publication_id:100}),
    item({id:7,status:'pending'})
  ];
  const copy=JSON.stringify(rows);
  const groups=triage(rows,{day:'2026-10-09'});
  assert.deepEqual(groups.planned.map(x=>x.id),[2,1]);
  assert.deepEqual(groups.ready.map(x=>x.id),[3]);
  assert.deepEqual(groups.needsQuality.map(x=>x.id),[4]);
  assert.deepEqual(groups.others.map(x=>x.id),[5]);
  assert.equal(groups.planned[0].overdue,true);
  assert.equal(groups.planned[1].planned_for_day,true);
  assert.equal(groups.planned[0].publication_prechecks_met,false);
  assert.equal(JSON.stringify(rows),copy);
  assert.throws(()=>triage(rows,{day:'2026-02-30'}),/invalid_editorial_day/);
});
test('alerta solo fuentes RSS aprobadas no consultadas en 48 horas',()=>{
  const sources=[
    {id:1,status:'approved',last_checked_at:null},
    {id:2,status:'approved',last_checked_at:'2026-10-06T10:00:00Z'},
    {id:3,status:'approved',last_checked_at:'2026-10-09T13:00:00Z'},
    {id:4,status:'paused',last_checked_at:null}
  ];
  assert.deepEqual(sourceAlerts(sources,now).map(x=>x.id),[1,2]);
});
test('resumen diario solo lectura, administradores autorizados y límites de paginación',()=>{
  const s=read('src/routes/admin-editorial-daily-v327.js');
  assert.match(s,/router\.use\(requireAdmin\)/);
  assert.match(s,/router\.get\('\/daily\/overview'/);
  assert.match(s,/Europe\/Madrid/);
  assert.match(s,/day!==undefined|day===undefined/);
  assert.match(s,/editorial_daily_date_out_of_range/);
  assert.match(s,/limit:300|LIMIT 300/);
  assert.match(s,/LIMIT 35/);
  assert.match(s,/Cache-Control','no-store/);
  assert.match(s,/autoPublishing:false/);
  assert.doesNotMatch(s,/INSERT INTO |UPDATE editorial_|DELETE FROM |router\.(post|patch|put|delete)\(/);
});
test('interfaz permite ir a revisar, calidad, fuentes y publicación humana',()=>{
  const html=read('public/admin.html'),js=read('public/admin.js'),css=read('public/admin.css');
  assert.match(html,/id="editorialDaily"/);
  assert.match(html,/id="editorialDailyDay"/);
  assert.match(html,/id="editorialDailySections"/);
  assert.match(js,/loadEditorialDailyV327/);
  assert.match(js,/\/api\/admin\/editorial\/daily\/overview/);
  assert.match(js,/editorialDailyTargetsV327/);
  assert.match(js,/section\.scrollIntoView/);
  assert.match(js,/data-editorial-daily-id/);
  assert.match(js,/loadEditorialInboxV321\(candidateId\)/);
  assert.match(js,/loadEditorialQualityV325\(candidateId\)/);
  assert.match(js,/data-editorial-daily-target/);
  assert.match(css,/#editorialDaily \.editorial-daily-sections/);
  assert.match(read('server.js'),/const APP_VERSION='3\.2\.31'/);
  assert.match(read('package.json'),/"version": "3\.2\.31"/);
});
