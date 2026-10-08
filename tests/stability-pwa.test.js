'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
function functionText(startLabel,endLabel){
  const start=source.indexOf(startLabel),end=source.indexOf(endLabel,start);
  assert.ok(start>=0&&end>start,'Service worker function missing: '+startLabel);
  return source.slice(start,end);
}
const getTarget=new Function('self','URL',
  functionText('function safeNotificationTarget(value){',"self.addEventListener('notificationclick'")+
  '\nreturn safeNotificationTarget;');
const safeTarget=getTarget({location:{origin:'https://redlibertad.com'}},URL);
const shouldBypass=new Function('self',
  functionText('function shouldBypass(url,request){','function isStaticAsset(')+
  '\nreturn shouldBypass;')({location:{origin:'https://redlibertad.com'}});
const full=url=>new URL(url,'https://redlibertad.com');
const getRequest=(method='GET')=>({method});

test('push retains in-app navigation and safe query parameters',()=>{
  assert.equal(safeTarget('/app?view=messages&conversation=123'),'https://redlibertad.com/app?view=messages&conversation=123');
  assert.equal(safeTarget('/app?post=23'),'https://redlibertad.com/app?post=23');
  assert.equal(safeTarget('https://redlibertad.com/app?view=notifications'),'https://redlibertad.com/app?view=notifications');
});
test('push rejects external origins and dangerous schemes',()=>{
  for(const url of ['https://evil.example/path','//evil.example/app','javascript:alert(1)','data:text/html,test','https://redlibertad.com.evil.example/app']){
    assert.equal(safeTarget(url),'https://redlibertad.com/app','unsafe URL '+url);
  }
});
test('push only opens app routes, and falls back for invalid URLs',()=>{
  for(const url of ['/admin','/logout','/api/auth/account/export','/p/1','/','http://%']){
    assert.equal(safeTarget(url),'https://redlibertad.com/app','unsupported route '+url);
  }
  assert.equal(safeTarget(undefined),'https://redlibertad.com/app');
});
test('push click handler invokes the validation helper',()=>{
  assert.match(source,/const target=safeNotificationTarget\(event\.notification\.data\?\.url\)/);
  assert.match(source,/self\.clients\.openWindow\(target\)/);
});
test('PWA bypasses API, uploads, public-post routes and all non-GET requests',()=>{
  for(const url of ['/api','/api/auth/account','/uploads','/uploads/private.jpg','/p','/p/123']){
    assert.equal(shouldBypass(full(url),getRequest()),true,url);
  }
  assert.equal(shouldBypass(full('/app'),getRequest('POST')),true);
  assert.equal(shouldBypass(new URL('https://other.example/app'),getRequest()),true);
  assert.equal(shouldBypass(full('/app'),getRequest()),false);
  assert.equal(shouldBypass(full('/social.css'),getRequest()),false);
});
test('precache only references committed public files or app entrypoints',()=>{
  const start=source.indexOf('const SHELL_ASSETS=[');
  const end=source.indexOf('];',start);
  assert.ok(start>=0&&end>start);
  const assets=new Function(source.slice(start,end+2)+'\nreturn SHELL_ASSETS;')();
  assert.ok(assets.length>=10);
  for(const uri of assets){
    assert.match(uri,/^\/[A-Za-z0-9_.\/-]*$/,'unsafe asset URL: '+uri);
    if(uri==='/'||uri==='/app')continue;
    assert.ok(fs.existsSync(path.join(__dirname,'../public',uri.slice(1))),'missing precache asset: '+uri);
  }
  assert.ok(!assets.some(x=>x.startsWith('/api/')||x.startsWith('/uploads/')));
});
