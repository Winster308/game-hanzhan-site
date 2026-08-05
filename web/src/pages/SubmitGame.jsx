import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

const EMPTY_FORM = {
  title: '', description: '', tags: '', original_url: '', localized_url: '',
  cover_type: 'url', cover_url: '',
};

export default function SubmitGame() {
  const { user, loading } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [coverPreview, setCoverPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    if (loading) return; // 等待 AuthContext 加载完成，避免误跳登录页
    if (!user) { navigate('/login'); return; }
    api('/submissions/my').then((d) => setSubmissions(d.submissions || [])).catch(() => {});
  }, [user, loading, navigate]);

  /** 封面图片 → base64 */
  const handleCoverFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return show('请选择图片文件', 'error');
    if (file.size > 5 * 1024 * 1024) return show('图片不能超过 5MB', 'error');
    const reader = new FileReader();
    reader.onload = () => {
      setForm({ ...form, cover_type: 'upload', cover_url: '' });
      setCoverPreview(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/submissions', {
        method: 'POST',
        body: {
          ...form,
          tags: form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
          cover_data: form.cover_type === 'upload' ? coverPreview : null,
        },
      });
      setForm(EMPTY_FORM);
      setCoverPreview('');
      show('投稿成功，等待管理员审核', 'ok');
      const d = await api('/submissions/my');
      setSubmissions(d.submissions || []);
    } catch (err) { show(err.message, 'error'); } finally { setSubmitting(false); }
  };

  if (!user) return null;

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="page-header">
        <h1 className="page-title">📮 投稿游戏</h1>
        <span className="muted small">分享你发现的汉化游戏 · 管理员审核通过后上架</span>
      </div>

      <div className="card mb16" style={{ padding: 22 }}>
        <form onSubmit={submit}>
          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>游戏标题 *（1-120 字）</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} />
            </div>
            <div className="form-group">
              <label>标签（逗号分隔，如：动作, 冒险）</label>
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="如：动作, 冒险, 像素风" />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>游戏简介 *（1-20000 字）</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                required maxLength={20000} style={{ width: '100%', minHeight: 110 }} />
            </div>
            <div className="form-group">
              <label>原版链接 *（http:// 或 https://）</label>
              <input value={form.original_url} onChange={(e) => setForm({ ...form, original_url: e.target.value })} required placeholder="https://…" />
            </div>
            <div className="form-group">
              <label>汉化链接 *（http:// 或 https://）</label>
              <input value={form.localized_url} onChange={(e) => setForm({ ...form, localized_url: e.target.value })} required placeholder="https://…" />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>封面图（选填）</label>
              <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
                <input
                  placeholder="图片 URL（http://…）"
                  value={form.cover_type === 'url' ? form.cover_url : ''}
                  onChange={(e) => setForm({ ...form, cover_type: 'url', cover_url: e.target.value })}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  📁 上传图片（≤5MB）
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverFile} />
                </label>
                {coverPreview && (
                  <img src={coverPreview} alt="封面预览" style={{ height: 60, borderRadius: 8, border: '1px solid var(--border)' }} />
                )}
              </div>
            </div>
          </div>
          <div className="flex-between mt16">
            <span className="small muted">投稿即表示内容真实合法，管理员将进行审核</span>
            <button className="btn" disabled={submitting}>{submitting ? '提交中…' : '提交投稿'}</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 className="mb16">📋 我的投稿</h3>
        {submissions.length === 0 ? (
          <p className="empty" style={{ padding: 20 }}>还没有投稿，快来分享第一个吧！</p>
        ) : submissions.map((s) => (
          <div key={s.id} className="flex-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <strong>{s.title}</strong>
              <div className="small muted mt8">{formatTime(s.created_at)} · 标签：{(s.tags || []).join(', ') || '未分类'}</div>
            </div>
            <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
              {s.status === 'approved' && s.game_id ? (
                <Link to={`/games/${s.game_id}`} className="btn btn-ghost btn-sm">已上架，去看看 →</Link>
              ) : (
                <span className={`badge ${s.status === 'pending' ? 'badge-yellow' : s.status === 'approved' ? 'badge-green' : 'badge-red'}`}>
                  {s.status === 'pending' ? '审核中' : s.status === 'approved' ? '已通过' : `已驳回${s.reject_reason ? '：' + s.reject_reason : ''}`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
