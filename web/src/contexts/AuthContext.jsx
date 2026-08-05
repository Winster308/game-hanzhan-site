import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api('/auth/me');
      setUser(user);
      // 登录后应用账号主题（跨设备一致）
      if (user?.theme) {
        localStorage.setItem('ghz_theme', user.theme);
        window.dispatchEvent(new CustomEvent('ghz:theme-user', { detail: user.theme }));
      }
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 任意接口返回 401（token 过期/被撤销）→ 全局登出
  useEffect(() => {
    const onUnauthorized = () => { setToken(null); setUser(null); };
    window.addEventListener('ghz:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ghz:unauthorized', onUnauthorized);
  }, []);

  const login = async (account, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { account, password } });
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async (username, email, password, code) => {
    const data = await api('/auth/register', { method: 'POST', body: { username, email, password, code } });
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
