'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function harness(responses=[],confirmAnswer=true){
 const full=fs.readFileSync('public/marketplace-professional-v3276.js','utf8');
 const state=full.slice(full.indexOf('const WOO_BULK_LIMIT_V32779=10;'),
  full.indexOf('const wooId=()'));
 const impl=full.slice(full.indexOf('/* V3.2.77.9:'),
  full.indexOf("(async()=>{const me=await api('/api/auth/me');"));
 assert.ok(state.startsWith('const WOO_BULK_LIMIT_V32779=10;'));
 assert.ok(impl.includes("$('wooBulkStart').addEventListener('click'"));
 const nodes=new Map(),calls=[],messages=[];
 function node(id){
  if(!nodes.has(id)){
   nodes.set(id,{
    value:'',hidden:false,disabled:false,innerHTML:'',textContent:'',
    children:[],dataset:{},handlers:{},
    addEventListener(name,fn){this.handlers[name]=fn;},
    appendChild(child){this.children.push(child);}
   });
  }
  return nodes.get(id);
 }
 node('wooCity').value='Valencia';node('wooProvince').value='Valencia';node('wooSaleScope').value='national';
 const doc={querySelectorAll:()=>[],querySelector:()=>null,
  createElement:tag=>({tagName:tag,dataset:{},textContent:'',children:[],appendChild(el){this.children.push(el);}})};
 let replyIndex=0;
 const sandbox={document:doc,$:node,console,confirm:()=>confirmAnswer,
  wooId:()=>String(5),wooStatus:async()=>({ok:true}),
  wooNote:message=>messages.push(message),
  api:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return responses[replyIndex++]||{ok:false,error:'network_error'};},
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
 vm.createContext(sandbox);
 vm.runInContext('let wooRunning=false,wooConnected=true;',sandbox);
 vm.runInContext(state+impl,sandbox);
 const run=(js)=>vm.runInContext(js,sandbox);
 const click=async(id)=>{const fn=node(id).handlers.click;assert.ok(fn,'missing click handler for '+id);return fn();};
 return {run,node,click,calls,messages};
}
const add=(h,ids)=>{
 for(const id of ids){
  h.run('wooBulkCatalog.set("'+id+'",{id:'+id+',title:"Producto '+id+'",priceCents:1599,category:"Tazas",photoUrl:"https://mundotaza.com/image.jpg"});');
 }
 h.run('wooBulkPageIds='+JSON.stringify(ids.map(String))+';');
};
test('batch selection is limited to 10 products across multiple preview pages',async()=>{
 const h=harness();
 add(h,[1,2,3,4,5,6]);
 await h.click('wooBulkSelectPage');
 assert.equal(h.run('wooBulkSelection.size'),6);
 add(h,[7,8,9,10,11,12]);
 await h.click('wooBulkSelectPage');
 assert.equal(h.run('wooBulkSelection.size'),10);
 assert.equal(h.node('wooBulkCount').textContent,'10 de 10 productos seleccionados.');
 assert.equal(h.run('wooBulkSelection.has("11")'),false);
 assert.equal(h.run('wooBulkSelection.has("12")'),false);
 await h.click('wooBulkClear');
 assert.equal(h.run('wooBulkSelection.size'),0);
 assert.equal(h.node('wooBulkReview').disabled,true);
});
test('no product imported before review AND explicit confirmation',async()=>{
 const h=harness([{ok:true,state:'imported',listingId:21}],false);
 add(h,[21]);
 await h.click('wooBulkSelectPage');
 assert.equal(h.calls.length,0);
 await h.click('wooBulkReview');
 assert.equal(h.calls.length,0);
 assert.equal(h.node('wooBulkConfirmPanel').hidden,false);
 await h.click('wooBulkStart');
 assert.equal(h.calls.length,0,'user must accept final confirm');
});
test('batch uses existing secured single-product API sequentially, never retries or duplicates',async()=>{
 const h=harness([
  {ok:true,state:'imported',listingId:51},
  {ok:false,error:'woocommerce_duplicate_candidate'},
  {ok:false,error:'network_error'}
 ]);
 add(h,[101,102,103]);
 await h.click('wooBulkSelectPage');
 await h.click('wooBulkReview');
 assert.equal(h.calls.length,0);
 await h.click('wooBulkStart');
 assert.equal(h.calls.length,3);
 for(let i=0;i<3;i++){
  assert.match(h.calls[i].url,new RegExp('/stores/5/import/'+(101+i)+'$'));
  assert.equal(h.calls[i].body.confirm,true);
  assert.equal(h.calls[i].body.city,'Valencia');
  assert.equal(h.calls[i].body.saleScope,'national');
 }
 assert.match(h.node('wooBulkProgress').textContent,/Procesados: 3\/3 · Publicados: 1 · No importados: 1 · Errores: 1/);
 assert.equal(h.run('wooBulkSelection.size'),1,'only unsuccessful item remains selectable');
 assert.equal(h.node('wooBulkResults').children.length,3);
 assert.equal(h.node('wooBulkResults').children[0].dataset.state,'imported');
 assert.equal(h.node('wooBulkResults').children[1].dataset.state,'blocked');
 assert.equal(h.node('wooBulkResults').children[2].dataset.state,'failed');
 assert.equal(h.run('wooBulkPlan'),null);
});
test('changed input or store invalidates reviewed selections before publication',async()=>{
 const h=harness();
 add(h,[101]);
 await h.click('wooBulkSelectPage');
 await h.click('wooBulkReview');
 assert.equal(h.node('wooBulkConfirmPanel').hidden,false);
 h.node('wooCity').value='Torrent';
 h.node('wooCity').handlers.input();
 assert.equal(h.node('wooBulkConfirmPanel').hidden,true);
 await h.click('wooBulkStart');
 assert.equal(h.calls.length,0);
 h.run('wooBulkReset(true)');
 assert.equal(h.run('wooBulkSelection.size'),0);
});
test('batch cancellation stops between product requests and preserves successful results',async()=>{
 const h=harness([{ok:true,state:'imported',listingId:51},{ok:true,state:'imported',listingId:52}]);
 add(h,[101,102]);
 await h.click('wooBulkSelectPage');
 await h.click('wooBulkReview');
 h.run("api=async(url,options)=>{wooBulkStopRequested=true;return {ok:true,state:'imported',listingId:51};}");
 await h.click('wooBulkStart');
 assert.match(h.node('wooBulkProgress').textContent,/Lote detenido\. Procesados: 1\/2/);
 assert.equal(h.run('wooBulkSelection.size'),1);
 assert.equal(h.node('wooBulkResults').children.length,1);
});
test('server retains confirmation, admin-only permission, duplicate checks and individual atomic transactions',()=>{
 const route=fs.readFileSync('src/routes/marketplace-woocommerce-v3277.js','utf8');
 const secured=fs.readFileSync('src/routes/marketplace-professional-v3276.js','utf8');
 const service=fs.readFileSync('src/services/marketplace-woocommerce-sync-v3277.js','utf8');
 const ui=fs.readFileSync('public/marketplace-professional-v3276.js','utf8');
 const html=fs.readFileSync('src/views/marketplace-professional-v3276.html','utf8');
 const css=fs.readFileSync('public/marketplace-woo-bulk-v32779.css','utf8');
 assert.match(secured,/router\.use\(requireAdmin\)/);
 assert.match(route,/confirm:z\.literal\(true\)/);
 assert.match(route,/router\.post\('\/stores\/:id\/import\/:wooId'/);
 assert.match(service,/const before=await findMatches/);
 assert.match(service,/const current=await findMatches/);
 assert.match(service,/pg_advisory_xact_lock/);
 assert.match(service,/await client\.query\('ROLLBACK'\)/);
 assert.match(service,/eraseFiles\(files\)/);
 assert.match(ui,/WOO_BULK_LIMIT_V32779=10/);
 assert.match(ui,/link-existing/);
 assert.match(ui,/data-woo-bulk-select/);
 assert.match(ui,/wooBulkFingerprint/);
 assert.match(ui,/wooBulkStopRequested/);
 assert.match(html,/id="wooBulkConfirmPanel"/);
 assert.match(html,/id="wooBulkProgress"/);
 assert.match(html,/marketplace-woo-bulk-v32779\.css\?v=3\.2\.77\.9/);
 assert.match(html,/marketplace-professional-v3276\.js\?v=3\.4\.2\.7/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.doesNotMatch(route,/router\.post\('\/stores\/:id\/bulk/);
});
