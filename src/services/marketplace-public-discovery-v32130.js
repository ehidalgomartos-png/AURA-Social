'use strict';
// V3.2.130 — truthful public internal discovery, and a READ-ONLY warning
// about coinciding public titles for administrators. No product mutations.
// The discovery SQL deliberately shares the four public visibility gates.
const PUBLIC_RELATED_SQL=
 "SELECT l.id,l.title,l.kind,l.deal,l.city,l.details,l.price_cents,l.image_urls,l.created_at"+
 " FROM marketplace_listings l JOIN users u ON u.id=l.seller_id"+
 " WHERE l.id<>$1 AND l.kind=$2 AND l.deal=$3"+
 " AND (LOWER(BTRIM(l.category))=LOWER(BTRIM($4::text))"+
 " OR LOWER(BTRIM(l.city))=LOWER(BTRIM($5::text)))"+
 " AND l.status='active' AND l.moderation_status='published'"+
 " AND u.status='active' AND u.discoverable=true"+
 " ORDER BY CASE WHEN LOWER(BTRIM(l.category))=LOWER(BTRIM($4::text))"+
 " THEN 0 ELSE 1 END,l.created_at DESC,l.id DESC LIMIT 4";
function relatedArgs(row){
 if(!row||!/^[1-9]\d{0,15}$/.test(String(row.id))||
  !['product','service','property'].includes(row.kind)||
  !['sale','buy','rent','offer'].includes(row.deal))
  throw Error('invalid_public_related_listing');
 return [String(row.id),row.kind,row.deal,
  String(row.category||'').slice(0,65),String(row.city||'').slice(0,100)];
}
function categoryBrowse(row){
 if(!row||!['product','service','property'].includes(row.kind))return '/marketplace/explorar';
 const params=new URLSearchParams();
 params.set('tipo',row.kind);
 // A sales listing must lead to SALE listings, and a wanted listing must
 // not send crawlers and people to indistinguishable sale listings.
 if(row.kind==='product'&&['sale','buy'].includes(row.deal))
  params.set('operacion',row.deal);
 if(typeof row.category==='string'&&row.category.trim())
  params.set('categoria',row.category.trim().slice(0,65));
 return '/marketplace/explorar?'+params.toString();
}
// No destructive cleanup, identity matching, source-store inference or
// automatic canonical/noindex decisions: repeated *titles* are not necessarily
// repeated products (e.g. two real mugs with the same printed design).
const SAMPLE_LIMIT=100;
const MAX_GROUPS=5;
const MAX_ITEMS=3;
function titleKey(s){
 return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es').replace(/[^a-z0-9]+/g,' ').trim()
  .replace(/\s+/g,' ');
}
function duplicateTitleCandidates(rows=[],{listingPath}={}){
 if(typeof listingPath!=='function')throw Error('duplicate_sample_path_required');
 const sample=Array.isArray(rows)?rows.slice(0,SAMPLE_LIMIT):[];
 const seen=new Map();
 for(const row of sample){
  if(!row||!['product','service','property'].includes(row.kind)||
   !['sale','buy','rent','offer'].includes(row.deal)||
   !/^[1-9]\d{0,15}$/.test(String(row.id)))continue;
  const title=titleKey(row.title),category=titleKey(row.category);
  if(title.length<8||!category)continue;
  const key=[row.kind,row.deal,category,title].join('\0');
  let group=seen.get(key);
  if(!group){group={title:String(row.title||'').slice(0,120),
   category:String(row.category||'').slice(0,65),
   kind:row.kind,deal:row.deal,count:0,items:[]};
   seen.set(key,group);
  }
  group.count++;
  if(group.items.length<MAX_ITEMS){
   const path=listingPath(row);
   if(/^\/marketplace\/p\/[1-9]\d{0,15}\/[a-z0-9-]+$/.test(path))
    group.items.push({id:String(row.id),title:String(row.title||'').slice(0,120),path});
  }
 }
 const groups=[...seen.values()].filter(g=>g.count>1)
  .sort((a,b)=>b.count-a.count||a.title.localeCompare(b.title,'es'))
  .slice(0,MAX_GROUPS);
 return {
  source:'recent_public_listing_title_sample',
  sampleSize:sample.length,maximumSample:SAMPLE_LIMIT,
  groupCount:groups.length,groups,
  note:'Coincidencias de títulos y categorías dentro de hasta 100 anuncios públicos recientes. Son posibles repeticiones que requieren revisión humana, NO duplicados confirmados. No representa el catálogo completo ni un diagnóstico de Google; ningún anuncio se modifica.'
 };
}
module.exports={PUBLIC_RELATED_SQL,relatedArgs,categoryBrowse,SAMPLE_LIMIT,MAX_GROUPS,MAX_ITEMS,titleKey,duplicateTitleCandidates};
