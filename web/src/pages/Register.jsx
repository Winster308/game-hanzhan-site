import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../api.js';

export default function Register() {
  const { register } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', code: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  /** 发送验证码（60 秒倒计时） */
  const sendCode = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setError('请先填写正确的邮箱');
    }
    setSending(true);
    try {
      const d = await api('/auth/send-register-code', { method: 'POST', body: { email: form.email } });
      show(d.message, 'ok');
      setCountdown(60);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(timerRef.current); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('两次输入的密码不一致');
    setLoading(true);
    try {
      await register(form.username, form.email, form.password, form.code);
      show('注册成功，欢迎加入！', 'ok');
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <form className="card form-card" onSubmit={submit}>
        <h2>注册账号</h2>
        <div className="form-group">
          <label>昵称</label>
          <input value={form.username} onChange={set('username')} required autoFocus />
          <p className="form-hint">3-32 位，字母 / 数字 / 下划线 / 中文</p>
        </div>
        <div className="form-group">
          <label>邮箱</label>
          <input type="email" value={form.email} onChange={set('email')} required />
          <p className="form-hint">注册必须通过邮箱验证码，请使用真实邮箱</p>
        </div>
        <div className="form-group">
          <label>邮箱验证码</label>
          <div className="flex" style={{ gap: 8 }}>
            <input value={form.code} onChange={set('code')} placeholder="6 位验证码" required
              style={{ flex: 1 }} inputMode="numeric" maxLength={6} />
            <button type="button" className="btn btn-ghost" onClick={sendCode} disabled={sending || countdown > 0}
              style={{ whiteSpace: 'nowrap' }}>
              {countdown > 0 ? `${countdown}s 后重发` : sending ? '发送中…' : '获取验证码'}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label>密码</label>
          <input type="password" value={form.password} onChange={set('password')} required />
          <p className="form-hint">6-72 位</p>
        </div>
        <div className="form-group">
          <label>确认密码</label>
          <input type="password" value={form.confirm} onChange={set('confirm')} required />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn" style={{ width: '100%' }} disabled={loading}>
          {loading ? '注册中…' : '注 册'}
        </button>
        <p className="mt16" style={{ fontSize: 13 }}>
          已有账号？<Link to="/login">去登录</Link>
        </p>
      </form>
    </div>
  );
}
