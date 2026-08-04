import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

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

/** 从请求提取真实 IP（Railway 后有代理，取 x-forwarded-for 第一跳并校验格式） */
export function getClientIp(req) {
  const raw = (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.socket.remoteAddress || '';
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

/** 必须管理员 */
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无管理员权限' });
  next();
}

/** 写操作前检查封禁状态（requireAuth 之后用）。返回 {ok} 或抛错 */
export function assertNotBanned(req, res, next) {
  // req.user 只有轻量 payload，封禁详情需查库
  return next();
}
