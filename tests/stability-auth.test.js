'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const start=js.indexOf('const activeAuthSubmissions=new WeakSet();');
const end=js.indexOf("const PUBLIC_ENTRY_STORAGE=",start);
assert.ok(start>=0&&end>start,'Submit guard must be present in login/registration UI');
const helper=js.slice(start,end);
function makeGuard(messages={}){
  return new Function('qs',helper+'\nreturn submitOnce;')(
    selector=>messages[selector]||null
  );
}
function fakeForm(initial=false){
  const button={disabled:initial};
  return {
    button,
    form:{querySelector:selector=>selector==='[type="submit"]'?button:null}
  };
}

test('two rapid form submissions send exactly one request until the first settles',async()=>{
  const submitOnce=makeGuard();
  const {form,button}=fakeForm();
  let runs=0;
  let resolveFirst;
  const task=new Promise(resolve=>{resolveFirst=resolve;});
  const first=submitOnce(form,'#formMessage',async()=>{runs++;await task;});
  const repeat=submitOnce(form,'#formMessage',async()=>{runs++;});
  assert.equal(button.disabled,true);
  await repeat;
  assert.equal(runs,1);
  resolveFirst();
  await first;
  assert.equal(button.disabled,false);
  await submitOnce(form,'#formMessage',async()=>{runs++;});
  assert.equal(runs,2);
});

test('offline error becomes actionable feedback without an unhandled rejection',async()=>{
  const message={textContent:''};
  const submitOnce=makeGuard({'#loginMessage':message});
  const {form,button}=fakeForm();
  await submitOnce(form,'#loginMessage',async()=>{throw Error('NetworkError');});
  assert.match(message.textContent,/No se pudo conectar/);
  assert.equal(button.disabled,false);
  await submitOnce(form,'#loginMessage',async()=>{});
  assert.equal(button.disabled,false);
});

test('pre-disabled submit button is not enabled by the guard',async()=>{
  const submitOnce=makeGuard();
  const {form,button}=fakeForm(true);
  await submitOnce(form,'#formMessage',async()=>{});
  assert.equal(button.disabled,true);
});

test('both registration and login invoke the same guarded workflow',()=>{
  assert.match(js,/submitOnce\(register,'#formMessage',async\(\)=>\{/);
  assert.match(js,/submitOnce\(login,'#loginMessage',async\(\)=>\{/);
  assert.match(js,/finishPublicEntry\(d\.returnPath\|\|''\)/);
  assert.match(js,/finishPublicEntry\(\)/);
});

test('guard releases in-flight state even if the form has no submit button',async()=>{
  const submitOnce=makeGuard();
  const form={querySelector:()=>null};
  let count=0;
  await submitOnce(form,'#loginMessage',async()=>{count++;throw Error('offline');});
  await submitOnce(form,'#loginMessage',async()=>{count++;});
  assert.equal(count,2);
});
