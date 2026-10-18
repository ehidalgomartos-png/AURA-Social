'use strict';
// V3.2.100: deterministic deployment identity, no network, no DB writes.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const release=require('../src/services/deployment-identity-v32100');
const pkg=require('../package.json');
const sha='c20a4cf89bdc44e5b5123f0a2e4f36107a95cfd8';

test('version derives from the release package, not stale hardcoded server strings',()=>{
 assert.equal(pkg.version,'3.2.100');
 assert.deepEqual(release.releaseInfo({SOURCE_COMMIT:sha}),{version:'3.2.100',commit:sha,commitKnown:true});
 const source=fs.readFileSync('server.js','utf8');
 assert.match(source,/APP_VERSION=require\('\.\/package\.json'\)\.version/);
 assert.doesNotMatch(source,/APP_VERSION='3\.2\.77'/);
 assert.match(source,/app\.get\('\/api\/health'/);
 assert.match(source,/deployedCommit:releaseInfo\(\)\.commit/);
 assert.match(source,/app\.get\('\/api\/public-config'/);
});
test('missing or unrecognized SOURCE_COMMIT is explicitly unknown, never guessed',()=>{
 for(const input of [{}, {SOURCE_COMMIT:''},{SOURCE_COMMIT:'main'},{SOURCE_COMMIT:'abc123'},
  {SOURCE_COMMIT:'x'.repeat(40)},{SOURCE_COMMIT:'a'.repeat(41)},
  {SOURCE_COMMIT:'a'.repeat(39)+'/'},{SOURCE_COMMIT:'http://example.test'}]){
  assert.deepEqual(release.releaseInfo(input),{version:'3.2.100',commit:null,commitKnown:false});
 }
});
test('valid Coolify 40-character hexadecimal SHA is normalized safely',()=>{
 assert.equal(release.deployedCommit({SOURCE_COMMIT:'  '+sha.toUpperCase()+'\n'}),sha);
 assert.equal(release.deployedCommit({SOURCE_COMMIT:sha}),sha);
});
test('only public release identity is exposed; no env secrets or internal Coolify metadata',()=>{
 const result=release.releaseInfo({SOURCE_COMMIT:sha,STRIPE_TEST_SECRET_KEY:'sk_test_SECRET',
  DATABASE_URL:'postgres://secret',JWT_SECRET:'hidden',
  COOLIFY_RESOURCE_UUID:'private-uuid'});
 assert.deepEqual(Object.keys(result).sort(),['commit','commitKnown','version']);
 const serialized=JSON.stringify(result);
 for(const value of ['sk_test_SECRET','postgres://secret','hidden','private-uuid'])
  assert.equal(serialized.includes(value),false);
});
test('deployment identity remains read-only and does not affect Marketplace purchases or subscriptions',()=>{
 const service=fs.readFileSync('src/services/deployment-identity-v32100.js','utf8');
 assert.doesNotMatch(service,/INSERT INTO|UPDATE marketplace_|DELETE FROM|fetch\(|stripeRequest\(|process\.env\.[A-Z_]+\s*=/);
 assert.equal(release.releaseInfo({SOURCE_COMMIT:sha}).commitKnown,true);
});
