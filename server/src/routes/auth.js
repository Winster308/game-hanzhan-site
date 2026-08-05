import crypto from 'node:crypto';
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import {
  hashPassword, verifyPassword, signToken, randomToken, getClientIp,
} from '../auth.js';
import { config, isAdminUsername } from '../config.js';
import { sendMail, mailTemplate } from '../mail.js';
import { loadUser, isBanned, audit } from '../utils.js';
import { rateLimit } from '../ratelimit.js';
import { checkAchievements } from '../achievements.js';

const router = Router();

const USERNAME_RE = /^[\w\u4e00-\u9fa5]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const genCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

/** 生成并发送邮箱验证邮件（改邮箱等场景） */

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    email_verified: u.email_verified,
    theme: u.theme,
    banned_until: u.banned_until,
    ban_reason: u.ban_reason,
    created_at: u.created_at,
  };
}

function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 6 || p.length > 72) {
    return '密码长度需为 6-72 位';
  }
  return null;
}

/** 生成并发送邮箱验证邮件 */
async function sendVerifyEmail(user) {
  const { token, tokenHash } = randomToken();
  await query(
    'INSERT INTO email_tokens (user_id, token_hash, kind, expires_at) VALUES ($1,$2,$3, now() + interval \'1 day\')',
    [user.id, tokenHash, 'verify']
  );
  const link = `${config.webUrl}/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: `【${config.siteName}】邮箱验证`,
    html: mailTemplate('验证您的邮箱', `<p>您好 <b>${user.username}</b>，请点击下方按钮完成邮箱验证（24 小时内有效）：</p><p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none">立即验证</a></p><p>如果按钮无法点击，请复制链接：<br><span style="color:#6b7280;word-break:break-all">${link}</span></p>`),
  });
}

// ── 发送注册邮箱验证码 ────────────────────────────────
router.post('/send-register-code', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').toLowerCase().trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });

    // 防枚举：邮箱已注册时也返回"已发送"（不实际发信）
    const exists = await query('SELECT id FROM users WHERE lower(email) = $1', [email]);
    if (exists.length) return res.json({ ok: true, message: '验证码已发送（如邮箱已注册，请直接登录）' });

    // 限流：每邮箱+IP 60 秒最多 1 次
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `regcode:${email}:${ip}`, limit: 1, windowMs: 60 * 1000 });
    if (!rl.allowed) return res.status(429).json({ error: '发送过于频繁，请 60 秒后再试' });

    // 过期旧验证码
    await query("UPDATE email_tokens SET used = TRUE WHERE email = $1 AND kind = 'register'", [email]);

    const code = genCode();
    await query(
      `INSERT INTO email_tokens (user_id, email, token_hash, kind, expires_at)
       VALUES (NULL, $1, $2, 'register', now() + interval '10 minutes')`,
      [email, sha256(code)]
    );
    // 邮件后台发送（不阻塞接口响应）
    sendMail({
      to: email,
      subject: `【${config.siteName}】注册验证码`,
      html: mailTemplate('注册验证码', `
        <p>您好！您的注册验证码为：</p>
        <p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#4f46e5;margin:16px 0">${code}</p>
        <p>请在注册页面输入以上验证码完成注册，<b>10 分钟内有效</b>。请勿泄露给他人。</p>`),
    }).catch((err) => console.error('[mail] register code failed:', err.message));

    res.json({ ok: true, message: '验证码已发送到邮箱' });
  } catch (err) {
    console.error('[auth/send-register-code]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 注册（必须邮箱验证码） ─────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, code } = req.body || {};
    if (!USERNAME_RE.test(String(username || ''))) {
      return res.status(400).json({ error: '用户名需为 3-32 位字母/数字/下划线/中文' });
    }
    if (isAdminUsername(username)) {
      return res.status(400).json({ error: '该用户名已被注册' });
    }
    if (!EMAIL_RE.test(String(email || ''))) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
    const pwdErr = validatePassword(password);
    if (pwdErr) return res.status(400).json({ error: pwdErr });
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!String(code || '').trim()) return res.status(400).json({ error: '请输入邮箱验证码' });

    const existing = await query('SELECT id FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)', [username, normalizedEmail]);
    if (existing.length) return res.status(400).json({ error: '用户名或邮箱已被注册' });

    // 校验验证码（防暴力：每邮箱+IP 30 秒最多 5 次尝试）
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `regcode-check:${normalizedEmail}:${ip}`, limit: 5, windowMs: 30 * 1000 });
    if (!rl.allowed) return res.status(429).json({ error: '验证码尝试过于频繁，请稍后再试' });
    const codeRows = await query(
      `SELECT id FROM email_tokens WHERE email = $1 AND kind = 'register' AND token_hash = $2
       AND used = FALSE AND expires_at > now()`,
      [normalizedEmail, sha256(String(code).trim())]
    );
    if (!codeRows.length) return res.status(400).json({ error: '验证码错误或已过期' });

    const passwordHash = await hashPassword(password);
    const user = await withTransaction(async (client) => {
      // 验证码一次性使用
      await client.query('UPDATE email_tokens SET used = TRUE WHERE id = $1', [codeRows[0].id]);
      const r = await client.query(
        'INSERT INTO users (username, email, password_hash, email_verified) VALUES ($1,$2,$3,TRUE) RETURNING *',
        [username, normalizedEmail, passwordHash]
      );
      return r.rows[0];
    });

    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 登录 ──────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { account, password } = req.body || {};
    if (!account || !password) return res.status(400).json({ error: '请输入账号和密码' });

    const ip = getClientIp(req);
    const rl = rateLimit({ key: `login:${ip}:${account}`, limit: 5, windowMs: 60 * 1000 });
    if (!rl.allowed) {
      return res.status(429).json({ error: '尝试过于频繁，请稍后再试' });
    }

    const rows = await query(
      'SELECT * FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
      [String(account).trim()]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      if (user) {
        await query('INSERT INTO login_logs (user_id, ip, user_agent, success) VALUES ($1,$2,$3,FALSE)',
          [user.id, ip, (req.headers['user-agent'] || '').slice(0, 300)]);
      }
      return res.status(401).json({ error: '账号或密码错误' });
    }

    // 封禁检查
    const ban = await isBanned(user.id);
    if (ban.banned) {
      return res.status(403).json({
        error: '账号已被封禁',
        ban_reason: ban.reason,
        ban_remaining_ms: ban.remainingMs,
      });
    }

    await query(
      'INSERT INTO login_logs (user_id, ip, user_agent, success) VALUES ($1,$2,$3,TRUE)',
      [user.id, ip, (req.headers['user-agent'] || '').slice(0, 300)]
    );
    await query('UPDATE users SET updated_at = now() WHERE id = $1', [user.id]);

    // 登录成就检查（不阻塞）
    checkAchievements(user.id).catch(() => {});

    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 当前用户 ──────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    const user = await loadUser(req.user.id);
    if (!user) return res.status(401).json({ error: '账号不存在' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 邮箱验证 ──────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: '缺少令牌' });
    const tokenHash = require('node:crypto').createHash('sha256').update(token).digest('hex');
    const rows = await query(
      `SELECT t.*, u.username, u.email FROM email_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.kind = 'verify' AND t.used = FALSE AND t.expires_at > now()`,
      [tokenHash]
    );
    if (!rows.length) return res.status(400).json({ error: '验证链接无效或已过期' });
    await withTransaction(async (client) => {
      await client.query('UPDATE email_tokens SET used = TRUE WHERE id = $1', [rows[0].id]);
      await client.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [rows[0].user_id]);
    });
    res.json({ ok: true, message: '邮箱验证成功' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 重新发送验证邮件 ──────────────────────────────────
router.post('/resend-verify', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    const user = await loadUser(req.user.id);
    if (!user) return res.status(401).json({ error: '账号不存在' });
    if (user.email_verified) return res.json({ ok: true, message: '邮箱已验证' });
    await sendVerifyEmail(user).catch((err) => console.error('[mail] resend failed:', err.message));
    res.json({ ok: true, message: '验证邮件已发送' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 忘记密码 ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: '请输入邮箱' });
    const rows = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    if (rows.length) {
      const user = rows[0];
      const { token, tokenHash } = randomToken();
      await query(
        'INSERT INTO email_tokens (user_id, token_hash, kind, expires_at) VALUES ($1,$2,$3, now() + interval \'1 hour\')',
        [user.id, tokenHash, 'reset']
      );
      const link = `${config.webUrl}/reset-password?token=${token}`;
      await sendMail({
        to: user.email,
        subject: `【${config.siteName}】重置密码`,
        html: mailTemplate('重置密码', `<p>您好 <b>${user.username}</b>，请点击下方按钮重置密码（1 小时内有效）：</p><p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none">重置密码</a></p><p>如果按钮无法点击，请复制链接：<br><span style="color:#6b7280;word-break:break-all">${link}</span></p>`),
      }).catch((err) => console.error('[mail] reset failed:', err.message));
    }
    // 无论是否存在都返回成功，防止邮箱枚举
    res.json({ ok: true, message: '如果该邮箱已注册，重置链接已发送' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 重置密码 ──────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    const pwdErr = validatePassword(newPassword);
    if (pwdErr) return res.status(400).json({ error: pwdErr });
    if (!token) return res.status(400).json({ error: '缺少令牌' });
    const tokenHash = require('node:crypto').createHash('sha256').update(token).digest('hex');
    const rows = await query(
      `SELECT * FROM email_tokens WHERE token_hash = $1 AND kind = 'reset' AND used = FALSE AND expires_at > now()`,
      [tokenHash]
    );
    if (!rows.length) return res.status(400).json({ error: '重置链接无效或已过期' });
    const passwordHash = await hashPassword(newPassword);
    await withTransaction(async (client) => {
      await client.query('UPDATE email_tokens SET used = TRUE WHERE id = $1', [rows[0].id]);
      await client.query('UPDATE users SET password_hash = $1, last_password_change_at = now() WHERE id = $2',
        [passwordHash, rows[0].user_id]);
    });
    res.json({ ok: true, message: '密码已重置，请重新登录' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 修改密码（登录后，每月一次） ──────────────────────
router.post('/change-password', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    const { oldPassword, newPassword } = req.body || {};
    const pwdErr = validatePassword(newPassword);
    if (pwdErr) return res.status(400).json({ error: pwdErr });
    const user = await loadUser(req.user.id);
    if (!user) return res.status(401).json({ error: '账号不存在' });
    if (!(await verifyPassword(oldPassword || '', user.password_hash))) {
      return res.status(400).json({ error: '原密码错误' });
    }
    // 管理员豁免每月修改限制
    if (req.user.role !== 'admin') {
      const last = user.last_password_change_at ? new Date(user.last_password_change_at).getTime() : 0;
      const remaining = last + config.changeCooldownMs - Date.now();
      if (remaining > 0) {
        return res.status(400).json({
          error: `密码每月只能修改一次，还需等待 ${Math.ceil(remaining / 86400000)} 天`,
          remaining_ms: remaining,
        });
      }
    }
    const passwordHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, last_password_change_at = now() WHERE id = $2',
      [passwordHash, user.id]);
    res.json({ ok: true, message: '密码修改成功' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 发送"修改邮箱"验证码（登录后） ───────────────────
router.post('/send-change-email-code', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    const newEmail = String((req.body || {}).newEmail || '').toLowerCase().trim();
    if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ error: '邮箱格式不正确' });

    const dup = await query('SELECT id FROM users WHERE lower(email) = $1 AND id <> $2', [newEmail, req.user.id]);
    if (dup.length) return res.status(400).json({ error: '该邮箱已被其他账号使用' });

    const ip = getClientIp(req);
    const rl = rateLimit({ key: `changecode:${req.user.id}:${newEmail}:${ip}`, limit: 1, windowMs: 60 * 1000 });
    if (!rl.allowed) return res.status(429).json({ error: '发送过于频繁，请 60 秒后再试' });

    await query("UPDATE email_tokens SET used = TRUE WHERE email = $1 AND kind = 'change_email'", [newEmail]);

    const code = genCode();
    await query(
      `INSERT INTO email_tokens (user_id, email, token_hash, kind, expires_at)
       VALUES ($1, $2, $3, 'change_email', now() + interval '10 minutes')`,
      [req.user.id, newEmail, sha256(code)]
    );
    sendMail({
      to: newEmail,
      subject: `【${config.siteName}】修改邮箱验证码`,
      html: mailTemplate('修改邮箱验证码', `
        <p>您好！您正在将账号邮箱修改为 <b>${newEmail}</b>，验证码为：</p>
        <p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#4f46e5;margin:16px 0">${code}</p>
        <p>请在修改邮箱页面输入以上验证码，<b>10 分钟内有效</b>。如非本人操作请忽略。</p>`),
    }).catch((err) => console.error('[mail] change-email code failed:', err.message));

    res.json({ ok: true, message: '验证码已发送到新邮箱' });
  } catch (err) {
    console.error('[auth/send-change-email-code]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 修改邮箱（登录后，需新邮箱验证码；管理员豁免每月限制） ──
router.post('/change-email', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    const { newEmail: rawNew, code } = req.body || {};
    const newEmail = String(rawNew || '').toLowerCase().trim();
    if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ error: '邮箱格式不正确' });
    if (!String(code || '').trim()) return res.status(400).json({ error: '请输入新邮箱收到的验证码' });

    const user = await loadUser(req.user.id);
    if (!user) return res.status(401).json({ error: '账号不存在' });
    // 管理员豁免每月修改限制
    if (req.user.role !== 'admin') {
      const last = user.last_email_change_at ? new Date(user.last_email_change_at).getTime() : 0;
      const remaining = last + config.changeCooldownMs - Date.now();
      if (remaining > 0) {
        return res.status(400).json({
          error: `邮箱每月只能修改一次，还需等待 ${Math.ceil(remaining / 86400000)} 天`,
          remaining_ms: remaining,
        });
      }
    }
    const dup = await query('SELECT id FROM users WHERE lower(email) = $1 AND id <> $2', [newEmail, user.id]);
    if (dup.length) return res.status(400).json({ error: '该邮箱已被使用' });

    // 校验验证码（防暴力）
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `changecode-check:${user.id}:${newEmail}:${ip}`, limit: 5, windowMs: 30 * 1000 });
    if (!rl.allowed) return res.status(429).json({ error: '验证码尝试过于频繁，请稍后再试' });
    const codeRows = await query(
      `SELECT id FROM email_tokens WHERE email = $1 AND kind = 'change_email' AND token_hash = $2
       AND used = FALSE AND expires_at > now()`,
      [newEmail, sha256(String(code).trim())]
    );
    if (!codeRows.length) return res.status(400).json({ error: '验证码错误或已过期' });

    await withTransaction(async (client) => {
      await client.query('UPDATE email_tokens SET used = TRUE WHERE id = $1', [codeRows[0].id]);
      // 验证码已验证新邮箱所有权，直接置为已验证
      await client.query(
        'UPDATE users SET email = $1, email_verified = TRUE, last_email_change_at = now() WHERE id = $2',
        [newEmail, user.id]
      );
    });
    res.json({ ok: true, message: '邮箱修改成功' });
  } catch (err) {
    console.error('[auth/change-email]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 修改昵称（登录后，每月一次） ──────────────────────
router.post('/change-username', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    const { newUsername } = req.body || {};
    if (!USERNAME_RE.test(String(newUsername || ''))) {
      return res.status(400).json({ error: '用户名需为 3-32 位字母/数字/下划线/中文' });
    }
    if (isAdminUsername(newUsername)) return res.status(400).json({ error: '该用户名已被注册' });
    const user = await loadUser(req.user.id);
    if (!user) return res.status(401).json({ error: '账号不存在' });
    // 管理员豁免每月修改限制
    if (req.user.role !== 'admin') {
      const last = user.last_username_change_at ? new Date(user.last_username_change_at).getTime() : 0;
      const remaining = last + config.changeCooldownMs - Date.now();
      if (remaining > 0) {
        return res.status(400).json({
          error: `昵称每月只能修改一次，还需等待 ${Math.ceil(remaining / 86400000)} 天`,
          remaining_ms: remaining,
        });
      }
    }
    const dup = await query('SELECT id FROM users WHERE lower(username) = $1 AND id <> $2', [String(newUsername).toLowerCase(), user.id]);
    if (dup.length) return res.status(400).json({ error: '该昵称已被使用' });
    await query('UPDATE users SET username = $1, last_username_change_at = now() WHERE id = $2', [newUsername, user.id]);
    res.json({ ok: true, message: '昵称修改成功', username: newUsername });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 主题设置 ──────────────────────────────────────────
router.put('/theme', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    const { theme } = req.body || {};
    if (!['light', 'dark', 'system'].includes(theme)) return res.status(400).json({ error: '主题不合法' });
    await query('UPDATE users SET theme = $1 WHERE id = $2', [theme, req.user.id]);
    res.json({ ok: true, theme });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 登录 IP 记录 ──────────────────────────────────────
router.get('/login-logs', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    const rows = await query(
      'SELECT ip, user_agent, success, created_at FROM login_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    res.json({ logs: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
