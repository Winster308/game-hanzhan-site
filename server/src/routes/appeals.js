import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { isBanned } from '../utils.js';
import { notify } from '../notify.js';

const router = Router();

// ── 提交申诉（需处于封禁状态，且无待处理申诉） ─────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const reason = String((req.body || {}).reason || '').trim();
    if (reason.length < 10 || reason.length > 2000) {
      return res.status(400).json({ error: '申诉内容需为 10-2000 字' });
    }
    const ban = await isBanned(req.user.id);
    if (!ban.banned) return res.status(400).json({ error: '当前账号未被封禁，无需申诉' });

    const dup = await query(
      "SELECT id FROM ban_appeals WHERE user_id = $1 AND status = 'pending'",
      [req.user.id]
    );
    if (dup.length) return res.status(400).json({ error: '您已提交申诉，请等待管理员处理' });

    const rows = await query(
      `INSERT INTO ban_appeals (user_id, reason) VALUES ($1,$2) RETURNING id, reason, status, created_at`,
      [req.user.id, reason]
    );
    res.status(201).json({ appeal: rows[0], message: '申诉已提交，请耐心等待处理' });
  } catch (err) {
    console.error('[appeals/create]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 我的申诉记录 ──────────────────────────────────────
router.get('/my', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, reason, status, reply, created_at, handled_at
       FROM ban_appeals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ appeals: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
