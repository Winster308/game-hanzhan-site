import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// ── 我的通知（分页） ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
    const rows = await query(
      `SELECT id, type, title, content, link, is_read, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, pageSize, (page - 1) * pageSize]
    );
    const total = await query('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1', [req.user.id]);
    res.json({ notifications: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 未读数 ────────────────────────────────────────────
router.get('/unread-count', async (req, res) => {
  try {
    const rows = await query(
      'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ count: rows[0].c });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 全部已读 ──────────────────────────────────────────
router.post('/read-all', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
