import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../auth.js';
import { isBanned } from '../utils.js';
import { config } from '../config.js';
import { notify } from '../notify.js';
import { checkAchievements } from '../achievements.js';

const router = Router();

// ── 游戏评论列表（顶层评论 + 楼中楼回复） ──────────────
router.get('/games/:id/comments', async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const page = Math.floor(Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)));
    if (!Number.isInteger(page) || page < 1) return res.status(400).json({ error: '参数错误' });
    const rows = await query(
      `SELECT c.id, c.game_id, c.parent_id, c.content, c.is_deleted, c.edited_at, c.created_at,
              u.id AS user_id, u.username
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.game_id = $1 AND c.parent_id IS NULL
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $2 OFFSET $3`,
      [gameId, pageSize, (page - 1) * pageSize]
    );
    const total = await query(
      'SELECT COUNT(*)::int AS total FROM comments WHERE game_id = $1 AND parent_id IS NULL',
      [gameId]
    );

    // 取本页顶层评论的全部回复（一层楼中楼，不嵌套）
    let replies = [];
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      replies = await query(
        `SELECT c.id, c.game_id, c.parent_id, c.content, c.is_deleted, c.edited_at, c.created_at,
                u.id AS user_id, u.username
         FROM comments c JOIN users u ON u.id = c.user_id
         WHERE c.parent_id = ANY($1::bigint[])
         ORDER BY c.created_at ASC, c.id ASC`,
        [ids]
      );
    }
    const replyMap = new Map();
    for (const r of replies) {
      if (!replyMap.has(r.parent_id)) replyMap.set(r.parent_id, []);
      replyMap.get(r.parent_id).push(r);
    }
    const comments = rows.map((r) => ({ ...r, replies: replyMap.get(r.id) || [] }));

    res.json({ comments, total: total[0].total, page, pageSize });
  } catch (err) {
    console.error('[comments/list]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 发表评论 / 回复 ───────────────────────────────────
router.post('/games/:id/comments', requireAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { content: raw, parent_id: parentIdRaw } = req.body || {};
    const content = String(raw || '').trim();
    const parentId = parentIdRaw ? Number(parentIdRaw) : null;

    const game = await query('SELECT id FROM games WHERE id = $1', [gameId]);
    if (!game.length) return res.status(404).json({ error: '游戏不存在' });

    if (content.length < config.commentMinLen) {
      return res.status(400).json({ error: `评论不能少于 ${config.commentMinLen} 个字` });
    }
    if (content.length > config.commentMaxLen) {
      return res.status(400).json({ error: `评论不能超过 ${config.commentMaxLen} 个字` });
    }

    // 回复时校验父评论存在且属于该游戏
    let parentComment = null;
    if (parentId) {
      const p = await query(
        'SELECT id, user_id, game_id FROM comments WHERE id = $1 AND is_deleted = FALSE',
        [parentId]
      );
      if (!p.length) return res.status(404).json({ error: '要回复的评论不存在' });
      if (Number(p[0].game_id) !== Number(gameId)) return res.status(400).json({ error: '评论不属于该游戏' });
      parentComment = p[0];
    }

    const ban = await isBanned(req.user.id);
    if (ban.banned) return res.status(403).json({ error: `账号已被封禁${ban.reason ? '：' + ban.reason : ''}` });

    // 限流：每分钟最多 5 条（管理员豁免）
    if (req.user.role !== 'admin') {
      const recent = await query(
        `SELECT COUNT(*)::int AS cnt FROM comments WHERE user_id = $1 AND created_at > now() - interval '1 minute'`,
        [req.user.id]
      );
      if (recent[0].cnt >= config.commentLimitPerMinute) {
        return res.status(429).json({ error: `评论过于频繁，每分钟最多 ${config.commentLimitPerMinute} 条` });
      }
    }

    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO comments (game_id, user_id, content, parent_id) VALUES ($1,$2,$3,$4)
         RETURNING id, content, parent_id, created_at`,
        [gameId, req.user.id, content, parentId]
      );
      // 仅顶层评论计入计数
      if (!parentId) {
        await client.query('UPDATE games SET comments_count = comments_count + 1 WHERE id = $1', [gameId]);
      }
      return r.rows[0];
    });

    // 回复通知被回复者（不通知自己）
    if (parentComment && parentComment.user_id !== req.user.id) {
      notify(
        parentComment.user_id,
        'comment_reply',
        `${req.user.username} 回复了你的评论`,
        content.slice(0, 80),
        `/games/${gameId}`
      );
    }

    // 成就检查（不阻塞主流程）
    checkAchievements(req.user.id).catch(() => {});

    res.status(201).json({
      comment: {
        ...result, username: req.user.username, is_deleted: false, edited_at: null, replies: [],
      },
    });
  } catch (err) {
    console.error('[comments/create]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 编辑自己的评论 ────────────────────────────────────
router.put('/comments/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const content = String((req.body || {}).content || '').trim();
    if (content.length < config.commentMinLen) {
      return res.status(400).json({ error: `评论不能少于 ${config.commentMinLen} 个字` });
    }
    if (content.length > config.commentMaxLen) {
      return res.status(400).json({ error: `评论不能超过 ${config.commentMaxLen} 个字` });
    }
    const rows = await query('SELECT * FROM comments WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (!rows.length) return res.status(404).json({ error: '评论不存在' });
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '只能编辑自己的评论' });
    }
    await query('UPDATE comments SET content = $1, edited_at = now() WHERE id = $2', [content, id]);
    res.json({ ok: true, message: '评论已更新' });
  } catch (err) {
    console.error('[comments/update]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 删除自己的评论（软删除；顶层评论删除时其回复一并隐藏） ──
router.delete('/comments/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('SELECT * FROM comments WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (!rows.length) return res.status(404).json({ error: '评论不存在' });
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '只能删除自己的评论' });
    }
    await withTransaction(async (client) => {
      await client.query('UPDATE comments SET is_deleted = TRUE, deleted_by = $1 WHERE id = $2 OR parent_id = $2',
        [req.user.role === 'admin' ? 'admin' : 'user', id]);
      if (!rows[0].parent_id) {
        await client.query('UPDATE games SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1', [rows[0].game_id]);
      }
    });
    res.json({ ok: true, message: '评论已删除' });
  } catch (err) {
    console.error('[comments/delete]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
