import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// ── 公告列表（未过期，置顶优先） ──────────────────────
router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.id, a.title, a.content, a.is_pinned, a.created_at, a.updated_at,
              u.username AS author
       FROM announcements a LEFT JOIN users u ON u.id = a.created_by
       WHERE a.expires_at IS NULL OR a.expires_at > now()
       ORDER BY a.is_pinned DESC, a.created_at DESC
       LIMIT 50`
    );
    res.json({ announcements: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 公告详情 ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      `SELECT a.id, a.title, a.content, a.is_pinned, a.expires_at, a.created_at, a.updated_at,
              u.username AS author
       FROM announcements a LEFT JOIN users u ON u.id = a.created_by
       WHERE a.id = $1 AND (a.expires_at IS NULL OR a.expires_at > now())`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: '公告不存在' });
    res.json({ announcement: rows[0] });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
