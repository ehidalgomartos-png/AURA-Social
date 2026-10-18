'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const launch=require('../src/services/marketplace-launch-readiness-v3289');
const root=path.join(__dirname,'..');
const read=path=>fs.readFileSync(require('node:path').join(root,path),'utf8');
const js=read('public/marketplace-commercial-decision-center-v3292.js');
const html=read('src/views/marketplace-commercial-v3281.html');
const css=read('public/marketplace-commercial-v3281.css');
function sample(missing=12){
 const ids=['price','features','external','terms','internal'],topics=launch.reviewTopics;
 let unfinished=0;
 const plan=code=>({
  code,priceApproved:false,productPurchaseExternal:true,
  checklist:ids.map((id,i)=>{
   const incomplete=unfinished++<missing;
   return {id,label:id+' '+code,complete:!incomplete};
  })
 });
 const plans=['professional','professional_plus'].map(plan);
 const reviewChecklist=topics.map(id=>{
  const incomplete=unfinished++<missing;
  return {id,label:'Revisión '+id,complete:!incomplete};
 });
 const planTasks=plans.reduce((n,p)=>n+p.checklist.filter(x=>!x.complete).length,0);
 const internalReviewTasks=reviewChecklist.filter(x=>!x.complete).length;
 return {ok:true,adminOnly:true,previewOnly:true,commercialDraftOnly:true,
  releaseAuthorized:false,productionReady:false,billingEnabled:false,
  liveStripeEnabled:false,publicEnrollmentEnabled:false,
  entitlementsEnforced:false,consentRecorded:false,pricesPublished:false,
  legalApproval:false,taxApproval:false,pilotProtected:true,externalProductCheckout:true,
  plans,reviewChecklist,summary:{needsFinalApprovals:true,planTasks,internalReviewTasks,
   outstanding:planTasks+internalReviewTasks}};
}
class Element{
 constructor(tag='div'){
  this.tagName=tag;this.children=[];this.attrs={};this.listeners={};
  this.className='';this.style={};this.dataset={};this.open=false;this.disabled=false;
  this._text='';this.scrolled=false;this.focused=false;
 }
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;this._text='';}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(x=>x.textContent||'').join('');}
 setAttribute(name,value){this.attrs[name]=String(value);}
 getAttribute(name){return this.attrs[name]||null;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 querySelector(tag){return this.children.find(x=>x.tagName===tag)||null;}
 scrollIntoView(args){this.scrolled=args?.block==='start';}
 focus(args){this.focused=args?.preventScroll===true;}
 click(){return this.listeners.click();}
}
function scenario(response=sample()){
 const ids=['decisionCenterCount','decisionCenterProgress','decisionCenterProgressFill',
 'decisionCenterPending','decisionCenterAll','decisionCenterRefresh','decisionCenterMessage',
 'decisionCenterGroups','workgroup-plans','workgroup-terms',
 'drafts','definitionCards','proposedFeatures','contractDraftList','reviews'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const plans=['professional','professional_plus'],reviewIds=launch.reviewTopics;
 const prepare=(container,attr,code)=>{
  const fold=new Element('details'),summary=new Element('summary');fold.append(summary);
  if(attr==='data-code')fold.dataset.code=code;
  else fold.setAttribute(attr,code);
  nodes[container].append(fold);return fold;
 };
 for(const name of plans){
  prepare('drafts','data-plan',name);
  prepare('definitionCards','data-plan',name);
  prepare('proposedFeatures','data-plan',name);
  prepare('contractDraftList','data-code',name);
 }
 for(const id of reviewIds)prepare('reviews','data-review',id);
 const events={},calls=[];
 const window={addEventListener(name,fn){events[name]=fn;}};
 const document={getElementById:id=>nodes[id]||null,createElement:tag=>new Element(tag)};
 let data=response;
 const fetch=async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,json:async()=>data};
 };
 vm.runInNewContext(js,{window,document,fetch,Set,Number,String,console});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return {nodes,events,calls,settle,setData:next=>data=next};
}
test('HTML contains accessible decision center with six review labels and versioned assets',()=>{
 for(const id of ['decisionCenterTitle','decisionCenterCount','decisionCenterGroups',
  'decisionCenterProgress','decisionCenterRefresh','decisionCenterPending','decisionCenterAll'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/aria-valuemin="0"/);
 assert.match(html,/aria-pressed="true"/);
 assert.match(html,/v=3\.2\.92/);
 assert.match(html,/marketplace-commercial-decision-center-v3292\.js/);
 assert.match(html,/Contratación y cobros desactivados/);
 assert.match(html,/MundoTaza conserva su piloto gratuito/);
 assert.match(css,/\.decision-center-item/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotMatch(js,/\bmethod:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
 assert.doesNotMatch(js,/sk_live_|\/checkout\/|window\.location|localStorage/);
});
test('16 server-backed checks group as 2 plans x 5 plus 6 global and initially filter 12 outstanding',async()=>{
 const s=scenario();await s.settle();await s.settle();
 const {nodes,calls}=s;
 assert.equal(nodes.decisionCenterCount.textContent,'4 de 16 comprobaciones internas preparadas · 12 pendientes');
 assert.equal(nodes.decisionCenterProgress.getAttribute('aria-valuenow'),'4');
 assert.equal(nodes.decisionCenterProgress.getAttribute('aria-valuemax'),'16');
 assert.equal(nodes.decisionCenterProgressFill.style.width,'25%');
 assert.equal(nodes.decisionCenterGroups.children.length,3);
 assert.equal(nodes.decisionCenterGroups.children[0].children[1].children.length,5);
 assert.equal(nodes.decisionCenterGroups.children[1].children[1].children.length,5);
 assert.equal(nodes.decisionCenterGroups.children[2].children[1].children.length,2);
 assert.equal(nodes.decisionCenterPending.getAttribute('aria-pressed'),'true');
 assert.equal(nodes.decisionCenterAll.getAttribute('aria-pressed'),'false');
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(calls[0].opts.credentials,'same-origin');
 assert.equal(calls[0].opts.cache,'no-store');
 assert.equal(calls[0].url,'/api/marketplace/subscriptions/admin/commercial/launch-readiness');
 // All shows completed controls; no change to server or stored completion flags.
 nodes.decisionCenterAll.click();
 assert.equal(nodes.decisionCenterGroups.children[2].children[1].children.length,6);
 assert.equal(nodes.decisionCenterAll.getAttribute('aria-pressed'),'true');
 nodes.decisionCenterPending.click();
 assert.equal(nodes.decisionCenterGroups.children[2].children[1].children.length,2);
 assert.equal(calls.length,1);
});
test('one-tap navigation opens exactly the matching existing form for plan and review',async()=>{
 const s=scenario();await s.settle();await s.settle();
 const n=s.nodes;
 const buttonAt=(group,row)=>n.decisionCenterGroups.children[group].children[1].children[row].children[2];
 buttonAt(0,0).click();
 assert.equal(n['workgroup-plans'].open,true);
 assert.equal(n.drafts.children[0].open,true);
 assert.equal(n.drafts.children[1].open,false);
 assert.equal(n.drafts.children[0].querySelector('summary').focused,true);
 // The sixth incomplete item is Plus price, not Professional; map must remain stable.
 buttonAt(1,0).click();
 assert.equal(n.drafts.children[1].open,true);
 // Terms and internal for Professional are under contract draft editor.
 buttonAt(0,3).click();
 assert.equal(n['workgroup-terms'].open,true);
 assert.equal(n.contractDraftList.children[0].open,true);
 // General reviews have their own exact topic code and do not change status.
 buttonAt(2,0).click();
 assert.equal(n.reviews.children[0].open,true);
 assert.equal(n.reviews.children[1].open,false);
 assert.match(n.decisionCenterMessage.textContent,/Los cambios solo se guardarán/);
 assert.equal(s.calls.length,1);
});
test('server updates refresh live counts and preserve opened group state',async()=>{
 const s=scenario();await s.settle();await s.settle();
 s.nodes.decisionCenterGroups.children[1].open=true;
 s.setData(sample(0));
 s.events['commercial:terms-saved']();
 await s.settle();await s.settle();
 assert.equal(s.nodes.decisionCenterCount.textContent,'16 de 16 comprobaciones internas preparadas · 0 pendientes');
 assert.equal(s.nodes.decisionCenterProgressFill.style.width,'100%');
 assert.equal(s.nodes.decisionCenterGroups.children[1].open,true);
 assert.equal(s.nodes.decisionCenterGroups.children[1].children[1].children[0].className,'decision-center-empty');
 s.nodes.decisionCenterRefresh.click();
 await s.settle();await s.settle();
 assert.equal(s.calls.length,3);
 assert.match(s.nodes.decisionCenterMessage.textContent,/No se ha guardado ningún cambio/);
});
test('invalid backend security flags or inconsistent totals fail closed and hide stale navigation',async()=>{
 const s=scenario();await s.settle();await s.settle();
 const unsafe=sample(12);
 unsafe.liveStripeEnabled=true;
 s.setData(unsafe);s.nodes.decisionCenterRefresh.click();
 await s.settle();await s.settle();
 assert.equal(s.nodes.decisionCenterGroups.children.length,0);
 assert.match(s.nodes.decisionCenterCount.textContent,/No se ha podido verificar/);
 assert.equal(s.nodes.decisionCenterProgressFill.style.width,'0%');
 const wrong=sample(12);wrong.summary.outstanding=11;
 s.setData(wrong);s.nodes.decisionCenterRefresh.click();
 await s.settle();await s.settle();
 assert.equal(s.nodes.decisionCenterGroups.children.length,0);
 const recovered=sample(13);s.setData(recovered);
 s.nodes.decisionCenterRefresh.click();
 await s.settle();await s.settle();
 assert.match(s.nodes.decisionCenterCount.textContent,/13 pendientes/);
});
test('source of truth remains the pre-existing secure, admin-only, non-operational readiness service',()=>{
 const data=launch.build(
  {cards:[]},{drafts:[]},{drafts:[],reviews:[]});
 assert.equal(data.summary.outstanding,16);
 assert.equal(data.productionReady,false);
 assert.equal(data.releaseAuthorized,false);
 assert.equal(data.liveStripeEnabled,false);
 assert.equal(data.pilotProtected,true);
 const route=read('src/routes/marketplace-subscription-commercial-v3281.js');
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(route,/router\.get\('\/launch-readiness'/);
 assert.doesNotMatch(js,/\.dispatchEvent\s*\(|document\.cookie/);
 const comm=read('public/marketplace-commercial-v3281.js');
 const features=read('public/marketplace-commercial-features-v3282.js');
 assert.match(comm,/setAttribute\('data-plan',entry\.code\)/);
 assert.match(comm,/setAttribute\('data-review',entry\.code\)/);
 assert.match(features,/setAttribute\('data-plan',plan\.code\)/);
});
