'use strict';
// V3.2.64 — factual Google organic SEO + private Merchant readiness audit.
// Never expose a Merchant feed while RedLibertad lacks compliant checkout.
function validGtin(value){
 const s=String(value||'');
 if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(s))return false;
 let sum=0;
 for(let i=s.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(s[i])*weight;
 return (10-(sum%10))%10===Number(s[s.length-1]);
}
function publicProduct(row){
 return row?.kind==='product'&&row.deal==='sale'&&row.status==='active'
   &&row.moderation_status==='published'&&row.seller_status==='active'
   &&row.seller_discoverable===true;
}
const LABELS={
 not_product:'Solo los productos puestos a la venta pueden tener una ficha comercial.',
 not_public:'El anuncio o perfil no está disponible públicamente.',
 no_image:'Añade una fotografía real del producto.',
 no_description:'Completa una descripción útil del producto.',
 no_condition:'Indica si el producto es nuevo o usado.',
 no_brand:'Añade la marca, si tu producto la tiene.',
 no_identifier:'Si existe EAN/GTIN o MPN oficial del fabricante, indícalo.',
 checkout_required:'Falta el proceso de compra y la configuración de Google Merchant Center.'
};
function auditProduct(row){
 const issues=[];
 if(row.kind!=='product'||row.deal!=='sale')issues.push('not_product');
 else{
  if(!publicProduct(row))issues.push('not_public');
  if(!Array.isArray(row.image_urls)||!row.image_urls.some(x=>/^\/uploads\/[A-Za-z0-9._-]{1,180}\.(?:png|jpe?g|webp)$/i.test(x)))issues.push('no_image');
  if(String(row.description||'').trim().length<60)issues.push('no_description');
  const d=row.details&&typeof row.details==='object'?row.details:{};
  if(!['new','used'].includes(d.condition))issues.push('no_condition');
  if(!String(d.brand||'').trim())issues.push('no_brand');
  if(!validGtin(d.gtin)&&!String(d.mpn||'').trim())issues.push('no_identifier');
 }
 return {id:row.id,title:row.title,publicOnGoogle:publicProduct(row),
  merchantReady:false,issues,notes:issues.map(x=>LABELS[x]),
  merchantBlocker:LABELS.checkout_required};
}
function summary(items){return {total:items.length,publicProducts:items.filter(x=>x.publicOnGoogle).length,
 withImprovements:items.filter(x=>x.publicOnGoogle&&x.issues.length).length,merchantReady:0};}
module.exports={validGtin,publicProduct,auditProduct,summary,LABELS};
