const test=require('node:test');
const assert=require('node:assert/strict');
const {buildLegalConsentReceipt}=require('../src/services/legal-consent-receipt');
const {renderLegalConsentReceiptHTML,escapeHTML,utcDate}=require('../src/services/legal-consent-readable');

const make=({username='prueba',acceptances=[],documents,generatedAt='2026-10-08T12:00:00Z'}={})=>
  buildLegalConsentReceipt({
    account:{username,created_at:'2022-03-04T09:20:00Z',email:'secret@redlibertad.test'},
    legalAcceptances:acceptances,
    legalDocuments:documents||{
      terms:{version:'1.0',path:'/terms/'},
      community_guidelines:{version:'1.0',path:'/community-guidelines/'},
      privacy:{version:'1.0',path:'/privacy/'}
    },
    generatedAt
  });
const event=(key,version,action,at,source='registration')=>({
  document_key:key,document_version:version,action,accepted_at:at,source
});

test('offline readable HTML includes account, UTC generation, document versions and print CSS',()=>{
  const html=renderLegalConsentReceiptHTML(make());
  assert.match(html,/<!doctype html>/i);
  assert.match(html,/lang="es"/);
  assert.match(html,/@prueba/);
  assert.match(html,/2026-10-08 12:00:00 UTC/);
  assert.match(html,/Versión vigente: 1\.0/);
  assert.equal((html.match(/class="document-card"/g)||[]).length,3);
  assert.match(html,/@media print/);
  assert.match(html,/Registro personal de consentimientos/);
});

test('does not invent acceptances when no events are recorded',()=>{
  const html=renderLegalConsentReceiptHTML(make());
  assert.match(html,/Historial de acciones \(0\)/);
  assert.match(html,/No constan acciones legales registradas/);
  assert.doesNotMatch(html,/class="record"/);
});

test('maps acknowledgements, actual timestamps and sources distinctly',()=>{
  const html=renderLegalConsentReceiptHTML(make({acceptances:[
    event('privacy','1.0','acknowledged','2026-10-08T11:03:00Z','account-legal-center'),
    event('terms','1.0','accepted','2026-10-08T11:04:00Z')
  ]}));
  assert.match(html,/Lectura reconocida/);
  assert.match(html,/Aceptación registrada/);
  assert.match(html,/2026-10-08 11:03:00 UTC/);
  assert.match(html,/Confirmación voluntaria desde Cuenta/);
  assert.match(html,/Registro durante el alta/);
  assert.equal((html.match(/class="record"/g)||[]).length,2);
});

test('legacy remains legacy and never becomes acceptance of a newer version',()=>{
  const html=renderLegalConsentReceiptHTML(make({acceptances:[
    event('terms','legacy','accepted','2021-06-01T00:00:00Z','legacy-terms-column')
  ]}));
  assert.match(html,/Registro legacy \(no acredita versiones posteriores\)/);
  assert.match(html,/Registro histórico anterior al versionado/);
  assert.match(html,/Versión registrada<\/dt><dd>legacy<\/dd>/);
  assert.match(html,/no acredita la aceptación de textos posteriores/);
});

test('HTML-escapes user, document and record data; never creates active markup',()=>{
  const bad='<img src=x onerror="alert(1)"><script>alert(1)</script>';
  const html=renderLegalConsentReceiptHTML(make({
    username:bad,documents:{terms:{version:bad,path:bad}},
    acceptances:[event('terms',bad,'accepted','2026-10-08T09:00:00Z',bad)]
  }));
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html,/<img\s|<script\b|<iframe\b|<form\b/i);
  assert.match(html,/default-src &#39;none&#39;/);
  assert.doesNotMatch(html,/<a\s+href=/);
});

test('does not embed personal email, tokens, messages or any remote resources',()=>{
  const html=renderLegalConsentReceiptHTML(make());
  assert.doesNotMatch(html,/secret@redlibertad\.test|password_hash|aura_token|api\/auth\/account/);
  assert.doesNotMatch(html,/<link\b|<script\b|<img\b|@import|https?:\/\//i);
  assert.match(html,/no certificado ni firmado digitalmente/);
  assert.match(html,/No son una copia de las versiones aceptadas históricamente/i);
});

test('returns predictable UTC dates without guessing absent timestamps',()=>{
  assert.equal(utcDate('2026-10-08T11:00:00Z'),'2026-10-08 11:00:00 UTC');
  assert.equal(utcDate(null),'Sin fecha registrada');
  assert.equal(utcDate('invalid'),'Sin fecha registrada');
  assert.equal(escapeHTML('<&"\''),'&lt;&amp;&quot;&#39;');
});

test('rejects malformed input and preserves JSON receipt unchanged',()=>{
  assert.throws(()=>renderLegalConsentReceiptHTML({}),/invalid_legal_receipt/);
  const receipt=make({acceptances:[event('terms','1.0','accepted','2026-10-08T08:00:00Z')]});
  const before=JSON.stringify(receipt);
  const html=renderLegalConsentReceiptHTML(receipt);
  assert.equal(JSON.stringify(receipt),before);
  assert.match(html,/Historial de acciones \(1\)/);
});
