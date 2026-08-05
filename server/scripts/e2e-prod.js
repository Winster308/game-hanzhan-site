/* Railway 生产环境端到端验证 */
import fs from 'node:fs';
const BASE = 'https://server-production-8436.up.railway.app/api';
const adminPw = fs.readFileSync(process.env.ADMIN_PW_FILE || '', 'utf8').trim().split('=')[1];
let pass = 0, fail = 0;
const check = (n, c, e = '') => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n} ${e}`)); };

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  const suffix = Date.now().toString(36).slice(-6);

  console.log('── 1. 基础 ──');
  const health = await call('/health');
  check('health', health.data.ok === true);

  console.log('── 2. 管理员登录 ──');
  const login = await call('/auth/login', { method: 'POST', body: { account: 'Winster', password: adminPw } });
  check('Winster 登录', login.status === 200, JSON.stringify(login.data).slice(0, 150));
  const adminToken = login.data.token;

  console.log('── 3. 管理：添加游戏 + 更新日志 ──');
  const game = await call('/admin/games', { method: 'POST', token: adminToken, body: {
    title: `公网测试游戏${suffix}`, description: '端到端验证用', tags: ['测试'],
    original_url: 'https://example.com', localized_url: 'https://example.com/cn',
  } });
  check('添加游戏', game.status === 201, JSON.stringify(game.data));
  const gid = game.data.id;
  const upd = await call(`/admin/games/${gid}/updates`, { method: 'POST', token: adminToken, body: { version: 'v1.0.0', content: '上线测试' } });
  check('添加更新日志', upd.status === 201);

  console.log('── 4. 公开列表/详情 ──');
  const list = await call('/games?pageSize=10');
  check('列表含新游戏', list.data.games.some((g) => g.id === gid), JSON.stringify(list.data).slice(0, 80));
  const detail = await call(`/games/${gid}`);
  check('详情含评分字段', detail.data.game.rating_avg !== undefined);

  console.log('── 5. 注册用户 → 点赞/评论/评分 ──');
  const regEmail = `e2e${suffix}@test.com`;
  const regUsername = `公网用户${suffix}`;
  // 注册强制邮箱验证码：先发送验证码，再从数据库读取注入（脚本同时连接生产库时）
  const sendCode = await call('/auth/send-register-code', { method: 'POST', body: { email: regEmail } });
  check('发送注册验证码', sendCode.status === 200, JSON.stringify(sendCode.data).slice(0, 120));
  let regCode = '';
  if (process.env.E2E_DATABASE_URL) {
    try {
      const { default: pg } = await import('pg');
      const crypto = await import('node:crypto');
      const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
      await client.connect();
      // 与本地 smoke-test 的 injectCode 一致：置旧验证码失效，插入已知验证码
      const code = '123456';
      await client.query("UPDATE email_tokens SET used = TRUE WHERE email = $1 AND kind = 'register'", [regEmail]);
      await client.query(
        `INSERT INTO email_tokens (user_id, email, token_hash, kind, expires_at)
         VALUES (NULL, $1, $2, 'register', now() + interval '10 minutes')`,
        [regEmail, crypto.createHash('sha256').update(code).digest('hex')]
      );
      await client.end();
      regCode = code;
    } catch (err) {
      console.log('  ⚠ 数据库验证码注入失败（跳过注册链路）:', err.message);
    }
  } else {
    console.log('  ⚠ 未配置 E2E_DATABASE_URL，跳过注册链路（注册需邮箱验证码）');
  }
  let ut = null;
  if (regCode) {
    const reg = await call('/auth/register', { method: 'POST', body: { username: regUsername, email: regEmail, password: 'test123456', code: regCode } });
    check('注册', reg.status === 201, JSON.stringify(reg.data).slice(0, 120));
    ut = reg.data.token;
  } else {
    console.log('  ⚠ 跳过注册（无法获取验证码）');
  }
  if (ut) {
    const like = await call(`/games/${gid}/like`, { method: 'POST', token: ut });
    check('点赞', like.data.liked === true);
    const cm = await call(`/games/${gid}/comments`, { method: 'POST', token: ut, body: { content: '端到端测试评论内容，验证完整链路！' } });
    check('评论', cm.status === 201, JSON.stringify(cm.data).slice(0, 100));
    const rt = await call(`/games/${gid}/rating`, { method: 'POST', token: ut, body: { score: 5 } });
    check('评分', rt.data.my_rating === 5);
    const sv = await call(`/games/${gid}/saves`, { method: 'POST', token: ut, body: { title: '测试存档', content: 'save data 123' } });
    check('上传存档', sv.status === 201, JSON.stringify(sv.data).slice(0, 100));
  }

  console.log('── 6. 成就/通知 ──');
  if (ut) {
    const ach = await call('/my/achievements', { token: ut });
    check('成就解锁≥1', ach.data.unlocked_count >= 1, JSON.stringify(ach.data));
    const unread = await call('/notifications/unread-count', { token: ut });
    check('通知未读数≥1', unread.data.count >= 1, JSON.stringify(unread.data));
  } else {
    console.log('  ⚠ 跳过成就/通知验证（未注册）');
  }

  console.log('── 7. 管理统计 ──');
  const stats = await call('/admin/stats', { token: adminToken });
  check('统计接口', stats.status === 200 && stats.data.totals.games >= 1);

  console.log(`\n══════ 生产验证：${pass} 通过 / ${fail} 失败 ══════`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('异常:', e); process.exit(1); });
