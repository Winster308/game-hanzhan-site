import dotenv from 'dotenv';
dotenv.config();

// 生产环境安全校验：缺少强密钥/管理员密码时拒绝启动，避免用公开默认值上线
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error('生产环境必须设置 JWT_SECRET（至少 16 字符随机串）');
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
    throw new Error('生产环境必须设置 ADMIN_PASSWORD（至少 8 字符随机密码）');
  }
}

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/game_hanzhan',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // 邮件：优先 SMTP（如 QQ 邮箱），其次 Brevo，都不配置则仅打日志
  // smtpHost 建议直接填 IPv4 地址（Railway 容器 DNS 解析 smtp.qq.com 时 IPv4 记录常缺失，导致只连 IPv6 失败）
  smtpHost: process.env.SMTP_HOST || 'smtp.qq.com',
  // TLS SNI/证书校验用域名（host 为 IP 时仍按域名校验证书）
  smtpServername: process.env.SMTP_SERVERNAME || 'smtp.qq.com',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
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
