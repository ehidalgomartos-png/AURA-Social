'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {requestPasswordReset,resetPassword,passwordResetLink}=require('../src/services/password-recovery-v321311');

const ENV={EMAIL_VERIFICATION_ENABLED:'true',RESEND_API_KEY:'re_123456789abcdefgh',EMAIL_VERIFICATION_FROM:'RedLibertad <noreply@redlibertad.com>'};

test('Forgot-password requests require email delivery enabled',async()=>{
  const result=await requestPasswordReset({email:'test@example.com',env:{}});
  assert.deepEqual(result,{accepted:false,reason:'email_unavailable'});
});
test('Nonexistent emails get success without sending and without identifying account',async()=>{
  const sql=[];
  const mock={query:async query=>{
    sql.push(query);
    return {rowCount:0,rows:[]};
  }};
  const result=await requestPasswordReset({
    email:'unknown@example.com',db:mock,env:ENV,
    fetchImpl:()=>{throw Error('should never send');}
  });
  assert.deepEqual(result,{accepted:true});
  assert.ok(sql.some(x=>x.includes('SELECT id,email FROM users')));
});
test('Valid recovery request sends one link through Resend and stores only SHA-256',async()=>{
  let hash,body;
  const mock={query:async(q,args)=>{
    if(q.includes('CREATE TABLE'))return {rowCount:0};
    if(q.includes('SELECT id,email FROM users'))return {rowCount:1,rows:[{id:4,email:'test@example.com'}]};
    if(q.startsWith('INSERT INTO password_resets_v321311')){
      hash=args[1];return {rowCount:1,rows:[{user_id:4}]};
    }
    if(q.startsWith('UPDATE password_resets_v321311 SET sent_at'))return {rowCount:1};
    throw Error('Unexpected SQL');
  }};
  const fetchImpl=async(_url,init)=>{
    assert.match(_url,/api\.resend\.com/);
    body=JSON.parse(init.body);
    return {ok:true};
  };
  const result=await requestPasswordReset({email:'test@example.com',db:mock,env:ENV,fetchImpl});
  assert.deepEqual(result,{accepted:true});
  assert.match(body.text,/\/recuperar-contrasena\/#token=/);
  const token=body.text.match(/#token=([A-Za-z0-9_-]+)/)[1];
  assert.equal(hash.length,64);
  assert.ok(!hash.includes(token));
  assert.equal(body.to[0],'test@example.com');
});
test('Repeated recovery requests respect per-account cooldown',async()=>{
  const mock={query:async q=>{
    if(q.includes('CREATE TABLE'))return{rowCount:0};
    if(q.includes('SELECT id,email'))return{rowCount:1,rows:[{id:4,email:'test@example.com'}]};
    return{rowCount:0};
  }};
  const result=await requestPasswordReset({email:'test@example.com',db:mock,env:ENV,fetchImpl:()=>{throw Error('should not resend')}});
  assert.deepEqual(result,{accepted:true});
});
test('Reset tokens are consumed in a transaction and session versions change',async()=>{
  const queries=[];
  const client={
    query:async(sql,args)=>{
      queries.push(sql);
      if(sql.startsWith('UPDATE password_resets_v321311'))return{rowCount:1,rows:[{user_id:4}]};
      if(sql.startsWith('UPDATE users'))return{rowCount:1,rows:[{id:4}]};
      return{rowCount:0};
    },release(){}
  };
  const mock={query:async()=>({rowCount:0}),pool:{connect:async()=>client}};
  const result=await resetPassword({token:'A'.repeat(43),newPassword:'strong-new-password-123',db:mock});
  assert.deepEqual(result,{ok:true});
  assert.equal(queries[0],'BEGIN');
  assert.ok(queries.some(sql=>sql.includes('auth_token_version=auth_token_version+1')));
  assert.equal(queries[queries.length-1],'COMMIT');
});
test('Reused token never modifies password',async()=>{
  const queries=[];
  const client={
    query:async sql=>{
      queries.push(sql);
      if(sql.startsWith('UPDATE password_resets_v321311'))return{rowCount:0,rows:[]};
      return{rowCount:0};
    },release(){}
  };
  const mock={query:async()=>({rowCount:0}),pool:{connect:async()=>client}};
  const result=await resetPassword({token:'A'.repeat(43),newPassword:'strong-new-password-123',db:mock});
  assert.equal(result.ok,false);
  assert.ok(queries.includes('ROLLBACK'));
  assert.ok(!queries.some(q=>q.startsWith('UPDATE users')));
});
test('Invalid reset token is rejected before database access',async()=>{
  const result=await resetPassword({token:'wrong',newPassword:'strong-password-123',db:{query:()=>{throw Error('no db calls')}}});
  assert.equal(result.ok,false);
});
test('Login and verification screens provide recovery/resend entrypoints',()=>{
  const index=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const verify=fs.readFileSync(path.join(__dirname,'../public/verificar-email/index.html'),'utf8');
  assert.match(index,/recuperar-contrasena/);
  assert.match(index,/verificar-email/);
  assert.match(verify,/anonymousVerifyForm/);
});
test('Client scripts parse; no recovery page marketing scripts',()=>{
  const reset=fs.readFileSync(path.join(__dirname,'../public/password-recovery-v321311.js'),'utf8');
  const verify=fs.readFileSync(path.join(__dirname,'../public/verify-email.js'),'utf8');
  new vm.Script(reset);new vm.Script(verify);
  const html=fs.readFileSync(path.join(__dirname,'../public/recuperar-contrasena/index.html'),'utf8');
  assert.ok(!html.includes('googletagmanager'));
  assert.ok(!html.includes('meta-pixel-consent.js'));
});
