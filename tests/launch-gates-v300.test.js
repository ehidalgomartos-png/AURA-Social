'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  verifyPublicRelease,parsePublicOrigin,validatePublicBody,CHECKS,ORIGIN
}=require('../scripts/release-gate-v300');
const {checkLaunchConfiguration}=require('../scripts/launch-preflight-v300');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const version='3.0.0';
function fakeBody(key){
  const bodies={
    health:JSON.stringify({ok:true,version,configuration:{criticalReady:true}}),
    database:JSON.stringify({ok:true,database:'ready',version}),
    app:'<!doctype html><html lang="es"><head></head><body>Social</body></html>',
    robots:'User-agent: *\nDisallow: /api/\nDisallow: /uploads/\nSitemap: '+ORIGIN+'/sitemap-index.xml\nSitemap: '+ORIGIN+'/sitemap-guias.xml',
    sitemaps:'<?xml version="1.0"?><sitemapindex><loc>'+ORIGIN+'/sitemap-guias.xml</loc></sitemapindex>',
    guide_sitemap:'<urlset><loc>'+ORIGIN+'/guias/como-empezar</loc></urlset>',
    guide_hub:'<!doctype html><html lang="es"><link rel="canonical" href="'+ORIGIN+'/guias">',
    guide_detail:'<!doctype html><html lang="es"><link rel="canonical" href="'+ORIGIN+'/guias/como-empezar">',
    manifest:'{"name":"RedLibertad"}',
    service_worker:'self.addEventListener("fetch",()=>{})',
    private_account:'{"error":"authentication_required"}',
    private_legal_export:'{"error":"authentication_required"}',
    private_growth:'{"error":"authentication_required"}',
    private_retention:'{"error":"authentication_required"}'
  };
  return bodies[key];
}
function harness({statuses={},bodies={},throwFor=null}={}){
  const requests=[];
  const fetchFn=async(url,opts)=>{
    requests.push({url,opts});
    const item=CHECKS.find(c=>ORIGIN+c.path===url);
    assert.ok(item,'Unexpected request '+url);
    if(item.key===throwFor)throw Error('network with private credentials: secret');
    const status=statuses[item.key]??item.status;
    return {status,ok:status>=200&&status<300,
      text:async()=>bodies[item.key]??fakeBody(item.key)};
  };
  return {requests,fetchFn};
}

test('gate checks version/readiness, PWA, SEO and protected API boundaries',async()=>{
  const h=harness();
  const result=await verifyPublicRelease({fetchFn:h.fetchFn,version});
  assert.equal(result.status,'passed');
  assert.equal(result.total,14);
  assert.equal(result.passed,14);
  assert.equal(result.externalHttpVerified,true);
  assert.equal(result.coolifyVerified,false);
  assert.equal(result.backupRestorationVerified,false);
  assert.equal(result.authenticatedSocialJourneysVerified,false);
  assert.equal(result.releaseApproved,false);
  assert.equal(h.requests.length,14);
  for(const request of h.requests){
    assert.equal(new URL(request.url).hostname,'redlibertad.com');
    assert.equal(request.opts.method,'GET');
    assert.equal(request.opts.redirect,'manual');
    assert.equal(request.opts.cache,'no-store');
    assert.ok(request.opts.signal);
    assert.ok(!request.opts.headers.Authorization);
    assert.ok(!request.opts.headers.Cookie);
  }
});
test('the target accepts only the canonical HTTPS origin and no user info',()=>{
  assert.equal(parsePublicOrigin(ORIGIN),ORIGIN);
  for(const input of ['http://redlibertad.com','https://www.redlibertad.com',
    'https://redlibertad.com:8443','https://redlibertad.com/extra',
    'https://redlibertad.com?x=1','https://redlibertad.com#x',
    'https://user:pass@redlibertad.com','https://127.0.0.1',
    'https://redlibertad.com.evil.example'])assert.throws(()=>parsePublicOrigin(input),input);
});
test('wrong release version fails both process and DB gates',async()=>{
  const h=harness({bodies:{
    health:JSON.stringify({ok:true,version:'2.20.0',configuration:{criticalReady:true}}),
    database:JSON.stringify({ok:true,version:'2.20.0',database:'ready'})
  }});
  const r=await verifyPublicRelease({fetchFn:h.fetchFn,version});
  assert.equal(r.status,'blocked');
  assert.equal(r.checks.find(x=>x.key==='health').reason,'wrong_version');
  assert.equal(r.checks.find(x=>x.key==='database').reason,'wrong_version');
});
test('health requiring configuration readiness and PostgreSQL readiness are separate blockers',async()=>{
  assert.equal(validatePublicBody('health',JSON.stringify({ok:true,version,configuration:{criticalReady:false}}),version),'configuration_incomplete');
  assert.equal(validatePublicBody('ready',JSON.stringify({ok:true,version,database:'unavailable'}),version),'database_unavailable');
  assert.equal(validatePublicBody('health','not-json',version),'invalid_json');
});
test('unexpected 200 from protected account or admin routes fails closed',async()=>{
  const h=harness({statuses:{private_account:200,private_growth:200,private_retention:200}});
  const report=await verifyPublicRelease({fetchFn:h.fetchFn,version});
  assert.equal(report.status,'blocked');
  for(const key of ['private_account','private_growth','private_retention'])
    assert.equal(report.checks.find(c=>c.key===key).reason,'unexpected_http_status');
});
test('authenticated denial must use generic error envelope not leaked private data',async()=>{
  const h=harness({bodies:{private_legal_export:'{"error":"other","username":"private"}'}});
  const r=await verifyPublicRelease({fetchFn:h.fetchFn,version});
  assert.equal(r.status,'blocked');
  assert.equal(r.checks.find(c=>c.key==='private_legal_export').reason,'not_authentication_denied');
  assert.ok(!JSON.stringify(r).includes('private"}'));
});
test('missing guide canonical or noindex blocks public SEO acceptance',async()=>{
  const h=harness({bodies:{guide_detail:'<html lang="es"><meta name="robots" content="noindex">'}});
  const r=await verifyPublicRelease({fetchFn:h.fetchFn,version});
  assert.equal(r.checks.find(c=>c.key==='guide_detail').reason,'unexpected_guide_html');
});
test('missing robots privacy protections or guide sitemap fails',async()=>{
  assert.equal(validatePublicBody('robots','User-agent: *',version),'unexpected_robots');
  assert.equal(validatePublicBody('sitemap-index','<sitemapindex></sitemapindex>',version),'missing_guide_sitemap');
  assert.equal(validatePublicBody('guide-sitemap','<urlset></urlset>',version),'missing_guide_urls');
});
test('network exceptions are converted to generic names without leaked URLs or secrets',async()=>{
  const h=harness({throwFor:'health'});
  const r=await verifyPublicRelease({fetchFn:h.fetchFn,version});
  assert.equal(r.status,'blocked');
  assert.equal(r.checks.find(c=>c.key==='health').reason,'network_failure');
  assert.ok(!JSON.stringify(r).includes('private credentials'));
});
test('only statically declared read-only methods and clean paths are allowed',()=>{
  assert.equal(CHECKS.length,14);
  assert.equal(new Set(CHECKS.map(x=>x.path)).size,14);
  for(const check of CHECKS){
    assert.match(check.path,/^\/[a-z0-9/.-]+$/);
    assert.ok([200,401].includes(check.status));
  }
  const code=read('scripts/release-gate-v300.js');
  assert.doesNotMatch(code,/method:'(?:POST|PATCH|PUT|DELETE)'/);
  assert.doesNotMatch(code,/Authorization:|Cookie:/);
});
function validEnv(){
  return {NODE_ENV:'production',APP_ORIGIN:ORIGIN,COOKIE_SECURE:'true',
    DATABASE_URL:'postgresql://username:password@db.local/app',
    JWT_SECRET:'0123456789abcdef0123456789abcdef',
    MEDIA_STORAGE:'local',UPLOAD_DIR:'/data/uploads'};
}
const fakeDir=()=>({isDirectory:()=>true});
test('complete configuration passes automatic checks but manual launch gates stay pending',()=>{
  const r=checkLaunchConfiguration(validEnv(),{stat:fakeDir});
  assert.equal(r.status,'pass');
  assert.equal(r.blocked,0);
  assert.equal(r.automaticBackupVerification,false);
  assert.equal(r.coolifyDeploymentVerified,false);
  assert.ok(r.manualGates.some(x=>x.includes('restauración')));
  assert.ok(r.manualGates.some(x=>x.includes('móvil')));
  assert.ok(!JSON.stringify(r).includes('username:password'));
  assert.ok(!JSON.stringify(r).includes('0123456789abcdef'));
});
test('production preflight refuses missing credentials and insecure origin and cookie',()=>{
  const env=validEnv();
  env.JWT_SECRET='changeMe';
  env.APP_ORIGIN='http://redlibertad.com';
  env.COOKIE_SECURE='false';
  env.DATABASE_URL='';
  const r=checkLaunchConfiguration(env,{stat:fakeDir});
  assert.equal(r.status,'blocked');
  assert.equal(r.blocked,4);
  for(const key of ['session_secret','canonical_origin','secure_cookies','database_config'])
    assert.equal(r.checks.find(x=>x.key===key).status,'block');
});
test('media requires accessible absolute volume and warns about nonstandard mount',()=>{
  const a=checkLaunchConfiguration({...validEnv(),UPLOAD_DIR:'uploads'},{stat:()=>{throw Error('not present');}});
  assert.equal(a.status,'blocked');
  assert.equal(a.checks.find(x=>x.key==='media_volume_access').status,'block');
  const b=checkLaunchConfiguration({...validEnv(),UPLOAD_DIR:'/opt/media'},{stat:fakeDir});
  assert.equal(b.status,'review');
  assert.equal(b.checks.find(x=>x.key==='media_mount_convention').status,'warning');
});
test('preflight is non-destructive and does not rely on unverified backup claims',()=>{
  const code=read('scripts/launch-preflight-v300.js');
  assert.doesNotMatch(code,/writeFile|mkdir|unlink|rmSync|db\.query|pg_dump|spawnSync/);
  const report=checkLaunchConfiguration(validEnv(),{stat:fakeDir});
  assert.ok(report.manualGates.length>=5);
});
test('integration documents release gate and project is declared as V3.0',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,version);
  assert.match(pkg.scripts['gate:public'],/release-gate-v300/);
  assert.match(pkg.scripts['gate:config'],/launch-preflight-v300/);
  assert.match(read('server.js'),/const APP_VERSION='3\.0\.0'/);
  assert.match(read('.github/workflows/validate-js.yml'),/test:launch-gates/);
});
