'use strict';
// V3.4.5.4 — cohort of the first 20 stores in the current 80-store sample.
// No approvals, messages, payments or imports take place here.
function nextStep(item){
 const status=String(item?.status||'unknown');
 if(status==='suspended')return {key:'paused',label:'Pausada',action:'Revisar suspensión antes de cualquier incorporación'};
 if(status==='pending')return {key:'review',label:'Pendiente de revisión',action:'Comprobar dominio y titularidad de la solicitud'};
 if(status==='draft')return {key:'draft',label:'Borrador',action:'Invitar al comercio a completar y enviar su solicitud'};
 if(status!=='approved')return {key:'unknown',label:'Revisar estado',action:'Comprobar el estado administrativo'};
 if(!item.purchasing)return {key:'checkout',label:'Revisar compra externa',action:'Verificar enlace de compra y autorización comercial'};
 if(!item.linked)return {key:'catalog',label:'Preparar catálogo',action:'Ayudar a conectar WooCommerce o a preparar CSV'};
 if(item.stale>0)return {key:'sync',label:'Actualizar datos',action:'Revisar productos API con comprobación antigua'};
 if(!item.available)return {key:'offers',label:'Revisar productos',action:'Comprobar requisitos y disponibilidad declarada'};
 return {key:'ready',label:'Ofertas preparadas',action:'Comprobar calidad y difusión; no se garantiza posicionamiento'};
}
function overview(items,limit=20){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('invalid_cohort_limit');
 const rows=(Array.isArray(items)?items:[]).slice(0,limit).map(item=>({
  id:String(item?.id||''),name:String(item?.name||''),status:String(item?.status||''),
  linked:Number(item?.linked)||0,available:Number(item?.available)||0,...nextStep(item)
 }));
 const counts=rows.reduce((out,item)=>{
  out[item.key]=(out[item.key]||0)+1;
  return out;
 },{});
 return {rows,counts,sampled:rows.length,limit,
  needsAction:rows.filter(item=>item.key!=='ready').length,
  ready:rows.filter(item=>item.key==='ready').length};
}
module.exports={nextStep,overview};
