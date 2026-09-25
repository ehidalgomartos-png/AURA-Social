const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const result = await db.query(`
    SELECT n.id,n.type,n.entity_type,n.entity_id,n.text,n.read_at,n.created_at,
           u.id AS actor_id,u.username AS actor_username,u.display_name AS actor_display_name,u.avatar_url AS actor_avatar_url
      FROM notifications n
      LEFT JOIN users u ON u.id=n.actor_id
     WHERE n.user_id=$1
     ORDER BY n.created_at DESC
     LIMIT 100
  `, [req.user.id]);
  const count = await db.query(`SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [req.user.id]);
  res.json({ notifications: result.rows, unread: count.rows[0].n });
});

router.post('/read-all', async (req, res) => {
  await db.query(`UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1`, [req.user.id]);
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  await db.query(`UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
