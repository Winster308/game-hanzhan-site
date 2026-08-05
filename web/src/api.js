export const TOKEN_KEY = 'ghz_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const BASE = import.meta.env.VITE_API_URL || '';

/** 统一 API 请求封装 */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // token 过期/无效：统一清除并通知全局登出（避免页面停留在"已登录"假象）。
  // 排除 auth 类接口：登录/注册/验证/重置失败返回 401 属正常业务，不应登出当前用户。
  if (res.status === 401 && auth && !path.startsWith('/auth/')) {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('ghz:unauthorized'));
    const err = new Error('登录已过期，请重新登录');
    err.status = 401;
    err.data = { error: '登录已过期，请重新登录' };
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `请求失败 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** 上报页面访问（当日人数统计） */
export function reportVisit() {
  try {
    navigator.sendBeacon(`${BASE}/api/visit`);
  } catch { /* 忽略 */ }
}

export function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatRemaining(ms) {
  if (ms <= 0) return '';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours} 小时 ${mins} 分钟`;
}
