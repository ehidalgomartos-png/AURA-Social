const test=require('node:test');
const assert=require('node:assert/strict');
const {buildLegalConsentReceipt}=require('../src/services/legal-consent-receipt');

const currentDocuments={
  terms:{version:'1.0',path:'/terms/'},
  community_guidelines:{version:'1.0',path:'/community-guidelines/'},
  privacy:{version:'1.0',path:'/privacy/'}
};
const user={username:'persona_1',created_at:'2023-04-05T12:00:00.000Z',email:'private@example.com'};
const fixedTime='2026-10-08T10:00:00.000Z';
const build=rows=>buildLegalConsentReceipt({account:user,legalAcceptances:rows,legalDocuments:currentDocuments,generatedAt:fixedTime});

test('includes document registry, account label and generation timestamp',()=>{
  const receipt=build([]);
  assert.equal(receipt.schemaVersion,'1.0');
  assert.equal(receipt.format,'redlibertad-legal-consent-record');
  assert.equal(receipt.generatedAt,fixedTime);
  assert.deepEqual(receipt.account,{username:'persona_1',createdAt:user.created_at});
  assert.equal(receipt.documents.terms.currentVersion,'1.0');
  assert.equal(receipt.documents.privacy.currentTextPath,'/privacy/');
  assert.deepEqual(receipt.legalAcceptances,[]);
});

test('preserves legal action, real source and date without fabricating acknowledgements',()=>{
  const consent={document_key:'privacy',document_version:'1.0',action:'acknowledged',source:'account-legal-center',accepted_at:'2026-10-08T09:59:00.000Z'};
  assert.deepEqual(build([consent]).legalAcceptances,[{
    documentKey:'privacy',documentVersion:'1.0',action:'acknowledged',
    source:'account-legal-center',recordedAt:consent.accepted_at
  }]);
});

test('preserves legacy exactly, without rewriting it to 1.0',()=>{
  const receipt=build([{document_key:'terms',document_version:'legacy',action:'accepted',source:'legacy-terms-column',accepted_at:'2020-01-01T00:00:00Z'}]);
  assert.equal(receipt.legalAcceptances[0].documentVersion,'legacy');
  assert.equal(receipt.legalAcceptances[0].source,'legacy-terms-column');
  assert.match(receipt.notice,/no acredita la aceptación de textos posteriores/);
});

test('does not include email, tokens, IP addresses or private account data',()=>{
  const serialized=JSON.stringify(build([]));
  assert.doesNotMatch(serialized,/private@example.com|password_hash|aura_token|ip_address/);
  assert.deepEqual(Object.keys(build([]).account).sort(),['createdAt','username']);
});

test('current text is explicitly not represented as historical text',()=>{
  const r=build([]);
  assert.match(r.notice,/no a una copia histórica/);
  assert.ok(!Object.hasOwn(r.documents.terms,'acceptedText'));
});

test('requires a real account and does not synthesize records',()=>{
  assert.throws(()=>buildLegalConsentReceipt({account:null,legalAcceptances:[],legalDocuments:currentDocuments,generatedAt:fixedTime}),/account_required/);
  assert.equal(buildLegalConsentReceipt({account:user,legalDocuments:currentDocuments,generatedAt:fixedTime}).legalAcceptances.length,0);
});

test('keeps all provided recorded events and does not modify input',()=>{
  const rows=[
    {document_key:'terms',document_version:'1.0',action:'accepted',source:'registration',accepted_at:'2026-01-02'},
    {document_key:'terms',document_version:'legacy',action:'accepted',source:'legacy-terms-column',accepted_at:'2020-01-02'}
  ];
  const original=JSON.stringify(rows);
  const receipt=build(rows);
  assert.equal(receipt.legalAcceptances.length,2);
  assert.equal(receipt.legalAcceptances[0].documentVersion,'1.0');
  assert.equal(JSON.stringify(rows),original);
});
