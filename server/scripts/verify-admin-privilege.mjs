/* 验证管理员豁免限制 */
import crypto from 'node:crypto';
import { query } from '../src/db.js';

const BASE = 'http://localhost:3001/api';
let pass = 0, fail = 0;
const check = (n, c, e = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n} ${e}`)); };

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const suffix = Date.now().toString(36).slice(-6);

// 管理员登录
const adminLogin = await call('/auth/login', { method: 'POST', body: { account: 'Winster', password: 'Winster@2025' } });
const adminToken = adminLogin.data.token;

// 普通用户注册（注入验证码）
const userEmail = `priv${suffix}@test.com`;
const code = '654321';
await query("UPDATE email_tokens SET used = TRUE WHERE email = $1 AND kind = 'register'", [userEmail]);
await query(`INSERT INTO email_tokens (user_id, email, token_hash, kind, expires_at)
  VALUES (NULL, $1, $2, 'register', now() + interval '10 minutes')`,
  [userEmail, crypto.createHash('sha256').update(code).digest('hex')]);
const reg = await call('/auth/register', { method: 'POST', body: { username: `普通用户${suffix}`, email: userEmail, password: 'test123456', code } });
const userToken = reg.data.token;
const userId = reg.data.user.id;

console.log('── 1. 昵称修改冷却豁免 ──');
// 模拟管理员刚改过昵称（冷却是 30 天）
await query('UPDATE users SET last_username_change_at = now() WHERE lower(username) = $1', ['winster']);
await query('UPDATE users SET last_username_change_at = now() WHERE id = $1', [userId]);
const adminRename = await call('/auth/change-username', { method: 'POST', token: adminToken, body: { newUsername: `管理员${suffix}` } });
check('管理员改昵称不受限', adminRename.status === 200, JSON.stringify(adminRename.data));
const userRename = await call('/auth/change-username', { method: 'POST', token: userToken, body: { newUsername: `改名${suffix}` } });
check('普通用户改昵称仍受限(400)', userRename.status === 400 && /每月/.test(userRename.data.error), JSON.stringify(userRename.data));

console.log('── 2. 邮箱修改冷却豁免 ──');
const adminRow = await query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
await query('UPDATE users SET last_email_change_at = now() WHERE id = $1', [adminRow[0].id]);
const adminEmail = await call('/auth/change-email', { method: 'POST', token: adminToken, body: { newEmail: `admin${suffix}@test.com` } });
check('管理员改邮箱不受限', adminEmail.status === 200, JSON.stringify(adminEmail.data));
await query('UPDATE users SET last_email_change_at = now() WHERE id = $1', [userId]);
const userEmailChange = await call('/auth/change-email', { method: 'POST', token: userToken, body: { newEmail: `u${suffix}@test.com` } });
check('普通用户改邮箱仍受限(400)', userEmailChange.status === 400 && /每月/.test(userEmailChange.data.error), JSON.stringify(userEmailChange.data));

console.log('── 3. 评论限流豁免 ──');
const gid = (await call('/games?pageSize=1')).data.games[0].id;
let adminOk = 0, userLimited = 0;
for (let i = 0; i < 7; i++) {
  const r = await call(`/games/${gid}/comments`, { method: 'POST', token: adminToken, body: { content: `管理员评论 ${i} 号` } });
  if (r.status === 201) adminOk++;
}
check(`管理员连发 7 条评论全成功（豁免限流）`, adminOk === 7, `ok=${adminOk}`);
for (let i = 0; i < 7; i++) {
  const r = await call(`/games/${gid}/comments`, { method: 'POST', token: userToken, body: { content: `普通用户评论 ${i} 号` } });
  if (r.status === 429) userLimited++;
}
check('普通用户第 6 条起被限流', userLimited >= 1, `limited=${userLimited}`);

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail ? 1 : 0);
