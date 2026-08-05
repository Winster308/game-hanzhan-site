import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { api, formatTime } from '../api.js';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [unread, setUnread] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api('/announcements', { auth: false }).then((d) => {
      const pinned = (d.announcements || []).filter((a) => a.is_pinned).slice(0, 1);
      setAnnouncements(pinned);
    }).catch(() => {});
  }, []);

  // 通知：登录后轮询未读数与最近通知
  useEffect(() => {
    if (!user) { setUnread(0); setRecentNotifs([]); return; }
    const load = () => {
      api('/notifications/unread-count').then((d) => setUnread(d.count)).catch(() => {});
      api('/notifications?page=1&pageSize=5').then((d) => setRecentNotifs(d.notifications)).catch(() => {});
    };
    load();
    const timer = setInterval(load, 45000); // 每 45 秒刷新
    return () => clearInterval(timer);
  }, [user]);

  const readAll = async () => {
    try { await api('/notifications/read-all', { method: 'POST' }); } catch { /* 忽略 */ }
    setUnread(0);
    setRecentNotifs((list) => list.map((n) => ({ ...n, is_read: true })));
  };

  const doSearch = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/?search=${encodeURIComponent(search.trim())}`);
  };

  return (
    <>
      {announcements.length > 0 && (
        <div className="announcement-bar">
          <span>📢</span>
          <span><Link to={`/announcements/${announcements[0].id}`}>{announcements[0].title}</Link></span>
          <span className="muted" style={{ marginLeft: 'auto', color: '#ddd' }}>置顶公告</span>
        </div>
      )}
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="logo">
            <span className="logo-icon">🎮</span> 游戏汉化站
          </Link>
          <div className="nav-links">
            <NavLink to="/" end>首页</NavLink>
            <NavLink to="/leaderboard">排行榜</NavLink>
            <NavLink to="/submit">投稿游戏</NavLink>
            <NavLink to="/announcements">公告</NavLink>
          </div>
          <form className="nav-search" onSubmit={doSearch}>
            <input
              placeholder="搜索游戏 / 标签..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit">搜索</button>
          </form>
          {user ? (
            <div className="nav-user" style={{ position: 'relative' }}>
              {/* 通知铃铛 */}
              <div style={{ position: 'relative' }}>
                <button
                  style={{
                    background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
                    color: '#e5e7eb', padding: 4, position: 'relative',
                  }}
                  title="通知"
                  onClick={() => setNotifOpen(!notifOpen)}
                >
                  🔔
                  {unread > 0 && (
                    <span style={{
                      position: 'absolute', top: -2, right: -4, background: '#ef4444', color: '#fff',
                      fontSize: 10, minWidth: 16, height: 16, borderRadius: 99,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                    }}>{unread > 99 ? '99+' : unread}</span>
                  )}
                </button>
                {notifOpen && (
                  <div className="dropdown" style={{ width: 300, padding: 8 }} onMouseLeave={() => setNotifOpen(false)}>
                    <div className="flex-between" style={{ padding: '4px 8px 8px' }}>
                      <strong style={{ fontSize: 14 }}>通知</strong>
                      <button className="btn btn-ghost btn-sm" onClick={readAll}>全部已读</button>
                    </div>
                    {recentNotifs.length === 0 ? (
                      <p className="muted small" style={{ padding: '14px 8px', textAlign: 'center' }}>暂无通知</p>
                    ) : recentNotifs.map((n) => (
                      <Link
                        key={n.id}
                        to={n.link || '/notifications'}
                        onClick={() => setNotifOpen(false)}
                        style={{
                          display: 'block', padding: '9px 8px', borderRadius: 8, color: 'var(--text)',
                          background: n.is_read ? 'transparent' : 'var(--primary-light)',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700 }}>{n.title}</div>
                        {n.content && (
                          <div className="small muted" style={{
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2,
                          }}>{n.content}</div>
                        )}
                        <div className="small muted" style={{ marginTop: 2 }}>{formatTime(n.created_at)}</div>
                      </Link>
                    ))}
                    <Link to="/notifications" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 6 }}
                      onClick={() => setNotifOpen(false)}>
                      查看全部通知 →
                    </Link>
                  </div>
                )}
              </div>
              <span className="username">{user.username}</span>
              {user.role === 'admin' && <span className="badge badge-yellow">管理员</span>}
              <button
                className="avatar"
                style={{ border: 'none', cursor: 'pointer' }}
                onClick={() => setMenuOpen(!menuOpen)}
                title="个人菜单"
              >
                {user.username.slice(0, 1).toUpperCase()}
              </button>
              {menuOpen && (
                <div className="dropdown" onMouseLeave={() => setMenuOpen(false)}>
                  <Link to="/profile" onClick={() => setMenuOpen(false)}>👤 个人中心</Link>
                  <Link to="/settings" onClick={() => setMenuOpen(false)}>⚙️ 设置</Link>
                  {user.role === 'admin' && (
                    <a href={import.meta.env.VITE_ADMIN_URL || '/admin'} target="_blank" rel="noreferrer"
                       onClick={() => setMenuOpen(false)}>🛠️ 管理后台</a>
                  )}
                  <button
                    className="danger"
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                      navigate('/');
                    }}
                  >
                    🚪 退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex">
              <Link to="/login" className="btn btn-ghost btn-sm">登录</Link>
              <Link to="/register" className="btn btn-sm">注册</Link>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
