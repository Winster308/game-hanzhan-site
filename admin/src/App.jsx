import { useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Games from './pages/Games.jsx';
import Comments from './pages/Comments.jsx';
import Users from './pages/Users.jsx';
import Reports from './pages/Reports.jsx';
import Saves from './pages/Saves.jsx';
import Appeals from './pages/Appeals.jsx';
import Announcements from './pages/Announcements.jsx';
import AuditLogs from './pages/AuditLogs.jsx';

function Toast({ message }) {
  if (!message) return null;
  return <div className={`toast ${message.type === 'error' ? 'error' : ''}`}>{message.text}</div>;
}

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const show = (text, type = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2600);
  };

  const links = [
    ['/admin', '📊', '仪表盘'],
    ['/admin/games', '🎮', '游戏管理'],
    ['/admin/comments', '💬', '评论管理'],
    ['/admin/users', '👥', '用户管理'],
    ['/admin/reports', '🚩', '举报审核'],
    ['/admin/appeals', '🧾', '申诉审核'],
    ['/admin/saves', '💾', '存档审核'],
    ['/admin/announcements', '📢', '公告管理'],
    ['/admin/audit', '📜', '审计日志'],
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo"><span>🎮</span><span className="txt">游戏汉化站</span></div>
        {links.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/admin'}>
            <span>{icon}</span><span className="txt">{label}</span>
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="small muted" style={{ padding: '0 12px 8px' }}>{user?.username}</div>
        <button className="logout" onClick={() => { logout(); navigate('/admin/login'); }}>
          🚪 <span className="txt">退出登录</span>
        </button>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard show={show} />} />
          <Route path="/games" element={<Games show={show} />} />
          <Route path="/comments" element={<Comments show={show} />} />
          <Route path="/users" element={<Users show={show} />} />
          <Route path="/reports" element={<Reports show={show} />} />
          <Route path="/appeals" element={<Appeals show={show} />} />
          <Route path="/saves" element={<Saves show={show} />} />
          <Route path="/announcements" element={<Announcements show={show} />} />
          <Route path="/audit" element={<AuditLogs />} />
        </Routes>
      </main>
      <Toast message={toast} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}

function Inner() {
  const { user, loading } = useAuth();
  if (loading) return <div className="spin" />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return <Layout />;
}
