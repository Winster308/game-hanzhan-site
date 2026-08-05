import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAdmin } from '../auth.js';
import { audit } from '../utils.js';
import { config } from '../config.js';
import { notify, notifyAll } from '../notify.js';
import { checkAchievements } from '../achievements.js';
import { validateGameBody } from '../game-validation.js';

const router = Router();
router.use(requireAdmin);

/** 通用分页参数 */
function pagination(req, defaultSize = 20) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// ══════════════ 仪表盘统计 ══════════════
router.get('/stats', async (req, res) => {
  try {
    const [
      todayVisitors,
      todayVisits,
      yesterdayVisitors,
      todayRegistrations,
      todayComments,
      totals,
      pendingReports,
      pendingSaves,
      pendingSubmissions,
    ] = await Promise.all([
      query("SELECT COUNT(DISTINCT ip)::int AS c FROM visit_logs WHERE created_at::date = CURRENT_DATE"),
      query("SELECT COUNT(*)::int AS c FROM visit_logs WHERE created_at::date = CURRENT_DATE"),
      query("SELECT COUNT(DISTINCT ip)::int AS c FROM visit_logs WHERE created_at::date = CURRENT_DATE - 1"),
      query("SELECT COUNT(*)::int AS c FROM users WHERE created_at::date = CURRENT_DATE"),
      query("SELECT COUNT(*)::int AS c FROM comments WHERE created_at::date = CURRENT_DATE"),
      query("SELECT (SELECT COUNT(*)::int FROM games) AS games, (SELECT COUNT(*)::int FROM users) AS users, (SELECT COUNT(*)::int FROM comments) AS comments, (SELECT COUNT(*)::int FROM saves) AS saves, (SELECT COUNT(*)::int FROM announcements) AS announcements"),
      query("SELECT COUNT(*)::int AS c FROM reports WHERE status = 'pending'"),
      query("SELECT COUNT(*)::int AS c FROM saves WHERE status = 'pending'"),
      query("SELECT COUNT(*)::int AS c FROM game_submissions WHERE status = 'pending'"),
    ]);

    // 最近 7 天每日独立访客
    const week = await query(
      `SELECT to_char(d, 'MM-DD') AS date, COUNT(DISTINCT ip)::int AS visitors
       FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') d
       LEFT JOIN visit_logs v ON v.created_at::date = d
       GROUP BY d ORDER BY d`
    );

    // 实时在线：最近 15 分钟去重 IP
    const online = await query(
      "SELECT COUNT(DISTINCT ip)::int AS c FROM visit_logs WHERE created_at > now() - interval '15 minutes'"
    );

    // 今日每小时访问量
    const hourly = await query(
      `SELECT extract(hour FROM created_at)::int AS hour, COUNT(*)::int AS visits
       FROM visit_logs WHERE created_at::date = CURRENT_DATE
       GROUP BY hour ORDER BY hour`
    );

    // 地区分布（来自异步 IP 归属增强）
    const regions = await query(
      `SELECT COALESCE(country, '未知') AS country, COUNT(DISTINCT ip)::int AS visitors
       FROM visit_logs WHERE created_at::date = CURRENT_DATE
       GROUP BY country ORDER BY visitors DESC LIMIT 10`
    );

    // 热门搜索词（近 7 天）
    const hotSearches = await query(
      `SELECT keyword, COUNT(*)::int AS cnt FROM search_logs
       WHERE created_at > now() - interval '7 days'
       GROUP BY keyword ORDER BY cnt DESC LIMIT 10`
    );

    // 来源页 Top（近 7 天）
    const referers = await query(
      `SELECT COALESCE(NULLIF(referer, ''), '直接访问') AS ref, COUNT(*)::int AS cnt
       FROM visit_logs WHERE created_at > now() - interval '7 days'
       GROUP BY ref ORDER BY cnt DESC LIMIT 8`
    );

    // TOP10 游戏
    const topGames = await query(
      `SELECT id, title, play_count, likes_count, favorites_count, comments_count,
              (likes_count*2 + favorites_count*3 + comments_count*4 + play_count) AS score
       FROM games ORDER BY score DESC LIMIT 10`
    );

    res.json({
      today_visitors: todayVisitors[0].c,
      today_visits: todayVisits[0].c,
      yesterday_visitors: yesterdayVisitors[0].c,
      today_registrations: todayRegistrations[0].c,
      today_comments: todayComments[0].c,
      totals: totals[0],
      pending_reports: pendingReports[0].c,
      pending_saves: pendingSaves[0].c,
      pending_submissions: pendingSubmissions[0].c,
      online_now: online[0].c,
      week,
      hourly,
      regions,
      hot_searches: hotSearches,
      referers,
      top_games: topGames,
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 游戏管理 ══════════════
router.get('/games', async (req, res) => {
  try {
    const { page, pageSize, offset } = pagination(req);
    const search = String(req.query.search || '').trim();
    const params = [];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE (title ILIKE $1 OR array_to_string(tags, ' ') ILIKE $1)`;
    }
    const rows = await query(
      `SELECT id, title, description, tags, cover_type, cover_url,
              original_url, localized_url,
              play_count, likes_count, favorites_count, comments_count, created_at,
              (likes_count*2 + favorites_count*3 + comments_count*4 + play_count) AS score
       FROM games ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const total = await query(`SELECT COUNT(*)::int AS c FROM games ${where}`, params);
    res.json({ games: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/games', async (req, res) => {
  try {
    const v = validateGameBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const { title, description, tags, originalUrl, localizedUrl, coverType, coverUrl, coverData } = v.value;
    const rows = await query(
      `INSERT INTO games (title, description, tags, cover_type, cover_url, cover_data, original_url, localized_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [title, description, tags, coverType, coverUrl, coverData, originalUrl, localizedUrl]
    );
    await audit(req.user.id, 'game.create', 'game', rows[0].id, { title });
    res.status(201).json({ id: rows[0].id, message: '游戏已添加' });
  } catch (err) {
    console.error('[admin/games/create]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/games/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const v = validateGameBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const { title, description, tags, originalUrl, localizedUrl, coverType, coverUrl, coverData } = v.value;
    const rows = await query(
      `UPDATE games SET title=$1, description=$2, tags=$3, cover_type=$4, cover_url=$5, cover_data=$6,
       original_url=$7, localized_url=$8, updated_at=now()
       WHERE id=$9 RETURNING id`,
      [title, description, tags, coverType, coverUrl, coverData, originalUrl, localizedUrl, id]
    );
    if (!rows.length) return res.status(404).json({ error: '游戏不存在' });
    await audit(req.user.id, 'game.update', 'game', id, { title });
    res.json({ ok: true, message: '游戏已更新' });
  } catch (err) {
    console.error('[admin/games/update]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/games/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('DELETE FROM games WHERE id = $1 RETURNING title', [id]);
    if (!rows.length) return res.status(404).json({ error: '游戏不存在' });
    await audit(req.user.id, 'game.delete', 'game', id, { title: rows[0].title });
    res.json({ ok: true, message: '游戏已删除' });
  } catch (err) {
    console.error('[admin/games/delete]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 评论管理 ══════════════
router.get('/comments', async (req, res) => {
  try {
    const { page, pageSize, offset } = pagination(req);
    const search = String(req.query.search || '').trim();
    const gameId = Number(req.query.game_id) || null;
    const params = [];
    const conds = [];
    if (search) {
      params.push(`%${search}%`);
      conds.push(`c.content ILIKE $${params.length}`);
    }
    if (gameId) {
      params.push(gameId);
      conds.push(`c.game_id = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query(
      `SELECT c.id, c.game_id, g.title AS game_title, c.content, c.is_deleted,
              c.edited_at, c.created_at, u.id AS user_id, u.username
       FROM comments c
       JOIN games g ON g.id = c.game_id
       JOIN users u ON u.id = c.user_id
       ${where} ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const total = await query(`SELECT COUNT(*)::int AS c FROM comments c ${where}`, params);
    res.json({ comments: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 管理员修改任意评论 */
router.put('/comments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const content = String((req.body || {}).content || '').trim();
    if (content.length < config.commentMinLen || content.length > config.commentMaxLen) {
      return res.status(400).json({ error: `评论长度需为 ${config.commentMinLen}-${config.commentMaxLen} 字` });
    }
    const rows = await query(
      `UPDATE comments SET content = $1, edited_at = now(), is_deleted = FALSE WHERE id = $2 RETURNING game_id`,
      [content, id]
    );
    if (!rows.length) return res.status(404).json({ error: '评论不存在' });
    await audit(req.user.id, 'comment.update', 'comment', id, {});
    res.json({ ok: true, message: '评论已修改' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 管理员删除任意评论 */
router.delete('/comments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('SELECT * FROM comments WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (!rows.length) return res.status(404).json({ error: '评论不存在或已删除' });
    await withTransaction(async (client) => {
      await client.query('UPDATE comments SET is_deleted = TRUE, deleted_by = $1 WHERE id = $2', ['admin', id]);
      await client.query('UPDATE games SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1', [rows[0].game_id]);
    });
    await audit(req.user.id, 'comment.delete', 'comment', id, { game_id: rows[0].game_id });
    res.json({ ok: true, message: '评论已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 用户管理 ══════════════
router.get('/users', async (req, res) => {
  try {
    const { page, pageSize, offset } = pagination(req, 20);
    const search = String(req.query.search || '').trim();
    const params = [];
    let where = '';
    if (search) {
      params.push(`%${search}%`);
      where = 'WHERE username ILIKE $1 OR email ILIKE $1';
    }
    const rows = await query(
      `SELECT id, username, email, role, email_verified, banned_until, ban_reason, theme,
              created_at, updated_at
       FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const total = await query(`SELECT COUNT(*)::int AS c FROM users ${where}`, params);
    res.json({ users: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 封禁用户：body { hours: number|null, reason, permanent: boolean } */
router.put('/users/:id/ban', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { hours, reason, permanent } = req.body || {};
    const target = await query('SELECT id, username, role FROM users WHERE id = $1', [id]);
    if (!target.length) return res.status(404).json({ error: '用户不存在' });
    if (target[0].role === 'admin' && target[0].id !== req.user.id) {
      return res.status(403).json({ error: '不能封禁其他管理员' });
    }
    const r = String(reason || '').trim();
    if (!r || r.length > 200) return res.status(400).json({ error: '请填写封禁原因（200 字内）' });

    let bannedUntil;
    if (permanent) {
      bannedUntil = 'infinity';
    } else {
      const h = Number(hours);
      if (!Number.isFinite(h) || h <= 0) return res.status(400).json({ error: '封禁时长不合法' });
      if (h > 365 * 24) return res.status(400).json({ error: '封禁时长不能超过 1 年，永久封禁请勾选永久' });
      bannedUntil = new Date(Date.now() + h * 3600 * 1000);
    }
    await query(
      'UPDATE users SET banned_until = $1, ban_reason = $2 WHERE id = $3',
      [bannedUntil, r, id]
    );
    await audit(req.user.id, 'user.ban', 'user', id, { username: target[0].username, banned_until: String(bannedUntil), reason: r });
    notify(
      id,
      'user_banned',
      '账号已被封禁',
      `原因：${r}${permanent ? '（永久封禁）' : `（${hours} 小时）`}。如有异议可提交申诉。`,
      '/appeals'
    );
    res.json({ ok: true, message: `用户 ${target[0].username} 已封禁` });
  } catch (err) {
    console.error('[admin/users/ban]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 解封 */
router.put('/users/:id/unban', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = $1 RETURNING username', [id]);
    if (!rows.length) return res.status(404).json({ error: '用户不存在' });
    await audit(req.user.id, 'user.unban', 'user', id, { username: rows[0].username });
    notify(id, 'user_unbanned', '账号已解封', '您的账号已解封，欢迎回来！', '/');
    res.json({ ok: true, message: '已解封' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 删除用户（管理员不可删，含审计引用清理；关联数据由外键级联删除） */
router.delete('/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const target = await query('SELECT id, username, role FROM users WHERE id = $1', [id]);
    if (!target.length) return res.status(404).json({ error: '用户不存在' });
    if (target[0].role === 'admin') return res.status(403).json({ error: '不能删除管理员账号' });
    await withTransaction(async (client) => {
      // audit_logs.admin_id 无级联，先置空避免外键冲突
      await client.query('UPDATE audit_logs SET admin_id = NULL WHERE admin_id = $1', [id]);
      await client.query('DELETE FROM users WHERE id = $1', [id]);
    });
    await audit(req.user.id, 'user.delete', 'user', id, { username: target[0].username });
    res.json({ ok: true, message: `用户 ${target[0].username} 已删除` });
  } catch (err) {
    console.error('[admin/users/delete]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 调整角色（授予/撤销管理员） */
router.put('/users/:id/role', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body || {};
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: '角色不合法' });
    const target = await query('SELECT id, username FROM users WHERE id = $1', [id]);
    if (!target.length) return res.status(404).json({ error: '用户不存在' });
    await query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    await audit(req.user.id, 'user.role', 'user', id, { username: target[0].username, role });
    res.json({ ok: true, message: '角色已更新' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 举报审核 ══════════════
router.get('/reports', async (req, res) => {
  try {
    const { page, pageSize, offset } = pagination(req);
    const status = String(req.query.status || 'pending');
    const conds = [];
    const params = [];
    if (['pending', 'approved', 'rejected'].includes(status)) {
      params.push(status);
      conds.push(`r.status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.detail, r.status, r.action_note,
              r.created_at, r.handled_at,
              ru.username AS reporter,
              cu.username AS comment_author, c.content AS comment_content, c.is_deleted AS comment_deleted,
              gu.username AS target_username, g.title AS game_title
       FROM reports r
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
       LEFT JOIN users cu ON cu.id = c.user_id
       LEFT JOIN users gu ON r.target_type = 'user' AND gu.id = r.target_id
       LEFT JOIN games g ON r.target_type = 'game' AND g.id = r.target_id
       ${where} ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const total = await query(`SELECT COUNT(*)::int AS c FROM reports r ${where}`, params);
    res.json({ reports: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    console.error('[admin/reports]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * 审核举报：
 * { action: 'approve' | 'reject', ban_hours?: number, permanent?: boolean, reason?: string, note?: string, delete_comment?: boolean }
 * approve 时：若举报对象是评论/用户，按封禁时长封禁目标用户；可选删除被举报评论。
 */
router.put('/reports/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { action, ban_hours, permanent, reason, note, delete_comment } = req.body || {};
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '操作不合法' });
    const rows = await query('SELECT * FROM reports WHERE id = $1 AND status = $2', [id, 'pending']);
    if (!rows.length) return res.status(404).json({ error: '举报不存在或已处理' });
    const report = rows[0];

    const done = await withTransaction(async (client) => {
      if (action === 'reject') {
        await client.query(
          'UPDATE reports SET status = $1, handled_by = $2, handled_at = now(), action_note = $3 WHERE id = $4',
          ['rejected', req.user.id, String(note || '').slice(0, 500), id]
        );
        return { message: '已驳回举报' };
      }

      // approve：确定被处理的目标用户
      let targetUserId = null;
      let targetName = null;
      if (report.target_type === 'comment') {
        const c = await client.query('SELECT user_id, game_id FROM comments WHERE id = $1', [report.target_id]);
        if (c.rows.length) {
          targetUserId = c.rows[0].user_id;
          const u = await client.query('SELECT username FROM users WHERE id = $1', [targetUserId]);
          targetName = u.rows[0]?.username;
          if (delete_comment) {
            await client.query('UPDATE comments SET is_deleted = TRUE, deleted_by = $1 WHERE id = $2', ['admin-report', report.target_id]);
            await client.query('UPDATE games SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1', [c.rows[0].game_id]);
          }
        }
      } else if (report.target_type === 'user') {
        targetUserId = report.target_id;
        const u = await client.query('SELECT username FROM users WHERE id = $1', [targetUserId]);
        targetName = u.rows[0]?.username;
      }

      const banReason = String(reason || '').trim() || `违规内容被举报（${report.reason}）`;
      if (targetUserId && targetUserId !== req.user.id) {
        const t = await client.query('SELECT role FROM users WHERE id = $1', [targetUserId]);
        if (t.rows[0]?.role === 'admin') {
          return { error: '不能封禁管理员，请手动处理' };
        }
        const banUntil = permanent ? 'infinity'
          : new Date(Date.now() + Math.min(Number(ban_hours) || 24, 365 * 24) * 3600 * 1000);
        await client.query(
          'UPDATE users SET banned_until = $1, ban_reason = $2 WHERE id = $3',
          [banUntil, banReason, targetUserId]
        );
        await client.query(
          `INSERT INTO audit_logs (admin_id, action, target_type, target_id, detail)
           VALUES ($1, 'user.ban', 'user', $2, $3)`,
          [req.user.id, targetUserId, JSON.stringify({ username: targetName, banned_until: String(banUntil), reason: banReason, via_report: report.id })]
        );
      }
      await client.query(
        'UPDATE reports SET status = $1, handled_by = $2, handled_at = now(), action_note = $3 WHERE id = $4',
        ['approved', req.user.id, String(note || '').slice(0, 500), id]
      );
      await client.query(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, detail)
         VALUES ($1, 'report.approve', 'report', $2, $3)`,
        [req.user.id, id, JSON.stringify({ reason: report.reason, target_type: report.target_type, target_id: report.target_id, target_username: targetName })]
      );
      return { message: '已确认举报并执行处理' };
    });

    if (done.error) return res.status(403).json({ error: done.error });
    // 通知举报人处理结果
    notify(
      report.reporter_id,
      'report_handled',
      '您的举报已处理',
      `举报（${report.reason}）${action === 'approve' ? '已确认，感谢您的监督！' : '经核查未构成违规。'}${note ? ` 备注：${note}` : ''}`,
      '/profile?tab=reports'
    );
    if (action === 'approve') {
      // 举报被采纳成就（可能触发 report_adopted）
      checkAchievements(report.reporter_id).catch(() => {});
    }
    res.json({ ok: true, message: done.message });
  } catch (err) {
    console.error('[admin/reports/handle]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 存档审核 ══════════════
router.get('/saves', async (req, res) => {
  try {
    const { page, pageSize, offset } = pagination(req);
    const status = String(req.query.status || 'pending');
    const conds = [];
    const params = [];
    if (['pending', 'approved', 'rejected'].includes(status)) {
      params.push(status);
      conds.push(`s.status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query(
      `SELECT s.id, s.game_id, g.title AS game_title, s.title, s.filename,
              LEFT(s.content, 200) AS content_preview, s.status, s.reject_reason,
              s.download_count, s.created_at, u.username AS uploader
       FROM saves s
       JOIN games g ON g.id = s.game_id
       JOIN users u ON u.id = s.user_id
       ${where} ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const total = await query(`SELECT COUNT(*)::int AS c FROM saves s ${where}`, params);
    res.json({ saves: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 查看存档完整内容（审核用） */
router.get('/saves/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      `SELECT s.*, g.title AS game_title, u.username AS uploader FROM saves s
       JOIN games g ON g.id = s.game_id JOIN users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: '存档不存在' });
    res.json({ save: rows[0] });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 审核存档 { action: 'approve' | 'reject', reason? } */
router.put('/saves/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { action, reason } = req.body || {};
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '操作不合法' });
    const rows = await query('SELECT id FROM saves WHERE id = $1 AND status = $2', [id, 'pending']);
    if (!rows.length) return res.status(404).json({ error: '存档不存在或已审核' });
    if (action === 'approve') {
      await query('UPDATE saves SET status = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3',
        ['approved', req.user.id, id]);
    } else {
      const r = String(reason || '').trim();
      if (!r) return res.status(400).json({ error: '请填写驳回原因' });
      await query('UPDATE saves SET status = $1, reviewed_by = $2, reviewed_at = now(), reject_reason = $3 WHERE id = $4',
        ['rejected', req.user.id, r, id]);
    }
    await audit(req.user.id, `save.${action}`, 'save', id, { reason: reason || null });
    // 通知上传者 + 成就检查
    const saveRows = await query('SELECT user_id, title FROM saves WHERE id = $1', [id]);
    if (saveRows.length) {
      const uploaderId = saveRows[0].user_id;
      notify(
        uploaderId,
        'save_reviewed',
        `存档${action === 'approve' ? '已通过' : '已被驳回'}`,
        `「${saveRows[0].title}」${action === 'approve' ? '已通过审核并公开' : `：${reason || '不符合要求'}`}`,
        '/profile?tab=saves'
      );
      if (action === 'approve') checkAchievements(uploaderId).catch(() => {});
    }
    res.json({ ok: true, message: action === 'approve' ? '已通过' : '已驳回' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 游戏投稿审核 ══════════════
router.get('/submissions', async (req, res) => {
  try {
    const { page, pageSize, offset } = pagination(req);
    const status = String(req.query.status || 'pending');
    const conds = [];
    const params = [];
    if (['pending', 'approved', 'rejected'].includes(status)) {
      params.push(status);
      conds.push(`s.status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query(
      `SELECT s.id, s.title, s.tags, s.status, s.reject_reason, s.game_id, s.created_at,
              s.original_url, s.localized_url, u.username AS submitter
       FROM game_submissions s JOIN users u ON u.id = s.user_id
       ${where} ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const total = await query(`SELECT COUNT(*)::int AS c FROM game_submissions s ${where}`, params);
    res.json({ submissions: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    console.error('[admin/submissions]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 查看投稿完整内容（审核用） */
router.get('/submissions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      `SELECT s.*, u.username AS submitter FROM game_submissions s
       JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: '投稿不存在' });
    res.json({ submission: rows[0] });
  } catch (err) {
    console.error('[admin/submissions/detail]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 审核投稿 { action: 'approve' | 'reject', reason? } — approve 即创建游戏并上架 */
router.put('/submissions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { action, reason } = req.body || {};
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '操作不合法' });
    const rows = await query('SELECT * FROM game_submissions WHERE id = $1 AND status = $2', [id, 'pending']);
    if (!rows.length) return res.status(404).json({ error: '投稿不存在或已审核' });
    const sub = rows[0];

    if (action === 'approve') {
      const result = await withTransaction(async (client) => {
        // 条件 UPDATE 认领待审投稿，防止并发审核重复上架
        const claim = await client.query(
          `UPDATE game_submissions SET status='approved', reviewed_by=$1, reviewed_at=now()
           WHERE id=$2 AND status='pending' RETURNING id`,
          [req.user.id, id]
        );
        if (!claim.rows.length) throw new Error('ALREADY_REVIEWED');
        const g = await client.query(
          `INSERT INTO games (title, description, tags, cover_type, cover_url, cover_data, original_url, localized_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [sub.title, sub.description, sub.tags, sub.cover_type, sub.cover_url, sub.cover_data, sub.original_url, sub.localized_url]
        );
        await client.query('UPDATE game_submissions SET game_id = $1 WHERE id = $2', [g.rows[0].id, id]);
        return g.rows[0].id;
      });
      await audit(req.user.id, 'submission.approve', 'submission', id, { title: sub.title, game_id: result });
      notify(sub.user_id, 'submission_approved', '您的游戏投稿已通过', `「${sub.title}」已上架！`, `/games/${result}`);
      res.json({ ok: true, message: '已通过并上架', game_id: result });
    } else {
      const r = String(reason || '').trim();
      if (!r) return res.status(400).json({ error: '请填写驳回原因' });
      await query(
        'UPDATE game_submissions SET status=$1, reject_reason=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4',
        ['rejected', r, req.user.id, id]
      );
      await audit(req.user.id, 'submission.reject', 'submission', id, { title: sub.title, reason: r });
      notify(sub.user_id, 'submission_rejected', '您的游戏投稿被驳回', `「${sub.title}」：${r}`, '/submit');
      res.json({ ok: true, message: '已驳回' });
    }
  } catch (err) {
    if (err.message === 'ALREADY_REVIEWED') {
      return res.status(409).json({ error: '投稿已被其他管理员审核' });
    }
    console.error('[admin/submissions/handle]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 公告管理 ══════════════
router.get('/announcements', async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.id, a.title, a.content, a.is_pinned, a.expires_at, a.created_at, u.username AS author
       FROM announcements a LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 200`
    );
    res.json({ announcements: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { title, content, is_pinned, expires_at } = req.body || {};
    const t = String(title || '').trim();
    const c = String(content || '').trim();
    if (!t || t.length > 120) return res.status(400).json({ error: '标题需为 1-120 字' });
    if (!c || c.length > 50000) return res.status(400).json({ error: '内容需为 1-50000 字' });
    const rows = await query(
      `INSERT INTO announcements (title, content, is_pinned, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [t, c, Boolean(is_pinned), expires_at ? new Date(expires_at) : null, req.user.id]
    );
    await audit(req.user.id, 'announcement.create', 'announcement', rows[0].id, { title: t });
    notifyAll('announcement', `新公告：${t}`, c.slice(0, 80), `/announcements/${rows[0].id}`);
    res.status(201).json({ id: rows[0].id, message: '公告已发布' });
  } catch (err) {
    console.error('[admin/announcements/create]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/announcements/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, content, is_pinned, expires_at } = req.body || {};
    const t = String(title || '').trim();
    const c = String(content || '').trim();
    if (!t || t.length > 120) return res.status(400).json({ error: '标题需为 1-120 字' });
    if (!c || c.length > 50000) return res.status(400).json({ error: '内容需为 1-50000 字' });
    const rows = await query(
      `UPDATE announcements SET title=$1, content=$2, is_pinned=$3, expires_at=$4, updated_at=now()
       WHERE id=$5 RETURNING id`,
      [t, c, Boolean(is_pinned), expires_at ? new Date(expires_at) : null, id]
    );
    if (!rows.length) return res.status(404).json({ error: '公告不存在' });
    await audit(req.user.id, 'announcement.update', 'announcement', id, { title: t });
    res.json({ ok: true, message: '公告已更新' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('DELETE FROM announcements WHERE id = $1 RETURNING title', [id]);
    if (!rows.length) return res.status(404).json({ error: '公告不存在' });
    await audit(req.user.id, 'announcement.delete', 'announcement', id, { title: rows[0].title });
    res.json({ ok: true, message: '公告已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 封禁申诉审核 ══════════════
router.get('/appeals', async (req, res) => {
  try {
    const { page, pageSize, offset } = pagination(req);
    const status = String(req.query.status || 'pending');
    const conds = [];
    const params = [];
    if (['pending', 'approved', 'rejected'].includes(status)) {
      params.push(status);
      conds.push(`a.status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query(
      `SELECT a.id, a.user_id, a.reason, a.status, a.reply, a.created_at, a.handled_at,
              u.username, u.banned_until, u.ban_reason
       FROM ban_appeals a JOIN users u ON u.id = a.user_id
       ${where} ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const total = await query(`SELECT COUNT(*)::int AS c FROM ban_appeals a ${where}`, params);
    res.json({ appeals: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/** 处理申诉 { action: 'approve'|'reject', reply } — approve 即解封 */
router.put('/appeals/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { action, reply } = req.body || {};
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '操作不合法' });
    const rows = await query('SELECT * FROM ban_appeals WHERE id = $1 AND status = $2', [id, 'pending']);
    if (!rows.length) return res.status(404).json({ error: '申诉不存在或已处理' });
    const appeal = rows[0];
    const r = String(reply || '').trim();

    await withTransaction(async (client) => {
      await client.query(
        'UPDATE ban_appeals SET status = $1, reply = $2, handled_by = $3, handled_at = now() WHERE id = $4',
        [action === 'approve' ? 'approved' : 'rejected', r, req.user.id, id]
      );
      if (action === 'approve') {
        await client.query('UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = $1', [appeal.user_id]);
      }
    });
    await audit(req.user.id, `appeal.${action}`, 'appeal', id, { username: appeal.reason.slice(0, 50), reply: r });
    notify(
      appeal.user_id,
      'appeal_handled',
      `申诉${action === 'approve' ? '已通过' : '已被驳回'}`,
      action === 'approve' ? '您的申诉已通过，账号已解封！' : `很遗憾，您的申诉未通过。${r ? ` 回复：${r}` : ''}`,
      '/appeals'
    );
    res.json({ ok: true, message: action === 'approve' ? '已批准并解封' : '已驳回申诉' });
  } catch (err) {
    console.error('[admin/appeals/handle]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 游戏更新日志管理 ══════════════
router.get('/games/:id/updates', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      'SELECT id, version, content, created_at FROM game_updates WHERE game_id = $1 ORDER BY created_at DESC, id DESC',
      [id]
    );
    res.json({ updates: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/games/:id/updates', async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { version, content } = req.body || {};
    const v = String(version || '').trim();
    const c = String(content || '').trim();
    if (!v || v.length > 40) return res.status(400).json({ error: '版本号需为 1-40 字' });
    if (!c || c.length > 5000) return res.status(400).json({ error: '更新内容需为 1-5000 字' });
    const game = await query('SELECT id FROM games WHERE id = $1', [gameId]);
    if (!game.length) return res.status(404).json({ error: '游戏不存在' });
    const rows = await query(
      'INSERT INTO game_updates (game_id, version, content) VALUES ($1,$2,$3) RETURNING id',
      [gameId, v, c]
    );
    await audit(req.user.id, 'game_update.create', 'game_update', rows[0].id, { game_id: gameId, version: v });
    res.status(201).json({ id: rows[0].id, message: '更新日志已添加' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/updates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { version, content } = req.body || {};
    const v = String(version || '').trim();
    const c = String(content || '').trim();
    if (!v || v.length > 40) return res.status(400).json({ error: '版本号需为 1-40 字' });
    if (!c || c.length > 5000) return res.status(400).json({ error: '更新内容需为 1-5000 字' });
    const rows = await query(
      'UPDATE game_updates SET version = $1, content = $2 WHERE id = $3 RETURNING id, game_id',
      [v, c, id]
    );
    if (!rows.length) return res.status(404).json({ error: '更新记录不存在' });
    await audit(req.user.id, 'game_update.update', 'game_update', id, { version: v });
    res.json({ ok: true, message: '更新日志已修改' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/updates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('DELETE FROM game_updates WHERE id = $1 RETURNING version', [id]);
    if (!rows.length) return res.status(404).json({ error: '更新记录不存在' });
    await audit(req.user.id, 'game_update.delete', 'game_update', id, { version: rows[0].version });
    res.json({ ok: true, message: '更新日志已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ══════════════ 审计日志 ══════════════
router.get('/audit-logs', async (req, res) => {
  try {
    const { page, pageSize, offset } = pagination(req);
    const rows = await query(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
              u.username AS admin_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    const total = await query('SELECT COUNT(*)::int AS c FROM audit_logs');
    res.json({ logs: rows, total: total[0].c, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
