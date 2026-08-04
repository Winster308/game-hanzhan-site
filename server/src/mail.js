import { config } from './config.js';

/**
 * Brevo 邮件发送（占位实现）。
 * - 配置了 BREVO_API_KEY：调用 Brevo Transactional Email API (v3)
 * - 未配置：仅打印日志并返回成功（开发/未配置阶段不阻断流程）
 */
export async function sendMail({ to, subject, html }) {
  if (!config.brevoApiKey) {
    console.log(`[mail:skipped] to=${to} subject=${subject}`);
    return { skipped: true };
  }
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
