import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { isBanned } from '../utils.js';

const router = Router();

const REASONS = ['辱骂/人身攻击', '广告/引流', '色情/低俗', '剧透', '其他'];

// ── 提交举报（登录） ──────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { target_type: targetType, target_id: targetId, reason, detail } = req.body || {};
    if (!['comment', 'user', 'game'].includes(targetType)) {
      return res.status(400).json({ error: '举报对象类型不合法' });
    }
    const tid = Number(targetId);
    if (!Number.isInteger(tid) || tid <= 0) return res.status(400).json({ error: '举报对象不合法' });
    if (!REASONS.includes(reason)) return res.status(400).json({ error: '举报原因不合法' });
    const d = String(detail || '').trim();
    if (d.length > 500) return res.status(400).json({ error: '补充说明不能超过 500 字' });

    // 校验目标存在
    let exists = false;
    if (targetType === 'comment') {
      const r = await query('SELECT id FROM comments WHERE id = $1', [tid]);
      exists = r.length > 0;
    } else if (targetType === 'user') {
      const r = await query('SELECT id FROM users WHERE id = $1', [tid]);
      exists = r.length > 0;
    } else {
      const r = await query('SELECT id FROM games WHERE id = $1', [tid]);
      exists = r.length > 0;
    }
    if (!exists) return res.status(404).json({ error: '举报目标不存在' });

    const ban = await isBanned(req.user.id);
    if (ban.banned) return res.status(403).json({ error: `账号已被封禁${ban.reason ? '：' + ban.reason : ''}` });

    // 防止重复举报同一目标
    const dup = await query(
      `SELECT id FROM reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'pending'`,
      [req.user.id, targetType, tid]
    );
    if (dup.length) return res.status(400).json({ error: '您已举报过该内容，请等待管理员处理' });

    const rows = await query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, detail)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, status, created_at`,
      [req.user.id, targetType, tid, reason, d]
    );
    res.status(201).json({ report: rows[0], message: '举报已提交，感谢您的反馈' });
  } catch (err) {
    console.error('[reports/create]', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── 我的举报记录 ──────────────────────────────────────
router.get('/my', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, target_type, target_id, reason, detail, status, action_note, created_at
       FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ reports: rows });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
