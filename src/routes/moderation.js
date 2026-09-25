const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const reportSchema = z.object({
  targetType: z.enum(['post', 'user', 'comment', 'message']),
  targetId: z.coerce.number().int().positive(),
  reason: z.enum([
    'minor',
    'non_consensual_intimate_content',
    'impersonation',
    'harassment',
    'threats',
    'spam',
    'copyright',
    'sexual_services',
    'prohibited_explicit_content',
    'other_illegal'
  ]),
  details: z.string().max(2000).optional().default('')
});

router.post('/report', requireAuth, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_report', details: parsed.error.flatten() });
  }

  const d = parsed.data;
  const priority = ['minor', 'non_consensual_intimate_content'].includes(d.reason)
    ? 'critical'
    : 'normal';

  const result = await db.query(`
    INSERT INTO reports (reporter_id,target_type,target_id,reason,details,priority)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id,status,priority,created_at
  `, [req.user.id, d.targetType, d.targetId, d.reason, d.details, priority]);

  res.status(201).json({ ok: true, report: result.rows[0] });
});

module.exports = router;
