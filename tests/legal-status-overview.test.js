const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../public/social.js'),'utf8');
const start=source.indexOf('function legalConsentDate(value){');
const end=source.indexOf("$('#legalConsentHistory')?.addEventListener('change'",start);
assert.ok(start>=0&&end>start,'legal summary renderer missing');

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);
const helper=new Function('esc','$',source.slice(start,end)+
  'return {summarize:legalStatusOverview,overviewHTML:legalStatusOverviewHTML,render:legalConsentHistoryHTML};')(escapeHtml,()=>null);
const defs=[
 {key:'terms',label:'Términos de Uso',action:'accepted'},
 {key:'community_guidelines',label:'Normas de la Comunidad',action:'accepted'},
 {key:'privacy',label:'Política de Privacidad',action:'acknowledged'}
];
const documents={
 terms:{version:'1.0',path:'/terms/'},
 community_guidelines:{version:'1.0',path:'/community-guidelines/'},
 privacy:{version:'1.0',path:'/privacy/'}
};
const entry=(document_key,document_version,action,accepted_at='2026-10-08T10:00:00Z')=>
  ({document_key,document_version,action,accepted_at,source:'registration'});

test('three confirmed current versions report no pending actions',()=>{
 const records=[
  entry('terms','1.0','accepted'),
  entry('community_guidelines','1.0','accepted'),
  entry('privacy','1.0','acknowledged')
 ];
 const info=helper.summarize(records,documents,defs);
 assert.deepEqual(info.totals,{current:3,historical:0,missing:0,unknown:0});
 assert.equal(info.pending,0);
 assert.equal(info.firstPending,null);
 const html=helper.render(records,documents);
 assert.match(html,/3 de 3 documentos con versión vigente registrada/);
 assert.doesNotMatch(html,/data-legal-go-pending/);
 assert.doesNotMatch(html,/class="legal-confirm-form"/);
});

test('legacy terms, current privacy, and missing guidelines are distinct',()=>{
 const records=[entry('terms','legacy','accepted'),entry('privacy','1.0','acknowledged')];
 const status=helper.summarize(records,documents,defs);
 assert.deepEqual(status.totals,{current:1,historical:1,missing:1,unknown:0});
 assert.equal(status.firstPending.key,'terms');
 assert.equal(status.pending,2);
 const html=helper.render(records,documents);
 assert.match(html,/Ver documentos pendientes \(2\)/);
 assert.match(html,/1 de 3 documentos con versión vigente registrada/);
 assert.match(html,/Los registros “legacy”/);
 assert.match(html,/Versión actual: <b>1.0<\/b>/);
 assert.equal((html.match(/class="legal-confirm-form"/g)||[]).length,2);
});

test('privacy accepted with the wrong action is not counted as acknowledged',()=>{
 const records=[entry('terms','1.0','accepted'),entry('privacy','1.0','accepted')];
 const status=helper.summarize(records,documents,defs);
 assert.deepEqual(status.totals,{current:1,historical:0,missing:2,unknown:0});
 const html=helper.render(records,documents);
 assert.match(html,/2 sin registro/);
 assert.doesNotMatch(html,/Leída · versión 1.0/);
 assert.equal((html.match(/class="legal-confirm-form"/g)||[]).length,2);
});

test('old version plus mismatched current document does not claim current consent',()=>{
 const records=[entry('terms','1.0','accepted')];
 const updated={...documents,terms:{version:'2.0',path:'/terms/'}};
 const status=helper.summarize(records,updated,defs);
 assert.equal(status.totals.historical,1);
 assert.equal(status.totals.current,0);
 assert.equal(status.firstPending.key,'terms');
 const html=helper.render(records,updated);
 assert.match(html,/Versión actual: <b>2.0<\/b>/);
 assert.match(html,/data-legal-document="terms"/);
});

test('unavailable version never creates a false pending action',()=>{
 const missingVersions={
  terms:{version:'',path:'/terms/'},
  community_guidelines:{version:'',path:'/community-guidelines/'},
  privacy:{version:'',path:'/privacy/'}
 };
 const status=helper.summarize([],missingVersions,defs);
 assert.deepEqual(status.totals,{current:0,historical:0,missing:0,unknown:3});
 assert.equal(status.available,0);
 assert.equal(status.pending,0);
 const html=helper.render([],missingVersions);
 assert.match(html,/No se pudo comprobar la versión vigente/);
 assert.doesNotMatch(html,/data-legal-go-pending/);
 assert.doesNotMatch(html,/class="legal-confirm-form"/);
});

test('summary escapes any supplied version/data and changes no stored records',()=>{
 const rows=[
  entry('terms','1.0','accepted'),
  entry('community_guidelines','legacy','accepted')
 ];
 const original=JSON.stringify(rows);
 const html=helper.render(rows,documents);
 assert.equal(JSON.stringify(rows),original);
 assert.match(html,/Estado de tus documentos/);
 assert.match(html,/role="region"/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/Privacidad indica lectura reconocida, no aceptación/);
});

test('existing downloads, history filters and confirmation remain outside overview',()=>{
 const html=helper.render([entry('terms','legacy','accepted')],documents);
 assert.match(html,/Historial completo/);
 assert.match(html,/data-legal-go-pending/);
 assert.match(html,/class="legal-confirm-form"/);
 const clickSection=source.slice(
  source.indexOf("$('#legalConsentHistory')?.addEventListener('click',event=>{",source.indexOf("// Navigates to a pending")),
  source.indexOf("function urlBase64ToUint8Array(base64String){")
 );
 assert.match(clickSection,/scrollIntoView/);
 assert.match(clickSection,/focus\(/);
 assert.doesNotMatch(clickSection,/\bfetch\s*\(|\bapi\s*\(|\.checked\s*=/);
});
