import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { authMiddleware, getClientIp } from './auth.js';
import { recordVisit } from './utils.js';
import { enrichCountry } from './geo.js';

import authRoutes from './routes/auth.js';
import gamesRoutes from './routes/games.js';
import commentsRoutes from './routes/comments.js';
import savesRoutes from './routes/saves.js';
import reportsRoutes from './routes/reports.js';
import announcementsRoutes from './routes/announcements.js';
import profileRoutes from './routes/profile.js';
import notificationsRoutes from './routes/notifications.js';
import appealsRoutes from './routes/appeals.js';
import adminRoutes from './routes/admin.js';

const app = express();

app.set('trust proxy', true); // Railway 后有代理，取真实 IP

app.use(cors({
  origin: true, // 开发环境允许所有来源；生产建议配置 WEB_URL/ADMIN_URL
  credentials: true,
}));
app.use(express.json({ limit: '8mb' })); // 封面图片 base64 需要较大限制

// 日志（简洁）
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(authMiddleware);

// 页面访问统计（用户端每次加载页面调用一次，按 IP 去重；异步补地区信息）
app.post('/api/visit', (req, res) => {
  const ip = getClientIp(req);
  recordVisit(ip, req.user?.id || null, req.get('referer') || null);
  if (ip) enrichCountry(ip).catch(() => {});
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api', commentsRoutes);
app.use('/api', savesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/my', profileRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, name: config.siteName, time: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ error: '接口不存在' }));

// 统一错误处理
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: '服务器内部错误' });
});

async function main() {
  await migrate();
  app.listen(config.port, () => {
    console.log(`[server] ${config.siteName} API 已启动: http://localhost:${config.port}`);
    console.log(`[server] 邮件: ${config.brevoApiKey ? 'Brevo 已配置' : '未配置 BREVO_API_KEY（邮件仅打日志）'}`);
  });
}

main().catch((err) => {
  console.error('[server] 启动失败:', err);
  process.exit(1);
});
