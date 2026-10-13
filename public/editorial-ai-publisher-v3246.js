'use strict';
// V3.2.46: an explicit administrator-controlled, one-screen article intake.
// Uses the EXISTING web import and separately budgeted image endpoint.
// Does not approve or publish: V3.2.45 handles those after final preview.
(function(root){
  const CATEGORIES=['actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento'];
  function urlOk(value){
    try{
      const x=new URL(String(value||''));
      return x.protocol==='https:'&&!x.username&&!x.password&&!!x.hostname;
    }catch(_){return false;}
  }
  function validId(id){return /^[1-9][0-9]{0,14}$/.test(String(id||''));}
  function validate({metadata,fields,profiles}={}){
    const m=metadata||{},f=fields||{},url=String(f.url||'').trim();
    const canonical=String(m.canonical_url||'').trim();
    const category=String(f.category||''),profileId=Number(f.profileId);
    const title=String(f.title||'').trim(),summary=String(f.summary||'').trim(),
      note=String(f.note||'').trim();
    if(!urlOk(url)||!urlOk(canonical)||url!==canonical)
      return {ok:false,error:'Analiza este enlace HTTPS antes de continuar. Si cambias la URL, vuelve a analizarla.'};
    if(String(m.source_title||'').trim().length<8)
      return {ok:false,error:'La fuente no proporciona un titular identificable. Usa el importador manual.'};
    if(!CATEGORIES.includes(category)||!validId(profileId)||
      !(profiles||[]).some(p=>Number(p.id)===profileId&&p.category===category))
      return {ok:false,error:'Selecciona un perfil editorial preparado de la misma categoría.'};
    if(title.length<12||title.length>220)return {ok:false,error:'El titular editorial debe tener de 12 a 220 caracteres.'};
    if(summary.length<70||summary.length>1100)return {ok:false,error:'El resumen original debe tener de 70 a 1100 caracteres.'};
    if(note.length<12||note.length>500)return {ok:false,error:'Explica en una nota de 12 a 500 caracteres qué datos verificaste.'};
    const checks=f.checks||{};
    if(!checks.sourceRead||!checks.factsChecked||!checks.rightsChecked)
      return {ok:false,error:'Debes comprobar personalmente la fuente, los hechos y los derechos antes de continuar.'};
    if(f.wantImage&&!f.paidImageConfirmed)
      return {ok:false,error:'Para crear la imagen debes aceptar explícitamente el uso de créditos de la API.'};
    return {ok:true,payload:{
      url,category,profileId,title,summary,note,
      manualFallback:false,manualSourceTitle:'',manualSourceExcerpt:'',
      confirmedSource:true,confirmedOriginality:true,confirmedPhotoIsNotLicensed:true
    },wantImage:f.wantImage===true,verifiedFacts:String(f.verifiedFacts||'').trim().slice(0,1800)};
  }
  async function prepare({metadata,fields,profiles,apiRequest,onStep}={}){
    const check=validate({metadata,fields,profiles});
    if(!check.ok)throw Object.assign(new Error(check.error),{stage:'validación'});
    if(typeof apiRequest!=='function')throw new Error('El cliente API no está disponible.');
    const request=async(stage,url,body)=>{
      onStep?.(stage);
      const {r,d}=await apiRequest(url,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
      });
      if(!r?.ok)throw Object.assign(new Error(d?.error||'No se completó '+stage),{stage,code:d?.error||''});
      return d;
    };
    const saved=await request('guardar borrador','/api/admin/editorial/web-import/save',check.payload);
    const candidate=saved?.candidate||{},id=String(candidate.id||'');
    if(!validId(id)||!Number.isSafeInteger(Number(candidate.revision))){
      throw Object.assign(new Error('El servidor no confirmó el borrador. Comprueba Pendientes antes de repetir.'),{stage:'guardar borrador'});
    }
    if(!check.wantImage)return {id,hasImage:false};
    try{
      const result=await request('generar ilustración IA',
        '/api/admin/editorial/ai-image/'+encodeURIComponent(id),{
          revision:Number(candidate.revision),verifiedFacts:check.verifiedFacts
        });
      if(!result?.candidate?.editorial_image_url)throw new Error('No se confirmó la imagen generada.');
    }catch(error){
      error.candidateId=id;
      error.stage='generar ilustración IA';
      throw error;
    }
    return {id,hasImage:true};
  }
  const api={validate,prepare,urlOk};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.editorialAiPublisherV3246=api;
})(typeof globalThis!=='undefined'?globalThis:null);
