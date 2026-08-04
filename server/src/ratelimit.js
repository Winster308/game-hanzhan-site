/**
 * 轻量内存限流（单实例够用；多实例部署建议换 Redis）。
 * 用于登录尝试等场景。
 */
const buckets = new Map();

export function rateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  const entry = buckets.get(key) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  if (entry.timestamps.length >= limit) {
    buckets.set(key, entry);
    return { allowed: false, retryAfterMs: windowMs - (now - entry.timestamps[0]) };
  }
  entry.timestamps.push(now);
  buckets.set(key, entry);
  return { allowed: true };
}

// 定时清理过期桶，防止内存膨胀
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 10 * 60 * 1000);
    if (entry.timestamps.length === 0) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();
