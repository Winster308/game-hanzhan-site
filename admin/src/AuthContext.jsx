import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api('/auth/me')
      .then((d) => {
        if (d.user?.role !== 'admin') {
          setToken(null);
          setUser(null);
        } else {
          setUser(d.user);
        }
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // 任意接口返回 401（token 过期/被撤销）→ 全局登出
  useEffect(() => {
    const onUnauthorized = () => { setToken(null); setUser(null); };
    window.addEventListener('ghz:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ghz:unauthorized', onUnauthorized);
  }, []);

  const login = async (account, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { account, password } });
    if (data.user?.role !== 'admin') {
      const err = new Error('该账号不是管理员');
      throw err;
    }
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => { setToken(null); setUser(null); };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
