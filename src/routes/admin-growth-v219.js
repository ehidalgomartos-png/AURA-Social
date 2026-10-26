'use strict';
const express=require('express');
const {requireAdmin}=require('../middleware/auth');
const {ensureSignupAttributionSchema}=require('../services/signup-attribution-schema-v219');
const {GUIDES}=require('../public-guides-v218');

const DAY_OPTIONS=Object.freeze([7,30,90]);
const KNOWN_GUIDES=new Set(GUIDES.map(g=>g.slug));
const KNOWN_SOURCES=new Set(['profile','post','community','event','reel','topic','story','guide']);
const CACHE_MS=60000;

// Public social contributions still visible now; no private messages or likes.
function publicContributionWindowSql(day){
  if(day!==1&&day!==7)throw new RangeError('invalid contribution day');
  const next=day+1,p='public_post_d'+day,c='public_comment_d'+day,x='public_parent_d'+day;
  return [
    '(EXISTS(SELECT 1 FROM posts '+p,
    ' WHERE '+p+'.user_id=s.id',
    " AND "+p+".moderation_status='published'",
    " AND "+p+".audience='public' AND "+p+".content_level='normal'",
    " AND "+p+".post_kind='post'",
    " AND "+p+".created_at>=s.created_at+interval '"+day+" days'",
    " AND "+p+".created_at<s.created_at+interval '"+next+" days')",
    ' OR EXISTS(SELECT 1 FROM comments '+c,
    ' JOIN posts '+x+' ON '+x+'.id='+c+'.post_id',
    ' WHERE '+c+'.user_id=s.id AND '+x+'.user_id<>s.id',
    " AND "+x+".moderation_status='published'",
    " AND "+x+".audience='public' AND "+x+".content_level='normal'",
    " AND "+x+".post_kind='post'",
    " AND "+c+".created_at>=s.created_at+interval '"+day+" days'",
    " AND "+c+".created_at<s.created_at+interval '"+next+" days'))",
    ' AS public_contribution_d'+day
  ].join(' ');
}

// Read-only interaction summaries: no message bodies, IPs or user IDs leave the API.
const GROWTH_SQL=[
  "WITH signups AS (SELECT u.id,u.created_at,",
  "COALESCE(sa.source_type,'unattributed') AS source_type,",
  "CASE WHEN sa.source_type='guide' THEN sa.source_key ELSE NULL END AS guide_slug,",
  "to_char(timezone('Europe/Madrid',u.created_at),'YYYY-MM-DD') AS local_day",
  "FROM users u LEFT JOIN signup_attributions sa ON sa.user_id=u.id",
  "WHERE u.is_admin=FALSE AND u.created_at>=now()-($1::int*interval '1 day') AND u.created_at<=now())",
  "SELECT s.source_type,s.guide_slug,s.local_day,",
  "s.created_at<=now()-interval '7 days' AS eligible_week,",
  "s.created_at<=now()-interval '2 days' AS eligible_d1,",
  "s.created_at<=now()-interval '8 days' AS eligible_d7,",
  "COALESCE(events.first_week,FALSE) AS first_week,",
  "COALESCE(events.d1,FALSE) AS d1,COALESCE(events.d7,FALSE) AS d7,",
  // Current state of this signup cohort, not completion within its signup day.
  "EXISTS(SELECT 1 FROM users profile WHERE profile.id=s.id",
  " AND NULLIF(BTRIM(profile.bio),'') IS NOT NULL AND profile.avatar_url IS NOT NULL",
  " AND EXISTS(SELECT 1 FROM user_interests ui WHERE ui.user_id=profile.id)) AS profile_complete,",
  "EXISTS(SELECT 1 FROM posts first_post WHERE first_post.user_id=s.id",
  " AND first_post.moderation_status='published' AND first_post.post_kind='post') AS has_first_post,",
  // A genuine outward social action, never inferred from a session or impression.
  " (EXISTS(SELECT 1 FROM follows social_follow JOIN users followed",
  " ON followed.id=social_follow.following_id",
  " WHERE social_follow.follower_id=s.id AND followed.status='active')",
  " OR EXISTS(SELECT 1 FROM comments social_reply",
  " JOIN posts parent_post ON parent_post.id=social_reply.post_id",
  " WHERE social_reply.user_id=s.id AND parent_post.user_id<>s.id",
  " AND parent_post.moderation_status='published' AND parent_post.audience='public'))",
  " AS has_social_contact,",
  publicContributionWindowSql(1)+",",
  publicContributionWindowSql(7),
  "FROM signups s LEFT JOIN LATERAL (",
  "SELECT bool_or(a.at<s.created_at+interval '7 days') AS first_week,",
  "bool_or(a.at>=s.created_at+interval '1 day' AND a.at<s.created_at+interval '2 days') AS d1,",
  "bool_or(a.at>=s.created_at+interval '7 days' AND a.at<s.created_at+interval '8 days') AS d7",
  "FROM (",
  "SELECT created_at AS at FROM posts WHERE user_id=s.id AND created_at>=s.created_at AND created_at<s.created_at+interval '8 days'",
  "UNION ALL SELECT created_at AS at FROM comments WHERE user_id=s.id AND created_at>=s.created_at AND created_at<s.created_at+interval '8 days'",
  "UNION ALL SELECT created_at AS at FROM follows WHERE follower_id=s.id AND created_at>=s.created_at AND created_at<s.created_at+interval '8 days'",
  "UNION ALL SELECT created_at AS at FROM messages WHERE sender_id=s.id AND created_at>=s.created_at AND created_at<s.created_at+interval '8 days'",
  "UNION ALL SELECT created_at AS at FROM likes WHERE user_id=s.id AND created_at>=s.created_at AND created_at<s.created_at+interval '8 days'",
  ") a) events ON TRUE"
].join(' ');

function rate(numerator,denominator){
  return denominator?Math.round(1000*numerator/denominator)/10:null;
}
function emptyCounts(){
  return {signups:0,eligibleWeek:0,firstWeek:0,eligibleD1:0,activeD1:0,eligibleD7:0,activeD7:0,completedProfiles:0,firstPosts:0,socialContacts:0,publishAndConnect:0};
}
function addCounts(target,row){
  target.signups++;
  if(row.profile_complete===true)target.completedProfiles++;
  if(row.has_first_post===true)target.firstPosts++;
  if(row.has_social_contact===true)target.socialContacts++;
  if(row.has_first_post===true&&row.has_social_contact===true)target.publishAndConnect++;
  if(row.eligible_week===true){
    target.eligibleWeek++;
    if(row.first_week===true)target.firstWeek++;
  }
  if(row.eligible_d1===true){
    target.eligibleD1++;
    if(row.d1===true)target.activeD1++;
  }
  if(row.eligible_d7===true){
    target.eligibleD7++;
    if(row.d7===true)target.activeD7++;
  }
}
function displayCounts(x){
  return {...x,profileCompleteRatePct:rate(x.completedProfiles,x.signups),
    firstPostRatePct:rate(x.firstPosts,x.signups),
    socialContactRatePct:rate(x.socialContacts,x.signups),
    publishAndConnectRatePct:rate(x.publishAndConnect,x.signups),
    firstWeekRatePct:rate(x.firstWeek,x.eligibleWeek),
    d1RatePct:rate(x.activeD1,x.eligibleD1),
    d7RatePct:rate(x.activeD7,x.eligibleD7)};
}
function summarizeGrowth(rows,days){
  const totals=emptyCounts(),bySource=new Map(),byGuide=new Map(),byDay=new Map();
  let attributed=0;
  for(const row of rows){
    addCounts(totals,row);
    const source=KNOWN_SOURCES.has(row.source_type)?row.source_type:'unattributed';
    if(source!=='unattributed')attributed++;
    if(!bySource.has(source))bySource.set(source,emptyCounts());
    addCounts(bySource.get(source),row);
    if(source==='guide'&&KNOWN_GUIDES.has(row.guide_slug)){
      if(!byGuide.has(row.guide_slug))byGuide.set(row.guide_slug,emptyCounts());
      addCounts(byGuide.get(row.guide_slug),row);
    }
    const day=String(row.local_day||'');
    if(/^\d{4}-\d{2}-\d{2}$/.test(day))byDay.set(day,(byDay.get(day)||0)+1);
  }
  const sources=[...bySource].map(([source,counts])=>({source,...displayCounts(counts)}))
    .sort((a,b)=>b.signups-a.signups||a.source.localeCompare(b.source));
  const guides=GUIDES.map(g=>({slug:g.slug,title:g.title,...displayCounts(byGuide.get(g.slug)||emptyCounts())}));
  const daily=[...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([day,signups])=>({day,signups}));
  return {
    windowDays:days,
    totals:{...displayCounts(totals),attributedSignups:attributed,
      attributionRatePct:rate(attributed,totals.signups)},
    sources,guides,daily,
    definitions:{
      firstWeek:'Primera interacción dentro de los 7 días tras el registro; solo cuentas con al menos 7 días de antigüedad.',
      d1:'Actividad social entre 24 y 48 horas después del registro; solo cuentas con al menos 48 horas de antigüedad.',
      d7:'Actividad social entre 7 y 8 días después del registro; solo cuentas con al menos 8 días de antigüedad.',
      activity:'Publicación, comentario, seguimiento, reacción o mensaje enviado. No implica sesión ni lectura de mensajes.',
      attribution:'Sin atribución significa que no se registró una ruta de origen; no equivale necesariamente a tráfico directo.',
      profileComplete:'Porcentaje de cuentas registradas en el periodo que hoy tienen foto, presentación e intereses; no mide cuándo se completaron.',
      firstPost:'Porcentaje de cuentas registradas en el periodo que hoy conservan al menos una publicación ordinaria publicada; excluye Reels y publicaciones eliminadas.',
      socialContact:'Porcentaje de cuentas del periodo que siguen hoy a una persona activa o han comentado una publicación pública ajena. No implica amistad recíproca ni respuesta recibida.',
      publishAndConnect:'Porcentaje de cuentas del periodo que hoy conservan una publicación ordinaria publicada y además cumplen el criterio de seguimiento o comentario público ajeno. No es una secuencia temporal ni una conversión del mismo día.'
    },
    privacy:{adminOnly:true,individualUserData:false,externalTracking:false,retrospectiveAttribution:false}
  };
}

function createGrowthCenterRouter({db,now=()=>Date.now()}={}){
  if(!db?.query)throw new TypeError('database query required');
  const router=express.Router();
  const cache=new Map();
  router.use(requireAdmin);
  router.get('/growth-center',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const raw=String(req.query.days??'30');
    if(!['7','30','90'].includes(raw))return res.status(400).json({error:'invalid_growth_window'});
    const days=Number(raw);
    try{
      await ensureSignupAttributionSchema(db);
      const current=cache.get(days);
      if(current && now()-current.timestamp<CACHE_MS)return res.json(current.result);
      if(current?.promise)return res.json(await current.promise);
      const promise=db.query(GROWTH_SQL,[days]).then(r=>summarizeGrowth(r.rows,days));
      cache.set(days,{timestamp:0,promise});
      try{
        const result=await promise;
        cache.set(days,{timestamp:now(),result});
        return res.json(result);
      }catch(error){
        cache.delete(days);
        throw error;
      }
    }catch(_){
      return res.status(503).json({error:'growth_center_unavailable'});
    }
  });
  return router;
}
module.exports={createGrowthCenterRouter,summarizeGrowth,rate,GROWTH_SQL,DAY_OPTIONS};
