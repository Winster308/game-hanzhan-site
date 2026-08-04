import { query, queryResult } from './db.js';
import { notify } from './notify.js';

/** 各成就条件的计数 SQL（$1 = user_id） */
const CONDITION_SQL = {
  comment_count: "SELECT COUNT(*)::int AS c FROM comments WHERE user_id = $1 AND is_deleted = FALSE",
  likes_count: 'SELECT COUNT(*)::int AS c FROM likes WHERE user_id = $1',
  favorites_count: 'SELECT COUNT(*)::int AS c FROM favorites WHERE user_id = $1',
  saves_count: 'SELECT COUNT(*)::int AS c FROM saves WHERE user_id = $1',
  saves_approved: "SELECT COUNT(*)::int AS c FROM saves WHERE user_id = $1 AND status = 'approved'",
  reports_count: 'SELECT COUNT(*)::int AS c FROM reports WHERE reporter_id = $1',
  report_adopted: "SELECT COUNT(*)::int AS c FROM reports WHERE reporter_id = $1 AND status = 'approved'",
  play_count: 'SELECT COUNT(*)::int AS c FROM play_logs WHERE user_id = $1',
  login_count: "SELECT COUNT(*)::int AS c FROM login_logs WHERE user_id = $1 AND success = TRUE",
};

/**
 * 检查并解锁新成就。在用户关键动作后调用。
 * 返回本次新解锁的成就数组。
 */
export async function checkAchievements(userId) {
  if (!userId) return [];
  const all = await query('SELECT * FROM achievements');
  const earned = await query('SELECT achievement_id FROM user_achievements WHERE user_id = $1', [userId]);
  const earnedSet = new Set(earned.map((r) => r.achievement_id));
  const newly = [];
  for (const a of all) {
    if (earnedSet.has(a.id)) continue;
    const sql = CONDITION_SQL[a.condition_type];
    if (!sql) continue;
    const rows = await query(sql, [userId]);
    if (rows[0].c >= a.condition_value) {
      // user_achievements 无自增 id，用 rowCount 判断是否新插入（ON CONFLICT 防并发重复）
      const { rowCount } = await queryResult(
        'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [userId, a.id]
      );
      if (rowCount > 0) {
        newly.push(a);
        await notify(userId, 'achievement', `解锁成就：${a.name}`, `${a.icon} ${a.description}（+${a.exp} 经验）`, '/profile');
      }
    }
  }
  return newly;
}

/** 等级公式：level = floor(sqrt(exp/50)) + 1 */
export function levelFromExp(exp) {
  return Math.floor(Math.sqrt(Math.max(0, exp) / 50)) + 1;
}

/** 等级进度（当前等级 / 总经验 / 距下一级） */
export function levelProgress(exp) {
  const e = Math.max(0, exp);
  const level = levelFromExp(e);
  const cur = 50 * (level - 1) ** 2;
  const next = 50 * level ** 2;
  return {
    level,
    exp: e,
    curExp: cur,
    nextExp: next,
    progress: Math.min(100, Math.round(((e - cur) / (next - cur)) * 100)),
  };
}

/** 我的成就：全部成就 + 解锁状态 + 等级信息 */
export async function myAchievements(userId) {
  const [all, mine] = await Promise.all([
    query('SELECT * FROM achievements ORDER BY exp DESC, id'),
    query('SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = $1', [userId]),
  ]);
  const mineMap = new Map(mine.map((m) => [m.achievement_id, m]));
  const totalExp = mine.reduce((sum, m) => sum + (all.find((a) => a.id === m.achievement_id)?.exp || 0), 0);
  return {
    level: levelProgress(totalExp),
    unlocked_count: mine.length,
    total_count: all.length,
    achievements: all.map((a) => ({
      ...a,
      unlocked: mineMap.has(a.id),
      earned_at: mineMap.get(a.id)?.earned_at || null,
    })),
  };
}
