import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Login() {
  const { login } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(account, password);
      show('登录成功', 'ok');
      navigate('/');
    } catch (err) {
      if (err.status === 403 && err.data?.ban_reason) {
        setError(`账号已被封禁：${err.data.ban_reason}`);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <form className="card form-card" onSubmit={submit}>
        <h2>登录</h2>
        <div className="form-group">
          <label>用户名 / 邮箱</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} required autoFocus />
        </div>
        <div className="form-group">
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn" style={{ width: '100%' }} disabled={loading}>
          {loading ? '登录中…' : '登 录'}
        </button>
        <div className="flex-between mt16" style={{ fontSize: 13 }}>
          <Link to="/register">没有账号？立即注册</Link>
          <Link to="/forgot-password">忘记密码？</Link>
        </div>
      </form>
    </div>
  );
}
