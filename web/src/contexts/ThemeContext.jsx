import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken } from '../api.js';

const ThemeContext = createContext(null);

const THEME_KEY = 'ghz_theme';

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme) {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || 'system');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 跟随系统变化
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // 登录后应用账号主题（AuthContext 触发 ghz:theme-user 事件）
  useEffect(() => {
    const onUserTheme = (e) => {
      const t = e.detail;
      if (['light', 'dark', 'system'].includes(t)) {
        setThemeState(t);
        localStorage.setItem(THEME_KEY, t);
      }
    };
    window.addEventListener('ghz:theme-user', onUserTheme);
    return () => window.removeEventListener('ghz:theme-user', onUserTheme);
  }, []);

  const setTheme = async (t) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    // 登录状态下同步到账号
    if (getToken()) {
      try { await api('/auth/theme', { method: 'PUT', body: { theme: t } }); } catch { /* 忽略 */ }
    }
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
