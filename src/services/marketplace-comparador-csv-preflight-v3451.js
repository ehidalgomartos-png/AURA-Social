'use strict';
// V3.4.5.1: a truly non-mutating CSV preflight. Uses the existing seller import rules.
const {csvRecords,parseProduct,indexVariationParents}=require('./marketplace-woocommerce-csv-v3260');
const MAX_PREVIEW_BYTES=128*1024,MAX_DETAILS=25;
function previewCsv(csv){
 if(typeof csv!=='string'||Buffer.byteLength(csv,'utf8')>MAX_PREVIEW_BYTES)
  throw new Error('csv_too_large');
 const rows=csvRecords(csv);
 const parents=indexVariationParents(rows);
 const seen=new Set();
 const counts={total:rows.length,ready:0,invalid:0,duplicate:0,skipped:0,warning:0};
 const items=rows.map(row=>{
  const product=parseProduct(row,{city:'Valencia',province:'Valencia',saleScope:'national'},parents);
  let state=product.state;
  let reason=String(product.error||'');
  if(product.key&&seen.has(product.key)&&state==='pending'){
   state='duplicate';reason='SKU o ID repetido en este archivo';
  }
  if(product.key)seen.add(product.key);
  if(state==='pending')counts.ready++;
  else if(state==='duplicate')counts.duplicate++;
  else if(state==='skipped')counts.skipped++;
  else counts.invalid++;
  if(product.warnings?.length)counts.warning++;
  return {line:row.line,title:String(product.title||'').slice(0,120),state,
   reason:reason.slice(0,240),warnings:(product.warnings||[]).slice(0,2).map(x=>String(x).slice(0,180))};
 });
 return {counts,items:items.slice(0,MAX_DETAILS),truncated:items.length>MAX_DETAILS};
}
module.exports={previewCsv,MAX_PREVIEW_BYTES,MAX_DETAILS};
