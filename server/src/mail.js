import nodemailer from 'nodemailer';
import { config } from './config.js';

/**
 * 邮件发送（优先级：SMTP → Brevo → 日志占位）。
 * - 配置了 SMTP_USER（如 QQ 邮箱授权码）→ 走 SMTP
 * - 配置了 BREVO_API_KEY → 走 Brevo Transactional Email API (v3)
 * - 都没有 → 仅打印日志并返回成功（开发/未配置阶段不阻断流程）
 */
export async function sendMail({ to, subject, html }) {
  if (config.smtpUser) {
    return sendViaSmtp({ to, subject, html });
  }
  if (config.brevoApiKey) {
    return sendViaBrevo({ to, subject, html });
  }
  console.log(`[mail:skipped] to=${to} subject=${subject}`);
  return { skipped: true };
}

/** QQ 邮箱 / 任意 SMTP 发信（TLS 465，带超时；host 建议为 IPv4 地址避免容器 DNS 解析出 IPv6） */
async function sendViaSmtp({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
    // host 是 IP 时用域名做 TLS SNI，保证证书校验通过
    tls: { servername: config.smtpServername || undefined },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  await transporter.sendMail({
    from: config.smtpUser,
    to,
    subject,
    html,
  });
  return { ok: true };
}

/** Brevo API 发信 */
async function sendViaBrevo({ to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.brevoApiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseSender(config.mailFrom),
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return { ok: true };
}

function parseSender(from) {
  const m = String(from).match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { email: from };
}

/** 生成 HTML 邮件模板 */
export function mailTemplate(title, bodyHtml) {
  return `
  <div style="max-width:600px;margin:0 auto;font-family:'Microsoft YaHei',sans-serif;color:#1f2937;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:#4f46e5;padding:18px 24px;color:#fff;font-size:18px;font-weight:bold">${config.siteName}</div>
    <div style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:16px">${title}</h2>
      ${bodyHtml}
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">此邮件由系统自动发送，请勿直接回复。</p>
    </div>
  </div>`;
}
