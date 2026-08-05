import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { isBanned } from '../utils.js';
import { rateLimit } from '../ratelimit.js';
import { validateGameBody } from '../game-validation.js';

const router = Router();

// ── 提交游戏投稿（登录用户，每小时最多 3 次） ──────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const v = validateGameBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const ban = await isBanned(req.user.id);
    if (ban.banned) return res.status(403).json({ error: `账号已被封禁${ban.reason ? '：' + ban.reason : ''}` });

    const rl = rateLimit({ key: `submit:${req.user.id}`, limit: 3, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return res.status(429).json({ error: '投稿过于频繁，每小时最多 3 次' });

    const { title, description, tags, originalUrl, localizedUrl, coverType, coverUrl, coverData } = v.value;
    const rows = await query(
      `INSERT INTO game_submissions (user_id, title, description, tags, cover_type, cover_url, cover_data, original_url, localized_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, title, status, created_at`,
      [req.user.id, title, description, tags, coverType, coverUrl, coverData, originalUrl, localizedUrl]
    );
    res.status(201).json({ submission: rows[0], message: '投稿成功，等待管理员审核' });
  } catch (err) {
    console.error('[submissions/create]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 我的投稿（含审核状态） ────────────────────────────
router.get('/my', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, title, tags, status, reject_reason, game_id, created_at
       FROM game_submissions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ submissions: rows });
  } catch (err) {
    console.error('[submissions/my]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
