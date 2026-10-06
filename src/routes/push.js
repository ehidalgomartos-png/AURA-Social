const express=require('express');
const {z}=require('zod');
const db=require('../db');
const {requireAuth}=require('../middleware/auth');
const {ensurePushSchema,publicPushConfig}=require('../services/push');

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
  res.json({
    ...publicPushConfig(),
    subscriptionCount:Number(count.rows[0]?.n || 0)
  });
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
