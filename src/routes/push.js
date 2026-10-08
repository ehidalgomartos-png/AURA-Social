const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAuth}=require('../middleware/auth');
const {ensurePushSchema,publicPushConfig}=require('../services/push');
const {normalizePushPreferences}=require('../services/push-preferences');

const router=express.Router();
router.use(requireAuth);
router.use(async(_req,res,next)=>{
  try{
    await ensurePushSchema();
    next();
  }catch(error){
    console.error('RedLibertad push bootstrap failed:',error);
    res.status(500).json({error:'push_bootstrap_failed'});
  }
});

router.get('/config',async(req,res)=>{
  const count=await db.query(
    'SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1 AND enabled=true',
    [req.user.id]
  );
  const settings=await db.query(
    'SELECT messages,mentions,interactions,community,consents,system FROM push_preferences WHERE user_id=$1',
    [req.user.id]
  );
  res.json({
    ...publicPushConfig(),
    subscriptionCount:Number(count.rows[0]?.n || 0),
    preferences:normalizePushPreferences(settings.rows[0])
  });
});

// Preferences affect Web Push delivery only; in-app records remain unchanged.
const preferencesSchema=z.object({
  messages:z.boolean(), mentions:z.boolean(), interactions:z.boolean(),
  community:z.boolean(), consents:z.boolean(), system:z.boolean()
}).strict();

router.put('/preferences',async(req,res)=>{
  const parsed=preferencesSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_push_preferences'});
  const p=parsed.data;
  await db.query(`
    INSERT INTO push_preferences(user_id,messages,mentions,interactions,community,consents,system,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,now())
    ON CONFLICT(user_id) DO UPDATE SET
      messages=excluded.messages, mentions=excluded.mentions,
      interactions=excluded.interactions, community=excluded.community,
      consents=excluded.consents, system=excluded.system, updated_at=now()
  `,[req.user.id,p.messages,p.mentions,p.interactions,p.community,p.consents,p.system]);
  res.json({ok:true,preferences:normalizePushPreferences(p)});
});
const subscriptionSchema=z.object({
  endpoint:z.string().url().max(4096),
  keys:z.object({
    p256dh:z.string().min(20).max(2048),
    auth:z.string().min(8).max(512)
  }),
  userAgent:z.string().max(500).optional().default('')
});

router.post('/subscribe',async(req,res)=>{
  const parsed=subscriptionSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_push_subscription'});
  const config=publicPushConfig();
  if(!config.enabled)return res.status(503).json({error:'push_not_configured'});

  const data=parsed.data;
  await db.query(`
    INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,user_agent,enabled,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,true,now(),now())
    ON CONFLICT(endpoint) DO UPDATE
      SET user_id=excluded.user_id,
          p256dh=excluded.p256dh,
          auth=excluded.auth,
          user_agent=excluded.user_agent,
          enabled=true,
          updated_at=now()
  `,[req.user.id,data.endpoint,data.keys.p256dh,data.keys.auth,data.userAgent]);

  res.json({ok:true});
});

const unsubscribeSchema=z.object({endpoint:z.string().url().max(4096)});
router.delete('/subscribe',async(req,res)=>{
  const parsed=unsubscribeSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'invalid_push_subscription'});
  await db.query(
    'DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',
    [req.user.id,parsed.data.endpoint]
  );
  res.json({ok:true});
});

module.exports=router;
