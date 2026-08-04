import { query } from './db.js';

/**
 * 写操作前检查用户是否被封禁。
 * 返回 true 表示已封禁（调用方需返回 403）。
 */
export async function isBanned(userId) {
  const rows = await query(
    'SELECT banned_until, ban_reason FROM users WHERE id = $1',
    [userId]
  );
  if (!rows.length) return { banned: true, reason: '账号不存在', remainingMs: 0 };
  const u = rows[0];
  if (!u.banned_until) return { banned: false };
  const remainingMs = new Date(u.banned_until).getTime() - Date.now();
  if (remainingMs <= 0) return { banned: false };
  return { banned: true, reason: u.ban_reason, remainingMs };
}

/** 完整用户信息（含封禁状态），供路由使用 */
export async function loadUser(userId) {
  const rows = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return rows[0] || null;
}

/** 写审计日志 */
export async function audit(adminId, action, targetType = null, targetId = null, detail = null) {
  await query(
    'INSERT INTO audit_logs (admin_id, action, target_type, target_id, detail) VALUES ($1,$2,$3,$4,$5)',
    [adminId || null, action, targetType, targetId, detail ? JSON.stringify(detail) : null]
  );
}

/** 记录访问（当天人数统计，按 IP 去重） */
export async function recordVisit(ip, userId) {
  if (!ip) return;
  await query('INSERT INTO visit_logs (ip, user_id) VALUES ($1, $2)', [ip, userId || null]);
}

/** 校验 IP 字符串合法性（辅助） */
export function isValidIp(ip) {
  if (!ip) return false;
  const cleaned = ip.replace(/^::ffff:/, '');
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned) && cleaned.split('.').every((n) => Number(n) <= 255);
  const isIpv6 = /^[0-9a-fA-F:]+$/.test(cleaned) && cleaned.includes(':');
  return isIpv4 || isIpv6;
}

export function nowIso() {
  return new Date().toISOString();
}
