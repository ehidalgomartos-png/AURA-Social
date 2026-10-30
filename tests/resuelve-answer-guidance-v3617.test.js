'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.17: respuesta ayuda con experiencia y contador descriptivo, no con ventas',()=>{
 const html=read('public/resuelve.html');
 assert.match(html,/id="answerBody" minlength="10" maxlength="1500"/);
 assert.match(html,/aria-describedby="answerGuidanceV3617 answerCharCountV3617"/);
 assert.match(html,/id="answerGuidanceV3617"/);
 assert.match(html,/Cuenta qué te funcionó, explica pasos concretos/);
 assert.match(html,/Evita datos personales y publicidad/);
 assert.match(html,/No necesitas recomendar productos/);
 assert.match(html,/<output id="answerCharCountV3617" for="answerBody"/);
 assert.match(html,/aria-live="off">0 \/ 1500 caracteres<\/output>/);
 assert.match(html,/id="answerForm" hidden/);
 assert.match(html,/id="answerCommercialInterest"/);
 assert.match(html,/id="answerListingUrl"/);
 assert.match(html,/No se permite utilizar esta opción para solicitar presupuestos/);
});

test('V3.6.17: contador refleja límites reales y se reinicia al publicar',()=>{
 const js=read('public/resuelve-v350.js');
 const start=js.indexOf('  function syncAnswerCounter(){');
 const end=js.indexOf("  el('answerBody').addEventListener('input',syncAnswerCounter);",start);
 assert.ok(start>0&&end>start);
 const snippet=js.slice(start,end);
 assert.doesNotMatch(snippet,/fetch\(|innerHTML|localStorage|sendBeacon/);
 assert.match(js,/el\('answerBody'\)\.addEventListener\('input',syncAnswerCounter\)/);
 assert.match(js,/form\.reset\(\);syncAnswerCounter\(\);message\('Respuesta publicada/);
 const input={value:''},output={dataset:{},textContent:''};
 const el=id=>id==='answerBody'?input:id==='answerCharCountV3617'?output:null;
 const context=vm.createContext({el});
 vm.runInContext(snippet,context);
 for(const [value,size,near] of [['',0,false],['x'.repeat(60),60,false],
  ['x'.repeat(1350),1350,true],['x'.repeat(1500),1500,true]]){
  input.value=value;vm.runInContext('syncAnswerCounter()',context);
  assert.match(output.textContent,new RegExp('^'+size+' / 1500 caracteres'));
  assert.equal(output.dataset.nearLimit,String(near));
  assert.equal(output.textContent.includes('Queda poco'),near);
 }
 input.value='';vm.runInContext('syncAnswerCounter()',context);
 assert.equal(output.textContent,'0 / 1500 caracteres');
 assert.doesNotThrow(()=>new Function(js));
});

test('V3.6.17: consejos mobile-first no ocultan la respuesta ni desactivan la validación',()=>{
 const css=read('public/resuelve-v350.css');
 const part=css.slice(css.lastIndexOf('/* V3.6.17'));
 assert.ok(part.startsWith('/* V3.6.17'));
 assert.match(part,/\.resuelve-answer-tips-v3617/);
 assert.match(part,/\.resuelve-answer-counter-v3617/);
 assert.match(part,/\[data-near-limit="true"\]/);
 assert.match(part,/@media\(max-width:650px\)/);
 assert.match(part,/overflow-wrap:anywhere/);
 assert.doesNotMatch(part,/display:none|visibility:hidden|pointer-events:none|position:fixed/);
 const route=read('src/routes/resuelve-v350.js');
 assert.match(route,/router\.post\('\/questions\/:id\/answers',requireAuth,checkOrigin/);
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
});
