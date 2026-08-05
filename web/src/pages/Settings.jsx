import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatTime, formatRemaining } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Settings() {
  const { user, refresh, loading } = useAuth();
  const { theme, setTheme } = useTheme();
  const { show } = useToast();
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0);
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const emailTimerRef = useRef(null);
  const [passwords, setPasswords] = useState({ old: '', next: '', confirm: '' });
  const [msg, setMsg] = useState({});

  useEffect(() => {
    if (loading) return; // 等待 AuthContext 加载完成，避免误跳登录页
    if (!user) { navigate('/login'); return; }
    setUsername(user.username);
    setEmail(user.email);
    api('/auth/login-logs').then((d) => setLogs(d.logs)).catch(() => {});
  }, [user, navigate, loading]);

  if (!user) return null;

  const doChangeUsername = async (e) => {
    e.preventDefault();
    try {
      await api('/auth/change-username', { method: 'POST', body: { newUsername: username } });
      setMsg({ ...msg, username: '昵称修改成功，下次修改需等待 30 天' });
      refresh();
    } catch (err) { setMsg({ ...msg, username: err.message }); }
  };

  const doChangeEmail = async (e) => {
    e.preventDefault();
    try {
      await api('/auth/change-email', { method: 'POST', body: { newEmail: email, code: emailCode } });
      setMsg({ ...msg, email: '邮箱修改成功' });
      setEmailCode('');
      refresh();
    } catch (err) { setMsg({ ...msg, email: err.message }); }
  };

  /** 发送"修改邮箱"验证码到新邮箱（60 秒倒计时） */
  const sendEmailCode = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setMsg({ ...msg, email: '请先填写正确的新邮箱' });
    }
    setEmailCodeSending(true);
    try {
      const d = await api('/auth/send-change-email-code', { method: 'POST', body: { newEmail: email } });
      setMsg({ ...msg, email: d.message });
      setEmailCodeCountdown(60);
      clearInterval(emailTimerRef.current);
      emailTimerRef.current = setInterval(() => {
        setEmailCodeCountdown((c) => {
          if (c <= 1) { clearInterval(emailTimerRef.current); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (err) { setMsg({ ...msg, email: err.message }); } finally { setEmailCodeSending(false); }
  };

  const doChangePassword = async (e) => {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) {
      setMsg({ ...msg, password: '两次输入的新密码不一致' });
      return;
    }
    try {
      await api('/auth/change-password', { method: 'POST', body: { oldPassword: passwords.old, newPassword: passwords.next } });
      setMsg({ ...msg, password: '密码修改成功' });
      setPasswords({ old: '', next: '', confirm: '' });
    } catch (err) { setMsg({ ...msg, password: err.message }); }
  };

  const resendVerify = async () => {
    try {
      const d = await api('/auth/resend-verify', { method: 'POST' });
      show(d.message, 'ok');
    } catch (err) { show(err.message, 'error'); }
  };

  const bannedUntilMs = user.banned_until ? new Date(user.banned_until).getTime() : 0;
  // 永久封禁：banned_until 为 Infinity 经 JSON 序列化为 null，但 ban_reason 仍在
  const isBanned = bannedUntilMs > Date.now() || (!user.banned_until && !!user.ban_reason);
  const banRemainingMs = bannedUntilMs > Date.now() ? bannedUntilMs - Date.now() : null;

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="page-header">
        <h1 className="page-title">⚙️ 设置</h1>
      </div>

      {isBanned && (
        <div className="card mb16" style={{ padding: 16, borderColor: 'var(--danger)' }}>
          <strong style={{ color: 'var(--danger)' }}>⛔ 账号封禁中</strong>
          <p className="small mt8">
            原因：{user.ban_reason || '未说明'} · 剩余：{banRemainingMs ? formatRemaining(banRemainingMs) : '永久'}
          </p>
          <button className="btn btn-outline btn-sm mt8" onClick={() => navigate('/appeals')}>
            提交封禁申诉
          </button>
        </div>
      )}

      {/* 主题 */}
      <div className="card mb16" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 12 }}>🎨 主题</h3>
        <div className="flex" style={{ gap: 10 }}>
          {[['light', '☀️ 亮色'], ['dark', '🌙 暗色'], ['system', '💻 跟随系统']].map(([v, label]) => (
            <button key={v} className={`btn btn-sm ${theme === v ? '' : 'btn-ghost'}`} onClick={() => setTheme(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 账号与安全 */}
      <div className="card mb16" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 12 }}>🔐 账号与安全</h3>

        <form onSubmit={doChangeUsername} className="mb16" style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <div className="flex" style={{ flexWrap: 'wrap' }}>
            <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: 220 }} required />
            <button className="btn btn-sm">修改昵称</button>
          </div>
          <p className="form-hint">昵称每月只能修改一次</p>
          {msg.username && <p className={msg.username.includes('成功') ? 'form-success' : 'form-error'}>{msg.username}</p>}
        </form>

        <form onSubmit={doChangeEmail} className="mb16" style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <div className="flex" style={{ flexWrap: 'wrap' }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: 260 }} required />
            <button type="button" className="btn btn-ghost btn-sm" onClick={sendEmailCode} disabled={emailCodeSending || emailCodeCountdown > 0}>
              {emailCodeCountdown > 0 ? `${emailCodeCountdown}s 后重发` : emailCodeSending ? '发送中…' : '发送验证码'}
            </button>
          </div>
          <div className="flex mt8" style={{ flexWrap: 'wrap' }}>
            <input value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="新邮箱收到的 6 位验证码"
              required inputMode="numeric" maxLength={6} style={{ width: 200 }} />
            <button className="btn btn-sm">确认修改邮箱</button>
          </div>
          <p className="form-hint">
            邮箱每月只能修改一次（管理员不受限）· 当前状态：
            {user.email_verified
              ? <span className="badge badge-green">已验证</span>
              : <span className="badge badge-yellow">未验证</span>}
            {!user.email_verified && <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={resendVerify}>重新发送验证邮件</button>}
          </p>
          {msg.email && <p className={msg.email.includes('成功') ? 'form-success' : 'form-error'}>{msg.email}</p>}
        </form>

        <form onSubmit={doChangePassword}>
          <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input type="password" placeholder="原密码" value={passwords.old}
              onChange={(e) => setPasswords({ ...passwords, old: e.target.value })} required />
            <input type="password" placeholder="新密码（6-72位）" value={passwords.next}
              onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} required />
            <input type="password" placeholder="确认新密码" value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} required />
            <button className="btn btn-sm">修改密码</button>
          </div>
          <p className="form-hint">密码每月只能修改一次</p>
          {msg.password && <p className={msg.password.includes('成功') ? 'form-success' : 'form-error'}>{msg.password}</p>}
        </form>
      </div>

      {/* 登录 IP 记录 */}
      <div className="card mb16" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 12 }}>🌐 登录 IP 记录 <span className="small muted">（最近 100 条）</span></h3>
        {logs.length === 0 ? <p className="muted small">暂无记录</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>时间</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>IP</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>设备</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>结果</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{formatTime(l.created_at)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{l.ip || '-'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.user_agent || '-'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                      {l.success ? <span className="badge badge-green">成功</span> : <span className="badge badge-red">失败</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
