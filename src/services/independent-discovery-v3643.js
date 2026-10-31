'use strict';
// V3.6.43: only previously published, consented articles are discoverable.
const db=require('../db');
const publications=require('./independent-publication-v3641');
const KINDS=new Set(['noticia','reportaje','analisis','opinion']);
const validAuthor=name=>typeof name==='string'&&name.length<=48&&/^[\p{L}\p{N}._-]{2,48}$/u.test(name);
function validKind(kind){return kind===null||kind===undefined||kind===''||KINDS.has(kind);}
const live=" FROM independent_article_publications_v3641 p JOIN independent_article_submissions_v3640 s ON s.id=p.submission_id JOIN users u ON u.id=s.author_user_id WHERE p.unpublished_at IS NULL AND s.status='approved' AND s.author_publish_consent_at IS NOT NULL AND u.status='active'";
const fields="p.id,p.published_at,s.title,s.body,s.kind,s.sources,u.username AS author_username";
async function browse(kind=null){
 if(!validKind(kind))return null;
 await publications.ensureSchema();
 const filter=kind?' AND s.kind=$1':'';
 const out=await db.query("SELECT "+fields+live+filter+" ORDER BY p.published_at DESC,p.id DESC LIMIT "+(kind?'$2':'$1'),kind?[kind,24]:[24]);
 return out.rows;
}
async function author(name){
 if(!validAuthor(name))return null;
 await publications.ensureSchema();
 const out=await db.query("SELECT "+fields+live+" AND LOWER(u.username)=LOWER($1) ORDER BY p.published_at DESC,p.id DESC LIMIT 40",[name]);
 return out.rows;
}
module.exports={KINDS,validKind,validAuthor,browse,author};
