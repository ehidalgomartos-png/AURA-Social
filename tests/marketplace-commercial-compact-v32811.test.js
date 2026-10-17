'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'public/marketplace-commercial-v3281.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/views/marketplace-commercial-v3281.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/marketplace-commercial-v3281.css'),'utf8');
class MockElement{
 constructor(tag='div'){
  this.tagName=tag;this.children=[];this.attributes={};this.listeners={};
  this.hidden=false;this.disabled=false;this.open=false;this.value='';this.className='';
  this._text='';
 }
 append(...children){this.children.push(...children);for(const child of children)if(child&&typeof child==='object')child.parentNode=this;}
 replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
 get lastChild(){return this.children[this.children.length-1]||null;}
 set textContent(text){this._text=String(text);this.children=[];}
 get textContent(){return this._text+this.children.map(x=>typeof x==='object'?x.textContent:String(x)).join('');}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(type,fn){this.listeners[type]=fn;}
}
function scenario(){
 const ids=['message','workspace','statPlans','statPending','statReviewed','reviewProgress','drafts','reviews'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new MockElement()]));
 const data={
  commercialDraftOnly:true,billingEnabled:false,enrollmentEnabled:false,pricesPublished:false,
  drafts:[
   {code:'professional',proposedMonthlyCents:null,summary:'Conexión privada de una tienda.'},
   {code:'professional_plus',proposedMonthlyCents:2490,summary:'Opciones de comercio ampliadas.'}
  ],
  reviews:[
   {code:'pricing',name:'Precios definitivos',detail:'Definir importes.',status:'pending',notes:''},
   {code:'taxes',name:'IVA y facturación',detail:'Consultar asesoría.',status:'pending',notes:'Esperando revisión.'},
   {code:'terms',name:'Condiciones y consentimiento',detail:'Revisión legal.',status:'pending',notes:''},
   {code:'renewals',name:'Renovaciones',detail:'Avisos.',status:'pending',notes:''},
   {code:'cancellations',name:'Bajas y reembolsos',detail:'Cancelación.',status:'in_review',notes:'Preparando opciones.'},
   {code:'privacy',name:'Privacidad',detail:'Retención.',status:'reviewed',notes:'Nota registrada.'}
  ]
 };
 const requests=[],confirms=[];
 const fetch=async(url,opts={})=>{
  requests.push({url,opts});
  let response=data;
  if(opts.method==='POST'){
   const body=JSON.parse(opts.body);
   if(url.includes('/drafts/')){
    const draft=data.drafts.find(x=>url.endsWith('/'+x.code));
    Object.assign(draft,body);response={ok:true,commercialDraftOnly:true,billingEnabled:false,draft};
   }else if(url.includes('/reviews/')){
    const item=data.reviews.find(x=>url.endsWith('/'+x.code));
    item.status=body.reviewStatus;item.notes=body.notes;
    response={ok:true,commercialDraftOnly:true,billingEnabled:false,review:item};
   }else throw Error('Unexpected POST: '+url);
  }
  return {ok:true,json:async()=>response};
 };
 const document={getElementById:id=>nodes[id],createElement:tag=>new MockElement(tag)};
 const window={confirm:prompt=>(confirms.push(prompt),true)};
 vm.runInNewContext(script,{document,window,fetch,encodeURIComponent,console});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const submit=async form=>{const promise=form.listeners.submit({preventDefault(){}});await promise;await settle();};
 return {nodes,data,requests,confirms,settle,submit};
}
test('mobile commercial panel uses native accessible summary/details instead of eight expanded forms',()=>{
 assert.match(html,/id="stats"/);
 assert.match(html,/id="statPlans"/);
 assert.match(html,/id="statPending"/);
 assert.match(html,/id="statReviewed"/);
 assert.match(html,/id="reviewProgress"/);
 assert.match(html,/<details class="panel flow-panel">/);
 assert.match(html,/<summary class="fold-head">/);
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/noindex,nofollow/);
 assert.match(html,/3\.2\.(?:81\.1|82)/);
 assert.match(css,/summary:focus-visible/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/min-height:60px/);
 assert.doesNotMatch(script,/\.innerHTML\s*=/);
 assert.doesNotMatch(script,/checkout\.stripe|sk_live_/);
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('compact accordion keeps proposals/reviews collapsed, shows all saved data and reflects persisted changes',async()=>{
 const x=scenario();await x.settle();await x.settle();
 const {nodes,data,requests}=x;
 assert.equal(nodes.workspace.hidden,false);
 assert.equal(nodes.message.textContent,'');
 assert.equal(nodes.statPlans.textContent,'2');
 assert.equal(nodes.statPending.textContent,'4');
 assert.equal(nodes.statReviewed.textContent,'1');
 assert.equal(nodes.reviewProgress.textContent,'1 de 6 revisadas · 1 en revisión');
 assert.equal(nodes.drafts.children.length,2);
 assert.equal(nodes.reviews.children.length,6);
 for(const item of [...nodes.drafts.children,...nodes.reviews.children]){
  assert.equal(item.tagName,'details');
  assert.equal(item.open,false);
  assert.equal(item.children[0].tagName,'summary');
  assert.equal(item.children[1].tagName,'form');
 }
 assert.match(nodes.drafts.children[0].children[0].textContent,/Sin precio decidido/);
 assert.match(nodes.drafts.children[1].children[0].textContent,/24,90/);
 assert.equal(nodes.reviews.children[1].children[1].children[1].children[0].value,'Esperando revisión.');
 const professional=nodes.drafts.children[0];professional.open=true;
 const cost=professional.children[1].children[0].children[0].children[0];
 // label is nested: form -> field -> label -> input.
 assert.equal(cost.tagName,'input');
 cost.value='9.90';
 const saveDraftForm=professional.children[1];
 await x.submit(saveDraftForm);
 assert.equal(data.drafts[0].proposedMonthlyCents,990);
 assert.equal(professional.open,true);
 assert.match(professional.children[0].textContent,/9,90/);
 assert.match(saveDraftForm.textContent,/Borrador guardado/);
 const tax=nodes.reviews.children[1];tax.open=true;
 const reviewForm=tax.children[1];
 const select=reviewForm.children[0].children[0].children[0];
 assert.equal(select.tagName,'select');
 select.value='reviewed';
 await x.submit(reviewForm);
 assert.equal(data.reviews[1].status,'reviewed');
 assert.equal(tax.open,true);
 assert.match(tax.children[0].textContent,/Revisado internamente/);
 assert.equal(nodes.statPending.textContent,'3');
 assert.equal(nodes.statReviewed.textContent,'2');
 assert.equal(nodes.reviewProgress.textContent,'2 de 6 revisadas · 1 en revisión');
 assert.ok(requests.some(x=>x.url.endsWith('/drafts/professional')&&x.opts.method==='POST'));
 assert.ok(requests.some(x=>x.url.endsWith('/reviews/taxes')&&x.opts.method==='POST'));
 assert.ok(requests.filter(x=>x.opts.method==='POST').every(x=>x.opts.credentials==='same-origin'));
});
test('compact panel preserves explicit confirmation before all writes and does not expose vendor endpoints',()=>{
 assert.match(script,/window\.confirm/);
 assert.match(script,/api\('\/drafts\/'/);
 assert.match(script,/api\('\/reviews\/'/);
 assert.match(script,/credentials:'same-origin'/);
 assert.doesNotMatch(script,/\/api\/marketplace\/subscriptions\/mine/);
 assert.doesNotMatch(html,/STRIPE_TEST_SECRET|sk_test_/);
 const original=fs.readFileSync(path.join(root,'src/routes/marketplace-subscription-commercial-v3281.js'),'utf8');
 assert.match(original,/router\.use\(requireAdmin\)/);
 assert.match(original,/checkOrigin/);
 const page=fs.readFileSync(path.join(root,'src/routes/marketplace-seo-v3251.js'),'utf8');
 assert.match(page,/router\.get\('\/marketplace\/suscripciones\/comercial',requireAdmin/);
});
