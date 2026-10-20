'use strict';
// V3.2.126 — PRIVATE catalogue of public SALE products with no successful,
// stored manual Search Console inspection within the last 90 days.
// Never infer whether Google itself knows a URL. No network requests to Google.
const {TABLE,RETENTION_DAYS}=require('./marketplace-gsc-followup-v32125');
const PAGE_SIZE=20;
const MAX_PAGE=250;
const MAX_QUERY=70;
const PUBLIC_SALE_FROM=
 " FROM marketplace_listings l JOIN users u ON u.id=l.seller_id"+
 " WHERE l.kind='product' AND l.deal='sale'"+
 " AND l.status='active' AND l.moderation_status='published'"+
 " AND u.status='active' AND u.discoverable=true";
const SEARCH_FILTER=" AND ($1::text='' OR strpos(lower(l.title),lower($1::text))>0)";
const MISSING_FILTER=" AND NOT EXISTS (SELECT 1 FROM "+TABLE+
 " s WHERE s.listing_id=l.id AND s.checked_at>=now()-interval '"+RETENTION_DAYS+" days')";
const COUNT_SQL=
 "SELECT COUNT(*)::integer AS eligible_total,"+
 " COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM "+TABLE+
 " s WHERE s.listing_id=l.id AND s.checked_at>=now()-interval '"+RETENTION_DAYS+" days'))::integer AS pending_total"+
 PUBLIC_SALE_FROM+SEARCH_FILTER;
const PAGE_SQL=
 "SELECT l.id,l.title,l.category,l.updated_at"+
 PUBLIC_SALE_FROM+SEARCH_FILTER+MISSING_FILTER+
 " ORDER BY l.updated_at DESC,l.id DESC LIMIT $2 OFFSET $3";
function parsePage(value){
 if(value===undefined||value===null||value==='')return 1;
 const text=String(value);
 if(!/^[1-9]\d{0,3}$/.test(text))return null;
 const page=Number(text);
 return page>=1&&page<=MAX_PAGE?page:null;
}
function parseSearch(value){
 if(value===undefined||value===null)return '';
 if(typeof value!=='string'||value.length>MAX_QUERY||
   /[\u0000-\u001f\u007f]/.test(value))return null;
 return value.trim();
}
function publicPath(row,listingPath){
 const path=listingPath({id:row.id,title:row.title});
 return /^\/marketplace\/p\/[1-9][0-9]{0,15}\/[a-z0-9-]+$/.test(path)?path:null;
}
async function pending(db,{listingPath,page=1,search=''}={}){
 if(typeof listingPath!=='function'||parsePage(page)!==page||parseSearch(search)!==search)
  throw Error('invalid_pending_arguments');
 const offset=(page-1)*PAGE_SIZE;
 const [totals,entries]=await Promise.all([
  db.query(COUNT_SQL,[search]),
  db.query(PAGE_SQL,[search,PAGE_SIZE+1,offset])
 ]);
 const found=entries.rows||[];
 const rows=found.slice(0,PAGE_SIZE).map(item=>({
  id:String(item.id),
  title:String(item.title||'').slice(0,180),
  category:String(item.category||'').slice(0,100),
  updatedAt:new Date(item.updated_at).toISOString(),
  path:publicPath(item,listingPath)
 }));
 const counts=totals.rows?.[0]||{};
 const asInt=value=>{
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=0?n:0;
 };
 return {
  ok:true,source:'public_products_without_recent_saved_manual_inspection',
  page,pageSize:PAGE_SIZE,maxPage:MAX_PAGE,search,
  hasPrevious:page>1,hasNext:found.length>PAGE_SIZE,
  totalPublicSaleProducts:asInt(counts.eligible_total),
  withoutRecentInspection:asInt(counts.pending_total),
  inspectedInWindow:Math.max(0,asInt(counts.eligible_total)-asInt(counts.pending_total)),
  retentionDays:RETENTION_DAYS,products:rows,
  note:'Pendiente significa SIN una inspección manual guardada en RedLibertad durante los últimos 90 días; NO significa que Google desconozca la URL. No se consulta Google, no se solicita indexación y no se modifican anuncios.'
 };
}
module.exports={TABLE,PAGE_SIZE,MAX_PAGE,MAX_QUERY,PUBLIC_SALE_FROM,SEARCH_FILTER,
 MISSING_FILTER,COUNT_SQL,PAGE_SQL,parsePage,parseSearch,publicPath,pending};
