const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/meta-pixel-consent.js'),'utf8');

function boot(existing={}) {
  const storage = new Map(Object.entries(existing));
  const scripts=[];
  const container = {hidden:false,querySelectorAll:()=>[]};
  const document = {
    cookie:'',
    head:{appendChild:el=>scripts.push(el)},
    body:{appendChild:()=>{}},
    createElement: tag=>tag==='script'?{async:false,src:''}:{
      className:'',hidden:false,setAttribute(){},querySelectorAll:()=>[],
      set innerHTML(_) {},get innerHTML(){return ''}
    },
    getElementById:()=>null,
    getElementsByTagName:()=>[{parentNode:{insertBefore:el=>scripts.push(el)}}]
  };
  const win = {localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    location:{search:'',hostname:'redlibertad.com',reload(){}},
    dataLayer:[]};
  const ctx={window:win,document,URLSearchParams,encodeURIComponent};
  vm.runInNewContext(source,ctx);
  return {win,scripts,storage};
}

test('No Google or Meta marketing scripts before advertising consent',()=>{
  const {scripts}=boot();
  assert.equal(scripts.length,0);
});

test('Existing Meta acceptance does not automatically grant Google acceptance',()=>{
  const {scripts}=boot({'redlibertad-meta-pixel-consent-v1':'accepted'});
  assert.ok(scripts.some(el=>String(el.src).includes('facebook.net')));
  assert.ok(!scripts.some(el=>String(el.src).includes('googletagmanager')));
});

test('Google tag loads only with explicit Google acceptance',()=>{
  const {scripts,win}=boot({'redlibertad-google-ads-consent-v1':'accepted'});
  assert.ok(scripts.some(el=>String(el.src).includes('googletagmanager.com/gtag/js')));
  assert.ok(!scripts.some(el=>String(el.src).includes('facebook.net')));
  assert.ok(win.dataLayer.some(args=>args[0]==='consent'&&args[1]==='default'));
});

test('Confirmed registration conversion is not exposed before server verification exists',()=>{
  const {win}=boot({'redlibertad-google-ads-consent-v1':'accepted'});
  assert.equal(typeof win.RedLibertadGoogleAds,'undefined');
  assert.ok(!source.includes("gtag('event', 'conversion'"));
});
