'use strict';
(()=> {
  const root=document.getElementById('editorialSocial');
  if(!root)return;
  const id=String(root.dataset.articleId||'');
  if(!/^[1-9][0-9]{0,14}$/.test(id))return;
  const $=sel=>root.querySelector(sel);
  let loggedIn=false,liked=false,myUserId=null,busy=false;
  const feedback=(message,error=false)=>{
    const node=$('#edFeedback');node.textContent=message;node.classList.toggle('error',error);
  };
  const request=async(url,opts={})=>{
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});
    let json={};
    try{json=await response.json();}catch(_){}
    return {ok:response.ok,status:response.status,data:json};
  };
  const toDate=value=>{
    try{return new Date(value).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});}
    catch(_){return '';}
  };
  function drawComments(rows){
    const container=$('#edComments');
    container.replaceChildren();
    if(!rows.length){container.textContent='Todavía no hay comentarios. Puedes iniciar la conversación.';return;}
    for(const entry of rows){
      const block=document.createElement('article');block.className='ed-comment';
      const header=document.createElement('div');header.className='ed-comment-head';
      const person=document.createElement('b');person.textContent=String(entry.display_name||entry.username||'Miembro');
      const timestamp=document.createElement('small');timestamp.textContent=toDate(entry.created_at);
      header.append(person,timestamp);
      const message=document.createElement('p');message.textContent=String(entry.body||'');
      const actions=document.createElement('div');actions.className='ed-comment-actions';
      if(loggedIn){
        const own=myUserId!==null&&String(myUserId)===String(entry.user_id);
        const button=document.createElement('button');button.type='button';
        button.textContent=own?'Eliminar mi comentario':'Denunciar';
        button.addEventListener('click',()=>own?removeComment(entry.id):reportComment(entry.id));
        actions.append(button);
      }
      block.append(header,message,actions);container.append(block);
    }
  }
  async function load(){
    try{
      const mine=await request('/api/editorial-social/'+encodeURIComponent(id)+'/mine');
      loggedIn=mine.ok;
      myUserId=mine.ok?mine.data.userId:null;
      liked=mine.ok&&mine.data.liked===true;
      const result=await request('/api/editorial-social/'+encodeURIComponent(id)+'/overview');
      if(!result.ok)throw Error('No se pueden mostrar las interacciones de esta noticia');
      $('#edLikeCount').textContent=Number(result.data.likes||0)+' Me gusta';
      $('#edCommentCount').textContent=Number(result.data.commentCount||0)+' comentarios · Opiniones de usuarios reales';
      $('#edLike').textContent=liked?'♥ Te gusta':'♡ Me gusta';
      $('#edLike').setAttribute('aria-pressed',String(liked));
      drawComments(Array.isArray(result.data.comments)?result.data.comments:[]);
      if(!loggedIn){$('#edCommentForm').classList.add('ed-login-needed');feedback('Inicia sesión para comentar, reaccionar o compartir en una comunidad.');}
    }catch(_){feedback('No se pudo actualizar la conversación.',true);}
  }
  async function act(url,method,body){
    const result=await request(url,{
      method,headers:body?{'Content-Type':'application/json'}:{},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(!result.ok){
      if(result.status===401)throw Error('Debes iniciar sesión en RedLibertad.');
      if(result.status===429)throw Error('Has alcanzado el límite temporal. Prueba más tarde.');
      if(result.data?.error==='community_membership_required')throw Error('Debes unirte a la comunidad para compartir.');
      if(result.data?.error==='editorial_already_shared')throw Error('Ya compartiste esta noticia en esa comunidad.');
      if(result.status===404)throw Error('Esta noticia o comunidad no está disponible.');
      throw Error('No se pudo completar la acción.');
    }
    return result.data;
  }
  $('#edLike').addEventListener('click',async()=>{
    if(busy)return;
    busy=true;
    try{
      await act('/api/editorial-social/'+id+'/like',liked?'DELETE':'PUT');
      feedback(liked?'Has retirado tu Me gusta.':'¡Gracias por participar!');
      await load();
    }catch(e){feedback(e.message,true);}
    finally{busy=false;}
  });
  $('#edCommentForm').addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(busy)return;
    const text=$('#edCommentText').value.trim();
    if(text.length<2||text.length>600)return feedback('Escribe entre 2 y 600 caracteres.',true);
    busy=true;
    try{
      await act('/api/editorial-social/'+id+'/comments','POST',{body:text});
      $('#edCommentText').value='';
      feedback('Comentario publicado. Es visible públicamente.');
      await load();
    }catch(e){feedback(e.message,true);}
    finally{busy=false;}
  });
  async function removeComment(cid){
    if(!window.confirm('¿Eliminar tu comentario?'))return;
    try{
      await act('/api/editorial-social/'+id+'/comments/'+encodeURIComponent(cid),'DELETE');
      feedback('Comentario eliminado.');await load();
    }catch(e){feedback(e.message,true);}
  }
  async function reportComment(cid){
    const reason=window.prompt('Motivo: spam, abuse, misinformation u other','spam');
    if(reason===null)return;
    if(!['spam','abuse','misinformation','other'].includes(reason.trim().toLowerCase()))
      return feedback('Selecciona uno de los motivos indicados.',true);
    try{
      await act('/api/editorial-social/'+id+'/comments/'+encodeURIComponent(cid)+'/report','POST',{reason:reason.trim().toLowerCase()});
      feedback('Aviso enviado al equipo de moderación.');
    }catch(e){feedback(e.message,true);}
  }
  $('#edShare').addEventListener('click',async()=>{
    const url=location.href.split('#')[0];
    if(navigator.share){
      try{await navigator.share({title:document.title,url});feedback('Enlace compartido.');}
      catch(e){if(e.name!=='AbortError')feedback('No se pudo compartir este enlace.',true);}
      return;
    }
    try{
      await navigator.clipboard.writeText(url);
      feedback('Enlace de noticia copiado.');
    }catch(_){feedback('Copia este enlace para compartirlo: '+url);}
  });
  $('#edCommunityShare')?.addEventListener('click',async()=>{
    const communityId=String(root.dataset.communityId||'');
    if(!/^[1-9][0-9]{0,14}$/.test(communityId))return;
    const context=window.prompt('Comentario para la comunidad (opcional, máximo 280 caracteres):','');
    if(context===null)return;
    if(context.trim().length>280)return feedback('Comentario demasiado largo.',true);
    if(!window.confirm('¿Compartir esta noticia en la comunidad con tu cuenta real?'))return;
    try{
      await act('/api/communities/'+communityId+'/share-editorial','POST',{publicationId:Number(id),context:context.trim()});
      feedback('Noticia compartida en la comunidad con tu cuenta.');
    }catch(e){feedback(e.message,true);}
  });
  load();
})();
