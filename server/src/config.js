import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/game_hanzhan',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Brevo 邮件（占位：未配置 BREVO_API_KEY 时邮件只打日志，不发送）
  brevoApiKey: process.env.BREVO_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || '游戏汉化站 <no-reply@example.com>',
  siteName: '游戏汉化站',
  // 前端地址（用于邮件中的链接）
  webUrl: process.env.WEB_URL || 'http://localhost:5173',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:5174',
  // 每月可修改一次账号信息（30 天）
  changeCooldownMs: 30 * 24 * 60 * 60 * 1000,
  // 评论限流：每分钟最多 5 条
  commentLimitPerMinute: 5,
  commentMinLen: 3,
  commentMaxLen: 500,
  // 存档限制
  saveMaxChars: 20000,
  saveMaxBytes: 2 * 1024 * 1024,
  // 封面图片限制 5MB
  coverMaxBytes: 5 * 1024 * 1024,
  // 管理员用户名（暂定 Winster / winster）
  adminUsernames: ['Winster', 'winster'],
};

export function isAdminUsername(username) {
  return config.adminUsernames.some((n) => n.toLowerCase() === String(username || '').toLowerCase());
}
