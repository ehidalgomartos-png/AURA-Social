const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/meta-pixel-consent.js'),'utf8');
const verifySource=fs.readFileSync(path.join(__dirname,'../public/verify-email.js'),'utf8');
const {confirmVerification,requestVerification,config}=require('../src/services/signup-email-verification-v32131');

function boot(initial={}){
  const storage=new Map(Object.entries(initial));
  const scripts=[];
  const listeners={};
  const section={
    hidden:false,className:'',setAttribute(){},
    querySelectorAll:()=>[
      {addEventListener:(ev,fn)=>listeners.accept=fn,getAttribute:()=> 'accepted'},
      {addEventListener:(ev,fn)=>listeners.reject=fn,getAttribute:()=> 'rejected'}
    ],
    set innerHTML(s){this.html=s;}
  };
  const document={
    cookie:'',
    head:{appendChild:el=>scripts.push(el)},
    body:{appendChild:el=>{listeners.section=el;}},
    createElement:tag=>tag==='script'?{src:'',async:false}:section,
    getElementById:()=>null,
    getElementsByTagName:()=>[{parentNode:{insertBefore:el=>scripts.push(el)}}]
  };
  const win={
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    location:{search:'',hostname:'redlibertad.com',reload(){}},
    dataLayer:[]
  };
  vm.runInNewContext(source,{window:win,document,URLSearchParams,encodeURIComponent});
  return{win,storage,scripts,listeners,document};
}

test('Base tag does not load until permission',()=>{
  const a=boot();assert.equal(a.scripts.length,0);
  assert.match(a.listeners.section.html,/Google Ads/);
});

test('Prior Meta consent does NOT imply Google consent',()=>{
  const a=boot({'redlibertad-meta-pixel-consent-v1':'accepted'});
  assert.ok(a.scripts.some(el=>String(el.src).includes('facebook.net')));
  assert.ok(!a.scripts.some(el=>String(el.src).includes('googletagmanager')));
});

test('On Google consent load Google tag; consent v2 starts with denial',()=>{
  const a=boot({'redlibertad-google-ads-consent-v1':'accepted'});
  assert.ok(a.scripts.some(el=>String(el.src).includes('/gtag/js')));
  assert.equal(a.win.dataLayer[0][0],'consent');
  assert.equal(a.win.dataLayer[0][1],'default');
  assert.equal(a.win.dataLayer[0][2].ad_storage,'denied');
  assert.equal(a.win.dataLayer[1][2].ad_personalization,'denied');
});

test('No conversion if no explicit Google consent; pending conversion emits only on approval',()=>{
  const a=boot({'redlibertad-google-ads-consent-v1':'rejected','redlibertad-meta-pixel-consent-v1':'rejected'});
  const result={ok:true,emailVerified:true,conversionId:'12345678-1234-4234-8234-123456789abc'};
  assert.equal(a.win.RedLibertadGoogleAds.trackVerifiedRegistration(result),false);
  assert.equal(a.win.dataLayer.length,0);
  a.listeners.accept();
  const conv=a.win.dataLayer.filter(x=>x[0]==='event'&&x[1]==='conversion');
  assert.equal(conv.length,1);
  assert.equal(conv[0][2].transaction_id,result.conversionId);
  assert.match(conv[0][2].send_to,/^AW-18535212811\//);
});

test('Invalid response and duplicate verified event are never reported',()=>{
  const a=boot({'redlibertad-google-ads-consent-v1':'accepted'});
  assert.equal(a.win.RedLibertadGoogleAds.trackVerifiedRegistration({ok:true,emailVerified:false,conversionId:'12345678-1234-4234-8234-123456789abc'}),false);
  const result={ok:true,emailVerified:true,conversionId:'12345678-1234-4234-8234-123456789abc'};
  assert.equal(a.win.RedLibertadGoogleAds.trackVerifiedRegistration(result),true);
  assert.equal(a.win.RedLibertadGoogleAds.trackVerifiedRegistration(result),false);
  assert.equal(a.win.dataLayer.filter(x=>x[0]==='event'&&x[1]==='conversion').length,1);
});

test('Do not send email unless explicitly enabled and sender configured',async()=>{
  const conf=config({RESEND_API_KEY:'not-a-real-key',EMAIL_VERIFICATION_FROM:'noreply@example.com'});
  assert.equal(conf.enabled,false);
  const result=await requestVerification({userId:1,email:'test@example.com',env:{}});
  assert.equal(result.sent,false);
});

test('Token validation rejects random and invalid links',async()=>{
  assert.equal((await confirmVerification({token:'insecure'})).ok,false);
});

test('Verification changes stored token atomically and reports only once',async()=>{
  let updates=0;
  const fakeDb={query:async(sql,args)=>{
    if(sql.startsWith('CREATE TABLE'))return {rowCount:0,rows:[]};
    if(sql.startsWith('UPDATE signup_email_verifications_v32131')){
      assert.match(sql,/verified_at IS NULL AND expires_at>now\(\)/);
      assert.equal(args[0].length,64);
      updates++;
      return updates===1?{rowCount:1,rows:[{conversion_id:'12345678-1234-4234-8234-123456789abc'}]}:{rowCount:0,rows:[]};
    }
    throw Error('unexpected query');
  }};
  const token='a'.repeat(43);
  const first=await confirmVerification({token,db:fakeDb});
  assert.equal(first.ok,true);
  assert.equal(first.emailVerified,true);
  const second=await confirmVerification({token,db:fakeDb});
  assert.equal(second.ok,false);
});

test('Frontend does not report a conversion before server verification succeeds',()=>{
  assert.match(verifySource,/response\.ok/);
  assert.match(verifySource,/data\.emailVerified!==true/);
  assert.ok(verifySource.indexOf('data.emailVerified!==true')<verifySource.indexOf('trackVerifiedRegistration(data)'));
  assert.match(verifySource,/addEventListener\('click'/);
});

test('Static client code parses',()=>{
  new vm.Script(source);
  new vm.Script(verifySource);
});
