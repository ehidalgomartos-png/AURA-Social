'use strict';

// V3.2.163: public landing only for genuinely public communities.
// Never includes private posts, members, moderation state or invite secrets.
module.exports=function registerPublicCommunityShareV32163(app,{db,publicOrigin,escapeHtml,publicEntryHrefV188,publicEntryBarV192,publicLegalFooterV197}){
  app.get('/comunidad/:id',async(req,res)=>{
    const id=String(req.params.id||'');
    if(!/^[1-9][0-9]{0,14}$/.test(id))return res.status(404).send('Comunidad no encontrada.');
    try{
      const result=await db.query(
        "SELECT c.id,c.name,c.description,c.category,owner.username AS owner_username "+
        "FROM communities c JOIN users owner ON owner.id=c.owner_id "+
        "WHERE c.id=$1 AND c.privacy='public' AND owner.status='active' LIMIT 1",
        [id]
      );
      if(!result.rowCount)return res.status(404).send('Comunidad no encontrada.');
      const community=result.rows[0];
      const origin=publicOrigin(req);
      const canonical=origin+'/comunidad/'+encodeURIComponent(community.id);
      const appLink='/app?view=communities&community='+encodeURIComponent(community.id);
      const title='Comunidad '+String(community.name||'')+' | RedLibertad';
      const description=String(community.description||'Descubre y participa en esta comunidad de RedLibertad.').replace(/\\s+/g,' ').trim().slice(0,170);
      const ogImage=origin+'/assets/og-redlibertad-v1922.jpg';
      const h=escapeHtml;
      const page=[
        '<!doctype html><html lang="es"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
        '<title>'+h(title)+'</title>',
        '<meta name="description" content="'+h(description)+'">',
        '<meta name="robots" content="index,follow,max-image-preview:large">',
        '<link rel="canonical" href="'+h(canonical)+'">',
        '<meta property="og:site_name" content="RedLibertad">',
        '<meta property="og:type" content="website">',
        '<meta property="og:title" content="'+h(title)+'">',
        '<meta property="og:description" content="'+h(description)+'">',
        '<meta property="og:url" content="'+h(canonical)+'">',
        '<meta property="og:image" content="'+h(ogImage)+'">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">',
        '<link rel="stylesheet" href="/styles.css">',
        '<style>body{margin:0;background:#f8f5ef;color:#10283c;font-family:system-ui,sans-serif}.rl-community-share{min-height:80vh;display:grid;align-content:center;max-width:640px;margin:0 auto;padding:20px}.rl-community-share article{padding:clamp(18px,5vw,35px);border:1px solid #deded6;border-radius:22px;background:#fff}.rl-community-share h1{font-size:clamp(24px,6vw,38px);overflow-wrap:anywhere}.rl-community-share p{line-height:1.65;overflow-wrap:anywhere}.rl-community-share small{color:#3b6b74}.rl-community-share nav{display:flex;gap:9px;flex-wrap:wrap;margin-top:20px}.rl-community-share a.button{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;text-decoration:none;border-radius:10px;background:#10283c;color:#fff}.rl-community-share a.button.secondary{background:#e8f2ef;color:#10283c}</style>',
        '</head><body><main class="rl-community-share"><article>',
        '<a href="/" aria-label="Ir a RedLibertad">RedLibertad</a>',
        '<small> · COMUNIDAD PÚBLICA</small>',
        '<h1>'+h(community.name)+'</h1>',
        '<p>'+h(community.description||'Un lugar para compartir ideas y conversar.')+'</p>',
        '<p><small>Creada por @'+h(community.owner_username||'')+'</small></p>',
        '<nav aria-label="Participar en la comunidad">',
        '<a class="button" href="'+h(appLink)+'">Ver comunidad</a>',
        '<a class="button secondary" href="'+h(publicEntryHrefV188('community',community.id,'/comunidad/'+encodeURIComponent(community.id)))+'">Crear cuenta</a>',
        '<a class="button secondary" href="'+h(publicEntryHrefV188('community',community.id,'/comunidad/'+encodeURIComponent(community.id),'acceso'))+'">Entrar</a>',
        '</nav>',
        '<p><small>Para participar necesitas una cuenta. Solo se muestra información pública de la comunidad.</small></p>',
        '</article></main>',
        publicLegalFooterV197(),
        publicEntryBarV192('community',community.id,'/comunidad/'+encodeURIComponent(community.id)),
        '</body></html>'
      ].join('');
      res.setHeader('Cache-Control','public, max-age=60');
      return res.type('html').send(page);
    }catch(error){
      console.error('Public community page failed:',error?.message||error);
      return res.status(500).send('No se pudo cargar la comunidad.');
    }
  });
};
