'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {version}=require('../package.json');
const {releaseInfo,deployedCommit}=require('../src/services/deployment-identity-v32100');
const server=read('server.js'),sw=read('public/sw.js'),workflow=read('.github/workflows/validate-js.yml');
test('runtime health keeps legacy contract while advertising real V3.3.32 milestone',()=>{
 assert.equal(version,'3.2.77');
 assert.ok(server.includes("const APP_VERSION='"+version+"'"));
 assert.match(server,/const RELEASE_MILESTONE_V3332='3\.3\.32'/);
 assert.match(server,/releaseMilestone:RELEASE_MILESTONE_V3332/);
 assert.match(server,/res\.json\(\{origin,version:APP_VERSION,releaseMilestone:RELEASE_MILESTONE_V3332/);
 assert.equal(releaseInfo({}).version,version);
 assert.match(server,/app\.get\('\/api\/health'/);
 assert.match(server,/app\.get\('\/api\/ready'/);
 assert.match(server,/deployedCommit:releaseInfo\(\)\.commit/);
 assert.match(read('scripts/release-gate-v300.js'),/const \{version:packageVersion\}=require\('\.\.\/package\.json'\)/);
});
test('only a full trusted Coolify SHA is surfaced; no guessing from GitHub or secrets',()=>{
 const sha='a'.repeat(40);
 assert.equal(deployedCommit({SOURCE_COMMIT:sha}),sha);
 assert.equal(deployedCommit({SOURCE_COMMIT:'main'}),null);
 const data=releaseInfo({SOURCE_COMMIT:sha,DATABASE_URL:'private-db',JWT_SECRET:'private-key'});
 assert.deepEqual(Object.keys(data).sort(),['commit','commitKnown','version']);
 assert.equal(JSON.stringify(data).includes('private-db'),false);
 assert.equal(JSON.stringify(data).includes('private-key'),false);
});
test('new PWA cache generation refreshes the public shell and safely retires the old one',()=>{
 assert.match(sw,/const SHELL_CACHE='redlibertad-v3332-shell'/);
 assert.match(sw,/const STATIC_CACHE='redlibertad-v3332-static'/);
 assert.match(sw,/const CACHE_PREFIX='redlibertad-'/);
 assert.match(sw,/keys\.filter|\.filter\(key=>key\.startsWith\(CACHE_PREFIX\)/);
 assert.match(sw,/caches\.delete\(key\)/);
 const shell=sw.slice(sw.indexOf('const SHELL_ASSETS='),sw.indexOf('self.addEventListener(\'install\''));
 assert.match(shell,/\/app/);
 assert.match(shell,/\/pwa-badges-v3323\.js/);
 assert.match(shell,/\/home-growth-desktop-v33242\.css/);
 assert.doesNotMatch(shell,/\/api\/|\/admin|\/uploads\/|\/messages\/|\/notifications\//);
});
test('private API and multimedia remain uncached; push navigation stays same-origin',()=>{
 assert.match(sw,/url\.pathname==='/);
 for(const boundary of ['/api','/uploads','/admin'])assert.ok(sw.includes(boundary),boundary);
 assert.match(sw,/function safeNotificationTarget\(value\)/);
 assert.match(sw,/request\.method!=='GET'/);
 assert.match(sw,/function networkFirstAsset\(request\)/);
 assert.match(sw,/function isMutableCodeAsset\(url\)/);
 assert.match(sw,/const MAX_STATIC_ENTRIES=64/);
});
test('public rollout checker never claims Coolify, backup restores or authenticated journeys verified',()=>{
 const src=read('scripts/release-gate-v300.js');
 for(const phrase of ['externalHttpVerified:pass','coolifyVerified:false','backupRestorationVerified:false',
  'authenticatedSocialJourneysVerified:false','releaseApproved:false']){
  assert.ok(src.includes(phrase),phrase);
 }
 assert.match(read('src/routes/admin-growth-v219.js'),/router\.use\(requireAdmin\)/);
 assert.match(read('src/routes/live.js'),/router\.get\('\/badge',requireAuth/);
 assert.match(read('public/pwa-badges-v3323.js'),/expectedOwner/);
 assert.match(workflow,/tests\/release-identity-pwa-audit-v3332\.test\.js/);
});
