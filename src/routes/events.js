const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAuth}=require('../middleware/auth');

const router=express.Router();
let eventsV160Ready=null;
async function ensureEventsV160(){
  if(!eventsV160Ready){
    eventsV160Ready=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS social_events (
          id BIGSERIAL PRIMARY KEY,
          creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          community_id BIGINT REFERENCES communities(id) ON DELETE CASCADE,
          title VARCHAR(120) NOT NULL,
          description VARCHAR(2000) NOT NULL DEFAULT '',
          event_type TEXT NOT NULL DEFAULT 'in_person' CHECK(event_type IN ('in_person','online')),
          starts_at TIMESTAMPTZ NOT NULL,
          ends_at TIMESTAMPTZ,
          location_label VARCHAR(240),
          online_url TEXT,
          visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','connections','circles','community')),
          attendee_visibility TEXT NOT NULL DEFAULT 'responders' CHECK(attendee_visibility IN ('public','responders','private')),
          cancelled_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CHECK(ends_at IS NULL OR ends_at>starts_at)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_social_events_start ON social_events(cancelled_at,starts_at)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_social_events_creator ON social_events(creator_id,starts_at DESC)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_social_events_community ON social_events(community_id,starts_at)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS event_circle_audiences (
          event_id BIGINT NOT NULL REFERENCES social_events(id) ON DELETE CASCADE,
          circle_id BIGINT NOT NULL REFERENCES connection_circles(id) ON DELETE CASCADE,
          PRIMARY KEY(event_id,circle_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_event_circle_audiences_circle ON event_circle_audiences(circle_id,event_id)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS event_responses (
          event_id BIGINT NOT NULL REFERENCES social_events(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('interested','going')),
          reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(event_id,user_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_event_responses_user ON event_responses(user_id,status,updated_at DESC)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS event_reminders (
          event_id BIGINT NOT NULL REFERENCES social_events(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          remind_at TIMESTAMPTZ NOT NULL,
          sent_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(event_id,user_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_event_reminders_due ON event_reminders(sent_at,remind_at)');
      await db.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
      await db.query(`
        ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK(type IN (
          'follow','message','consent_request','consent_approved','consent_rejected','consent_revoked',
          'like','comment','mention','repost','creator_broadcast','creator_vip_broadcast',
          'creator_poll_vote','creator_question_response','event_reminder',
          'collaboration_request','collaboration_approved','collaboration_rejected','collaboration_revoked',
          'circle_mention','system'
        ))
      `);
    })().catch(error=>{eventsV160Ready=null;throw error;});
  }
  return eventsV160Ready;
}
router.use(requireAuth);
router.use(async(_req,res,next)=>{try{await ensureEventsV160();next();}catch(error){console.error('RedLibertad V1.60 events bootstrap failed:',error);res.status(500).json({error:'events_bootstrap_failed'});}});

function eventAccessWhere(viewerParam='$1',alias='e'){
  return `(
    ${alias}.creator_id=${viewerParam}
    OR ${alias}.visibility='public'
    OR (
      ${alias}.visibility='connections'
      AND EXISTS(SELECT 1 FROM follows a WHERE a.follower_id=${alias}.creator_id AND a.following_id=${viewerParam})
      AND EXISTS(SELECT 1 FROM follows b WHERE b.follower_id=${viewerParam} AND b.following_id=${alias}.creator_id)
    )
    OR (
      ${alias}.visibility='circles'
      AND EXISTS(
        SELECT 1 FROM event_circle_audiences eca
        JOIN connection_circles cc ON cc.id=eca.circle_id AND cc.user_id=${alias}.creator_id
        JOIN connection_circle_members ccm ON ccm.circle_id=cc.id AND ccm.connection_user_id=${viewerParam}
        WHERE eca.event_id=${alias}.id
      )
    )
    OR (
      ${alias}.visibility='community'
      AND ${alias}.community_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id=${alias}.community_id AND cm.user_id=${viewerParam})
    )
  )`;
}

async function eventRow(eventId,userId){
  const result=await db.query(`
    SELECT e.*,u.username,u.display_name,u.avatar_url,u.creator_verified,
      er.status AS my_response,COALESCE(er.reminder_enabled,false) AS reminder_enabled,
      (SELECT count(*)::int FROM event_responses x WHERE x.event_id=e.id AND x.status='interested') AS interested_count,
      (SELECT count(*)::int FROM event_responses x WHERE x.event_id=e.id AND x.status='going') AS going_count,
      c.name AS community_name
    FROM social_events e
    JOIN users u ON u.id=e.creator_id
    LEFT JOIN event_responses er ON er.event_id=e.id AND er.user_id=$1
    LEFT JOIN communities c ON c.id=e.community_id
    WHERE e.id=$2 AND u.status='active'
      AND ${eventAccessWhere('$1','e')}
      AND NOT EXISTS(
        SELECT 1 FROM blocks b
         WHERE (b.blocker_id=$1 AND b.blocked_id=e.creator_id)
            OR (b.blocker_id=e.creator_id AND b.blocked_id=$1)
      )
    LIMIT 1
  `,[userId,eventId]);
  return result.rows[0]||null;
}

function reminderAt(startsAt){
  const start=new Date(startsAt).getTime(),now=Date.now();
  if(!Number.isFinite(start)||start<=now)return null;
  const day=start-24*60*60*1000,hour=start-60*60*1000;
  return day>now ? new Date(day) : hour>now ? new Date(hour) : null;
}
async function syncReminder(eventId,userId,enabled,startsAt){
  await db.query('DELETE FROM event_reminders WHERE event_id=$1 AND user_id=$2',[eventId,userId]);
  if(!enabled)return;
  const at=reminderAt(startsAt);
  if(at)await db.query('INSERT INTO event_reminders(event_id,user_id,remind_at) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET remind_at=EXCLUDED.remind_at,sent_at=NULL',[eventId,userId,at.toISOString()]);
}

const eventSchema=z.object({
  title:z.string().trim().min(2).max(120),
  description:z.string().trim().max(2000).optional().default(''),
  eventType:z.enum(['in_person','online']),
  startsAt:z.string().datetime({offset:true}),
  endsAt:z.string().datetime({offset:true}).optional().nullable(),
  locationLabel:z.string().trim().max(240).optional().default(''),
  onlineUrl:z.string().trim().url().max(4096).optional().or(z.literal('')).default(''),
  visibility:z.enum(['public','connections','circles','community']).default('public'),
  attendeeVisibility:z.enum(['public','responders','private']).default('responders'),
  circleIds:z.array(z.coerce.number().int().positive()).max(12).optional().default([]),
  communityId:z.coerce.number().int().positive().optional().nullable()
});
async function validateAudience(userId,data){
  const start=new Date(data.startsAt);
  const end=data.endsAt?new Date(data.endsAt):null;
  if(!Number.isFinite(start.getTime())||start.getTime()<=Date.now()+5*60*1000)return {error:'invalid_start'};
  if(end && (!Number.isFinite(end.getTime())||end<=start))return {error:'invalid_end'};
  if(data.eventType==='in_person'&&!data.locationLabel)return {error:'location_required'};
  if(data.eventType==='online'&&!data.onlineUrl)return {error:'online_url_required'};
  let circleIds=[];
  if(data.visibility==='circles'){
    const ids=[...new Set(data.circleIds.map(Number))];
    if(!ids.length)return {error:'circle_audience_required'};
    const found=await db.query('SELECT id FROM connection_circles WHERE user_id=$1 AND id=ANY($2::bigint[])',[userId,ids]);
    circleIds=found.rows.map(x=>Number(x.id));
    if(circleIds.length!==ids.length)return {error:'invalid_circle_audience'};
  }
  let communityId=null;
  if(data.visibility==='community'){
    communityId=Number(data.communityId);
    if(!communityId)return {error:'community_required'};
    const member=await db.query("SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2 AND role IN ('owner','admin') LIMIT 1",[communityId,userId]);
    if(!member.rowCount)return {error:'community_admin_required'};
  }
  return {start,end,circleIds,communityId};
}

router.get('/',async(req,res)=>{
  const scope=['upcoming','going','interested','mine'].includes(String(req.query.scope||''))?String(req.query.scope):'upcoming';
  const result=await db.query(`
    SELECT e.*,u.username,u.display_name,u.avatar_url,u.creator_verified,c.name AS community_name,
      er.status AS my_response,COALESCE(er.reminder_enabled,false) AS reminder_enabled,
      (SELECT count(*)::int FROM event_responses x WHERE x.event_id=e.id AND x.status='interested') AS interested_count,
      (SELECT count(*)::int FROM event_responses x WHERE x.event_id=e.id AND x.status='going') AS going_count
    FROM social_events e
    JOIN users u ON u.id=e.creator_id
    LEFT JOIN communities c ON c.id=e.community_id
    LEFT JOIN event_responses er ON er.event_id=e.id AND er.user_id=$1
    WHERE u.status='active'
      AND e.cancelled_at IS NULL
      AND e.starts_at>now()-interval '2 hours'
      AND ${eventAccessWhere('$1','e')}
      AND NOT EXISTS(
        SELECT 1 FROM blocks b
         WHERE (b.blocker_id=$1 AND b.blocked_id=e.creator_id)
            OR (b.blocker_id=e.creator_id AND b.blocked_id=$1)
      )
      AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=$1 AND m.muted_id=e.creator_id)
      AND (
        $2='upcoming'
        OR ($2='mine' AND e.creator_id=$1)
        OR ($2='going' AND er.status='going')
        OR ($2='interested' AND er.status='interested')
      )
    ORDER BY e.starts_at ASC,e.id ASC
    LIMIT 100
  `,[req.user.id,scope]);
  res.json({events:result.rows,scope});
});

router.get('/:id',async(req,res)=>{
  const event=await eventRow(req.params.id,req.user.id);
  if(!event)return res.status(404).json({error:'event_not_found'});
  const viewerCanSeePeople=String(event.creator_id)===String(req.user.id)||event.attendee_visibility==='public'||(event.attendee_visibility==='responders'&&!!event.my_response);
  const attendees=viewerCanSeePeople?await db.query(`
    SELECT u.id,u.username,u.display_name,u.avatar_url,u.creator_verified,r.status
    FROM event_responses r JOIN users u ON u.id=r.user_id
    WHERE r.event_id=$1 AND u.status='active'
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$2))
    ORDER BY CASE r.status WHEN 'going' THEN 0 ELSE 1 END,r.updated_at DESC
    LIMIT 100
  `,[event.id,req.user.id]):{rows:[]};
  res.json({event,attendees:attendees.rows,attendees_visible:viewerCanSeePeople});
});

router.post('/',async(req,res)=>{
  const parsed=eventSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:'invalid_event'});
  const data=parsed.data,valid=await validateAudience(req.user.id,data); if(valid.error)return res.status(400).json({error:valid.error});
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const created=await client.query(`
      INSERT INTO social_events(creator_id,community_id,title,description,event_type,starts_at,ends_at,location_label,online_url,visibility,attendee_visibility)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `,[req.user.id,valid.communityId,data.title,data.description,data.eventType,valid.start.toISOString(),valid.end?.toISOString()||null,data.locationLabel||null,data.onlineUrl||null,data.visibility,data.attendeeVisibility]);
    for(const circleId of valid.circleIds)await client.query('INSERT INTO event_circle_audiences(event_id,circle_id) VALUES($1,$2)',[created.rows[0].id,circleId]);
    await client.query('COMMIT');
    res.status(201).json({ok:true,event:created.rows[0]});
  }catch(error){await client.query('ROLLBACK');console.error('RedLibertad event create failed:',error);res.status(500).json({error:'event_create_failed'});}finally{client.release();}
});

const responseSchema=z.object({status:z.enum(['interested','going']),reminderEnabled:z.boolean().optional().default(true)});
router.post('/:id/respond',async(req,res)=>{
  const parsed=responseSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'invalid_response'});
  const event=await eventRow(req.params.id,req.user.id);if(!event||event.cancelled_at)return res.status(404).json({error:'event_not_found'});
  await db.query(`
    INSERT INTO event_responses(event_id,user_id,status,reminder_enabled)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(event_id,user_id) DO UPDATE SET status=EXCLUDED.status,reminder_enabled=EXCLUDED.reminder_enabled,updated_at=now()
  `,[event.id,req.user.id,parsed.data.status,parsed.data.reminderEnabled]);
  await syncReminder(event.id,req.user.id,parsed.data.reminderEnabled,event.starts_at);
  res.json({ok:true,status:parsed.data.status,reminderEnabled:parsed.data.reminderEnabled});
});
router.delete('/:id/respond',async(req,res)=>{
  const event=await eventRow(req.params.id,req.user.id);if(!event)return res.status(404).json({error:'event_not_found'});
  await db.query('DELETE FROM event_responses WHERE event_id=$1 AND user_id=$2',[event.id,req.user.id]);
  await db.query('DELETE FROM event_reminders WHERE event_id=$1 AND user_id=$2',[event.id,req.user.id]);
  res.json({ok:true});
});

router.delete('/:id',async(req,res)=>{
  const event=await eventRow(req.params.id,req.user.id);if(!event)return res.status(404).json({error:'event_not_found'});
  if(String(event.creator_id)!==String(req.user.id))return res.status(403).json({error:'event_owner_required'});
  await db.query('UPDATE social_events SET cancelled_at=now(),updated_at=now() WHERE id=$1',[event.id]);
  await db.query('DELETE FROM event_reminders WHERE event_id=$1',[event.id]);
  res.json({ok:true});
});

let reminderTimer=null,reminderRunning=false;
async function runReminderSweep(){
  if(reminderRunning)return;reminderRunning=true;
  try{
    await ensureEventsV160();
    const due=await db.query(`
      SELECT r.event_id,r.user_id,e.title,e.starts_at
      FROM event_reminders r JOIN social_events e ON e.id=r.event_id
      WHERE r.sent_at IS NULL AND r.remind_at<=now() AND e.cancelled_at IS NULL AND e.starts_at>now()
      ORDER BY r.remind_at ASC LIMIT 100
    `);
    for(const row of due.rows){
      const inserted=await db.query(`
        INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)
        SELECT $1,NULL,'event_reminder','event',$2,$3
        WHERE NOT EXISTS(
          SELECT 1 FROM notifications WHERE user_id=$1 AND type='event_reminder' AND entity_type='event' AND entity_id=$2
        )
        RETURNING id
      `,[row.user_id,row.event_id,`Recordatorio: “${row.title}” empieza pronto.`]);
      await db.query('UPDATE event_reminders SET sent_at=now() WHERE event_id=$1 AND user_id=$2',[row.event_id,row.user_id]);
    }
  }catch(error){console.error('RedLibertad event reminder sweep failed:',error);}finally{reminderRunning=false;}
}
router.startReminderWorker=async function(){
  await ensureEventsV160();
  if(reminderTimer)return;
  await runReminderSweep();
  reminderTimer=setInterval(runReminderSweep,60*1000);
  reminderTimer.unref?.();
};
module.exports=router;
