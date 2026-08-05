import { config } from './config.js';

/**
 * 校验游戏/投稿表单，返回 { error } 或 { value }。
 * value: { title, description, tags, originalUrl, localizedUrl, coverType, coverUrl, coverData }
 */
export function validateGameBody(body) {
  const b = body || {};
  const title = String(b.title || '').trim();
  const description = String(b.description || '').trim();
  const originalUrl = String(b.original_url || '').trim();
  const localizedUrl = String(b.localized_url || '').trim();
  let tags = Array.isArray(b.tags) ? b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10) : [];
  if (!title || title.length > 120) return { error: '标题需为 1-120 字' };
  if (!description || description.length > 20000) return { error: '简介需为 1-20000 字' };
  if (!/^https?:\/\//.test(originalUrl)) return { error: '原版链接需以 http(s):// 开头' };
  if (!/^https?:\/\//.test(localizedUrl)) return { error: '汉化链接需以 http(s):// 开头' };
  if (!tags.length) tags = ['未分类'];
  const coverType = b.cover_type === 'upload' ? 'upload' : 'url';
  let coverUrl = null;
  let coverData = null;
  if (coverType === 'upload') {
    const data = String(b.cover_data || '');
    if (!data.startsWith('data:image/')) return { error: '请上传图片文件' };
    const bytes = Buffer.byteLength(data, 'utf8');
    if (bytes > config.coverMaxBytes * 1.35) return { error: '图片不能超过 5MB' };
    coverData = data;
  } else {
    coverUrl = String(b.cover_url || '').trim() || null;
  }
  return {
    value: { title, description, tags, originalUrl, localizedUrl, coverType, coverUrl, coverData },
  };
}
