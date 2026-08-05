/* 冒烟测试：覆盖核心 API 链路（本地开发数据库） */
import crypto from 'node:crypto';
import { query } from '../src/db.js';

const BASE = 'http://localhost:3001/api';
let pass = 0, fail = 0;
let userToken = null, adminToken = null, gameId = null, commentId = null, replyId = null, saveId = null, reportId = null, appealId = null;

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

/** 本地测试用：直接向数据库插入指定验证码 */
async function injectCode(email, code) {
  await query("UPDATE email_tokens SET used = TRUE WHERE email = $1 AND kind = 'register'", [email]);
  await query(
    `INSERT INTO email_tokens (user_id, email, token_hash, kind, expires_at)
     VALUES (NULL, $1, $2, 'register', now() + interval '10 minutes')`,
    [email, crypto.createHash('sha256').update(code).digest('hex')]
  );
}

async function main() {
  const suffix = Date.now().toString(36);

  console.log('── 1. 健康检查 ──');
  const health = await call('/health');
  check('health ok', health.data.ok === true, JSON.stringify(health.data));

  console.log('── 2. 注册/登录 ──');
  const regEmail = `t${suffix}@test.com`;
  // 未带验证码注册 → 必须拒绝
  const noCode = await call('/auth/register', { method: 'POST', body: { username: `测试用户${suffix.slice(-6)}`, email: regEmail, password: 'test123456' } });
  check('无验证码注册被拒', noCode.status === 400, JSON.stringify(noCode.data));
  // 错误验证码 → 拒绝
  await injectCode(regEmail, '123456');
  const badCode = await call('/auth/register', { method: 'POST', body: { username: `测试用户${suffix.slice(-6)}`, email: regEmail, password: 'test123456', code: '000000' } });
  check('错误验证码被拒', badCode.status === 400, JSON.stringify(badCode.data));
  // 正确验证码 → 注册成功（邮箱已验证）
  const reg = await call('/auth/register', { method: 'POST', body: { username: `测试用户${suffix.slice(-6)}`, email: regEmail, password: 'test123456', code: '123456' } });
  check('验证码注册成功', reg.status === 201 && reg.data.user.email_verified === true, JSON.stringify(reg.data).slice(0, 150));
  userToken = reg.data.token;

  const regWinster = await call('/auth/register', { method: 'POST', body: { username: 'Winster', email: 'w2@test.com', password: 'test123456' } });
  check('禁止注册管理员名', regWinster.status === 400, JSON.stringify(regWinster.data));

  const login = await call('/auth/login', { method: 'POST', body: { account: 'Winster', password: 'Winster@2025' } });
  check('管理员登录', login.status === 200, JSON.stringify(login.data).slice(0, 120));
  adminToken = login.data.token;

  const badLogin = await call('/auth/login', { method: 'POST', body: { account: 'Winster', password: 'wrong' } });
  check('错误密码被拒', badLogin.status === 401);

  console.log('── 3. 游戏列表/详情/评分聚合 ──');
  const list = await call('/games?page=1&pageSize=5');
  check('游戏列表（含示例）', list.status === 200 && list.data.games.length >= 3, JSON.stringify(list.data).slice(0, 100));
  gameId = list.data.games[0].id;

  const detail = await call(`/games/${gameId}`, { token: userToken });
  check('详情含评分字段', detail.data.game.rating_avg !== undefined && detail.data.game.my_rating === null);
  check('详情含热度分', typeof detail.data.game.score === 'number');

  const tags = await call('/games/tags');
  check('标签列表', tags.status === 200 && tags.data.tags.length > 0);

  console.log('── 4. 点赞/收藏/评分/游玩 ──');
  const like = await call(`/games/${gameId}/like`, { method: 'POST', token: userToken });
  check('点赞成功', like.data.liked === true, JSON.stringify(like.data));
  const fav = await call(`/games/${gameId}/favorite`, { method: 'POST', token: userToken });
  check('收藏成功', fav.data.favorited === true);
  const rating = await call(`/games/${gameId}/rating`, { method: 'POST', body: { score: 5 }, token: userToken });
  check('评分 5 星', rating.data.my_rating === 5 && rating.data.rating_count >= 1, JSON.stringify(rating.data));
  const rating2 = await call(`/games/${gameId}/rating`, { method: 'POST', body: { score: 3 }, token: userToken });
  check('改分为 3 星', rating2.data.my_rating === 3 && rating2.data.rating_avg === 3);
  const play = await call(`/games/${gameId}/play`, { method: 'POST' });
  check('游玩计数+1', play.data.play_count > list.data.games[0].play_count);

  console.log('── 5. 评论/楼中楼 ──');
  const short = await call(`/games/${gameId}/comments`, { method: 'POST', body: { content: '短' }, token: userToken });
  check('过短评论被拒', short.status === 400, JSON.stringify(short.data));
  const comment = await call(`/games/${gameId}/comments`, { method: 'POST', body: { content: '这游戏真的很好玩，汉化质量很高！' }, token: userToken });
  check('发表评论', comment.status === 201, JSON.stringify(comment.data));
  commentId = comment.data.comment.id;
  const reply = await call(`/games/${gameId}/comments`, { method: 'POST', body: { content: '同意！画风也超棒', parent_id: commentId }, token: userToken });
  check('楼中楼回复', reply.status === 201 && reply.data.comment.parent_id === commentId);
  replyId = reply.data.comment.id;
  const list2 = await call(`/games/${gameId}/comments`);
  const top = list2.data.comments.find((c) => c.id === commentId);
  check('回复嵌套返回', top && top.replies.length === 1, JSON.stringify(top && top.replies));
  const edit = await call(`/comments/${commentId}`, { method: 'PUT', body: { content: '修改后的评论内容' }, token: userToken });
  check('编辑评论', edit.status === 200);
  const delReply = await call(`/comments/${replyId}`, { method: 'DELETE', token: userToken });
  check('删除回复', delReply.status === 200);

  console.log('── 6. 存档银行 ──');
  const save = await call(`/games/${gameId}/saves`, { method: 'POST', body: { title: '完美通关存档', content: '金钱999999\n全道具收集' }, token: userToken });
  check('上传存档（待审核）', save.status === 201 && save.data.save.status === 'pending', JSON.stringify(save.data));
  saveId = save.data.save.id;

  console.log('── 7. 游戏投稿 ──');
  const submit = await call('/submissions', { method: 'POST', token: userToken, body: { title: '冒烟测试投稿', description: '测试投稿内容', tags: ['测试'], original_url: 'https://example.com', localized_url: 'https://example.com/cn' } });
  check('提交投稿', submit.status === 201 && submit.data.submission.status === 'pending', JSON.stringify(submit.data));
  const submitId = submit.data.submission.id;
  const noAuthSubmit = await call('/submissions', { method: 'POST', body: { title: 'x', description: 'y', tags: [], original_url: 'https://a.com', localized_url: 'https://b.com' } });
  check('未登录投稿被拒', noAuthSubmit.status === 401);
  const adminSubmits = await call('/admin/submissions?status=pending', { token: adminToken });
  check('后台投稿列表', adminSubmits.status === 200 && adminSubmits.data.submissions.some((s) => s.id === submitId));
  const approveSub = await call(`/admin/submissions/${submitId}`, { method: 'PUT', token: adminToken, body: { action: 'approve' } });
  check('审核通过并上架', approveSub.status === 200 && approveSub.data.game_id, JSON.stringify(approveSub.data));
  const newGameId = approveSub.data.game_id;
  const published = await call(`/games/${newGameId}`);
  check('上架后游戏可见', published.status === 200 && published.data.game.title === '冒烟测试投稿');
  const mySubs = await call('/submissions/my', { token: userToken });
  check('我的投稿状态已通过', mySubs.data.submissions.find((s) => s.id === submitId)?.status === 'approved');
  const rejectSub = await call('/submissions', { method: 'POST', token: userToken, body: { title: '冒烟测试投稿2', description: '将被驳回', tags: [], original_url: 'https://example.com', localized_url: 'https://example.com/cn' } });
  const rejectRes = await call(`/admin/submissions/${rejectSub.data.submission.id}`, { method: 'PUT', token: adminToken, body: { action: 'reject', reason: '测试驳回' } });
  check('审核驳回', rejectRes.status === 200);

  console.log('── 8. 举报 ──');
  const report = await call('/reports', { method: 'POST', body: { target_type: 'comment', target_id: commentId, reason: '广告/引流', detail: '测试举报' }, token: userToken });
  check('提交举报', report.status === 201, JSON.stringify(report.data));
  reportId = report.data.report.id;
  const dupReport = await call('/reports', { method: 'POST', body: { target_type: 'comment', target_id: commentId, reason: '其他' }, token: userToken });
  check('重复举报被拒', dupReport.status === 400);

  console.log('── 9. 通知/成就 ──');
  const unread = await call('/notifications/unread-count', { token: userToken });
  check('成就通知已生成（未读数≥1）', unread.data.count >= 1, JSON.stringify(unread.data));
  const ach = await call('/my/achievements', { token: userToken });
  check('成就列表（至少解锁初出茅庐/点个赞等）', ach.data.unlocked_count >= 2 && ach.data.level.level >= 1, JSON.stringify(ach.data.level));
  const notifList = await call('/notifications?page=1', { token: userToken });
  check('通知列表', notifList.data.notifications.length >= 1);
  await call('/notifications/read-all', { method: 'POST', token: userToken });
  const unread2 = await call('/notifications/unread-count', { token: userToken });
  check('全部已读', unread2.data.count === 0);

  console.log('── 10. 管理后台 ──');
  const adminGames = await call('/admin/games?page=1', { token: adminToken });
  check('管理端游戏列表', adminGames.status === 200);
  const newGame = await call('/admin/games', { method: 'POST', token: adminToken, body: { title: '冒烟测试游戏', description: '测试用游戏', tags: ['测试'], original_url: 'https://example.com', localized_url: 'https://example.com/cn' } });
  check('添加游戏', newGame.status === 201, JSON.stringify(newGame.data));
  const upd = await call(`/admin/games/${newGame.data.id}/updates`, { method: 'POST', token: adminToken, body: { version: 'v1.0.1', content: '修复崩溃问题' } });
  check('添加更新日志', upd.status === 201);
  const updates = await call(`/games/${newGame.data.id}/updates`);
  check('公开更新日志', updates.data.updates.length === 1 && updates.data.updates[0].version === 'v1.0.1');
  const saveApprove = await call(`/admin/saves/${saveId}`, { method: 'PUT', token: adminToken, body: { action: 'approve' } });
  check('存档审核通过', saveApprove.status === 200);
  const reportApprove = await call(`/admin/reports/${reportId}`, { method: 'PUT', token: adminToken, body: { action: 'approve', ban_hours: 2, reason: '广告内容', delete_comment: true } });
  check('举报确认+封禁', reportApprove.status === 200, JSON.stringify(reportApprove.data));
  const stats = await call('/admin/stats', { token: adminToken });
  check('仪表盘统计（含在线/地区/搜索字段）', stats.status === 200 && stats.data.online_now !== undefined && stats.data.regions !== undefined, JSON.stringify(stats.data).slice(0, 80));
  const audit = await call('/admin/audit-logs?page=1', { token: adminToken });
  check('审计日志', audit.data.logs.length >= 5, `count=${audit.data.logs.length}`);

  console.log('── 11. 封禁/申诉 ──');
  const banUser = await call(`/admin/users/${reg.data.user.id}/ban`, { method: 'PUT', token: adminToken, body: { hours: 48, reason: '测试封禁' } });
  check('封禁用户', banUser.status === 200);
  const bannedComment = await call(`/games/${gameId}/comments`, { method: 'POST', body: { content: '被封禁后还能评论吗' }, token: userToken });
  check('封禁后评论被拒(403)', bannedComment.status === 403, JSON.stringify(bannedComment.data));
  const appeal = await call('/appeals', { method: 'POST', body: { reason: '我并没有违规，那条评论是误会，请求解封！' }, token: userToken });
  check('提交申诉', appeal.status === 201, JSON.stringify(appeal.data));
  appealId = appeal.data.appeal.id;
  const appealApprove = await call(`/admin/appeals/${appealId}`, { method: 'PUT', token: adminToken, body: { action: 'approve', reply: '欢迎回来' } });
  check('申诉通过=解封', appealApprove.status === 200);
  const commentAfter = await call(`/games/${gameId}/comments`, { method: 'POST', body: { content: '解封后恢复评论权限' }, token: userToken });
  check('解封后可评论', commentAfter.status === 201);

  console.log('── 12. 搜索记录 ──');
  await call('/games?search=星露');
  const stats2 = await call('/admin/stats', { token: adminToken });
  check('热门搜索词有记录', stats2.data.hot_searches.length >= 1, JSON.stringify(stats2.data.hot_searches));

  console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('测试脚本异常:', e); process.exit(1); });
