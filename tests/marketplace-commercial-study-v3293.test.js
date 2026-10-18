'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'public/marketplace-commercial-study-v3293.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/marketplace-commercial-v3281.css'),'utf8');
class Element{
 constructor(tag='div'){
  this.tagName=tag;this.children=[];this.listeners={};this.attrs={};this.dataset={};
  this.className='';this.style={};this._text='';this.value='';this.disabled=false;
  this.open=false;this.focused=false;this.scrolled=false;
 }
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];this._text='';}
 set textContent(text){this._text=String(text);this.children=[];}
 get textContent(){return this._text+this.children.map(c=>typeof c==='object'?c.textContent:String(c)).join('');}
 setAttribute(name,value){this.attrs[name]=String(value);}
 getAttribute(name){return this.attrs[name]||null;}
 addEventListener(name,handler){this.listeners[name]=handler;}
 click(){return this.listeners.click();}
 querySelector(name){return this.children.find(x=>x.tagName===name)||null;}
 focus(options){this.focused=options?.preventScroll===true;}
 scrollIntoView(options){this.scrolled=options?.block==='start';}
}
const names=['professional','professional_plus'];
function fixtures(){
 const fields=['priceDisclosure','taxes','renewals','cancellations','privacy','consent'];
 return {
  commercial:{ok:true,commercialDraftOnly:true,billingEnabled:false,enrollmentEnabled:false,
   entitlementsEnforced:false,pricesPublished:false,pilotProtected:true,
   drafts:names.map(code=>({code,proposedMonthlyCents:null,
    summary:'Propuesta comercial interna pendiente de aprobación.'}))},
  guidance:{ok:true,adminOnly:true,privateSuggestion:true,pricesApproved:false,
   termsApproved:false,consentRecorded:false,billingEnabled:false,liveStripeEnabled:false,
   pilotProtected:true,proposals:names.map((code,i)=>({code,approved:false,proposedMonthlyCents:i?2490:990}))},
  readiness:{ok:true,adminOnly:true,commercialDraftOnly:true,previewOnly:true,productionReady:false,
   releaseAuthorized:false,legalApproval:false,taxApproval:false,pricesPublished:false,
   billingEnabled:false,liveStripeEnabled:false,consentRecorded:false,pilotProtected:true,
   externalProductCheckout:true,plans:names.map((code,i)=>({
    code,priceApproved:false,productPurchaseExternal:true,contractReviewState:'draft',
    termsPreview:fields.map((id,index)=>({id,
     text:i===0&&index===0?'Texto de prueba sobre periodicidad y la cuota mensual del contrato.':
      i===1&&index===2?'PLANTILLA INTERNA V3.2.90 — PENDIENTE DE REVISIÓN.': ''}))
   })) }
 };
}
function scenario(data=fixtures()){
 const ids=['studyStatus','studyPlan','studySource','studyPrice','studyCost','studyFee',
 'studyVat','studyVatMode','studyCalculate','studyResult','studyContractSummary',
 'studyContractFields','studyGoPrice','studyGoPricingReview','studyGoTaxes',
 'studyGoContract','studyGoTermsReview','workgroup-plans','workgroup-terms',
 'drafts','reviews','contractDraftList'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
 nodes.studyPlan.value='professional';nodes.studyVatMode.value='included';
 const events={},calls=[];
 const fake=(list,attr,value)=>{
  const item=new Element('details');item.append(new Element('summary'));
  if(attr==='data-code')item.dataset.code=value;
  else item.setAttribute(attr,value);
  nodes[list].append(item);return item;
 };
 for(const p of names){fake('drafts','data-plan',p);fake('contractDraftList','data-code',p);}
 for(const k of ['pricing','taxes','terms','renewals','cancellations','privacy'])fake('reviews','data-review',k);
 const window={addEventListener(name,cb){events[name]=cb;}};
 const document={getElementById:id=>nodes[id]||null,createElement:tag=>new Element(tag)};
 let response=data;
 const fetch=async(url,opts)=>{
  calls.push({url,opts});
  if(opts.method!=='GET')throw Error('Unexpected write operation');
  if(url.endsWith('/guidance'))return {ok:true,json:async()=>response.guidance};
  if(url.endsWith('/launch-readiness'))return {ok:true,json:async()=>response.readiness};
  if(url.endsWith('/commercial'))return {ok:true,json:async()=>response.commercial};
  throw Error('Unrecognized URL '+url);
 };
 vm.runInNewContext(script,{document,window,fetch,Number,String,Math,console,Promise});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return {nodes,calls,events,settle,setResponse:newResponse=>response=newResponse};
}
test('V3.2.93 includes new private preparation center and correct mobile layout',()=>{
 for(const id of ['commercialStudy','studyEconomics','studyFiscal','studyContracts','studyPlan',
  'studyPrice','studyCost','studyFee','studyVat','studyVatMode','studyResult','studyGoPrice',
  'studyGoPricingReview','studyGoTaxes','studyGoContract','studyGoTermsReview']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/marketplace-commercial-study-v3293\.js\?v=3\.2\.93/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.match(html,/MundoTaza conserva su piloto gratuito/);
 assert.match(html,/noindex,nofollow/);
 assert.match(html,/Stripe LIVE permanece desactivado/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/@media\(min-width:600px\)/);
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.doesNotMatch(script,/\bmethod:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
 assert.doesNotMatch(script,/sk_live_|localStorage|document\.cookie|window\.location|\.innerHTML\s*=/);
});
test('on load, proposals are clear orientations and fields are blank until the admin provides all hypotheses',async()=>{
 const s=scenario();await s.settle();await s.settle();
 const n=s.nodes;
 assert.equal(n.studyCalculate.disabled,false);
 assert.equal(n.studyPrice.value,'9.90');
 assert.match(n.studySource.textContent,/Referencia orientativa sin guardar/);
 assert.match(n.studySource.textContent,/No es una oferta/);
 assert.equal(n.studyCost.value,'');
 assert.equal(n.studyVat.value,'');
 assert.equal(n.studyFee.value,'');
 assert.match(n.studyStatus.textContent,/Estudio privado disponible/);
 assert.equal(n.studyContractFields.children.length,6);
 assert.equal(n.studyContractFields.children[0].children[1].textContent,'Texto preparado');
 assert.equal(n.studyContractFields.children[1].children[1].textContent,'Pendiente de redactar');
 assert.match(n.studyContractSummary.textContent,/1 de 6/);
 assert.deepEqual(s.calls.map(x=>x.opts.method),['GET','GET','GET']);
 for(const call of s.calls){assert.equal(call.opts.credentials,'same-origin');assert.equal(call.opts.cache,'no-store');}
});
test('no invented VAT or fees: validate input, comma decimals and inclusive calculation accurately',async()=>{
 const s=scenario();await s.settle();await s.settle();
 const n=s.nodes;
 n.studyCalculate.click();
 assert.match(n.studyResult.textContent,/No se aplica ningún porcentaje por defecto/);
 assert.equal(n.studyResult.className,'study-result is-error');
 n.studyCost.value='2,00';n.studyFee.value='0,30';n.studyVat.value='21';
 n.studyCalculate.click();
 assert.match(n.studyResult.textContent,/Base estimada sin IVA hipotético: 8,18/);
 assert.match(n.studyResult.textContent,/IVA hipotético: 1,72/);
 assert.match(n.studyResult.textContent,/Resultado estimado antes de otros costes e impuestos: 5,88/);
 assert.match(n.studyResult.textContent,/no se ha guardado|no obligac|sin obligaciones fiscales determinadas|sin importes guardados/i);
 assert.equal(n.studyResult.className,'study-result');
 assert.equal(s.calls.length,3,'Calculation must never write to server');
});
test('plus simulation uses stored internal draft instead of orientation and handles IVA added separately',async()=>{
 const data=fixtures();data.commercial.drafts[1].proposedMonthlyCents=1990;
 const s=scenario(data);await s.settle();await s.settle();
 const n=s.nodes;n.studyPlan.value='professional_plus';n.studyPlan.listeners.change();
 assert.equal(n.studyPrice.value,'19.90');
 assert.match(n.studySource.textContent,/borrador privado guardado/);
 assert.match(n.studyContractSummary.textContent,/0 de 6/);
 assert.equal(n.studyContractFields.children[2].children[1].textContent,'Plantilla por revisar');
 n.studyPrice.value='24,90';n.studyPrice.listeners.input();
 n.studyVatMode.value='excluded';
 n.studyCost.value='4';n.studyFee.value='0.50';n.studyVat.value='10';
 n.studyCalculate.click();
 assert.match(n.studyResult.textContent,/Base estimada sin IVA hipotético: 24,90/);
 assert.match(n.studyResult.textContent,/Total hipotético para el cliente: 27,39/);
 assert.match(n.studyResult.textContent,/Resultado estimado antes de otros costes e impuestos: 20,40/);
 assert.equal(s.calls.length,3);
});
test('direct navigation opens only corresponding existing plan price, tax or contracts form',async()=>{
 const s=scenario();await s.settle();await s.settle();
 const n=s.nodes;
 n.studyGoPrice.click();
 assert.equal(n['workgroup-plans'].open,true);
 assert.equal(n.drafts.children[0].open,true);
 assert.equal(n.drafts.children[1].open,false);
 assert.equal(n.drafts.children[0].querySelector('summary').focused,true);
 n.studyGoTaxes.click();
 assert.equal(n['workgroup-terms'].open,true);
 assert.equal(n.reviews.children[1].open,true);
 n.studyGoContract.click();
 assert.equal(n.contractDraftList.children[0].open,true);
 assert.equal(n.contractDraftList.children[1].open,false);
 n.studyPlan.value='professional_plus';n.studyPlan.listeners.change();
 n.studyGoContract.click();
 assert.equal(n.contractDraftList.children[1].open,true);
 n.studyGoTermsReview.click();
 assert.equal(n.reviews.children[2].open,true);
 n.studyGoPricingReview.click();
 assert.equal(n.reviews.children[0].open,true);
 assert.equal(s.calls.length,3,'Navigation must not automatically save changes');
});
test('refresh keeps manually edited work and does not change real draft values',async()=>{
 const data=fixtures();const s=scenario(data);await s.settle();await s.settle();
 s.nodes.studyPrice.value='13.40';s.nodes.studyPrice.listeners.input();
 s.setResponse({...data,commercial:{...data.commercial,
  drafts:[{...data.commercial.drafts[0],proposedMonthlyCents:1490},data.commercial.drafts[1]]}});
 s.events['commercial:price-saved']();
 await s.settle();await s.settle();
 assert.equal(s.nodes.studyPrice.value,'13.40','unsaved typed scenario must be preserved');
 assert.match(s.nodes.studySource.textContent,/14,90/,'read-only saved reference updates');
 assert.equal(s.calls.length,6);
 assert.match(s.nodes.studyResult.textContent,/No se ha calculado ni guardado/);
});
test('fail closed if live billing is asserted, and refuse calculate with unsupported payload',async()=>{
 const bad=fixtures();bad.readiness.liveStripeEnabled=true;
 const s=scenario(bad);await s.settle();await s.settle();
 assert.equal(s.nodes.studyCalculate.disabled,true);
 assert.match(s.nodes.studyStatus.textContent,/No se puede garantizar/);
 assert.equal(s.nodes.studyContractFields.children.length,0);
 s.nodes.studyCalculate.click();
 assert.match(s.nodes.studyResult.textContent,/No se ha podido verificar/);
 assert.equal(s.calls.length,3);
});
