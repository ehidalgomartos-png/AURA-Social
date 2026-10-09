'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspectMediaStorage,parseMountInfo,deepestMount}=require('../scripts/storage-audit-v304');
const {auditSitemaps,validSitemapXml,SITEMAPS,CHECKS,ORIGIN}=require('../scripts/seo-sitemap-audit-v304');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const validEnv={MEDIA_STORAGE:'local',UPLOAD_DIR:'/data/uploads'};
const rootMount='36 25 0:39 / / rw,relatime - overlay overlay rw\n';
const mediaMount='40 36 8:1 / /data/uploads rw,relatime - ext4 /dev/vda rw\n';
const memMount='41 36 0:88 / /data/uploads rw,relatime - tmpfs tmpfs rw\n';
const deps=(mounts)=>({
 stat:()=>({isDirectory:()=>true}),
 real:p=>p,
 read:()=>mounts
});
function itemXml(path){
 return '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
 '<url><loc>'+ORIGIN+(path==='/sitemap-guias.xml'?'/guias/como-empezar':'/perfiles')+'</loc></url></urlset>';
}
function indexXml(){
 return '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
 SITEMAPS.map(x=>'<sitemap><loc>'+ORIGIN+x+'</loc></sitemap>').join('')+'</sitemapindex>';
}
function fixture(overrides={}){
 const requests=[];
 const fetchFn=async(url,opts)=>{
   requests.push({url,opts});
   const location=new URL(url).pathname;
   const custom=overrides[location]||{};
   return {status:custom.status??200,
     headers:{get:()=>custom.type??'application/xml; charset=utf-8'},
     text:async()=>custom.body??(location==='/sitemap-index.xml'?indexXml():itemXml(location))}
 };
 return {fetchFn,requests};
}

test('mount parser identifies actual nested mount and decodes space-escaped paths',()=>{
 const mounts=parseMountInfo(rootMount+mediaMount+'45 36 8:2 / /data/my\\040photos rw - ext4 /dev/sdb rw\n');
 assert.equal(deepestMount('/data/uploads/image.jpg',mounts).mount,'/data/uploads');
 assert.equal(deepestMount('/data/my photos/photo.jpg',mounts).mount,'/data/my photos');
 assert.equal(deepestMount('/var/task',mounts).mount,'/');
});
test('container root filesystem alone blocks claims of persistent media',()=>{
 const result=inspectMediaStorage(validEnv,deps(rootMount));
 assert.equal(result.status,'blocked');
 assert.equal(result.checks.find(x=>x.key==='mount_evidence').status,'block');
 assert.equal(result.persistenceAcrossDeployVerified,false);
 assert.equal(result.backupVerified,false);
});
test('tmpfs storage cannot be mistaken for persistent media',()=>{
 const r=inspectMediaStorage(validEnv,deps(rootMount+memMount));
 assert.equal(r.status,'blocked');
 assert.match(r.checks.find(x=>x.key==='mount_evidence').explanation,/memoria temporal/);
});
test('separate disk mount still requires Coolify and offsite backup verification',()=>{
 const r=inspectMediaStorage(validEnv,deps(rootMount+mediaMount));
 assert.equal(r.status,'review');
 assert.equal(r.blocked,0);
 assert.equal(r.checks.find(x=>x.key==='mount_evidence').status,'review');
 assert.equal(r.restoreTested,false);
 assert.ok(r.nextActions.some(x=>x.includes('Coolify')));
 assert.ok(r.nextActions.some(x=>x.includes('restaurar')||x.includes('Restaurar')));
});
test('unavailable mountinfo is a manual-review state, not a false pass',()=>{
 const r=inspectMediaStorage(validEnv,{
   stat:()=>({isDirectory:()=>true}),real:p=>p,read:()=>{throw Error('access denied')}
 });
 assert.equal(r.status,'review');
 assert.equal(r.checks.find(x=>x.key==='mount_evidence').status,'review');
 assert.ok(!JSON.stringify(r).includes('access denied'));
});
test('bad/missing directory and relative upload paths fail safely',()=>{
 const a=inspectMediaStorage({...validEnv,UPLOAD_DIR:'uploads'},deps(rootMount));
 assert.equal(a.status,'blocked');
 const b=inspectMediaStorage(validEnv,{stat:()=>{throw Error('private location')},real:p=>p,read:()=>rootMount});
 assert.equal(b.status,'blocked');
 assert.ok(!JSON.stringify(b).includes('private location'));
});
test('storage verifier is read-only, never claims backups or persistence',()=>{
 const code=read('scripts/storage-audit-v304.js');
 assert.doesNotMatch(code,/\b(?:writeFile|mkdir|rename|unlink|rmdir|execSync|spawnSync|db\.query)\b/);
 const r=inspectMediaStorage({MEDIA_STORAGE:'bunny'});
 assert.equal(r.status,'review');
 assert.equal(r.backupVerified,false);
});
test('all eight dynamic sitemaps and the index return valid XML in the happy path',async()=>{
 const h=fixture(),report=await auditSitemaps({fetchFn:h.fetchFn});
 assert.equal(report.status,'passed');
 assert.equal(report.passed,9);
 assert.equal(report.total,9);
 assert.equal(report.searchConsoleVerified,false);
 assert.equal(report.indexationVerified,false);
 assert.equal(h.requests.length,9);
 for(const call of h.requests){
   assert.equal(new URL(call.url).hostname,'redlibertad.com');
   assert.equal(call.opts.method,'GET');
   assert.equal(call.opts.redirect,'manual');
   assert.ok(call.opts.signal);
   assert.ok(!call.opts.headers.Cookie);
 }
});
test('Search Console error: empty urlset is blocked instead of accepted',async()=>{
 const body='<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
 const h=fixture({'/sitemap-topics.xml':{body}});
 const result=await auditSitemaps({fetchFn:h.fetchFn});
 assert.equal(result.status,'blocked');
 assert.equal(result.checks.find(x=>x.path==='/sitemap-topics.xml').reason,'missing_required_url');
});
test('server HTTP errors and HTML error pages are clearly classified',async()=>{
 const h=fixture({
  '/sitemap-events.xml':{status:503,body:'Service unavailable'},
  '/sitemap-reels.xml':{type:'text/html',body:'<html>error</html>'}
 });
 const r=await auditSitemaps({fetchFn:h.fetchFn});
 assert.equal(r.checks.find(x=>x.path==='/sitemap-events.xml').reason,'http_error');
 assert.equal(r.checks.find(x=>x.path==='/sitemap-reels.xml').reason,'unexpected_content_type');
});
test('index must reference all eight child sitemaps',()=>{
 const xml='<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
 '<sitemap><loc>'+ORIGIN+'/sitemap-guias.xml</loc></sitemap></sitemapindex>';
 assert.equal(validSitemapXml(xml,{index:true}),'sitemap_missing_from_index');
});
test('malformed XML, missing URL, wrong origin and forbidden doctypes are rejected',()=>{
 assert.equal(validSitemapXml('not xml'),'missing_xml_declaration');
 assert.equal(validSitemapXml('<?xml version="1.0"?><urlset></urlset>'),'invalid_xml_root');
 assert.equal(validSitemapXml(itemXml('/sitemap-topics.xml').replace('</url>','')),'unbalanced_entries');
 assert.equal(validSitemapXml(itemXml('/sitemap-topics.xml').replaceAll(ORIGIN,'https://evil.example')),'unexpected_url_origin');
 assert.equal(validSitemapXml('<?xml version="1.0"?><!DOCTYPE test>'+itemXml('/sitemap-topics.xml')),'forbidden_doctype');
});
test('production-only target restriction rejects arbitrary destinations',async()=>{
 const h=fixture();
 await assert.rejects(()=>auditSitemaps({origin:'https://127.0.0.1',fetchFn:h.fetchFn}),/canonical HTTPS/);
 assert.equal(h.requests.length,0);
});
test('network failures are sanitized; the report does not contain secrets',async()=>{
 const r=await auditSitemaps({fetchFn:async()=>{throw Error('https://private:secret@server')}});
 assert.equal(r.status,'blocked');
 assert.equal(r.checks.length,9);
 assert.ok(r.checks.every(x=>x.reason==='network_failure'));
 assert.ok(!JSON.stringify(r).includes('private:secret'));
});
test('V3.0.4 commands and CI run the safety audit suite',()=>{
 const pkg=require('../package.json');
 assert.match(pkg.version,/^3\.[0-9]+\.[0-9]+(?:\.[0-9]+)?$/);
 assert.match(pkg.scripts['gate:seo'],/seo-sitemap-audit-v304/);
 assert.match(pkg.scripts['gate:storage'],/storage-audit-v304/);
 assert.match(pkg.scripts['test:production-safety'],/production-safety-v304/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:production-safety/);
 assert.match(read('server.js'),new RegExp("const APP_VERSION='"+pkg.version.replace(/\./g,'\\.')+"'"));
});
