'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const server=read('server.js');
const sw=read('public/sw.js');
const ci=read('.github/workflows/validate-js.yml');

test('public health and configuration expose V3.4.0 while legacy version and deployment SHA remain stable',()=>{
  const {version}=require('../package.json');
  assert.equal(version,'3.2.77');
  assert.ok(server.includes("const APP_VERSION='"+version+"'"));
  assert.match(server,/const RELEASE_MILESTONE_V3400='3\.4\.0'/);
  assert.equal((server.match(/releaseMilestone:RELEASE_MILESTONE_V3400/g)||[]).length,2);
  assert.match(server,/deployedCommit:releaseInfo\(\)\.commit/);
  assert.match(server,/app\.get\('\/api\/ready'/);
  assert.match(read('scripts/verify-production-deploy-v32101.js'),/observed!==expected/);
  assert.match(read('scripts/verify-production-deploy-v32101.js'),/database!=='ready'/);
});

test('V3.4.0 PWA rotation evicts old public cache but does not intercept sensitive APIs or media',()=>{
  assert.match(sw,/const SHELL_CACHE='redlibertad-v3400-shell'/);
  assert.match(sw,/const STATIC_CACHE='redlibertad-v3400-static'/);
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(sw,/caches\.delete\(key\)/);
  for(const path of ['/api','/uploads','/p','/admin']){
    assert.ok(sw.includes(path),path);
  }
  assert.match(sw,/function safeNotificationTarget\(value\)/);
  assert.match(read('public/pwa.js'),/SW_UPDATE_INTERVAL_V336=60\*60\*1000/);
  assert.match(read('public/pwa.js'),/ensureServiceWorkerRegistrationV3338/);
});

test('real D1/D7, first posts and privacy tests remain mandatory release checks',()=>{
  const names=[
    'growth-public-contribution-v335.test.js',
    'activation-growth-v32164.test.js',
    'activation-consistency-v331.test.js',
    'growth-consolidated-v330.test.js',
    'home-growth-desktop-v33242.test.js',
    'mobile-pwa-update-budget-v336.test.js',
    'pwa-registration-recovery-v3338.test.js',
    'public-post-privacy-v3340.test.js',
    'profile-seo-v302.test.js',
    'release-identity-pwa-audit-v3332.test.js',
    'growth-release-v3400.test.js'
  ];
  for(const name of names)assert.ok(ci.includes(name),'Missing release regression: '+name);
  assert.match(read('src/routes/admin-growth-v219.js'),/router\.use\(requireAdmin\)/);
  const {summarizeGrowth}=require('../src/routes/admin-growth-v219');
  const totals=summarizeGrowth([],7).totals;
  assert.equal(totals.d1RatePct,null);
  assert.equal(totals.d7RatePct,null);
});

test('existing public privacy boundaries and no-index still apply',()=>{
  const privacy=read('src/services/public-post-privacy-v3340.js');
  assert.match(privacy,/const showContent=post\?\.content_level==='normal'/);
  assert.match(server,/publicPostPreview\(post\)/);
  assert.match(server,/setHeader\('X-Robots-Tag','noindex,nofollow'\)/);
  const sitemap=server.slice(server.indexOf("app.get('/sitemap.xml'"));
  for(const condition of ["p.audience='public'","p.content_level='normal'","u.discoverable=true"])
    assert.ok(sitemap.includes(condition),condition);
});

test('release acceptance documentation explicitly separates automated and real-world checks',()=>{
  const doc=read('docs/V3.4.0-ACEPTACION.md');
  for(const term of ['PostgreSQL 18','D1/D7','móvil','escritorio','Coolify','restauración','Search Console'])
    assert.ok(doc.includes(term),'Missing operational acceptance: '+term);
  assert.match(doc,/pendiente de validación manual/);
});
