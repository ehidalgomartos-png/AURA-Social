'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const sw=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');

function harness(windows=[]){
  let onClick=null;
  const calls={opened:[],navigated:[],focused:[],closed:0};
  const self={
    location:{origin:'https://redlibertad.com'},
    addEventListener:(name,fn)=>{if(name==='notificationclick')onClick=fn},
    clients:{
      matchAll:async args=>{
        assert.equal(args.type,'window');
        assert.equal(args.includeUncontrolled,true);
        return windows.map(item=>({
          url:item.url,
          navigate:async url=>{
            calls.navigated.push({from:item.url,to:url});
            if(item.fail)throw Error('closed tab');
            if(item.nullNavigate)return null;
            return {focus:async()=>{calls.focused.push(item.url);return true}};
          }
        }));
      },
      openWindow:async url=>{calls.opened.push(url);return true}
    }
  };
  const start=sw.indexOf('function safeNotificationTarget(value){');
  assert.ok(start>0);
  const context={self,URL,console};
  const x=vm.runInNewContext(sw.slice(start)+'\nthis.safe=safeNotificationTarget;',context);
  async function click(url){
    let work;
    const event={
      notification:{data:{url},close:()=>calls.closed++},
      waitUntil:promise=>{work=promise}
    };
    onClick(event);
    await work;
  }
  return {calls,click,safe:context.safe};
}
test('same-origin app paths are preserved, but subpaths and credentials are rejected',()=>{
  const {safe}=harness();
  assert.equal(safe('/app?view=notifications'),'https://redlibertad.com/app?view=notifications');
  assert.equal(safe('/app?view=messages&conversation=2'),'https://redlibertad.com/app?view=messages&conversation=2');
  for(const url of ['/app/anything','/api/health','/admin','/','/perfil/test',
    'https://evil.example/app','https://attacker:password@redlibertad.com/app','//evil.example/app','javascript:alert(1)']){
    assert.equal(safe(url),'https://redlibertad.com/app',url);
  }
});
test('notification never navigates registration, public profile, Marketplace or administration tabs',async()=>{
  const h=harness([
    {url:'https://redlibertad.com/#registro'},
    {url:'https://redlibertad.com/marketplace'},
    {url:'https://redlibertad.com/perfil/fotografia'},
    {url:'https://redlibertad.com/admin'},
    {url:'https://other.example/app'}
  ]);
  await h.click('/app?view=notifications');
  assert.equal(h.calls.closed,1);
  assert.equal(h.calls.navigated.length,0);
  assert.equal(h.calls.focused.length,0);
  assert.deepEqual(h.calls.opened,['https://redlibertad.com/app?view=notifications']);
});
test('existing app tab can be reused without hijacking an earlier registration tab',async()=>{
  const h=harness([
    {url:'https://redlibertad.com/?entry=community'},
    {url:'https://redlibertad.com/app?view=feed'},
    {url:'https://redlibertad.com/admin'}
  ]);
  await h.click('/app?view=notifications');
  assert.equal(h.calls.navigated.length,1);
  assert.equal(h.calls.navigated[0].from,'https://redlibertad.com/app?view=feed');
  assert.equal(h.calls.navigated[0].to,'https://redlibertad.com/app?view=notifications');
  assert.deepEqual(h.calls.focused,['https://redlibertad.com/app?view=feed']);
  assert.equal(h.calls.opened.length,0);
});
test('closed or non-navigable app tabs fall back to opening notification destination',async()=>{
  const h=harness([
    {url:'https://redlibertad.com/app?view=messages',fail:true},
    {url:'https://redlibertad.com/app?view=explore',nullNavigate:true}
  ]);
  await h.click('/app?post=33');
  assert.equal(h.calls.navigated.length,2);
  assert.equal(h.calls.focused.length,0);
  assert.deepEqual(h.calls.opened,['https://redlibertad.com/app?post=33']);
  assert.equal(h.calls.closed,1);
});
test('PWA security change retains push, caches, notification click and existing mobile design',()=>{
  assert.match(sw,/self\.addEventListener\('push'/);
  assert.match(sw,/self\.addEventListener\('fetch'/);
  assert.match(sw,/self\.addEventListener\('install'/);
  assert.match(sw,/self\.addEventListener\('activate'/);
  assert.match(sw,/const target=safeNotificationTarget\(event\.notification\.data\?\.url\)/);
  assert.match(sw,/self\.clients\.openWindow\(target\)/);
  const yaml=fs.readFileSync(path.join(__dirname,'../.github/workflows/validate-js.yml'),'utf8');
  assert.match(yaml,/tests\/pwa-safe-push-navigation-v32166\.test\.js/);
});
