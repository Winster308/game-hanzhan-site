import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatTime } from '../api.js';

export default function AnnouncementDetail() {
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/announcements/${id}`, { auth: false })
      .then((d) => setA(d.announcement))
      .catch(() => setA(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="spin" />;
  if (!a) return <div className="empty">公告不存在或已过期</div>;

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="card mt16" style={{ padding: 30 }}>
        <Link to="/announcements" className="small">← 返回公告栏</Link>
        <h1 style={{ margin: '14px 0 8px' }}>{a.is_pinned && <span className="announcement-pin">📌 </span>}{a.title}</h1>
        <p className="small muted mb16">{a.author || '管理员'} · {formatTime(a.created_at)}{a.updated_at !== a.created_at && ' · 已编辑'}</p>
        <div style={{ lineHeight: 1.9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.content}</div>
      </div>
    </div>
  );
}
