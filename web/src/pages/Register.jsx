import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Register() {
  const { register } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('两次输入的密码不一致');
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
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
          <p className="form-hint">注册后建议完成邮箱验证（用于找回密码）</p>
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
