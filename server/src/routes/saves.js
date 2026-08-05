import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { isBanned } from '../utils.js';
import { config } from '../config.js';
import { checkAchievements } from '../achievements.js';

const router = Router();

// ── 某游戏的已审核存档（公开，存档银行已并入每个游戏详情页） ──
router.get('/games/:id/saves', async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const page = Math.floor(Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(req.query.pageSize) || 15)));
    if (!Number.isInteger(page) || page < 1) return res.status(400).json({ error: '参数错误' });
    const rows = await query(
      `SELECT s.id, s.game_id, s.title, s.filename, s.download_count, s.created_at,
              u.username AS uploader
       FROM saves s JOIN users u ON u.id = s.user_id
       WHERE s.game_id = $1 AND s.status = 'approved'
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [gameId, pageSize, (page - 1) * pageSize]
    );
    const total = await query(
      "SELECT COUNT(*)::int AS total FROM saves WHERE game_id = $1 AND status = 'approved'",
      [gameId]
    );
    res.json({ saves: rows, total: total[0].total, page, pageSize });
  } catch (err) {
    console.error('[saves/list]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 上传存档（每个游戏均内置存档银行） ─────────────────
router.post('/games/:id/saves', requireAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { title, content, filename } = req.body || {};

    const games = await query('SELECT id FROM games WHERE id = $1', [gameId]);
    if (!games.length) return res.status(404).json({ error: '游戏不存在' });

    const t = String(title || '').trim();
    const c = String(content || '');
    if (t.length < 1 || t.length > 120) return res.status(400).json({ error: '存档标题需为 1-120 字' });
    if (!c.length) return res.status(400).json({ error: '存档内容不能为空' });
    if (c.length > config.saveMaxChars) return res.status(400).json({ error: `存档内容不能超过 ${config.saveMaxChars} 字` });
    if (Buffer.byteLength(c, 'utf8') > config.saveMaxBytes) return res.status(400).json({ error: '存档大小不能超过 2MB' });

    const ban = await isBanned(req.user.id);
    if (ban.banned) return res.status(403).json({ error: `账号已被封禁${ban.reason ? '：' + ban.reason : ''}` });

    const rows = await query(
      `INSERT INTO saves (game_id, user_id, title, content, filename)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, title, filename, status, created_at`,
      [gameId, req.user.id, t, c, filename ? String(filename).slice(0, 120) : null]
    );
    checkAchievements(req.user.id).catch(() => {});
    res.status(201).json({ save: rows[0], message: '存档已提交，等待管理员审核' });
  } catch (err) {
    console.error('[saves/create]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 查看/下载存档内容（公开，仅已审核） ───────────────
router.get('/saves/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      `SELECT s.id, s.game_id, s.title, s.content, s.filename, s.download_count, s.created_at,
              u.username AS uploader
       FROM saves s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.status = 'approved'`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: '存档不存在' });
    await query('UPDATE saves SET download_count = download_count + 1 WHERE id = $1', [id]);
    res.json({ save: { ...rows[0], download_count: rows[0].download_count + 1 } });
  } catch (err) {
    console.error('[saves/get]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 我的存档（含审核状态） ────────────────────────────
router.get('/my/saves', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT s.id, s.game_id, g.title AS game_title, s.title, s.filename, s.status,
              s.reject_reason, s.download_count, s.created_at
       FROM saves s JOIN games g ON g.id = s.game_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json({ saves: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
