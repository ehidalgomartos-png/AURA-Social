'use strict';
const express=require('express');
const {requireAdmin}=require('../middleware/auth');
const ALLOWED_TYPES=new Set(['all','post','reel','comment','story','registration']);
const ALLOWED_DAYS=new Set([1,7,30]);
const PAGE_SIZE=30;

// Private message contents, identities and conversation links are never returned.
const METRICS_SQL=`
SELECT
 (SELECT count(*)::int FROM users WHERE created_at >= now()-($1::int*interval '1 day')) AS registrations,
 (SELECT count(*)::int FROM posts WHERE post_kind='post' AND moderation_status='published'
    AND created_at >= now()-($1::int*interval '1 day')) AS posts,
 (SELECT count(*)::int FROM posts WHERE post_kind='reel' AND moderation_status='published'
    AND created_at >= now()-($1::int*interval '1 day')) AS reels,
 (SELECT count(*)::int FROM stories WHERE moderation_status='published'
    AND created_at >= now()-($1::int*interval '1 day')) AS stories,
 (SELECT count(*)::int FROM comments WHERE created_at >= now()-($1::int*interval '1 day')) AS comments,
 (SELECT count(*)::int FROM messages WHERE created_at >= now()-($1::int*interval '1 day')) AS messages,
 (SELECT count(DISTINCT conversation_id)::int FROM messages
    WHERE created_at >= now()-($1::int*interval '1 day')) AS conversations,
 (SELECT count(*)::int FROM follows WHERE created_at >= now()-($1::int*interval '1 day')) AS follows,
 (SELECT count(*)::int FROM likes WHERE created_at >= now()-($1::int*interval '1 day')) AS likes,
 (SELECT count(*)::int FROM reports WHERE created_at >= now()-($1::int*interval '1 day')) AS reports,
 (SELECT count(*)::int FROM reports WHERE status='open') AS open_reports,
 (SELECT count(*)::int FROM users WHERE status='active') AS active_members
`;

// V3.6.11 — cifras mínimas para la portada administrativa; ninguna identidad ni mensaje.
const OVERVIEW_SQL=`
SELECT
 (SELECT count(*)::int FROM users WHERE created_at >= now()-interval '7 days') AS registrations,
 (SELECT count(*)::int FROM posts WHERE post_kind='post' AND moderation_status='published'
    AND created_at >= now()-interval '7 days') AS posts,
 (SELECT count(*)::int FROM posts WHERE post_kind='reel' AND moderation_status='published'
    AND created_at >= now()-interval '7 days') AS reels,
 (SELECT count(*)::int FROM comments WHERE created_at >= now()-interval '7 days') AS comments,
 (SELECT count(*)::int FROM reports WHERE status='open') AS open_reports
`;

// Only public normal-content activity from publicly discoverable members who
// elected to show their activity. Private conversations/reports never appear.
const ACTIVITY_SQL=`
WITH visible_activity AS (
  SELECT CASE WHEN p.post_kind='reel' THEN 'reel' ELSE 'post' END::text AS kind,
    p.id AS event_id, p.created_at AS occurred_at,
    u.username AS actor_username, left(p.caption,180) AS excerpt,
    p.id AS post_id
    FROM posts p JOIN users u ON u.id=p.user_id
   WHERE p.created_at >= now()-($1::int*interval '1 day')
     AND p.post_kind IN ('post','reel')
     AND p.moderation_status='published' AND p.audience='public'
     AND p.content_level='normal'
     AND u.status='active' AND u.discoverable=true AND u.show_activity=true
  UNION ALL
  SELECT 'comment'::text,c.id,c.created_at,u.username,left(c.body,180),p.id
    FROM comments c JOIN posts p ON p.id=c.post_id
    JOIN users u ON u.id=c.user_id
    JOIN users author ON author.id=p.user_id
   WHERE c.created_at >= now()-($1::int*interval '1 day')
     AND p.moderation_status='published' AND p.audience='public'
     AND p.content_level='normal'
     AND u.status='active' AND u.discoverable=true AND u.show_activity=true
     AND author.status='active' AND author.discoverable=true
  UNION ALL
  SELECT 'story'::text,s.id,s.created_at,u.username,''::text,NULL::bigint
    FROM stories s JOIN users u ON u.id=s.user_id
   WHERE s.created_at >= now()-($1::int*interval '1 day')
     AND s.expires_at>now()
     AND s.moderation_status='published' AND s.audience='public'
     AND s.content_level='normal'
     AND u.status='active' AND u.discoverable=true AND u.show_activity=true
  UNION ALL
  SELECT 'registration'::text,u.id,u.created_at,u.username,''::text,NULL::bigint
    FROM users u
   WHERE u.created_at >= now()-($1::int*interval '1 day')
     AND u.status='active' AND u.discoverable=true AND u.show_activity=true
)
SELECT kind,event_id,occurred_at,actor_username,excerpt,post_id
  FROM visible_activity
 WHERE ($2::text='all' OR kind=$2::text)
 ORDER BY occurred_at DESC,event_id DESC,kind
 LIMIT 31 OFFSET $3::int
`;
function normalizedOptions(query={}){
 const days=Number(query.days??1),type=String(query.type??'all');
 const page=Number(query.page??0);
 if(!ALLOWED_DAYS.has(days)||!ALLOWED_TYPES.has(type)||!Number.isInteger(page)||page<0||page>20)
   return null;
 return {days,type,page};
}
function createAdminActivityRouter({db}){
 if(!db?.query)throw Error('db_required');
 const router=express.Router();
 router.use(requireAdmin);
 router.get('/summary-7d',async(_req,res)=>{
   try{
     const stats=await db.query(OVERVIEW_SQL);
     res.set('Cache-Control','no-store');
     res.set('X-Robots-Tag','noindex,nofollow');
     res.json({ok:true,days:7,updatedAt:new Date().toISOString(),metrics:stats.rows[0]||{}});
   }catch(error){
     console.error('Admin aggregate summary unavailable:',error.message);
     res.status(503).json({error:'summary_unavailable'});
   }
 });
 router.get('/',async(req,res)=>{
   const opts=normalizedOptions(req.query);
   if(!opts)return res.status(400).json({error:'invalid_filters'});
   try{
     const [stats,feed]=await Promise.all([
       db.query(METRICS_SQL,[opts.days]),
       db.query(ACTIVITY_SQL,[opts.days,opts.type,opts.page*PAGE_SIZE])
     ]);
     res.set('Cache-Control','no-store');
     res.json({
       ok:true,days:opts.days,type:opts.type,page:opts.page,
       updatedAt:new Date().toISOString(),
       metrics:stats.rows[0]||{},
       items:feed.rows.slice(0,PAGE_SIZE).map(row=>({
         kind:row.kind,eventId:String(row.event_id),
         occurredAt:row.occurred_at,
         username:String(row.actor_username||''),
         excerpt:String(row.excerpt||''),
         postId:row.post_id==null?null:String(row.post_id)
       })),
       hasMore:feed.rows.length>PAGE_SIZE
     });
   }catch(error){
     console.error('Admin activity summary unavailable:',error.message);
     res.status(503).json({error:'activity_unavailable'});
   }
 });
 return router;
}
module.exports={createAdminActivityRouter,normalizedOptions,METRICS_SQL,OVERVIEW_SQL,ACTIVITY_SQL,PAGE_SIZE};
