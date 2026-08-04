import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

/** 我的评论 */
router.get('/comments', async (req, res) => {
  try {
    const rows = await query(
      `SELECT c.id, c.game_id, c.content, c.is_deleted, c.edited_at, c.created_at,
              g.title AS game_title
       FROM comments c JOIN games g ON g.id = c.game_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ comments: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 我收藏的游戏 */
router.get('/favorites', async (req, res) => {
  try {
    const rows = await query(
      `SELECT g.* FROM favorites f JOIN games g ON g.id = f.game_id
       WHERE f.user_id = $1 ORDER BY f.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ games: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 我点赞的游戏 */
router.get('/likes', async (req, res) => {
  try {
    const rows = await query(
      `SELECT g.* FROM likes l JOIN games g ON g.id = l.game_id
       WHERE l.user_id = $1 ORDER BY l.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ games: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
