import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { show } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('两次输入的密码不一致');
    setLoading(true);
    try {
      const d = await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: password } });
      show(d.message, 'ok');
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <form className="card form-card" onSubmit={submit}>
        <h2>重置密码</h2>
        <div className="form-group">
          <label>新密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>确认新密码</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn" style={{ width: '100%' }} disabled={loading}>{loading ? '提交中…' : '重置密码'}</button>
        <p className="mt16" style={{ fontSize: 13 }}>
          <Link to="/login">← 返回登录</Link>
        </p>
      </form>
    </div>
  );
}
