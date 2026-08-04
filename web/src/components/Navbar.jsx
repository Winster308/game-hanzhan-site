import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { api } from '../api.js';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api('/announcements', { auth: false }).then((d) => {
      const pinned = (d.announcements || []).filter((a) => a.is_pinned).slice(0, 1);
      setAnnouncements(pinned);
    }).catch(() => {});
  }, []);

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
            <NavLink to="/saves">存档银行</NavLink>
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
