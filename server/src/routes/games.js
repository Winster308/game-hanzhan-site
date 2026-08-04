import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth, getClientIp } from '../auth.js';
import { isBanned, recordVisit } from '../utils.js';
import { rateLimit } from '../ratelimit.js';
import { checkAchievements } from '../achievements.js';
const router = Router();

const SCORE_SQL = '(g.likes_count * 2 + g.favorites_count * 3 + g.comments_count * 4 + g.play_count)';

/** 评分聚合子查询 */
const RATING_SQL = `(SELECT ROUND(AVG(score)::numeric, 1)::float FROM ratings r WHERE r.game_id = g.id) AS rating_avg,
  (SELECT COUNT(*)::int FROM ratings r WHERE r.game_id = g.id) AS rating_count`;

/** 组装游戏查询（带当前用户点赞/收藏/评分状态） */
function gameSelect(userId) {
  return `
    SELECT g.*, ${SCORE_SQL} AS score, ${RATING_SQL},
      ${userId ? `EXISTS(SELECT 1 FROM likes l WHERE l.game_id = g.id AND l.user_id = ${userId}) AS is_liked,
      EXISTS(SELECT 1 FROM favorites f WHERE f.game_id = g.id AND f.user_id = ${userId}) AS is_favorited,
      (SELECT r.score FROM ratings r WHERE r.game_id = g.id AND r.user_id = ${userId}) AS my_rating` : 'FALSE AS is_liked, FALSE AS is_favorited, NULL AS my_rating'}
    FROM games g`;
}

// ── 列表（搜索 / 标签筛选 / 排序 / 分页） ─────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', tag = '', sort = 'latest' } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(60, Math.max(1, Number(req.query.pageSize) || 24));

    const where = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(g.title ILIKE $${params.length} OR g.description ILIKE $${params.length} OR array_to_string(g.tags, ' ') ILIKE $${params.length})`);
      // 记录搜索词（每 IP 每分钟最多记 1 次，防刷）
      const ip = getClientIp(req);
      const rl = rateLimit({ key: `search:${ip}`, limit: 1, windowMs: 60 * 1000 });
      if (rl.allowed) {
        query('INSERT INTO search_logs (keyword, ip) VALUES ($1, $2)', [String(search).slice(0, 50), ip]).catch(() => {});
      }
    }
    if (tag) {
      params.push(tag);
      where.push(`$${params.length} = ANY(g.tags)`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql =
      sort === 'popular' ? `ORDER BY score DESC, g.id DESC`
      : sort === 'most-played' ? `ORDER BY g.play_count DESC, g.id DESC`
      : `ORDER BY g.created_at DESC, g.id DESC`;

    const countRows = await query(`SELECT COUNT(*)::int AS total FROM games g ${whereSql}`, params);
    const rows = await query(
      `${gameSelect(req.user?.id)} ${whereSql} ${orderSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ games: rows, total: countRows[0].total, page, pageSize });
  } catch (err) {
    console.error('[games/list]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 全部标签 ──────────────────────────────────────────
router.get('/tags', async (req, res) => {
  try {
    const rows = await query('SELECT DISTINCT unnest(tags) AS tag FROM games ORDER BY tag');
    res.json({ tags: rows.map((r) => r.tag) });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 排行榜（按分数实时排序） ──────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const rows = await query(
      `${gameSelect(req.user?.id)} ORDER BY score DESC, g.id ASC LIMIT $1`,
      [limit]
    );
    res.json({ games: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 详情 ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: '参数错误' });
    const rows = await query(`${gameSelect(req.user?.id)} WHERE g.id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: '游戏不存在' });
    res.json({ game: rows[0] });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 点赞（切换） ──────────────────────────────────────
router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const game = await query('SELECT id FROM games WHERE id = $1', [id]);
    if (!game.length) return res.status(404).json({ error: '游戏不存在' });
    const ban = await isBanned(req.user.id);
    if (ban.banned) return res.status(403).json({ error: `账号已被封禁${ban.reason ? '：' + ban.reason : ''}` });

    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT 1 FROM likes WHERE user_id = $1 AND game_id = $2', [req.user.id, id]);
      let liked;
      if (existing.rows.length) {
        await client.query('DELETE FROM likes WHERE user_id = $1 AND game_id = $2', [req.user.id, id]);
        await client.query('UPDATE games SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1', [id]);
        liked = false;
      } else {
        await client.query('INSERT INTO likes (user_id, game_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
        await client.query('UPDATE games SET likes_count = likes_count + 1 WHERE id = $1', [id]);
        liked = true;
      }
      const updated = await client.query('SELECT likes_count FROM games WHERE id = $1', [id]);
      return { liked, likes_count: updated.rows[0].likes_count };
    });
    if (result.liked) checkAchievements(req.user.id).catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('[games/like]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 收藏（切换） ──────────────────────────────────────
router.post('/:id/favorite', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const game = await query('SELECT id FROM games WHERE id = $1', [id]);
    if (!game.length) return res.status(404).json({ error: '游戏不存在' });
    const ban = await isBanned(req.user.id);
    if (ban.banned) return res.status(403).json({ error: `账号已被封禁${ban.reason ? '：' + ban.reason : ''}` });

    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT 1 FROM favorites WHERE user_id = $1 AND game_id = $2', [req.user.id, id]);
      let favorited;
      if (existing.rows.length) {
        await client.query('DELETE FROM favorites WHERE user_id = $1 AND game_id = $2', [req.user.id, id]);
        await client.query('UPDATE games SET favorites_count = GREATEST(0, favorites_count - 1) WHERE id = $1', [id]);
        favorited = false;
      } else {
        await client.query('INSERT INTO favorites (user_id, game_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
        await client.query('UPDATE games SET favorites_count = favorites_count + 1 WHERE id = $1', [id]);
        favorited = true;
      }
      const updated = await client.query('SELECT favorites_count FROM games WHERE id = $1', [id]);
      return { favorited, favorites_count: updated.rows[0].favorites_count };
    });
    if (result.favorited) checkAchievements(req.user.id).catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('[games/favorite]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 游玩计数（点击"去玩"时上报） ──────────────────────
router.post('/:id/play', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('UPDATE games SET play_count = play_count + 1 WHERE id = $1 RETURNING play_count', [id]);
    if (!rows.length) return res.status(404).json({ error: '游戏不存在' });
    // 顺带记录访问 + 登录用户的游玩记录（成就用）
    recordVisit(getClientIp(req), req.user?.id || null);
    if (req.user) {
      query('INSERT INTO play_logs (user_id, game_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id])
        .then(() => checkAchievements(req.user.id))
        .catch(() => {});
    }
    res.json({ play_count: rows[0].play_count });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 评分（1-5 星，一人一评，可改可取消） ──────────────
router.post('/:id/rating', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const score = Number((req.body || {}).score);
    if (![1, 2, 3, 4, 5].includes(score)) return res.status(400).json({ error: '评分需为 1-5 星' });
    const game = await query('SELECT id FROM games WHERE id = $1', [id]);
    if (!game.length) return res.status(404).json({ error: '游戏不存在' });
    const ban = await isBanned(req.user.id);
    if (ban.banned) return res.status(403).json({ error: `账号已被封禁${ban.reason ? '：' + ban.reason : ''}` });

    await query(
      `INSERT INTO ratings (user_id, game_id, score) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, game_id) DO UPDATE SET score = $3, updated_at = now()`,
      [req.user.id, id, score]
    );
    const agg = await query(
      'SELECT ROUND(AVG(score)::numeric, 1)::float AS rating_avg, COUNT(*)::int AS rating_count FROM ratings WHERE game_id = $1',
      [id]
    );
    res.json({ my_rating: score, rating_avg: agg[0].rating_avg, rating_count: agg[0].rating_count });
  } catch (err) {
    console.error('[games/rating]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 取消评分 ──────────────────────────────────────────
router.delete('/:id/rating', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await query('DELETE FROM ratings WHERE user_id = $1 AND game_id = $2', [req.user.id, id]);
    const agg = await query(
      'SELECT ROUND(AVG(score)::numeric, 1)::float AS rating_avg, COUNT(*)::int AS rating_count FROM ratings WHERE game_id = $1',
      [id]
    );
    res.json({ my_rating: null, rating_avg: agg[0].rating_avg, rating_count: agg[0].rating_count });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 游戏更新日志（公开） ──────────────────────────────
router.get('/:id/updates', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      'SELECT id, version, content, created_at FROM game_updates WHERE game_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50',
      [id]
    );
    res.json({ updates: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
