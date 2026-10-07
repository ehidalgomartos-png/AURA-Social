const express=require('express');
const db=require('./db');

const router=express.Router();

const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origin=req=>String(process.env.APP_ORIGIN||req.protocol+'://'+req.get('host')).replace(/\/$/,'');
const abs=(req,v='')=>!v?'':/^https?:\/\//i.test(v)?v:origin(req)+(v.startsWith('/')?'':'/')+v;
const fmt=v=>{try{return new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Madrid'}).format(new Date(v));}catch(_){return '';}};
const entryHref=(type,key,pathValue,anchor='registro')=>'/?'+new URLSearchParams({entry:String(type),entryKey:String(key),next:String(pathValue)}).toString()+'#'+(anchor==='acceso'?'acceso':'registro');
const entryBar=(type,key,pathValue)=>'<div class="public-entry-spacer-v192" aria-hidden="true"></div><nav class="public-entry-bar-v192" aria-label="Acceso a RedLibertad"><a class="button" href="'+esc(entryHref(type,key,pathValue))+'">Crear cuenta</a><a class="button ghost" href="'+esc(entryHref(type,key,pathValue,'acceso'))+'">Entrar</a></nav>';

function shell(req,{title,description,canonical,robots='noindex,follow,max-image-preview:large,max-video-preview:-1',body,ogImage='',ogVideo=''}) {
  const o=origin(req);
  const image=ogImage||o+'/assets/og-redlibertad.png';
  const video=ogVideo?'<meta property="og:video" content="'+esc(ogVideo)+'"><meta property="og:video:secure_url" content="'+esc(ogVideo)+'">':'';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="'+esc(robots)+'"><link rel="canonical" href="'+esc(canonical)+'"><meta property="og:site_name" content="RedLibertad"><meta property="og:type" content="website"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+esc(canonical)+'"><meta property="og:image" content="'+esc(image)+'">'+video+'<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+esc(title)+'"><meta name="twitter:description" content="'+esc(description)+'"><meta name="twitter:image" content="'+esc(image)+'"><link rel="stylesheet" href="/styles.css"><script defer src="/public-share-v187.js"></script><style>.sh{min-height:100vh;background:var(--bg);color:var(--navy)}.st{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px max(16px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:rgba(255,253,249,.95);backdrop-filter:blur(14px)}.sb{display:flex;gap:8px;align-items:center;color:inherit;text-decoration:none;font-weight:900}.sb img{width:32px;height:32px}.sa{display:flex;gap:7px;flex-wrap:nowrap}.sa .button{min-width:0;white-space:nowrap;padding:9px 12px}.wrap{width:min(1120px,calc(100% - 28px));margin:auto;padding:38px 0 72px}.story-hero{display:grid;grid-template-columns:1fr minmax(300px,.6fr);gap:22px;align-items:end;margin-bottom:22px}.story-hero h1{font:800 clamp(34px,5vw,54px) Manrope,sans-serif;line-height:1.04;margin:6px 0 10px}.muted{color:var(--muted);line-height:1.6}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card{border:1px solid var(--line);border-radius:18px;background:var(--paper);overflow:hidden;box-shadow:0 9px 25px rgba(13,34,56,.05)}.card a{display:block;color:inherit;text-decoration:none}.visual{aspect-ratio:9/14;background:#071522;overflow:hidden;position:relative}.visual img,.visual video{width:100%;height:100%;object-fit:cover;display:block}.badge{position:absolute;left:10px;bottom:10px;padding:6px 9px;border-radius:999px;background:#071522dd;color:#fff;font-size:10px;font-weight:900}.copy{padding:12px}.row{display:flex;gap:9px;align-items:center}.avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:900;flex:none}.story-view{display:grid;grid-template-columns:minmax(0,.7fr) minmax(280px,.42fr);gap:22px;align-items:start}.player{background:#071522;border-radius:22px;overflow:hidden;min-height:420px;display:grid;place-items:center}.player img,.player video{display:block;width:100%;max-height:78vh;object-fit:contain}.meta{padding:20px;border:1px solid var(--line);border-radius:20px;background:var(--paper)}.creator{display:flex;gap:10px;align-items:center;margin:16px 0;color:inherit;text-decoration:none}.creator img,.creator .avatar{width:46px;height:46px}.notice{padding:28px;border:1px dashed var(--line);border-radius:18px;background:var(--paper);text-align:center}@media(max-width:900px){.grid{grid-template-columns:repeat(3,1fr)}.story-hero,.story-view{grid-template-columns:1fr}}@media(max-width:620px){.wrap{width:calc(100% - 20px);padding-top:22px}.grid{grid-template-columns:repeat(2,1fr)}.sa .ghost:nth-child(-n+5){display:none}.st{padding:9px 10px}.player{min-height:0}.visual{aspect-ratio:9/13}}</style></head><body><main class="sh"><header class="st"><a class="sb" href="/"><img src="/assets/logo-mark.svg" alt=""><span>RedLibertad</span></a><div class="sa"><a class="button small ghost" href="/perfiles">Personas</a><a class="button small ghost" href="/publicaciones">Publicaciones</a><a class="button small ghost" href="/comunidades">Comunidades</a><a class="button small ghost" href="/eventos">Eventos</a><a class="button small ghost" href="/reels">Reels</a><a class="button small ghost" href="/buscar">Buscar</a><a class="button small" href="/#registro">Crear cuenta</a></div></header><div class="wrap">'+body+'</div></main></body></html>';
}

function eligible(alias='s',user='u'){
  return alias+".audience='public' AND "+alias+".moderation_status='published' AND "+alias+".content_level='normal' AND "+user+".status='active' AND "+user+".is_admin=false AND "+user+".discoverable=true";
}

router.get('/historias',async(req,res)=>{
  try{
    const r=await db.query(`
      SELECT s.id,s.media_url,s.media_type,s.playback_url,s.created_at,s.expires_at,
             u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM stories s JOIN users u ON u.id=s.user_id
      WHERE ${eligible('s','u')} AND s.expires_at>now()
      ORDER BY s.created_at DESC,s.id DESC
      LIMIT 60
    `);
    const cards=r.rows.map(x=>{
      const media=x.media_type==='video'?(x.playback_url||x.media_url):x.media_url;
      const src=abs(req,media);
      const visual=x.media_type==='image'
        ?'<img src="'+esc(src)+'" loading="lazy" decoding="async" alt="Historia de '+esc(x.display_name||x.username)+'">'
        :'<video src="'+esc(src)+'" muted playsinline preload="metadata"></video>';
      const avatar=x.avatar_url?'<img class="avatar" src="'+esc(abs(req,x.avatar_url))+'" alt="">':'<span class="avatar">'+esc(String(x.display_name||x.username).slice(0,2).toUpperCase())+'</span>';
      return '<article class="card"><a href="/historia/'+encodeURIComponent(x.id)+'"><div class="visual">'+visual+'<span class="badge">'+(x.media_type==='video'?'▶ VÍDEO':'HISTORIA')+'</span></div><div class="copy"><div class="row">'+avatar+'<span><b>'+esc(x.display_name||x.username)+(x.creator_verified?' ✓':'')+'</b><br><span class="muted">@'+esc(x.username)+'</span></span></div><div class="muted" style="margin-top:8px">Activa hasta '+esc(fmt(x.expires_at))+'</div></div></a></article>';
    }).join('');
    const o=origin(req),description='Historias públicas activas de perfiles descubribles en RedLibertad.';
    const body='<section class="story-hero"><div><span class="eyebrow">HISTORIAS · 24 HORAS</span><h1>Historias públicas</h1><p class="muted">'+esc(description)+' Solo mostramos contenido normal y público; las historias privadas o sensibles nunca aparecen aquí.</p></div><p><a class="button ghost" href="/descubrir">← Descubrir</a> <a class="button" href="/#registro">Crear cuenta</a></p></section>'+(cards?'<section class="grid">'+cards+'</section>':'<div class="notice"><b>No hay historias públicas activas ahora mismo.</b><p class="muted">Vuelve más tarde o entra en RedLibertad para ver las historias disponibles para ti.</p></div>');
    res.type('html').send(shell(req,{title:'Historias públicas — RedLibertad',description,canonical:o+'/historias',body}));
  }catch(err){
    console.error('RedLibertad public stories directory error:',err);
    res.status(500).send('No se pudieron cargar las historias.');
  }
});

router.get('/historia/:id',async(req,res)=>{
  try{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(404).send('Historia no encontrada.');
    const r=await db.query(`
      SELECT s.id,s.media_url,s.media_type,s.playback_url,s.created_at,s.expires_at,
             u.username,u.display_name,u.avatar_url,u.creator_verified
      FROM stories s JOIN users u ON u.id=s.user_id
      WHERE s.id=$1 AND ${eligible('s','u')}
      LIMIT 1
    `,[id]);
    if(!r.rowCount)return res.status(404).send('Historia no encontrada.');
    const x=r.rows[0],o=origin(req),canonical=o+'/historia/'+encodeURIComponent(x.id);
    if(new Date(x.expires_at).getTime()<=Date.now()){
      const body='<section class="story-hero"><div><span class="eyebrow">HISTORIA FINALIZADA</span><h1>Esta historia ya terminó</h1><p class="muted">Las Stories de RedLibertad duran 24 horas. El contenido ya no está disponible desde este enlace.</p></div><p><a class="button" href="/historias">Ver historias activas</a> <a class="button ghost" href="/descubrir">Descubrir</a></p></section>';
      return res.status(410).type('html').send(shell(req,{title:'Historia finalizada — RedLibertad',description:'Esta historia de RedLibertad ya ha finalizado.',canonical,robots:'noindex,follow',body}));
    }
    const media=x.media_type==='video'?(x.playback_url||x.media_url):x.media_url,src=abs(req,media);
    const avatar=x.avatar_url?'<img src="'+esc(abs(req,x.avatar_url))+'" alt="">':'<span class="avatar">'+esc(String(x.display_name||x.username).slice(0,2).toUpperCase())+'</span>';
    const player=x.media_type==='image'?'<img src="'+esc(src)+'" alt="Historia de '+esc(x.display_name||x.username)+'">':'<video src="'+esc(src)+'" controls autoplay muted playsinline preload="metadata"></video>';
    const description='Historia pública activa de '+String(x.display_name||x.username)+' en RedLibertad.';
    const body='<section class="story-view"><div class="player">'+player+'</div><aside class="meta"><span class="eyebrow">HISTORIA PÚBLICA · 24H</span><a class="creator" href="/perfil/'+encodeURIComponent(x.username)+'">'+avatar+'<span><b>'+esc(x.display_name||x.username)+(x.creator_verified?' ✓':'')+'</b><br><span class="muted">@'+esc(x.username)+'</span></span></a><p class="muted">Publicada '+esc(fmt(x.created_at))+'<br>Disponible hasta '+esc(fmt(x.expires_at))+'.</p><p class="muted">Este enlace solo funciona mientras la Story esté activa y siga siendo pública.</p><p><span class="public-entry-inline-v192"><a class="button" href="'+esc(entryHref('story',x.id,'/historia/'+encodeURIComponent(x.id)))+'">Crear cuenta para participar</a> <a class="button ghost" href="'+esc(entryHref('story',x.id,'/historia/'+encodeURIComponent(x.id),'acceso'))+'">Entrar y volver aquí</a></span> <button type="button" class="button ghost" data-public-share data-share-title="'+esc('Historia de '+String(x.display_name||x.username)+' — RedLibertad')+'" data-share-text="'+esc(description)+'">Compartir historia</button> <a class="button ghost" href="/historias">Más historias</a></p></aside></section>';
    res.type('html').send(shell(req,{title:'Historia de '+String(x.display_name||x.username)+' — RedLibertad',description,canonical,body:body+entryBar('story',x.id,'/historia/'+encodeURIComponent(x.id)),ogImage:x.media_type==='image'?src:'',ogVideo:x.media_type==='video'?src:''}));
  }catch(err){
    console.error('RedLibertad public story page error:',err);
    res.status(500).send('No se pudo cargar la historia.');
  }
});

module.exports=router;
