'use strict';
// V3.2.21 — conservative support for ADMIN-confirmed re-link of a saved news
// item to an approved RSS source. Matching hostname is necessary but is NOT
// verification of facts, rights or original publisher identity.
function normalizedHostnameV3221(rawUrl){
  try{
    const url=new URL(String(rawUrl||''));
    if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.'))return '';
    const hostname=url.hostname.toLowerCase();
    if(/\.(?:local|localhost|internal|test|invalid|example|onion)$/.test(hostname))return '';
    return hostname.replace(/^www\./,'');
  }catch(_){return '';}
}
function sourceMatchV3221(candidate,source){
  if(!candidate||!source)return false;
  const articleHost=normalizedHostnameV3221(candidate.canonical_url);
  const feedHost=normalizedHostnameV3221(source.feed_url);
  return Boolean(candidate.source_id==null &&
    articleHost&&feedHost&&articleHost===feedHost &&
    candidate.category===source.category &&
    source.status==='approved'&&source.profile_status==='ready'&&
    source.profile_id!=null&&source.profile_category===source.category);
}
function eligibleSourcesV3221(candidate,sources=[]){
  return (Array.isArray(sources)?sources:[]).filter(source=>sourceMatchV3221(candidate,source))
    .map(source=>({
      id:String(source.id),name:String(source.name),category:String(source.category),
      profileName:String(source.profile_name||''),feedHost:normalizedHostnameV3221(source.feed_url)
    }));
}
module.exports={normalizedHostnameV3221,sourceMatchV3221,eligibleSourcesV3221};
