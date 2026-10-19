'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const gsc=require('../src/services/marketplace-gsc-readonly-v32123');
const {createGscRouter,sameOriginJson}=require('../src/routes/marketplace-gsc-v32123');
const {requireAdmin}=require('../src/middleware/auth');
const db=require('../src/db');
const listingPath=require('../src/routes/marketplace-seo-v3251').listingPath;
const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const serviceEnv={
 GSC_READONLY_ENABLED:'true',
 GSC_SITE_URL:'sc-domain:redlibertad.com',
 GSC_SERVICE_ACCOUNT_EMAIL:'readonly-test@test-project.iam.gserviceaccount.com',
 GSC_SERVICE_ACCOUNT_PRIVATE_KEY:privateKey.replace(/\n/g,'\\n')
};
function mockResponse(){
 return {
  statusCode:200,body:null,headers:{},
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  json(value){this.body=value;return this;}
 };
}
function routeHandler(){
 const router=createGscRouter({listingPath,ensureMarketplaceSchema:async()=>{}});
 const route=router.stack.find(entry=>entry.route?.path==='/inspeccionar')?.route;
 assert.ok(route);
 assert.equal(route.methods.post,true);
 assert.equal(route.stack[0].handle,requireAdmin);
 assert.equal(route.stack[1].handle,sameOriginJson);
 return route.stack.at(-1).handle;
}
test('disabled until explicit Coolify opt-in and full exact Google service account configuration',()=>{
 const disabled=gsc.status({});
 assert.equal(disabled.state,'disabled');
 assert.equal(disabled.configured,false);
 assert.equal(disabled.property,null);
 assert.equal(gsc.status({...serviceEnv,GSC_READONLY_ENABLED:'false'}).state,'disabled');
 assert.equal(gsc.status({...serviceEnv,GSC_SITE_URL:'https://evil.example/'}).state,'needs_configuration');
 assert.equal(gsc.status({...serviceEnv,GSC_SITE_URL:'sc-domain:other.com'}).configured,false);
 assert.equal(gsc.status({...serviceEnv,GSC_SERVICE_ACCOUNT_PRIVATE_KEY:''}).configured,false);
 const ready=gsc.status(serviceEnv);
 assert.equal(ready.state,'ready');
 assert.equal(ready.property,'sc-domain:redlibertad.com');
 assert.equal(ready.enabled,true);
 assert.equal(ready.configured,true);
 assert.equal(gsc.status({...serviceEnv,GSC_SITE_URL:'https://redlibertad.com/'}).configured,true);
 assert.doesNotMatch(JSON.stringify(ready),/PRIVATE KEY|readonly-test@/);
 assert.equal(gsc.status({...serviceEnv,GSC_READONLY_ENABLED:'false'}).property,null);
});
test('only exact local listing IDs and server-generated canonical Marketplace URLs may be inspected',()=>{
 for(const good of ['1','120','9999999999999999'])assert.equal(gsc.safeListingId(good),true);
 for(const bad of [120,null,undefined,'','0','01','-1','1e2','1/2','%2f','https://evil.example/',"1' OR 1=1", '99999999999999999'])
  assert.equal(gsc.safeListingId(bad),false,JSON.stringify(bad));
 const sql=gsc.PUBLIC_LISTING_SQL;
 for(const clause of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true",'l.id=$1','LIMIT 1'])
  assert.ok(sql.includes(clause),clause);
 assert.doesNotMatch(sql,/INSERT INTO|UPDATE marketplace_listings|DELETE FROM/i);
 const src=fs.readFileSync('src/routes/marketplace-gsc-v32123.js','utf8');
 assert.match(src,/requireAdmin,sameOriginJson,limiter/);
 assert.match(src,/max:6/);
 assert.match(src,/gsc\.PUBLIC_LISTING_SQL,\[id\]/);
 assert.match(src,/private,no-store/);
 assert.match(src,/noindex,nofollow/);
 assert.doesNotMatch(src,/req\.body\?\.url|req\.query\?\.url|api\/indexing|urlNotifications/);
});
test('OAuth assertion uses signed RS256, readonly scope and official fixed token audience',()=>{
 const c=gsc.serviceConfig(serviceEnv);
 const jwt=gsc.assertion(c,1234567890);
 const [header,body,sig]=jwt.split('.');
 assert.equal(JSON.parse(Buffer.from(header,'base64url').toString()).alg,'RS256');
 const claims=JSON.parse(Buffer.from(body,'base64url').toString());
 assert.equal(claims.iss,serviceEnv.GSC_SERVICE_ACCOUNT_EMAIL);
 assert.equal(claims.aud,'https://oauth2.googleapis.com/token');
 assert.equal(claims.scope,'https://www.googleapis.com/auth/webmasters.readonly');
 assert.equal(claims.iat,1234567890);
 assert.equal(claims.exp,1234568790);
 const pub=crypto.createPublicKey(privateKey);
 assert.equal(crypto.verify('RSA-SHA256',Buffer.from(header+'.'+body),pub,Buffer.from(sig,'base64url')),true);
 assert.throws(()=>gsc.assertion({...c,privateKey:'bad-key'},1234),e=>e.code==='gsc_invalid_service_account_key');
});
test('read-only Google inspection uses exactly two fixed endpoints and returns whitelisted genuine results',async()=>{
 const calls=[];
 const fakeFetch=async(url,request)=>{
  calls.push({url,request});
  if(url===gsc.TOKEN_URL)return {ok:true,status:200,json:async()=>({access_token:'valid_mock_access_token',expires_in:3599})};
  if(url===gsc.INSPECTION_URL)return {ok:true,status:200,json:async()=>({
   inspectionResult:{indexStatusResult:{
    verdict:'PASS',coverageState:'Submitted and indexed',
    indexingState:'INDEXING_ALLOWED',pageFetchState:'SUCCESSFUL',
    robotsTxtState:'ALLOWED',lastCrawlTime:'2026-10-10T14:00:00Z',
    userCanonical:'https://redlibertad.com/marketplace/p/33/taza-cuphead',
    googleCanonical:'https://redlibertad.com/marketplace/p/33/taza-cuphead',
    sitemap:['https://redlibertad.com/sitemap-marketplace-productos-1.xml']
   },ampResult:{privateToken:'NEVER_RETURN'}}
  })};
  throw Error('Unexpected outgoing endpoint');
 };
 const c=gsc.serviceConfig(serviceEnv);
 const data=await gsc.inspect({id:'33',row:{id:33,title:'Taza Cuphead'},config:c,request:fakeFetch,listingPath});
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(c=>c.url),[gsc.TOKEN_URL,gsc.INSPECTION_URL]);
 const jwtParams=new URLSearchParams(calls[0].request.body);
 assert.equal(jwtParams.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
 assert.equal(calls[0].request.method,'POST');
 assert.equal(calls[0].request.redirect,'error');
 const inspectCall=calls[1];
 assert.equal(inspectCall.request.method,'POST');
 assert.equal(inspectCall.request.redirect,'error');
 assert.equal(inspectCall.request.headers.Authorization,'Bearer valid_mock_access_token');
 assert.deepEqual(JSON.parse(inspectCall.request.body),{
  inspectionUrl:'https://redlibertad.com/marketplace/p/33/taza-cuphead',
  siteUrl:'sc-domain:redlibertad.com',
  languageCode:'es-ES'
 });
 assert.equal(data.source,'google_search_console_url_inspection');
 assert.equal(data.verdict,'PASS');
 assert.equal(data.coverageState,'Submitted and indexed');
 assert.equal(data.googleCanonical,data.inspectionUrl);
 assert.equal(data.sitemaps.length,1);
 assert.match(data.note,/No es una prueba de la página publicada/);
 assert.equal(data.ampResult,undefined);
 assert.doesNotMatch(JSON.stringify(data),/mock_access_token|PRIVATE KEY|privateToken/);
});
test('invalid listing, disabled credentials and Google errors do not leak raw responses, tokens or secrets',async()=>{
 const c=gsc.serviceConfig(serviceEnv);
 const row={id:33,title:'Taza Cuphead'};
 const badRequest=async()=>{throw Error('private_key leak: SHOULD_NOT_DISPLAY');};
 await assert.rejects(
  gsc.inspect({id:'33',row,config:{...c,configured:false},request:badRequest,listingPath}),
  error=>error.code==='gsc_not_configured'
 );
 await assert.rejects(
  gsc.inspect({id:'33',row:{id:34,title:'Other'},config:c,request:badRequest,listingPath}),
  error=>error.code==='gsc_invalid_public_listing'
 );
 await assert.rejects(
  gsc.inspect({id:'33',row,config:c,request:badRequest,listingPath}),
  error=>error.code==='gsc_network_unavailable'&&!error.message.includes('private_key')
 );
 await assert.rejects(
  gsc.inspect({id:'33',row,config:c,request:async()=>({status:429,ok:false}),listingPath}),
  error=>error.code==='gsc_quota_exceeded'&&error.status===429
 );
 await assert.rejects(
  gsc.inspect({id:'33',row,config:c,request:async()=>({status:403,ok:false}),listingPath}),
  error=>error.code==='gsc_access_denied'&&error.status===502
 );
 const trimmed=gsc.sanitizeInspection({
  inspectionResult:{indexStatusResult:{verdict:'INVALID_VERDICT',coverageState:'X'.repeat(600),googleCanonical:'javascript:alert(1)'}}
 },'https://redlibertad.com/marketplace/p/33/taza-cuphead');
 assert.equal(trimmed.verdict,'VERDICT_UNSPECIFIED');
 assert.equal(trimmed.coverageState.length,180);
 assert.equal(trimmed.googleCanonical,'javascript:alert(1)'); // client renders it only as inert text
 assert.equal(trimmed.indexedByGoogle,undefined);
});
test('same-origin application/json precondition prevents cookie CSRF and forged origins',()=>{
 for(const headers of [
  {'content-type':'application/x-www-form-urlencoded',origin:'https://redlibertad.com'},
  {'content-type':'application/json',origin:'https://evil.example'},
  {'content-type':'application/json',origin:'https://redlibertad.com.evil.test'},
  {'content-type':'text/plain',origin:'https://redlibertad.com'},
  {'content-type':'application/json'}
 ]){
  const res=mockResponse();let forwarded=false;
  sameOriginJson({headers},res,()=>{forwarded=true;});
  assert.equal(forwarded,false);assert.equal(res.statusCode,403);
 }
 const res=mockResponse();let forwarded=false;
 sameOriginJson({headers:{origin:'https://redlibertad.com','content-type':'application/json;charset=UTF-8'}},res,()=>{forwarded=true;});
 assert.equal(forwarded,true);
});
test('route refuses disabled, malformed and nonpublic listings without calling Google',async()=>{
 const route=routeHandler();
 const query=db.query,oldInspect=gsc.inspect;
 const envKeys=['GSC_READONLY_ENABLED','GSC_SITE_URL','GSC_SERVICE_ACCOUNT_EMAIL','GSC_SERVICE_ACCOUNT_PRIVATE_KEY'];
 const previous=envKeys.map(key=>process.env[key]);
 const calls=[];
 try{
  gsc.inspect=async()=>{calls.push('GOOGLE');return {source:'google_search_console_url_inspection'};};
  db.query=async(sql,args)=>{calls.push({sql,args});return {rows:[],rowCount:0};};
  process.env.GSC_READONLY_ENABLED='false';
  const basic={headers:{origin:'https://redlibertad.com','content-type':'application/json'},body:{id:'33'},user:{id:12,isAdmin:true}};
  let res=mockResponse();
  await route(basic,res,e=>{throw e;});
  assert.equal(res.statusCode,503);
  assert.equal(res.body.error,'gsc_not_configured');
  assert.equal(calls.length,0);
  for(let i=0;i<envKeys.length;i++)process.env[envKeys[i]]=serviceEnv[envKeys[i]];
  res=mockResponse();await route({...basic,body:{id:'../33'}},res,e=>{throw e;});
  assert.equal(res.statusCode,400);
  assert.equal(calls.length,0);
  res=mockResponse();await route(basic,res,e=>{throw e;});
  assert.equal(res.statusCode,404);
  assert.equal(res.body.error,'gsc_listing_not_public');
  assert.equal(calls.length,1);
  assert.equal(calls[0].args[0],'33');
  assert.equal(res.headers['X-Robots-Tag'],'noindex,nofollow');
  assert.equal(res.headers['Cache-Control'],'private,no-store');
 }finally{
  db.query=query;gsc.inspect=oldInspect;
  envKeys.forEach((key,i)=>{
   if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];
  });
 }
});
test('mobile panel never calls the Google inspection API until an authenticated admin clicks',async()=>{
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 for(const id of ['auditGscId','auditGscInspect','auditGscState','auditGscActionStatus','auditGscResult','auditGscResultFields']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/No inspecciona la versión en directo/);
 assert.match(js,/gscButton\.addEventListener\('click'/);
 assert.doesNotMatch(js,/\.innerHTML\s*=|insertAdjacentHTML|eval\(/);
 assert.match(css,/@media\(max-width:480px\)/);
 class Element{
  constructor(){this.children=[];this.events={};this.value='';this.hidden=false;this.textContent='';this.disabled=false;}
  append(...values){this.children.push(...values);}
  replaceChildren(...values){this.children=[...values];}
  addEventListener(event,handler){this.events[event]=handler;}
 }
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 node('auditExampleFilter').value='todos';
 const calls=[];
 const audit={
  ok:true,mode:'preparacion_tecnica',generatedAt:'2026-10-19T12:00:00Z',
  googleSearchConsole:{mode:'google_search_console_readonly',configured:true,note:'Configurado'},
  limits:{recentSample:1},totals:{publicListings:1,products:1,services:0,properties:0},
  checks:[],informational:[],categories:[],examples:[],issueLabels:{}
 };
 const inspection={
  source:'google_search_console_url_inspection',inspectionUrl:'https://redlibertad.com/marketplace/p/33/taza-cuphead',
  verdict:'NEUTRAL',coverageState:'Discovered - currently not indexed',sitemaps:[],
  note:'Index version'
 };
 const fetch=async(path,options)=>{
  calls.push({path,options});
  return {ok:true,status:200,json:async()=>path.includes('/gsc/inspeccionar')?{ok:true,inspection}:audit};
 };
 const context={document:{getElementById:node,createElement:()=>new Element()},fetch,Intl,Date,Number,String,Array,Object,Error,Promise};
 vm.runInNewContext(js,context);
 for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(node('auditGscInspect').disabled,false);
 node('auditGscId').value='33';
 await node('auditGscInspect').events.click();
 assert.equal(calls.length,2);
 assert.equal(calls[1].options.method,'POST');
 assert.equal(calls[1].options.credentials,'same-origin');
 assert.equal(calls[1].options.body,JSON.stringify({id:'33'}));
 assert.equal(node('auditGscResult').hidden,false);
 assert.ok(node('auditGscResultFields').children.some(row=>row.children?.some(c=>c.textContent.includes('Descubierta'))===true)===false);
 assert.match(node('auditGscActionStatus').textContent,/Inspección manual finalizada/);
});


test('V3.2.123.1 safe diagnostics identify exactly which GSC variable fails, without echoing secrets',()=>{
 const healthy=gsc.status(serviceEnv);
 assert.equal(healthy.configured,true);
 assert.equal(healthy.state,'ready');
 assert.equal(healthy.checks.length,6);
 assert.ok(healthy.checks.every(x=>x.ok));
 const cases=[
  [{...serviceEnv,GSC_READONLY_ENABLED:'false'},'enabled'],
  [{...serviceEnv,GSC_SITE_URL:'sc-domain:some-other-domain.com'},'validSite'],
  [{...serviceEnv,GSC_SERVICE_ACCOUNT_EMAIL:'not-a-google-service-account'},'validEmail'],
  [{...serviceEnv,GSC_SERVICE_ACCOUNT_PRIVATE_KEY:''},'keyPresent'],
  [{...serviceEnv,GSC_SERVICE_ACCOUNT_PRIVATE_KEY:'private_key_id-not-the-key'},'keyMarkers'],
  [{...serviceEnv,GSC_SERVICE_ACCOUNT_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----\nnot-base64\n-----END PRIVATE KEY-----'},'keyReadable']
 ];
 for(const [env,failedId] of cases){
  const status=gsc.status(env),flag=status.checks.find(c=>c.id===failedId);
  assert.equal(status.configured,false,failedId);
  assert.equal(status.property,null,failedId);
  assert.equal(flag.ok,false,failedId);
  assert.ok(flag.hint.length>10);
  if(status.enabled)assert.ok(status.note.includes(flag.label));
  else assert.match(status.note,/desactivada/i);
  const json=JSON.stringify(status);
  assert.ok(!json.includes('redlibertad-search-console@'),failedId);
  assert.ok(!json.includes('-----BEGIN PRIVATE KEY-----'),failedId);
  assert.ok(!json.includes('-----END PRIVATE KEY-----'),failedId);
  assert.ok(!json.includes('not-base64'),failedId);
  assert.ok(!json.includes('private_key_id-not-the-key'),failedId);
  assert.doesNotMatch(json,/"privateKey"|"email"|"rawValue"|"keyLength"/);
 }
});

test('V3.2.123.1 accepts actual Coolify multiline, JSON-escaped, double-escaped and quoted RSA PEM inputs',()=>{
 const formats=[
  privateKey,
  privateKey.replace(/\n/g,'\\n'),
  privateKey.replace(/\n/g,'\\\\n'),
  JSON.stringify(privateKey),
  '"'+privateKey.replace(/\n/g,'\\n')+'"',
  privateKey.replace(/\n/g,'\r\n'),
  privateKey.replace(/\n/g,'\\r\\n')
 ];
 for(const [i,pem] of formats.entries()){
  const env={
   ...serviceEnv,
   GSC_READONLY_ENABLED:' true ',
   GSC_SITE_URL:'"sc-domain:redlibertad.com"',
   GSC_SERVICE_ACCOUNT_EMAIL:"'readonly-test@test-project.iam.gserviceaccount.com'",
   GSC_SERVICE_ACCOUNT_PRIVATE_KEY:pem
  };
  const config=gsc.serviceConfig(env);
  assert.equal(config.configured,true,'format '+i);
  assert.equal(config.privateKey,privateKey.trim(),'normalization '+i);
  assert.equal(gsc.status(env).state,'ready','status '+i);
  assert.ok(gsc.assertion(config).split('.').length===3);
 }
});

test('V3.2.123.1 rejects incomplete, malformed and non-RSA private keys before any Google call',()=>{
 const ec=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  .privateKey.export({type:'pkcs8',format:'pem'});
 const malformed=[
  '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----',
  privateKey.replace(/-----END PRIVATE KEY-----/,'-----END BAD KEY-----'),
  ec
 ];
 for(const pem of malformed){
  const config=gsc.serviceConfig({...serviceEnv,GSC_SERVICE_ACCOUNT_PRIVATE_KEY:pem});
  assert.equal(config.configured,false);
  assert.equal(gsc.status({...serviceEnv,GSC_SERVICE_ACCOUNT_PRIVATE_KEY:pem}).state,'needs_configuration');
  assert.equal(config.readiness.keyReadable,false);
 }
 const oversized=gsc.serviceConfig({...serviceEnv,GSC_SERVICE_ACCOUNT_PRIVATE_KEY:'x'.repeat(65537)});
 assert.equal(oversized.configured,false);
});

test('V3.2.123.1 private mobile panel clearly presents safe checks without network diagnostics',()=>{
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 assert.match(html,/id="auditGscConfigChecks"/);
 assert.match(html,/Nunca muestra ni transmite las credenciales/);
 assert.match(html,/v=3\.2\.123\.1/);
 assert.match(js,/for\(const item of info\?\.checks\|\|\[\]\)/);
 assert.match(js,/item\.ok\?'✓ ':'✕ '/);
 assert.match(js,/element\('small','audit-muted',item\.hint\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.doesNotMatch(js,/innerHTML\s*=|insertAdjacentHTML|console\.log\(/);
 assert.doesNotMatch(js,/GSC_SERVICE_ACCOUNT_PRIVATE_KEY|PRIVATE KEY-----/);
});
