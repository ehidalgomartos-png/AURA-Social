'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/views/marketplace-commercial-v3281.html');
const css=read('public/marketplace-commercial-v3281.css');
const js=read('public/marketplace-commercial-workspace-v3291.js');
const features=read('public/marketplace-commercial-features-v3282.js');
test('V3.2.91 groups all existing tools into three accessible, collapsible mobile-first workflows',()=>{
 const markers=[
  'id="workgroup-plans" open','id="workgroup-terms"','id="workgroup-tools"',
  'id="drafts"','id="proposedFeatures"','id="planComparison"',
  'id="definitionCards"','id="definitionReviews"','id="contractDraftWorkspace"',
  'id="contractDraftList"','id="reviews"','id="simulator"','id="simResult"','id="applyUnlimited"',
  'id="workgroup-plans"','id="workgroup-terms"','id="workgroup-tools"'
 ];
 for(const marker of markers)assert.ok(html.includes(marker),marker);
 const prices=html.slice(html.indexOf('<details class="workgroup" id="workgroup-plans"'),html.indexOf('<details class="workgroup" id="workgroup-terms"'));
 const legal=html.slice(html.indexOf('<details class="workgroup" id="workgroup-terms"'),html.indexOf('<details class="workgroup" id="workgroup-tools"'));
 const advanced=html.slice(html.indexOf('<details class="workgroup" id="workgroup-tools"'));
 assert.match(prices,/Planes comerciales propuestos/);
 assert.match(prices,/id="proposedFeatures"/);
 assert.match(prices,/id="planComparison"/);
 assert.match(prices,/id="definitionCards"/);
 assert.doesNotMatch(prices,/id="contractDraftList"|id="simulator"/);
 assert.match(legal,/id="contractDraftList"/);
 assert.match(legal,/id="reviews"/);
 assert.doesNotMatch(legal,/id="simulator"/);
 assert.match(advanced,/id="simulator"/);
 assert.match(advanced,/Flujo previsto para el vendedor/);
 assert.match(html,/<nav class="workspace-links" aria-label="Acceso rápido a la preparación comercial">/);
 assert.match(html,/href="#workgroup-plans"/);
 assert.match(html,/href="#workgroup-terms"/);
 assert.match(html,/href="#workgroup-tools"/);
 assert.match(html,/id="workspaceReadiness" role="status" aria-live="polite"/);
 assert.match(html,/href="\/marketplace\/suscripciones\/lanzamiento"/);
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/noindex,nofollow/);
 assert.match(html,/marketplace-commercial-workspace-v3291\.js\?v=3\.2\.\d+(?:\.\d+)?/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/@media\(min-width:640px\)/);
 assert.match(css,/\.workgroup-summary:after/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotMatch(js,/\bmethod:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
});
test('quick navigation opens the correct collapsed group and moves keyboard focus',async()=>{
 const groups={},links=[],listeners={},calls=[];
 for(const name of ['workgroup-plans','workgroup-terms','workgroup-tools']){
  const summary={focused:false,scrolled:false,
   focus(options){this.focused=options?.preventScroll===true;},
   scrollIntoView(options){this.scrolled=options?.block==='start';}};
  groups[name]={open:name==='workgroup-plans',querySelector:tag=>tag==='summary'?summary:null,summary};
  links.push({href:'#'+name,getAttribute(key){return key==='href'?this.href:'';},
   addEventListener(name,handler){this[name]=handler;}});
 }
 const node={textContent:''};
 const document={
  getElementById(id){return id==='workspaceReadiness'?node:groups[id]||null;},
  querySelectorAll(selector){assert.equal(selector,'.workspace-jump');return links;}
 };
 const window={addEventListener(name,fn){listeners[name]=fn;}};
 let payload={ok:true,adminOnly:true,previewOnly:true,releaseAuthorized:false,productionReady:false,
  billingEnabled:false,liveStripeEnabled:false,consentRecorded:false,pricesPublished:false,
  pilotProtected:true,summary:{outstanding:12,planTasks:6,internalReviewTasks:6}};
 const fetch=async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,json:async()=>payload};
 };
 vm.runInNewContext(js,{document,window,fetch,Map,Number});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 await settle();await settle();
 assert.match(node.textContent,/12 decisiones internas pendientes/);
 assert.match(node.textContent,/Cobros desactivados/);
 assert.equal(calls[0].opts.credentials,'same-origin');
 assert.equal(calls[0].opts.cache,'no-store');
 assert.match(calls[0].url,/\/admin\/commercial\/launch-readiness$/);
 let prevented=false;
 links[1].click({preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
 assert.equal(groups['workgroup-terms'].open,true);
 assert.equal(groups['workgroup-terms'].summary.focused,true);
 assert.equal(groups['workgroup-terms'].summary.scrolled,true);
 assert.equal(groups['workgroup-tools'].open,false);
 links[2].click({preventDefault(){}});
 assert.equal(groups['workgroup-tools'].open,true);
 payload={...payload,summary:{outstanding:0,planTasks:0,internalReviewTasks:0}};
 listeners['commercial:terms-saved']();
 await settle();await settle();
 assert.match(node.textContent,/lanzamiento sigue sin autorización legal/);
 assert.ok(calls.length>=2);
});
test('private readiness summary fails closed if API claims enrollment or Stripe are active',async()=>{
 const group={open:false,querySelector:()=>({scrollIntoView(){},focus(){}})};
 const message={textContent:''};
 const document={getElementById:id=>id==='workspaceReadiness'?message:group,querySelectorAll:()=>[]};
 const window={addEventListener(){}};
 const fetch=async()=>({ok:true,json:async()=>({ok:true,adminOnly:true,previewOnly:true,
  releaseAuthorized:false,productionReady:false,billingEnabled:false,liveStripeEnabled:true,
  consentRecorded:false,pricesPublished:false,pilotProtected:true,summary:{outstanding:0}})});
 vm.runInNewContext(js,{document,window,fetch,Map,Number});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(message.textContent,/Consulta el estado detallado/);
 assert.doesNotMatch(message.textContent,/Sin tareas internas pendientes/);
});
test('commercial comparison and feature accordion singular/plural work without changing stored plan policy',()=>{
 const match=features.match(/const limit=\(n,suffix\)=>\{[\s\S]*?\n\};/);
 assert.ok(match,'Expected display-only unit formatter');
 const limit=vm.runInNewContext('('+match[0].replace(/^const limit=/,'').replace(/;$/,'')+')');
 assert.equal(limit(1,'tienda(s)'),'1 tienda');
 assert.equal(limit(3,'tienda(s)'),'3 tiendas');
 assert.equal(limit(1,'producto(s)'),'1 producto');
 assert.equal(limit(400,'producto(s)'),'400 productos');
 assert.equal(limit(null,'tienda(s)'),'Pendiente de definir');
 assert.match(features,/comparisonRow\('Tiendas conectadas',plan\?limit\(plan\.storeLimit,'tienda\(s\)'\)/);
 assert.match(features,/limit\(plan\.storeLimit,'tienda\(s\)'\)/);
 assert.match(features,/externalCheckout:true/);
 assert.doesNotMatch(features,/sk_live_|stripe\.checkout\.sessions/);
});
test('existing commercial editors stay private, unchanged and explicitly confirmed',()=>{
 const commercial=read('public/marketplace-commercial-v3281.js');
 const contract=read('public/marketplace-contract-drafts-v3288.js');
 const compare=read('public/marketplace-commercial-features-v3282.js');
 const policies=read('public/marketplace-commercial-decisions-v3285.js');
 const simulator=read('public/marketplace-commercial-preview-v3284.js');
 assert.match(commercial,/window\.confirm/);
 assert.match(contract,/window\.confirm/);
 assert.match(compare,/window\.confirm/);
 assert.match(policies,/window\.confirm/);
 assert.match(simulator,/previewOnly|Simulación interna/);
 assert.match(contract,/commercial:terms-saved/);
 assert.match(html,/Contratación y cobros desactivados/);
 assert.match(html,/MundoTaza conserva su piloto gratuito/);
 assert.match(html,/marketplace-contract-drafts-v3288\.js\?v=3\.2\.\d+(?:\.\d+)?/);
 for(const s of [commercial,contract,compare,policies,simulator])assert.doesNotThrow(()=>new vm.Script(s));
});
