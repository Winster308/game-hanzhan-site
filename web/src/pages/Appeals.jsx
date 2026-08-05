import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatTime, formatRemaining } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Appeals() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { show } = useToast();
  const [appeals, setAppeals] = useState([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banned, setBanned] = useState(null);

  const load = useCallback(() => {
    api('/appeals/my').then((d) => setAppeals(d.appeals)).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return; // 等待 AuthContext 加载完成，避免误跳登录页
    if (!user) { navigate('/login'); return; }
    load();
    // 当前封禁状态
    api('/auth/me').then((d) => {
      const u = d.user;
      const ms = u.banned_until ? new Date(u.banned_until).getTime() - Date.now() : 0;
      // 永久封禁：banned_until 为 Infinity 经 JSON 序列化为 null，但 ban_reason 仍在
      if (ms > 0 || (!u.banned_until && !!u.ban_reason)) {
        setBanned({ reason: u.ban_reason, remainingMs: ms > 0 ? ms : null });
      } else {
        setBanned(null);
      }
    }).catch(() => {});
  }, [user, navigate, load, loading]);

  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 10) return show('申诉内容至少 10 个字', 'error');
    setSubmitting(true);
    try {
      await api('/appeals', { method: 'POST', body: { reason } });
      setReason('');
      show('申诉已提交，请耐心等待处理', 'ok');
      load();
    } catch (err) { show(err.message, 'error'); } finally { setSubmitting(false); }
  };

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1 className="page-title">🧾 封禁申诉</h1>
      </div>

      {banned ? (
        <form className="card mb16" style={{ padding: 22 }} onSubmit={submit}>
          <div className="card" style={{ background: 'var(--bg-hover)', padding: 14, marginBottom: 14, border: 'none' }}>
            <strong style={{ color: 'var(--danger)' }}>⛔ 当前处于封禁状态</strong>
            <p className="small mt8">
              原因：{banned.reason || '未说明'} · 剩余：{banned.remainingMs ? formatRemaining(banned.remainingMs) : '永久'}
            </p>
            <p className="small muted mt8">如认为封禁有误，请提交申诉，管理员会尽快处理。</p>
          </div>
          <div className="form-group">
            <label>申诉内容 *（10-2000 字，请说明情况）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', minHeight: 120 }}
              placeholder="例如：我并未发布违规内容，那条评论是误操作……"
            />
          </div>
          <button className="btn" disabled={submitting}>{submitting ? '提交中…' : '提交申诉'}</button>
        </form>
      ) : (
        <div className="card mb16" style={{ padding: 22 }}>
          <p className="muted">当前账号未被封禁，无需申诉。</p>
        </div>
      )}

      <div className="card" style={{ padding: 22 }}>
        <h3 className="mb16">我的申诉记录</h3>
        {appeals.length === 0 ? (
          <p className="muted small">暂无申诉记录</p>
        ) : appeals.map((a) => (
          <div key={a.id} className="comment-item">
            <div className="flex" style={{ gap: 8 }}>
              <span className={`badge ${a.status === 'pending' ? 'badge-yellow' : a.status === 'approved' ? 'badge-green' : 'badge-red'}`}>
                {a.status === 'pending' ? '处理中' : a.status === 'approved' ? '已通过（已解封）' : '已驳回'}
              </span>
              <span className="small muted">{formatTime(a.created_at)}</span>
            </div>
            <p className="comment-content mt8">{a.reason}</p>
            {a.reply && <p className="small mt8" style={{ color: 'var(--primary)' }}>管理员回复：{a.reply}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
