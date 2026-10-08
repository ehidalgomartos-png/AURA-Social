const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../public/social.js'),'utf8');
const start=source.indexOf('function legalConsentDate(value){');
const end=source.indexOf("$('#legalConsentHistory')?.addEventListener('change'",start);
assert.ok(start>=0 && end>start,'Legal renderer functions must exist');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);
const render=new Function('esc',source.slice(start,end)+'\nreturn legalConsentHistoryHTML;')(escapeHtml);
const documents={
  terms:{version:'1.0',path:'/terms/'},
  community_guidelines:{version:'1.0',path:'/community-guidelines/'},
  privacy:{version:'1.0',path:'/privacy/'}
};
function record(key,version,action,date,source='registration'){
  return {document_key:key,document_version:version,action,accepted_at:date,source};
}

test('new account shows three current documents and full timeline',()=>{
  const rows=[
    record('terms','1.0','accepted','2026-10-08T08:00:00Z'),
    record('community_guidelines','1.0','accepted','2026-10-08T08:00:00Z'),
    record('privacy','1.0','acknowledged','2026-10-08T08:00:00Z')
  ];
  const html=render(rows,documents);
  assert.match(html,/Historial completo · 3 registros/);
  assert.equal((html.match(/class="legal-history-item"/g)||[]).length,3);
  assert.equal((html.match(/Ver texto actual</g)||[]).length,3);
  assert.doesNotMatch(html,/class="legal-confirm-form"/);
  assert.match(html,/Lectura reconocida/);
  assert.match(html,/Durante el alta/);
});

test('legacy record is historical; other documents remain unregistered',()=>{
  const html=render([record('terms','legacy','accepted','2020-01-01T00:00:00Z','legacy-terms-column')],documents);
  assert.match(html,/versión legacy/);
  assert.match(html,/Registro anterior al versionado/);
  assert.match(html,/Sin aceptación registrada de versiones posteriores/);
  assert.match(html,/Historial completo · 1 registro/);
  assert.equal((html.match(/class="legal-confirm-form"/g)||[]).length,3);
  assert.match(html,/Sin registro/);
});

test('old and current versions are both visible, sorted newest first',()=>{
  const html=render([
    record('terms','legacy','accepted','2018-01-01T00:00:00Z','legacy-terms-column'),
    record('terms','1.0','accepted','2026-10-08T08:00:00Z','account-legal-center')
  ],documents);
  const timeline=html.slice(html.indexOf('<details class="legal-timeline"'));
  assert.match(timeline,/Historial completo · 2 registros/);
  assert.ok(timeline.indexOf('versión 1.0')<timeline.indexOf('versión legacy'));
  assert.match(timeline,/Confirmación desde Cuenta/);
  assert.doesNotMatch(html,/data-key="terms"/);
  assert.equal((html.match(/class="legal-confirm-form"/g)||[]).length,2);
});

test('future version requires explicit confirmation and historic text is not mislinked',()=>{
  const html=render([record('terms','1.0','accepted','2026-10-08T08:00:00Z')],{
    ...documents,terms:{version:'2.0',path:'/terms/'}
  });
  assert.match(html,/Versión actual: <b>2.0<\/b>/);
  assert.match(html,/Versión histórica/);
  assert.match(html,/Ver texto actual de Términos de Uso/);
  assert.match(html,/no una copia archivada/);
  assert.equal((html.match(/href="\/terms\/"/g)||[]).length,1);
});

test('untrusted versions are escaped; invalid action is not shown as evidence',()=>{
  const html=render([
    record('terms','<img src=x onerror=alert(1)>','accepted','2025-01-01T00:00:00Z'),
    record('privacy','1.0','accepted','2026-10-08T00:00:00Z')
  ],documents);
  assert.doesNotMatch(html,/<img src=x onerror=/);
  assert.match(html,/&lt;img src=x onerror=/);
  assert.match(html,/Historial completo · 1 registro/);
});
