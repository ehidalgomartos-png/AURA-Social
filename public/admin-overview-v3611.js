'use strict';
// V3.6.11 — resumen solo de cifras agregadas para administradores.
(()=>{
 const byId=id=>document.getElementById(id);
 const socialFields=[
  ['registrations','Nuevas cuentas · 7 días'],
  ['posts','Publicaciones · 7 días'],
  ['reels','Reels · 7 días'],
  ['comments','Comentarios registrados · 7 días'],
  ['open_reports','Denuncias abiertas · total actual']
 ];
 const helpFields=[
  ['questions','Peticiones · 7 días'],
  ['answers','Respuestas visibles · 7 días'],
  ['resolutions','Problemas resueltos · 7 días']
 ];
 let busy=false;
 const nonNegativeInt=value=>{
  const n=Number(value);
  if(value===null||value===undefined||value===''||!Number.isSafeInteger(n)||n<0)
   throw Error('invalid_metric');
  return n;
 };
 const card=(label,value)=>{
  const tile=document.createElement('article');
  tile.className='admin-overview-tile-v3611';
  const strong=document.createElement('strong');
  strong.textContent=nonNegativeInt(value).toLocaleString('es-ES');
  const span=document.createElement('span');
  span.textContent=label;
  tile.append(strong,span);
  return tile;
 };
 const read=async url=>{
  const response=await fetch(url,{
   credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json'}
  });
  if(!response.ok)throw Error('admin_data_unavailable');
  return response.json();
 };
 const showSocial=data=>{
  if(data?.ok!==true||data.days!==7||!data.metrics||typeof data.metrics!=='object')
   throw Error('invalid_social_metrics');
  const tiles=socialFields.map(([key,label])=>card(label,data.metrics[key]));
  byId('adminOverviewSocialV3611').replaceChildren(...tiles);
 };
 const showResuelve=data=>{
  if(data?.ok!==true||!Array.isArray(data.days)||data.days.length!==7)
   throw Error('invalid_help_metrics');
  const totals={questions:0,answers:0,resolutions:0};
  for(const day of data.days){
   for(const key of Object.keys(totals)){
    const next=totals[key]+nonNegativeInt(day?.[key]);
    if(!Number.isSafeInteger(next))throw Error('overflow_metric');
    totals[key]=next;
   }
  }
  const tiles=helpFields.map(([key,label])=>card(label,totals[key]));
  byId('adminOverviewHelpV3611').replaceChildren(...tiles);
 };
 const refresh=async()=>{
  if(busy)return;
  busy=true;
  const button=byId('refreshAdminOverviewV3611'),status=byId('adminOverviewStatusV3611');
  button.disabled=true;
  status.textContent='Consultando los datos de los últimos 7 días…';
  byId('adminOverviewSocialV3611').replaceChildren();
  byId('adminOverviewHelpV3611').replaceChildren();
  const results=await Promise.allSettled([
   read('/api/admin/activity?days=7&type=all&page=0'),
   read('/api/resuelve/admin/activity-7d')
  ]);
  const groups=[
   [results[0],showSocial,'adminOverviewSocialStatusV3611'],
   [results[1],showResuelve,'adminOverviewHelpStatusV3611']
  ];
  let success=0;
  for(const [outcome,render,statusId] of groups){
   const target=byId(statusId);
   try{
    if(outcome.status!=='fulfilled')throw Error('unavailable');
    render(outcome.value);
    target.textContent='Datos consultados correctamente.';
    success++;
   }catch(_error){
    target.textContent='No disponible. Puedes volver a actualizar.';
   }
  }
  status.textContent=success===2?
   'Resumen actualizado. Solo cifras agregadas; los mensajes privados no se muestran.':
   'Algunos datos no se han podido consultar. No se muestran cifras estimadas.';
  button.disabled=false;
  busy=false;
 };
 byId('refreshAdminOverviewV3611').addEventListener('click',()=>void refresh());
 void refresh();
})();
