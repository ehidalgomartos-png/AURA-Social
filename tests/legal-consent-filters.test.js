const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../public/social.js'),'utf8');
const start=source.indexOf('function legalConsentDate(value){');
const end=source.indexOf("$('#legalConsentHistory')?.addEventListener('change'",start);
assert.ok(start>=0 && end>start,'Legal timeline renderer must be available');

const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);

let mockContainer=null;
const $=()=>mockContainer;
const getHelpers=new Function('esc','$',source.slice(start,end)+
  'return {render:legalConsentHistoryHTML,normalize:legalHistoryNormalize,'+
  'classify:legalHistoryRecordState,matches:legalHistoryMatchesFilter,'+
  'apply:applyLegalHistoryFilters,filters:legalHistoryFilterState};');
const tools=getHelpers(htmlEscape,$);
const documents={
  terms:{version:'1.0',path:'/terms/'},
  community_guidelines:{version:'1.0',path:'/community-guidelines/'},
  privacy:{version:'1.0',path:'/privacy/'}
};
const item=(key,version,action,date,source='registration')=>({
  document_key:key,document_version:version,action,source,accepted_at:date
});
const rows=[
  item('terms','1.0','accepted','2026-10-08T08:00:00Z'),
  item('privacy','1.0','acknowledged','2026-10-08T09:00:00Z','account-legal-center'),
  item('terms','legacy','accepted','2019-01-01T10:00:00Z','legacy-terms-column'),
  item('community_guidelines','0.9','accepted','2022-01-01T10:00:00Z')
];
function reset(){
  tools.filters.document='all';
  tools.filters.state='all';
  tools.filters.query='';
}

test('search is case-insensitive and accent-insensitive',()=>{
  assert.equal(tools.normalize('  TÉRMINOS  '),'terminos');
  assert.equal(tools.normalize('Versión 1.0'),'version 1.0');
  assert.equal(tools.normalize(null),'');
});

test('current/historical/legacy classify independently from other documents',()=>{
  assert.equal(tools.classify(rows[0],documents),'current');
  assert.equal(tools.classify(rows[2],documents),'legacy');
  assert.equal(tools.classify(rows[3],documents),'historical');
  assert.equal(tools.classify(item('terms','1.0','accepted',''),{terms:{version:'2.0'}}),'historical');
});

test('filters can combine document, state and free-text search',()=>{
  const entry={documentKey:'terms',state:'legacy',searchText:'Términos de Uso · versión legacy · Registro anterior al versionado'};
  assert.equal(tools.matches(entry,{document:'terms',state:'legacy',query:'TÉRMINOS'}),true);
  assert.equal(tools.matches(entry,{document:'privacy',state:'legacy',query:'términos'}),false);
  assert.equal(tools.matches(entry,{document:'terms',state:'current',query:''}),false);
  assert.equal(tools.matches(entry,{document:'all',state:'all',query:'version'}),true);
  assert.equal(tools.matches(entry,{document:'all',state:'all',query:'2026-12-31'}),false);
});

test('timeline renders native labelled controls and a live result counter',()=>{
  reset();
  const html=tools.render(rows,documents);
  assert.match(html,/data-legal-history-filter="document"/);
  assert.match(html,/data-legal-history-filter="state"/);
  assert.match(html,/data-legal-history-filter="query"/);
  assert.match(html,/data-legal-history-clear/);
  assert.match(html,/role="status" aria-live="polite">Mostrando 4 de 4 registros/);
  assert.match(html,/Historial completo · 4 registros/);
  assert.equal((html.match(/class="legal-history-item"/g)||[]).length,4);
  assert.match(html,/data-legal-state="legacy"/);
  assert.match(html,/data-legal-state="historical"/);
  assert.match(html,/data-legal-state="current"/);
  assert.match(html,/type="search"/);
});

test('a single or empty history avoids unnecessary filter controls',()=>{
  reset();
  assert.doesNotMatch(tools.render([rows[0]],documents),/data-legal-history-filter/);
  const blank=tools.render([],documents);
  assert.doesNotMatch(blank,/data-legal-history-filter/);
  assert.match(blank,/Todavía no constan confirmaciones legales/);
});

test('stored filter selection is rendered safely and does not change audit data',()=>{
  reset();
  const before=JSON.stringify(rows);
  tools.filters.document='privacy';
  tools.filters.state='current';
  tools.filters.query='"><img src=x onerror=alert(1)>';
  const html=tools.render(rows,documents);
  assert.match(html,/value="privacy" selected/);
  assert.match(html,/value="current" selected/);
  assert.doesNotMatch(html,/<img src=x onerror/);
  assert.match(html,/&lt;img src=x onerror/);
  assert.equal(JSON.stringify(rows),before);
  reset();
});

test('invalid action cannot create a visible consent',()=>{
  reset();
  const html=tools.render([rows[0],item('privacy','1.0','accepted','2026-01-01')],documents);
  assert.match(html,/Historial completo · 1 registro/);
  assert.equal((html.match(/class="legal-history-item"/g)||[]).length,1);
});

test('applying local filters hides only matching DOM entries and reports count',()=>{
  reset();
  const nodes=[
    {dataset:{legalDocument:'terms',legalState:'legacy'},textContent:'Términos de Uso Versión legacy',hidden:false},
    {dataset:{legalDocument:'terms',legalState:'current'},textContent:'Términos de Uso Versión 1.0',hidden:false},
    {dataset:{legalDocument:'privacy',legalState:'current'},textContent:'Política de Privacidad Versión 1.0',hidden:false}
  ];
  const count={textContent:''},empty={hidden:true};
  const timeline={
    querySelectorAll:()=>nodes,
    querySelector:q=>q==='.legal-timeline-count'?count:q==='.legal-timeline-filter-empty'?empty:null
  };
  mockContainer={querySelector:()=>timeline};
  tools.filters.document='terms';tools.filters.state='legacy';tools.filters.query='términos';
  tools.apply();
  assert.deepEqual(nodes.map(n=>n.hidden),[false,true,true]);
  assert.equal(count.textContent,'Mostrando 1 de 3 registros');
  assert.equal(empty.hidden,true);
  tools.filters.query='ningún resultado';
  tools.apply();
  assert.deepEqual(nodes.map(n=>n.hidden),[true,true,true]);
  assert.equal(empty.hidden,false);
  assert.equal(count.textContent,'Mostrando 0 de 3 registros');
  mockContainer=null;reset();
});

test('filter logic is local and never invokes a network request',()=>{
  const from=source.indexOf('function legalHistoryNormalize(value)');
  const to=source.indexOf('function legalConsentHistoryHTML(items=',from);
  assert.ok(from>=0&&to>from);
  const filterCode=source.slice(from,to);
  assert.doesNotMatch(filterCode,/\bfetch\s*\(|\bapi\s*\(|\bdb\.query\s*\(/);
});
