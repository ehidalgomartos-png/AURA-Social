'use strict';
// V3.2.61: A seller's physical origin and their sales/delivery reach are different.
// Never infer a specific origin city from "España · España" legacy listings.
function text(value){return typeof value==='string'?value.trim():'';}
function normalize(value){return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function isSpain(value){return normalize(value)==='espana';}
function nationalSale(row){
 if(row?.kind!=='product'||row?.deal!=='sale')return false;
 if(row.details?.saleScope==='national')return true;
 if(row.details?.saleScope==='local')return false;
 // Backwards-compatible display for seller-entered country-wide legacy listings.
 return isSpain(row.city)&&isSpain(row.details?.province);
}
function originLocation(row){
 const city=text(row?.city),province=text(row?.details?.province);
 if(!city||isSpain(city))return '';
 return [city,province].filter((v,i,a)=>v&&!isSpain(v)&&a.findIndex(x=>normalize(x)===normalize(v))===i).join(' · ');
}
function coverageLabel(row){
 if(nationalSale(row))return 'Venta y envíos a toda España';
 if(row?.kind==='product'&&row?.deal==='sale'&&row.details?.saleScope==='local')return 'Venta en la zona indicada';
 return '';
}
function publicLocation(row){
 const origin=originLocation(row),coverage=coverageLabel(row);
 if(origin&&coverage)return origin+' · '+coverage;
 if(coverage)return coverage;
 if(origin)return origin;
 return [text(row?.city),text(row?.details?.province)]
  .filter((v,i,a)=>v&&a.findIndex(x=>normalize(x)===normalize(v))===i).join(' · ');
}
module.exports={isSpain,nationalSale,originLocation,coverageLabel,publicLocation};
