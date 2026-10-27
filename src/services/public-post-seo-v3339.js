'use strict';

// Metadata for already-public posts. Never place hidden, sensitive or admin
// content into previews, including when a URL is shared without signing in.
const {cleanText,shorten}=require('./public-profile-seo-v302');

function publicPostSeo(post,{indexable=false}={}){
  if(!indexable){
    return {
      title:'Publicación en RedLibertad',
      description:'Visita RedLibertad para descubrir publicaciones y conversaciones.'
    };
  }
  const author=shorten(cleanText(post.display_name||post.username||'Una persona'),23);
  const caption=cleanText(post.caption);
  const id=String(post.id||'');
  const fallbackId=/^[1-9][0-9]{0,14}$/.test(id)?' #'+id:'';
  const headline=caption?shorten(caption,44):'Publicación'+fallbackId;
  const title=shorten(headline+' — '+author+' | RedLibertad',88);
  const description=caption
    ?shorten(caption+' — Publicado por '+author+' en RedLibertad.',158)
    :shorten('Descubre la publicación de '+author+' en RedLibertad. Comparte ideas y participa en la conversación.',158);
  return {title,description};
}

module.exports={publicPostSeo};
