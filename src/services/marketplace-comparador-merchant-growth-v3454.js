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
// V3.4.5.6 — cola orientativa para trabajar con la cohorte existente.
// El filtrado, los contadores y la ordenación son locales: cero consultas nuevas.
const CATEGORIES=[
 {key:'todas',label:'Todas'},
 {key:'solicitudes',label:'Solicitudes'},
 {key:'catalogos',label:'Catálogos'},
 {key:'preparadas',label:'Preparadas'},
 {key:'pausadas',label:'Pausadas'}
];
const PRIORITY={review:0,draft:1,checkout:2,catalog:3,sync:4,offers:5,unknown:6,ready:7,paused:8};
function categoryFor(key){
 if(key==='paused')return 'pausadas';
 if(key==='ready')return 'preparadas';
 if(key==='review'||key==='draft'||key==='unknown')return 'solicitudes';
 return 'catalogos';
}
function queue(cohort,requested='todas'){
 const rows=Array.isArray(cohort?.rows)?cohort.rows:[];
 const categories=new Set(CATEGORIES.map(item=>item.key));
 const selected=categories.has(requested)?requested:'todas';
 const counters=Object.fromEntries(CATEGORIES.map(item=>[item.key,0]));
 counters.todas=rows.length;
 const enriched=rows.map((item,index)=>{
  const category=categoryFor(item.key);
  counters[category]++;
  return {...item,category,originalIndex:index};
 });
 const ordered=enriched.sort((a,b)=>
  (PRIORITY[a.key]??6)-(PRIORITY[b.key]??6)||a.originalIndex-b.originalIndex);
 return {selected,counts:counters,filters:CATEGORIES.map(({key,label})=>({key,label,count:counters[key]})),
  rows:ordered.filter(item=>selected==='todas'||item.category===selected),
  total:rows.length};
}
module.exports={nextStep,overview,categoryFor,queue};

