'use strict';
// V3.2.45 — one explicit administrator action through the EXISTING review,
// quality and publication APIs. No new server-side shortcut to moderation.
(function(root){
  function checkedId(value){return /^[1-9][0-9]{0,14}$/.test(String(value||''));}
  function validate({item,fields}={}){
    if(!item||!checkedId(item.id)||item.status!=='pending')return {ok:false,error:'Abre una noticia pendiente de revisión.'};
    if(!Number.isSafeInteger(Number(item.revision))||Number(item.revision)<0)return {ok:false,error:'La revisión no es válida; recarga la noticia.'};
    const title=String(fields?.title||'').trim(),summary=String(fields?.summary||'').trim();
    const note=String(fields?.note||'').trim(),checks=fields?.checks||{};
    if(title.length<12||title.length>220)return {ok:false,error:'Escribe un titular original de entre 12 y 220 caracteres.'};
    if(summary.length<70||summary.length>1100)return {ok:false,error:'El resumen debe tener entre 70 y 1100 caracteres.'};
    if(note.length<12||note.length>500)return {ok:false,error:'Describe las verificaciones realizadas en la nota (mínimo 12 caracteres).'};
    if(!checks.sourceRead||!checks.factsChecked||!checks.rightsChecked)return {ok:false,error:'Antes de continuar, comprueba y confirma fuente, hechos y derechos.'};
    if(item.source_status!=='approved'||!item.source_id)return {ok:false,error:'La fuente no está aprobada o ya no está vinculada a la noticia.'};
    try{
      const url=new URL(String(item.canonical_url||''));
      if(url.protocol!=='https:'||url.username||url.password)return {ok:false,error:'La fuente debe disponer de una URL HTTPS válida.'};
    }catch(_){return {ok:false,error:'La dirección de la fuente original no es válida.'};}
    return {ok:true,fields:{title,summary,note,checks:{
      sourceRead:true,factsChecked:true,rightsChecked:true}}};
  }
  async function run({item,fields,apiRequest,onStep}={}){
    const checked=validate({item,fields});
    if(!checked.ok)throw Object.assign(new Error(checked.error),{stage:'validación'});
    if(typeof apiRequest!=='function')throw Error('Se necesita el cliente de API');
    const data=checked.fields,id=String(item.id),encoded=encodeURIComponent(id);
    let revision=Number(item.revision);
    const dirty=data.title!==String(item.editorial_title||'').trim()||
      data.summary!==String(item.editorial_summary||'').trim()||
      data.note!==String(item.editor_note||'').trim();
    const request=async(stage,url,method,body)=>{
      onStep?.(stage);
      const {r,d}=await apiRequest(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r?.ok)throw Object.assign(new Error(d?.error||'Error al '+stage),{stage,code:d?.error||''});
      return d||{};
    };
    if(dirty){
      const draft=await request('guardar borrador','/api/admin/editorial/review/'+encoded+'/draft','PATCH',{
        revision,title:data.title,summary:data.summary,note:data.note
      });
      revision=Number(draft.candidate?.revision);
      if(!Number.isSafeInteger(revision))throw Object.assign(new Error('Revisión de borrador desconocida'),{stage:'guardar borrador'});
    }
    const approval=await request('aprobar noticia','/api/admin/editorial/review/'+encoded+'/decision','POST',{
      revision,decision:'approve',note:data.note,...data.checks
    });
    revision=Number(approval.candidate?.revision);
    if(!Number.isSafeInteger(revision))throw Object.assign(new Error('Revisión de aprobación desconocida'),{stage:'aprobar noticia'});
    await request('comprobar calidad','/api/admin/editorial/quality/'+encoded,'PUT',{
      revision,decision:'clear',reason:'accuracy',note:data.note,
      sourceChecked:true,contextChecked:true,rightsChecked:true
    });
    const published=await request('publicar noticia','/api/admin/editorial/publish/'+encoded,'POST',{
      revision,confirm:true
    });
    if(!published.ok||!/^\/noticias\/p\/[1-9][0-9]*$/.test(String(published.url||''))){
      throw Object.assign(new Error('Publicación sin enlace confirmado'),{stage:'publicar noticia'});
    }
    onStep?.('publicada');
    return {url:published.url,publicationId:published.publicationId,revision};
  }
  const api={validate,run};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.editorialQuickPublishV3245=api;
})(typeof globalThis!=='undefined'?globalThis:null);
