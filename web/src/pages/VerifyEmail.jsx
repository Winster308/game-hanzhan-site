import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState('loading'); // loading | ok | fail

  useEffect(() => {
    if (!token) { setState('fail'); return; } // 无 token 直接判定失败，不发无意义请求
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('ok'))
      .catch(() => setState('fail'));
  }, [token]);

  return (
    <div className="container">
      <div className="card form-card" style={{ textAlign: 'center' }}>
        {state === 'loading' && <div className="spin" />}
        {state === 'ok' && (
          <>
            <div style={{ fontSize: 42 }}>✅</div>
            <h2 className="mt16">邮箱验证成功</h2>
            <p className="muted mt8">您的账号已通过邮箱验证</p>
            <Link to="/" className="btn mt16">返回首页</Link>
          </>
        )}
        {state === 'fail' && (
          <>
            <div style={{ fontSize: 42 }}>❌</div>
            <h2 className="mt16">验证失败</h2>
            <p className="muted mt8">链接无效或已过期</p>
            <Link to="/settings" className="btn mt16">前往设置重新发送</Link>
          </>
        )}
      </div>
    </div>
  );
}
