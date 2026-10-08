'use strict';

// Builds search metadata only from existing publicly displayed profile fields.
function cleanText(value){
  return String(value??'')
    .replace(/<[^>]*>/g,' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function shorten(text,limit=155){
  const s=cleanText(text);
  if(s.length<=limit)return s;
  const prefix=s.slice(0,limit-1);
  const boundary=prefix.lastIndexOf(' ');
  return (boundary>limit*0.65?prefix.slice(0,boundary):prefix).replace(/[.,;:\s-]+$/,'')+'…';
}
function publicProfileSeo(profile,{url,avatar}={}){
  const username=cleanText(profile.username);
  const name=cleanText(profile.display_name)||username;
  const label=name.toLocaleLowerCase('es')===username.toLocaleLowerCase('es')
    ?name:name+' (@'+username+')';
  const title=shorten(label+' | Perfil en RedLibertad',75);
  const headline=cleanText(profile.creator_headline);
  const bio=cleanText(profile.bio);
  const individualText=[headline,bio].filter(Boolean)
    .filter((value,index,list)=>list.findIndex(x=>x.toLocaleLowerCase('es')===value.toLocaleLowerCase('es'))===index)
    .join('. ');
  const count=Math.max(0,Number(profile.public_post_count)||0);
  const summary=shorten(individualText
    ?label+' en RedLibertad: '+individualText
    :count===1
      ?'Descubre el perfil público de '+label+' en RedLibertad y conoce su publicación y sus ideas.'
      :count>1
        ?'Descubre el perfil público de '+label+' en RedLibertad, conoce sus publicaciones y participa en la conversación.'
      :'Conoce a '+label+' en RedLibertad. Visita su perfil público y descubre una comunidad para compartir ideas y conversar.',158);
  const indexable=profile.discoverable===true;
  if(!indexable){
    return {title,description:'Perfil de RedLibertad. La cuenta no aparece en los resultados públicos de búsqueda.',summary:'',structuredData:null};
  }
  const person={
    '@type':'Person','@id':url+'#person',
    name,alternateName:'@'+username,url,
    description:headline||bio||summary
  };
  if(avatar)person.image=avatar;
  // In-platform creator verification never implies verified identity at Google.
  const markup={
    '@context':'https://schema.org','@type':'ProfilePage',
    '@id':url+'#profile',url,name:title,description:summary,mainEntity:person
  };
  for(const [key,field] of [['dateCreated','created_at'],['dateModified','updated_at']]){
    if(profile[field]){
      const date=new Date(profile[field]);
      if(Number.isFinite(date.getTime()))markup[key]=date.toISOString();
    }
  }
  return {title,description:summary,summary,structuredData:markup};
}
function safeJsonLd(data){
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,ch=>({
    '<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'
  })[ch]);
}
module.exports={publicProfileSeo,cleanText,shorten,safeJsonLd};
