import { query } from './db.js';

/** 站内通知（异步安全，失败不影响主流程） */
export async function notify(userId, type, title, content = null, link = null) {
  if (!userId) return;
  try {
    await query(
      'INSERT INTO notifications (user_id, type, title, content, link) VALUES ($1,$2,$3,$4,$5)',
      [userId, type, title, content, link]
    );
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

/** 群发通知（公告等场景；用户量大时改为按需拉取） */
export async function notifyAll(type, title, content = null, link = null) {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, content, link)
       SELECT id, $1, $2, $3, $4 FROM users`,
      [type, title, content, link]
    );
  } catch (err) {
    console.error('[notifyAll] failed:', err.message);
  }
}
