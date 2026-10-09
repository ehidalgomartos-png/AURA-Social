'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {planSchema,selectionScore,shortlist}=require('../src/services/editorial-planning-v326');
const {validFilters}=require('../src/routes/admin-editorial-planning-v326');

const now=new Date('2026-10-09T12:00:00Z');
const base={
 id:5,revision:3,category:'actualidad',source_id:11,source_name:'Medio ejemplo',
 source_title:'Se anuncia una nueva iniciativa local',editorial_title:'Una nueva propuesta para la comunidad',
 editorial_summary:'El equipo editorial ha revisado y explicado el contexto de esta iniciativa.',
 published_at:'2026-10-09T09:00:00Z',fetched_at:'2026-10-09T10:00:00Z',
 quality_decision:'clear',quality_revision:3,source_status:'approved',profile_status:'ready',
 priority:2,source_recent_count:0,category_recent_count:0,planned_for:null
};

test('planeación estricta: admite solo fecha ISO con zona, revisión, prioridad y nota',()=>{
 const good={revision:3,plannedFor:'2026-10-15T15:00:00.000Z',priority:2,note:'Publicación manual prevista'};
 assert.equal(planSchema.safeParse(good).success,true);
 assert.equal(planSchema.safeParse({...good,plannedFor:null,priority:1}).success,true);
 for(const invalid of [
  {...good,priority:0},{...good,priority:4},{...good,revision:-1},
  {...good,plannedFor:'mañana'},{...good,plannedFor:'2026-10-15T17:00'},
  {...good,autoPublish:true},{...good,note:'x'.repeat(501)},{...good,priority:'2'}
 ])assert.equal(planSchema.safeParse(invalid).success,false,JSON.stringify(invalid));
});

test('ranking es explicable y la revisión de calidad no es una puntuación de veracidad',()=>{
 const fresh=selectionScore(base,now);
 assert.ok(fresh.score>=80);
 assert.ok(fresh.reasons.includes('calidad_validada'));
 assert.ok(fresh.reasons.includes('noticia_reciente'));
 const held=selectionScore({...base,quality_decision:'hold',published_at:'2026-09-01T09:00:00Z'},now);
 assert.ok(held.score<fresh.score);
 assert.ok(held.reasons.includes('calidad_pendiente'));
 assert.ok(held.reasons.includes('noticia_antigua'));
 const repetitive=selectionScore({...base,source_recent_count:4,category_recent_count:5},now);
 assert.ok(repetitive.score<fresh.score);
 assert.ok(repetitive.reasons.includes('fuente_repetida'));
 assert.ok(repetitive.reasons.includes('categoria_repetida'));
});
test('filtros por tema, medio, texto y calidad no cambian los candidatos',()=>{
 const original=[
  {...base,id:1,category:'actualidad',source_id:11,editorial_title:'Noticias locales de hoy'},
  {...base,id:2,category:'tecnologia',source_id:12,editorial_title:'Avances de ordenadores',quality_decision:'hold'},
  {...base,id:3,category:'tecnologia',source_id:13,editorial_title:'Nuevos procesadores',priority:3}
 ];
 const copy=JSON.stringify(original);
 assert.deepEqual(shortlist(original,{category:'tecnologia'},now).map(x=>x.id),[3,2]);
 assert.deepEqual(shortlist(original,{sourceId:'12'},now).map(x=>x.id),[2]);
 assert.deepEqual(shortlist(original,{search:'ORDENADORES'},now).map(x=>x.id),[2]);
 assert.deepEqual(shortlist(original,{quality:'pending'},now).map(x=>x.id),[2]);
 assert.deepEqual(shortlist(original,{quality:'clear'},now).map(x=>x.id),[3,1]); // prioridad alta antes de normal
 assert.equal(JSON.stringify(original),copy);
});
test('filtros de servidor restringidos a categorías, identificadores y longitud',()=>{
 assert.deepEqual(validFilters({}),{category:'',sourceId:'',quality:'all',search:''});
 assert.equal(validFilters({category:'inventado'}),null);
 assert.equal(validFilters({sourceId:'1 OR 1=1'}),null);
 assert.equal(validFilters({quality:'publish'}),null);
 assert.equal(validFilters({search:'a'.repeat(101)}),null);
 assert.equal(validFilters({category:'cultura',quality:'clear'}).category,'cultura');
});
test('calendario solo guarda objetivos, limita 6 por día en Madrid y audita acciones',()=>{
 const source=read('src/routes/admin-editorial-planning-v326.js');
 assert.match(source,/router\.use\(requireAdmin\)/);
 assert.match(source,/router\.get\('\/planning\/overview'/);
 assert.match(source,/router\.put\('\/planning\/:id'/);
 assert.match(source,/router\.delete\('\/planning\/:id'/);
 assert.match(source,/FOR UPDATE/);
 assert.match(source,/editorial_planning_stale/);
 assert.match(source,/pg_advisory_xact_lock\(326,1\)/);
 assert.match(source,/Europe\/Madrid/);
 assert.match(source,/>=6/);
 assert.match(source,/90\*86400000/);
 assert.match(source,/INSERT INTO editorial_audit/);
 assert.match(source,/willAutoPublish:false/);
 assert.doesNotMatch(source,/INSERT INTO posts\b|INSERT INTO editorial_publications\b|INSERT INTO users\b/);
});
test('SQL es aditivo y ningún trabajador automático consume la fecha del calendario',()=>{
 const source=read('src/services/editorial-planning-v326.js');
 assert.match(source,/CREATE TABLE IF NOT EXISTS editorial_plans/);
 assert.match(source,/REFERENCES editorial_candidates\(id\) ON DELETE CASCADE/);
 assert.match(source,/candidate_revision INTEGER/);
 assert.doesNotMatch(source,/cron|setInterval|setTimeout|INSERT INTO posts/i);
 assert.match(read('src/services/editorial-v320.js'),/CHECK\(NOT auto_publish_enabled\)/);
});
test('interfaz permite prioridad, filtros y eliminar objetivo con publicación separada',()=>{
 const html=read('public/admin.html'),js=read('public/admin.js');
 assert.match(html,/id="editorialPlanning"/);
 assert.match(html,/id="editorialPlanningFilters"/);
 assert.match(html,/id="editorialPlanningCalendar"/);
 assert.match(js,/loadEditorialPlanningV326/);
 assert.match(js,/\/api\/admin\/editorial\/planning\/overview/);
 assert.match(js,/data-editorial-plan/);
 assert.match(js,/data-editorial-unplan/);
 assert.match(js,/plannedFor:localTime\?localTime\.toISOString\(\):null/);
 assert.match(js,/No se publicará automáticamente/);
 assert.match(read('server.js'),/const APP_VERSION='3\.2\.15'/);
 assert.match(read('package.json'),/"version": "3\.2\.15"/);
});
