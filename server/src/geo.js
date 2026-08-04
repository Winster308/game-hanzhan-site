import { query } from './db.js';

/**
 * 异步 IP 地区增强（免费 ip-api.com，仅 http）。
 * 结果回填 visit_logs.country；任何失败静默降级，不影响主流程。
 */
const cache = new Map(); // ip -> country | null

export async function enrichCountry(ip) {
  if (!ip) return null;
  if (cache.has(ip)) return cache.get(ip);
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country`, {
      signal: AbortSignal.timeout(3500),
    });
    const data = await res.json();
    const country = data && data.status === 'success' ? String(data.country).slice(0, 60) : null;
    cache.set(ip, country);
    if (country) {
      // 回填最近 100 条该 IP 的记录（量少直接全表匹配该 ip）
      query('UPDATE visit_logs SET country = $1 WHERE ip = $2 AND country IS NULL', [country, ip]).catch(() => {});
    }
    return country;
  } catch {
    cache.set(ip, null);
    return null;
  }
}
