import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
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
    } catch (err) {
      setError(err.data?.ban_reason ? `账号已被封禁：${err.data.ban_reason}` : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e1b4b' }}>
      <form onSubmit={submit} className="card" style={{ width: 380, padding: 30 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 34 }}>🎮</div>
          <h2 style={{ marginTop: 8 }}>游戏汉化站 · 管理后台</h2>
          <p className="small muted mt8">仅限管理员登录</p>
        </div>
        <div className="form-group mb16">
          <label>用户名 / 邮箱</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} required autoFocus />
        </div>
        <div className="form-group mb16">
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn" style={{ width: '100%', padding: '10px' }} disabled={loading}>
          {loading ? '登录中…' : '登 录'}
        </button>
      </form>
    </div>
  );
}
