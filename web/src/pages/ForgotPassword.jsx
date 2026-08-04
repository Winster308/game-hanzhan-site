import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const d = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setMessage(d.message);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <form className="card form-card" onSubmit={submit}>
        <h2>找回密码</h2>
        <p className="muted small mb16">输入注册邮箱，我们将发送重置链接（1 小时内有效）</p>
        <div className="form-group">
          <label>邮箱</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {message && <p className={message.includes('发送') || message.includes('已') ? 'form-success' : 'form-error'}>{message}</p>}
        <button className="btn" style={{ width: '100%' }} disabled={loading}>{loading ? '发送中…' : '发送重置链接'}</button>
        <p className="mt16" style={{ fontSize: 13 }}>
          <Link to="/login">← 返回登录</Link>
        </p>
      </form>
    </div>
  );
}
