'use strict';
// V3.2.100 — public deployed commit fingerprint; no payments, network, or DB operations.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const release=require('../src/services/deployment-identity-v32100');
const sha='c20a4cf89bdc44e5b5123f0a2e4f36107a95cfd8';

test('Coolify SOURCE_COMMIT is the only trusted deployed SHA',()=>{
 const output=release.releaseInfo({SOURCE_COMMIT:sha});
 assert.equal(output.commit,sha);
 assert.equal(output.commitKnown,true);
 assert.equal(output.version,require('../package.json').version);
 assert.equal(release.deployedCommit({SOURCE_COMMIT:' '+sha.toUpperCase()+'\\n'}),null);
 assert.equal(release.deployedCommit({SOURCE_COMMIT:' '+sha.toUpperCase()+'\n'}),sha);
});
test('missing or invalid SHA is unknown and never guessed',()=>{
 for(const value of ['', 'main','abc123','x'.repeat(40),'a'.repeat(41),'https://example.test']){
  const output=release.releaseInfo({SOURCE_COMMIT:value});
  assert.equal(output.commit,null);
  assert.equal(output.commitKnown,false);
 }
 assert.equal(release.deployedCommit({}),null);
});
test('health and public config expose the compatibility version, milestone and deployed SHA',()=>{
 const server=fs.readFileSync('server.js','utf8');
 for(const phrase of ["const APP_VERSION='3.2.77'",'releaseMilestone:RELEASE_MILESTONE_V3332','deployedCommit:releaseInfo().commit',
  "app.get('/api/health'", "app.get('/api/public-config'"]){
  assert.equal(server.includes(phrase),true,phrase);
 }
});
test('release identity exposes no secrets or Coolify internal IDs',()=>{
 const output=release.releaseInfo({SOURCE_COMMIT:sha,DATABASE_URL:'private-db',JWT_SECRET:'private-jwt',
  STRIPE_TEST_SECRET_KEY:'private-stripe',COOLIFY_RESOURCE_UUID:'private-uuid'});
 assert.deepEqual(Object.keys(output).sort(),['commit','commitKnown','version']);
 const text=JSON.stringify(output);
 for(const secret of ['private-db','private-jwt','private-stripe','private-uuid'])
  assert.equal(text.includes(secret),false);
});
test('fingerprint module is read-only and cannot change payment or store records',()=>{
 const source=fs.readFileSync('src/services/deployment-identity-v32100.js','utf8');
 for(const forbidden of ['UPDATE marketplace_','INSERT INTO','DELETE FROM','stripeRequest(',
  'fetch(','process.env.STRIPE_TEST_SECRET_KEY='])
  assert.equal(source.includes(forbidden),false);
});
