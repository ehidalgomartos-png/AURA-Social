const express=require('express');
const db=require('../db');
const { requireAdmin }=require('../middleware/auth');
const { GUIDES }=require('../public-guides-v218');

const router=express.Router();
router.use(requireAdmin);

const INTERESTS=['Arte','Fotografía','Naturismo','Moda','Fitness','Viajes','Música','Lifestyle','Belleza','Creatividad','Tecnología','Bienestar'];
const slug=v=>String(v||'tema').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'tema';

function hashtagCount(rows){
  const map=new Map();
  const rx=/#([\p{L}\p{N}_]{2,40})/gu;
  for(const row of rows){
    for(const m of String(row.caption||'').matchAll(rx)){
      const tag=m[1].normalize('NFC').toLowerCase();
      map.set(tag,(map.get(tag)||0)+1);
    }
  }
  return [...map.values()].filter(n=>n>=2).length;
}

router.get('/seo-health',async(_req,res)=>{
  try{
    const [
      profilesR,
      postsR,
      reelsR,
      communitiesR,
      eventsR,
      hashtagRowsR,
      topicCountsR,
      sensitivePublicR,
      privateAudienceR,
      hiddenAuthorPostsR,
      adminEventsR
    ]=await Promise.all([
      db.query(`
        SELECT count(*)::int n
        FROM users
        WHERE status='active' AND is_admin=false AND discoverable=true
      `),
      db.query(`
        SELECT count(*)::int n
        FROM posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published'
          AND p.audience='public'
          AND p.content_level='normal'
          AND p.post_kind<>'reel'
          AND u.status='active'
          AND u.is_admin=false
          AND u.discoverable=true
      `),
      db.query(`
        SELECT count(*)::int n
        FROM posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published'
          AND p.audience='public'
          AND p.content_level='normal'
          AND p.post_kind='reel'
          AND p.media_type='video'
          AND p.media_url IS NOT NULL
          AND p.media_url<>''
          AND u.status='active'
          AND u.is_admin=false
          AND u.discoverable=true
      `),
      db.query(`
        SELECT count(*)::int n
        FROM communities c
        JOIN users owner ON owner.id=c.owner_id
        WHERE c.privacy='public'
          AND owner.status='active'
          AND owner.is_admin=false
          AND owner.discoverable=true
      `),
      db.query(`
        SELECT count(*)::int n
        FROM social_events e
        JOIN users creator ON creator.id=e.creator_id
        WHERE e.visibility='public'
          AND e.cancelled_at IS NULL
          AND e.starts_at>=now()-interval '2 hours'
          AND creator.status='active'
          AND creator.is_admin=false
          AND creator.discoverable=true
          AND (
            e.community_id IS NULL
            OR EXISTS(
              SELECT 1
              FROM communities pc
              JOIN users pc_owner ON pc_owner.id=pc.owner_id
              WHERE pc.id=e.community_id
                AND pc.privacy='public'
                AND pc_owner.status='active'
                AND pc_owner.is_admin=false
                AND pc_owner.discoverable=true
            )
          )
      `),
      db.query(`
        SELECT p.caption
        FROM posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published'
          AND p.audience='public'
          AND p.content_level='normal'
          AND u.status='active'
          AND u.is_admin=false
          AND u.discoverable=true
          AND p.caption IS NOT NULL
          AND p.caption LIKE '%#%'
        ORDER BY p.created_at DESC
        LIMIT 5000
      `),
      db.query(`
        SELECT t.topic,
          (SELECT count(*)::int
             FROM user_interests ui JOIN users u ON u.id=ui.user_id
            WHERE lower(ui.interest)=lower(t.topic)
              AND u.status='active' AND u.is_admin=false AND u.discoverable=true) people,
          (SELECT count(*)::int
             FROM community_interests ci
             JOIN communities c ON c.id=ci.community_id
             JOIN users owner ON owner.id=c.owner_id
            WHERE lower(ci.interest)=lower(t.topic)
              AND c.privacy='public'
              AND owner.status='active' AND owner.is_admin=false AND owner.discoverable=true) communities,
          (SELECT count(*)::int
             FROM posts p JOIN users u ON u.id=p.user_id
            WHERE p.moderation_status='published'
              AND p.audience='public'
              AND p.content_level='normal'
              AND u.status='active'
              AND u.is_admin=false
              AND u.discoverable=true
              AND (
                lower(p.caption) LIKE '%#'||lower(t.topic)||'%'
                OR lower(p.caption) LIKE '%#'||t.topic_slug||'%'
              )) posts
        FROM unnest($1::text[],$2::text[]) AS t(topic,topic_slug)
      `,[INTERESTS,INTERESTS.map(slug)]),
      db.query(`
        SELECT count(*)::int n
        FROM posts
        WHERE moderation_status='published'
          AND audience='public'
          AND content_level<>'normal'
      `),
      db.query(`
        SELECT count(*)::int n
        FROM posts
        WHERE moderation_status='published'
          AND audience<>'public'
      `),
      db.query(`
        SELECT count(*)::int n
        FROM posts p
        JOIN users u ON u.id=p.user_id
        WHERE p.moderation_status='published'
          AND p.audience='public'
          AND p.content_level='normal'
          AND u.status='active'
          AND (u.is_admin=true OR u.discoverable=false)
      `),
      db.query(`
        SELECT count(*)::int n
        FROM social_events e
        JOIN users creator ON creator.id=e.creator_id
        WHERE e.visibility='public'
          AND e.cancelled_at IS NULL
          AND e.starts_at>=now()-interval '2 hours'
          AND creator.status='active'
          AND creator.is_admin=true
      `)
    ]);

    const counts={
      profiles:Number(profilesR.rows[0]?.n||0),
      posts:Number(postsR.rows[0]?.n||0),
      reels:Number(reelsR.rows[0]?.n||0),
      communities:Number(communitiesR.rows[0]?.n||0),
      events:Number(eventsR.rows[0]?.n||0),
      hashtags:hashtagCount(hashtagRowsR.rows),
      guides:GUIDES.length+1,
      topics:topicCountsR.rows.filter(row=>
        Number(row.people||0)+Number(row.communities||0)+Number(row.posts||0)>=2
      ).length
    };

    const staticIndexable=10;
    const totalIndexable=staticIndexable+Object.values(counts).reduce((sum,n)=>sum+Number(n||0),0);

    const sitemaps=[
      {path:'/sitemap.xml',label:'Principal',count:staticIndexable+counts.posts},
      {path:'/sitemap-profiles.xml',label:'Perfiles',count:counts.profiles},
      {path:'/sitemap-hashtags.xml',label:'Hashtags',count:counts.hashtags},
      {path:'/sitemap-communities.xml',label:'Comunidades',count:counts.communities},
      {path:'/sitemap-events.xml',label:'Eventos',count:counts.events},
      {path:'/sitemap-reels.xml',label:'Reels',count:counts.reels},
      {path:'/sitemap-topics.xml',label:'Temas',count:counts.topics},
      {path:'/sitemap-guias.xml',label:'Guías',count:counts.guides}
    ].map(item=>({...item,status:item.count>0?'ok':'empty'}));

    const warnings=[];
    if(!counts.profiles)warnings.push({level:'warning',code:'no_profiles',text:'No hay perfiles públicos indexables.'});
    if(!counts.posts)warnings.push({level:'warning',code:'no_posts',text:'No hay publicaciones normales indexables en el sitemap principal.'});
    if(!counts.reels)warnings.push({level:'info',code:'no_reels',text:'Todavía no hay Reels públicos indexables.'});
    if(!counts.communities)warnings.push({level:'info',code:'no_communities',text:'Todavía no hay comunidades públicas indexables.'});
    if(!counts.events)warnings.push({level:'info',code:'no_events',text:'No hay eventos públicos próximos indexables.'});
    if(!counts.hashtags)warnings.push({level:'info',code:'no_hashtags',text:'Aún no hay hashtags con al menos 2 publicaciones elegibles.'});
    if(!counts.topics)warnings.push({level:'info',code:'no_topics',text:'Aún no hay temas con suficiente contenido para indexar.'});

    res.json({
      ok:true,
      generatedAt:new Date().toISOString(),
      totalIndexable,
      staticIndexable,
      counts,
      sitemaps,
      crawl:{
        sitemapIndex:'/sitemap-index.xml',
        robots:'/robots.txt',
        storiesIndexed:false,
        searchQueriesIndexed:false,
        reelCanonical:'/reel/:id/:slug',
        legacyReelPostRedirect301:true,
        mainSitemapExcludesReels:true,
        adminEventsExcluded:true
      },
      protected:{
        sensitivePublic:Number(sensitivePublicR.rows[0]?.n||0),
        privateAudience:Number(privateAudienceR.rows[0]?.n||0),
        hiddenAuthorPosts:Number(hiddenAuthorPostsR.rows[0]?.n||0),
        adminEventsSuppressed:Number(adminEventsR.rows[0]?.n||0)
      },
      warnings,
      searchConsole:{
        recommendedSitemap:'/sitemap-index.xml',
        note:'Los datos de indexación real de Google se consultan en Search Console; este panel mide la preparación interna de RedLibertad.'
      }
    });
  }catch(error){
    console.error('RedLibertad V1.90 SEO health failed:',error);
    res.status(500).json({error:'seo_health_failed'});
  }
});

module.exports=router;
