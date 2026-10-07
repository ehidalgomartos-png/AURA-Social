const express=require('express');
const db=require('../db');
const { requireAdmin }=require('../middleware/auth');

const router=express.Router();

async function recordAction(client,{userId,adminId,action,reason=''}) {
  await client.query(`
    INSERT INTO user_moderation_actions (user_id,admin_id,action,duration_label,reason)
    VALUES ($1,$2,$3,'',$4)
  `,[userId,adminId,action,String(reason||'').trim()]);
}

async function notify(client,userId,entityId,text) {
  await client.query(`
    INSERT INTO notifications (user_id,actor_id,type,entity_type,entity_id,text)
    VALUES ($1,NULL,'system','verification',$2,$3)
  `,[userId,entityId||userId,text]);
}

router.post('/verifications/:id/decision',requireAdmin,async(req,res)=>{
  const decision=String(req.body?.decision||'');
  const note=String(req.body?.note||'').trim().slice(0,1000);
  if(!['approve','reject'].includes(decision)){
    return res.status(400).json({error:'invalid_verification_decision'});
  }

  const request=await db.query(`
    SELECT vr.*,u.age_verified,u.creator_verified
      FROM verification_requests vr
      JOIN users u ON u.id=vr.user_id
     WHERE vr.id=$1
     LIMIT 1
  `,[req.params.id]);
  if(!request.rowCount)return res.status(404).json({error:'verification_request_not_found'});

  const item=request.rows[0];
  if(item.status!=='pending')return res.status(409).json({error:'verification_request_not_pending'});

  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');

    await client.query(`
      UPDATE verification_requests
         SET status=$2,review_note=$3,admin_id=$4,reviewed_at=now()
       WHERE id=$1
    `,[
      item.id,
      decision==='approve'?'approved':'rejected',
      note,
      req.user.id
    ]);

    if(decision==='approve'){
      if(item.type==='age'){
        await client.query('UPDATE users SET age_verified=true,updated_at=now() WHERE id=$1',[item.user_id]);
        if(!item.age_verified){
          await client.query(`
            INSERT INTO age_verifications (user_id,provider,result,created_at,verified_at)
            VALUES ($1,'manual','verified',now(),now())
          `,[item.user_id]);
        }
      }else if(item.type==='creator'){
        await client.query('UPDATE users SET creator_verified=true,updated_at=now() WHERE id=$1',[item.user_id]);
        if(!item.creator_verified){
          await client.query(`
            INSERT INTO creator_verifications (user_id,provider,result,created_at,verified_at)
            VALUES ($1,'manual','verified',now(),now())
          `,[item.user_id]);
        }
      }
    }

    await recordAction(client,{
      userId:item.user_id,
      adminId:req.user.id,
      action:decision==='approve'?('verify_'+item.type+'_request'):('reject_'+item.type+'_request'),
      reason:note
    });

    await notify(
      client,
      item.user_id,
      item.id,
      decision==='approve'
        ? (item.type==='age'?'Tu verificación +18 ha sido aprobada.':'Tu verificación de creador ha sido aprobada.')
        : (item.type==='age'?'Tu solicitud de verificación +18 ha sido revisada y no se ha aprobado.':'Tu solicitud de verificación de creador ha sido revisada y no se ha aprobado.')
    );

    await client.query('COMMIT');
    res.json({ok:true,status:decision==='approve'?'approved':'rejected',type:item.type});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad V1.89.1 verification decision failed:',error);
    res.status(500).json({error:'verification_decision_failed'});
  }finally{
    client.release();
  }
});

async function setVerification(req,res,type,value){
  const column=type==='age'?'age_verified':'creator_verified';
  const table=type==='age'?'age_verifications':'creator_verifications';
  const label=type==='age'?'+18':'creador';

  const target=await db.query(`SELECT id,${column} current_value FROM users WHERE id=$1 LIMIT 1`,[req.params.id]);
  if(!target.rowCount)return res.status(404).json({error:'user_not_found'});

  const current=Boolean(target.rows[0].current_value);
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');

    await client.query(`UPDATE users SET ${column}=$2,updated_at=now() WHERE id=$1`,[req.params.id,value]);

    if(value){
      await client.query(`
        UPDATE verification_requests
           SET status='approved',review_note='Aprobada desde la ficha de usuario.',admin_id=$2,reviewed_at=now()
         WHERE user_id=$1 AND type=$3 AND status='pending'
      `,[req.params.id,req.user.id,type]);

      if(!current){
        await client.query(`
          INSERT INTO ${table} (user_id,provider,result,created_at,verified_at)
          VALUES ($1,'manual','verified',now(),now())
        `,[req.params.id]);
      }
    }

    if(current!==value){
      await recordAction(client,{
        userId:req.params.id,
        adminId:req.user.id,
        action:value?('verify_'+type):('revoke_'+type+'_verification')
      });
      await notify(
        client,
        req.params.id,
        req.params.id,
        value
          ? ('Tu cuenta ha sido verificada como '+label+'.')
          : ('Tu verificación '+label+' ha sido retirada por administración.')
      );
    }

    await client.query('COMMIT');
    res.json({
      ok:true,
      ageVerified:type==='age'?value:undefined,
      creatorVerified:type==='creator'?value:undefined
    });
  }catch(error){
    await client.query('ROLLBACK');
    console.error('RedLibertad V1.89.1 verification update failed:',error);
    res.status(500).json({error:'verification_update_failed'});
  }finally{
    client.release();
  }
}

router.post('/users/:id/verify-age',requireAdmin,(req,res)=>setVerification(req,res,'age',true));
router.post('/users/:id/verify-creator',requireAdmin,(req,res)=>setVerification(req,res,'creator',true));
router.post('/users/:id/revoke-age',requireAdmin,(req,res)=>setVerification(req,res,'age',false));
router.post('/users/:id/revoke-creator',requireAdmin,(req,res)=>setVerification(req,res,'creator',false));

module.exports=router;
