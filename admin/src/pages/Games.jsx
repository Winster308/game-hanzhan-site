import { useCallback, useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';
import Pagination from '../components/Pagination.jsx';

const EMPTY_FORM = {
  title: '', description: '', tags: '', original_url: '', localized_url: '',
  cover_type: 'url', cover_url: '', save_bank_enabled: false,
};

export default function Games({ show }) {
  const [games, setGames] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | 游戏对象
  const [form, setForm] = useState(EMPTY_FORM);
  const [coverPreview, setCoverPreview] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api(`/admin/games?page=${page}&pageSize=15${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then((d) => { setGames(d.games); setTotal(d.total); })
      .catch(() => {});
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (g) => {
    if (!g) {
      setForm(EMPTY_FORM);
      setCoverPreview('');
      setEditing('new');
      return;
    }
    setForm({
      title: g.title, description: g.description, tags: (g.tags || []).join(', '),
      original_url: g.original_url, localized_url: g.localized_url,
      cover_type: g.cover_type, cover_url: g.cover_url || '', save_bank_enabled: g.save_bank_enabled,
    });
    setCoverPreview(g.cover_type === 'upload' ? g.cover_data : (g.cover_url || ''));
    setEditing(g);
  };

  /** 图片文件 → base64 */
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
    setSaving(true);
    const body = {
      ...form,
      tags: form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      cover_data: form.cover_type === 'upload' ? coverPreview : null,
    };
    try {
      if (editing === 'new') {
        await api('/admin/games', { method: 'POST', body });
        show('游戏已添加', 'ok');
      } else {
        await api(`/admin/games/${editing.id}`, { method: 'PUT', body });
        show('游戏已更新', 'ok');
      }
      setEditing(null);
      load();
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  const remove = async (g) => {
    if (!window.confirm(`确定删除游戏「${g.title}」吗？相关评论与存档将一并删除！`)) return;
    try {
      await api(`/admin/games/${g.id}`, { method: 'DELETE' });
      show('游戏已删除', 'ok');
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div>
      <div className="main-header">
        <h1>🎮 游戏管理</h1>
        <button className="btn" onClick={() => openEdit(null)}>＋ 添加游戏</button>
      </div>

      <div className="toolbar">
        <input placeholder="搜索游戏标题 / 标签…" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
        <button className="btn btn-ghost" onClick={() => { setPage(1); load(); }}>搜索</button>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>封面</th><th>标题</th><th>标签</th>
              <th>▶ 游玩</th><th>👍</th><th>⭐</th><th>💬</th><th>存档银行</th><th>创建时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>{g.id}</td>
                <td>
                  {g.cover_type === 'upload' ? (
                    <img src={g.cover_data} alt="" style={{ width: 56, height: 34, objectFit: 'cover', borderRadius: 6 }} />
                  ) : g.cover_url ? (
                    <img src={g.cover_url} alt="" style={{ width: 56, height: 34, objectFit: 'cover', borderRadius: 6 }} />
                  ) : <span className="muted">无</span>}
                </td>
                <td className="cell-clamp" style={{ fontWeight: 600 }}>{g.title}</td>
                <td className="cell-clamp">{g.tags.join(', ')}</td>
                <td>{g.play_count}</td><td>{g.likes_count}</td><td>{g.favorites_count}</td><td>{g.comments_count}</td>
                <td>{g.save_bank_enabled ? <span className="badge badge-green">已开启</span> : <span className="badge badge-gray">未开启</span>}</td>
                <td>{formatTime(g.created_at)}</td>
                <td>
                  <div className="flex">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)}>编辑</button>
                    <button className="btn btn-red btn-sm" onClick={() => remove(g)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {games.length === 0 && <div className="empty">暂无游戏</div>}
      </div>
      <Pagination page={page} total={total} pageSize={15} onChange={setPage} />

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <form className="modal wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3>{editing === 'new' ? '添加游戏' : `编辑游戏 #${editing.id}`}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>游戏标题 *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>标签（逗号分隔）</label>
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="如：动作, 冒险, 像素风" />
              </div>
              <div className="form-group full">
                <label>游戏简介 *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required style={{ minHeight: 100 }} />
              </div>
              <div className="form-group">
                <label>原版链接 *（http:// 或 https://）</label>
                <input value={form.original_url} onChange={(e) => setForm({ ...form, original_url: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>汉化链接 *（http:// 或 https://）</label>
                <input value={form.localized_url} onChange={(e) => setForm({ ...form, localized_url: e.target.value })} required />
              </div>
              <div className="form-group full">
                <label>封面图</label>
                <div className="flex" style={{ flexWrap: 'wrap' }}>
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
                    <img src={coverPreview} alt="封面预览" style={{ height: 60, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  )}
                </div>
              </div>
              <div className="form-group full flex">
                <label style={{ margin: 0 }}>
                  <input type="checkbox" checked={form.save_bank_enabled}
                    onChange={(e) => setForm({ ...form, save_bank_enabled: e.target.checked })}
                    style={{ width: 'auto', marginRight: 6 }} />
                  开启该游戏的存档银行（玩家可上传存档供审核分享）
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
