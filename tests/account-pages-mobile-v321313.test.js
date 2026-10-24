'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/verify-email.js'),'utf8');
const verifyHtml=fs.readFileSync(path.join(__dirname,'../public/verificar-email/index.html'),'utf8');
const recoverHtml=fs.readFileSync(path.join(__dirname,'../public/recuperar-contrasena/index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/account-help-v321313.css'),'utf8');

function boot(hash='',responseData={ok:true,emailVerified:true,conversionId:'12345678-1234-4234-8234-123456789abc'}){
  const calls=[];
  let tracked=0;
  const events={};
  const button={hidden:false,disabled:false,addEventListener:(kind,fn)=>events['confirm-'+kind]=fn};
  const submit={disabled:false};
  const emailInput={value:'test@example.com'};
  const request={hidden:true,addEventListener:(kind,fn)=>events['request-'+kind]=fn,querySelector:sel=>sel.includes('submit')?submit:emailInput};
  const panel={hidden:true};
  const intro={textContent:''};
  const status={hidden:true,textContent:'',dataset:{}};
  const elements={
    confirmEmailButton:button,anonymousVerifyForm:request,confirmPanel:panel,
    verificationIntro:intro,verificationStatus:status
  };
  const location={hash,search:''};
  const window={location,history:{replaceState(_s,_t,url){this.path=url;}},RedLibertadGoogleAds:{trackVerifiedRegistration(data){tracked++;assert.equal(data.emailVerified,true);}}};
  const fetch=async (url,options)=>{
    calls.push({url,options});
    return {ok:url.includes('/confirm')?responseData.ok:true,status:responseData.ok?200:400,json:async()=>responseData};
  };
  vm.runInNewContext(source,{document:{getElementById:k=>elements[k]},window,URLSearchParams,fetch});
  return{button,request,panel,intro,status,calls,events,window,get tracked(){return tracked}};
}

test('Direct verification page with no token only shows email request',()=>{
  const a=boot();
  assert.equal(a.panel.hidden,true);
  assert.equal(a.request.hidden,false);
  assert.equal(a.status.hidden,true);
  assert.equal(a.calls.length,0);
  assert.match(a.intro.textContent,/Introduce tu correo/);
});

test('Malformed token cannot expose confirm action; readable error',()=>{
  const a=boot('#token=invalid');
  assert.equal(a.panel.hidden,true);
  assert.equal(a.request.hidden,false);
  assert.equal(a.status.hidden,false);
  assert.match(a.status.textContent,/no es válido/);
  assert.equal(a.calls.length,0);
});

test('Valid link shows confirmation and removes token from browser address',()=>{
  const a=boot('#token='+('A'.repeat(43)));
  assert.equal(a.panel.hidden,false);
  assert.equal(a.request.hidden,true);
  assert.equal(a.window.history.path,'/verificar-email/');
  assert.equal(a.calls.length,0);
});

test('Only a successful verified response can produce Google Ads event',async()=>{
  const a=boot('#token='+('B'.repeat(43)));
  await a.events['confirm-click']();
  assert.equal(a.tracked,1);
  assert.equal(a.calls.length,1);
  assert.match(a.calls[0].url,/verify-email\/confirm/);
  assert.equal(a.panel.hidden,true);
  assert.equal(a.request.hidden,true);
  assert.match(a.status.textContent,/confirmado correctamente/);
});

test('Used or expired token returns user to one email request, not to duplicate resend button',async()=>{
  const a=boot('#token='+('C'.repeat(43)),{ok:false,error:'invalid_or_expired'});
  await a.events['confirm-click']();
  assert.equal(a.tracked,0);
  assert.equal(a.panel.hidden,true);
  assert.equal(a.request.hidden,false);
  assert.match(a.status.textContent,/ha caducado o ya se ha utilizado/);
});

test('Resend form is functional without signing in',async()=>{
  const a=boot();
  await a.events['request-submit']({preventDefault(){}});
  assert.equal(a.calls.length,1);
  assert.match(a.calls[0].url,/verify-email\/request/);
  assert.equal(JSON.parse(a.calls[0].options.body).email,'test@example.com');
  assert.match(a.status.textContent,/recibirás un enlace/);
});

test('Both pages use one dark visual language with strong hidden state and no old white layout',()=>{
  assert.match(css,/\[hidden\]\{display:none!important\}/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/\.account-primary/);
  assert.match(verifyHtml,/account-help-v321313\.css/);
  assert.match(recoverHtml,/account-help-v321313\.css/);
  assert.match(verifyHtml,/id="anonymousVerifyForm" class="account-form" hidden/);
  assert.match(verifyHtml,/id="confirmPanel" hidden/);
  assert.ok(!verifyHtml.includes('id="resendEmailButton"'));
  assert.ok(!verifyHtml.includes('/styles.css'));
  assert.match(recoverHtml,/id="requestResetForm"/);
  assert.match(recoverHtml,/id="confirmResetForm" class="account-form" hidden/);
  assert.ok(!recoverHtml.includes('googletagmanager'));
});

test('Client code parses and preserves privacy-safe conversion condition',()=>{
  new vm.Script(source);
  assert.ok(source.indexOf('data.emailVerified!==true')<source.indexOf('trackVerifiedRegistration(data)'));
  assert.match(source,/history\.replaceState/);
});
