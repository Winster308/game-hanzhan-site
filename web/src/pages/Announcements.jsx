import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime } from '../api.js';

export default function Announcements() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/announcements', { auth: false })
      .then((d) => setList(d.announcements))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="page-header">
        <h1 className="page-title">📢 公告栏</h1>
      </div>
      {loading ? <div className="spin" /> : list.length === 0 ? (
        <div className="empty">暂无公告</div>
      ) : (
        <div className="announcement-list">
          {list.map((a) => (
            <div className="card" key={a.id}>
              <div className="flex-between">
                <Link to={`/announcements/${a.id}`} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {a.is_pinned && <span className="announcement-pin">📌 </span>}
                  {a.title}
                </Link>
                <span className="small muted">{a.author || '管理员'} · {formatTime(a.created_at)}</span>
              </div>
              <p className="muted mt8 small" style={{
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{a.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
