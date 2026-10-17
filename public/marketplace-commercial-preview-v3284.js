'use strict';
// V3.2.84: private, non-operative commercial simulator.
(()=>{
const endpoint='/api/marketplace/subscriptions/admin/commercial/preview';
const choices=[
 ['single_product','Publicar un producto (uno a uno)'],
 ['bulk_import','Importar un lote CSV'],
 ['woo_auto_sync','Sincronizar catálogo WooCommerce'],
 ['connect_store','Conectar otra tienda externa'],
 ['external_purchase','Compra en la tienda del vendedor']
];
const byId=id=>document.getElementById(id);
const el=(tag,text,klass)=>{
 const item=document.createElement(tag);
 if(text!==undefined)item.textContent=String(text??'');
 if(klass)item.className=klass;
 return item;
};
function option(value,text){const item=el('option',text);item.value=value;return item;}
const form=byId('simulator'),plan=byId('simPlan'),action=byId('simAction'),
 stores=byId('simStores'),products=byId('simProducts'),incoming=byId('simBatch'),
 batchField=byId('simBatchField'),result=byId('simResult'),submit=byId('simRun');
for(const [code,label] of choices)action.append(option(code,label));
function inputs(){
 const grouped=['bulk_import','woo_auto_sync'].includes(action.value);
 batchField.hidden=!grouped;
 if(!grouped)incoming.value='1';
}
action.addEventListener('change',inputs);
inputs();
function number(value,min,max){
 if(!/^\d+$/.test(value.trim()))return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;
}
function display(data){
 const title=el('strong',data.status==='proposed_allowed'?'Previsto: permitido':
  data.status==='proposed_denied'?'Previsto: no incluido':'Pendiente de definir');
 const reason=el('p',data.reason);
 const details=el('p','Simulación interna · no activa límites, permisos ni pagos reales.','muted');
 const notes=el('ul',undefined,'preview-notes');
 for(const note of data.notes||[])notes.append(el('li',note));
 result.className='preview-result';
 result.replaceChildren(title,reason,details,notes);
}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const storeCount=number(stores.value,0,100000),productCount=number(products.value,0,100000000);
 const requestCount=number(incoming.value,1,10000);
 if(storeCount===null||productCount===null||requestCount===null){
  result.className='status error';
  result.textContent='Revisa los campos numéricos; no se admiten valores negativos ni decimales.';
  return;
 }
 submit.disabled=true;result.className='status';result.textContent='Calculando la propuesta…';
 try{
  const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json','Content-Type':'application/json'},
   body:JSON.stringify({planCode:plan.value,action:action.value,storeCount,productCount,requestCount})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok||!data.previewOnly||data.limitsEnforced!==false||
     data.billingEnabled!==false)throw Error(data.error||'No se pudo comprobar el escenario.');
  display(data);
 }catch(error){result.className='status error';result.textContent=error.message;}
 finally{submit.disabled=false;}
});
})();
