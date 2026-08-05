import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

export const hashPassword = (plain) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

/** 生成随机令牌并返回 { token, tokenHash } */
export function randomToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: crypto.createHash('sha256').update(token).digest('hex') };
}

/**
 * 从请求提取真实 IP（Railway 后有代理）。
 * X-Forwarded-For 是客户端可伪造的：取"最右侧非代理"的一跳不现实（代理层数未知），
 * 因此采用：若存在 XFF 则取最后一个条目（通常由可信代理追加），否则用 socket 地址，并做格式校验。
 */
export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const raw = (xff && xff.split(',').filter(Boolean).pop()?.trim()) || req.socket.remoteAddress || '';
  // 校验 IPv4/IPv6 格式，防止伪造注入
  const cleaned = raw.replace(/^::ffff:/, '');
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned) && cleaned.split('.').every((n) => Number(n) <= 255);
  const isIpv6 = /^[0-9a-fA-F:]+$/.test(cleaned) && cleaned.includes(':');
  return isIpv4 || isIpv6 ? cleaned : null;
}

/** 计算封禁剩余毫秒；未封禁返回 0 */
export function banRemainingMs(user) {
  if (!user.banned_until) return 0;
  const diff = new Date(user.banned_until).getTime() - Date.now();
  return diff > 0 ? diff : 0;
}

/**
 * 认证中间件：解析 Bearer token，挂载 req.user。
 * 若账号被封禁，仅允许查看类操作通过（由具体路由再校验写操作）。
 */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.uid, username: payload.username, role: payload.role };
    next();
  } catch {
    next();
  }
}

/** 必须登录 */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  next();
}

/** 必须管理员（实时查库校验角色，防止被降权/删号的管理员持旧 token 继续操作） */
export async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  try {
    const rows = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    const role = rows[0]?.role;
    if (!rows.length) return res.status(401).json({ error: '账号不存在' });
    if (role !== 'admin') return res.status(403).json({ error: '无管理员权限' });
    // 同步刷新 req.user.role，供审计等使用
    req.user.role = role;
    next();
  } catch (err) {
    console.error('[requireAdmin]', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

/** 写操作前检查封禁状态（requireAuth 之后用）。被封禁则返回 403。 */
export async function assertNotBanned(req, res, next) {
  try {
    const rows = await query('SELECT banned_until FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(401).json({ error: '账号不存在' });
    const u = rows[0];
    if (u.banned_until) {
      // 永久封禁：pg 将 'infinity' 解析为 Infinity
      if (u.banned_until === Infinity || u.banned_until === 'infinity') {
        return res.status(403).json({ error: '账号已被永久封禁' });
      }
      if (new Date(u.banned_until).getTime() > Date.now()) {
        return res.status(403).json({ error: '账号已被封禁，无法执行此操作' });
      }
    }
    next();
  } catch (err) {
    console.error('[assertNotBanned]', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
}
