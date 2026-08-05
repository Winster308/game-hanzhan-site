import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import Pagination from '../components/Pagination.jsx';

const TYPE_ICON = {
  save_reviewed: '💾', report_handled: '🚩', comment_reply: '💬', appeal_handled: '🧾',
  user_banned: '⛔', user_unbanned: '✅', achievement: '🏆', announcement: '📢',
};

export default function Notifications() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { show } = useToast();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    api(`/notifications?page=${page}&pageSize=20`).then((d) => { setList(d.notifications); setTotal(d.total); }).catch(() => {});
  }, [page]);

  useEffect(() => {
    if (loading) return; // 等待 AuthContext 加载完成，避免误跳登录页
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate, load, loading]);

  const readAll = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setList((l) => l.map((n) => ({ ...n, is_read: true })));
      show('已全部标记为已读', 'ok');
    } catch (err) { show(err.message, 'error'); }
  };

  if (!user) return null;

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="page-header">
        <h1 className="page-title">🔔 通知中心</h1>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={readAll}>全部已读</button>
        </div>
      </div>

      <div className="card" style={{ padding: 10 }}>
        {list.length === 0 ? (
          <div className="empty">暂无通知</div>
        ) : list.map((n) => (
          <Link
            key={n.id}
            to={n.link || '#'}
            style={{
              display: 'block', padding: '12px 14px', borderRadius: 10, color: 'var(--text)',
              borderBottom: '1px solid var(--border)', background: n.is_read ? 'transparent' : 'var(--primary-light)',
            }}
          >
            <div className="flex" style={{ gap: 8 }}>
              <span style={{ fontSize: 18 }}>{TYPE_ICON[n.type] || '🔔'}</span>
              <span style={{ fontWeight: n.is_read ? 500 : 700 }}>{n.title}</span>
              {!n.is_read && <span className="badge badge-red">新</span>}
              <span className="small muted" style={{ marginLeft: 'auto' }}>{formatTime(n.created_at)}</span>
            </div>
            {n.content && <p className="small muted mt8" style={{ paddingLeft: 26 }}>{n.content}</p>}
          </Link>
        ))}
      </div>
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  );
}
