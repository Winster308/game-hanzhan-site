import { useCallback, useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';

const EMPTY = { title: '', content: '', is_pinned: false, expires_at: '' };

/** UTC ISO 转本地 datetime-local 格式（避免时区漂移） */
function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Announcements({ show }) {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | 公告
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(() => {
    api('/admin/announcements').then((d) => setList(d.announcements)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (a) => {
    if (!a) {
      setForm(EMPTY);
      setEditing('new');
    } else {
      setForm({
        title: a.title, content: a.content, is_pinned: a.is_pinned,
        expires_at: a.expires_at ? toLocalInput(a.expires_at) : '',
      });
      setEditing(a);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return show('标题和内容不能为空', 'error');
    const body = {
      title: form.title, content: form.content, is_pinned: form.is_pinned,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    try {
      if (editing === 'new') {
        await api('/admin/announcements', { method: 'POST', body });
        show('公告已发布', 'ok');
      } else {
        await api(`/admin/announcements/${editing.id}`, { method: 'PUT', body });
        show('公告已更新', 'ok');
      }
      setEditing(null);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const remove = async (a) => {
    if (!window.confirm(`确定删除公告「${a.title}」吗？`)) return;
    try {
      await api(`/admin/announcements/${a.id}`, { method: 'DELETE' });
      show('公告已删除', 'ok');
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div>
      <div className="main-header">
        <h1>📢 公告管理</h1>
        <button className="btn" onClick={() => openEdit(null)}>＋ 发布公告</button>
      </div>

      <div className="card">
        {list.length === 0 ? <div className="empty">暂无公告</div> : list.map((a) => (
          <div key={a.id} className="flex-between" style={{ padding: '12px 4px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {a.is_pinned && <span style={{ color: '#d97706' }}>📌 </span>}
                {a.title}
                {a.expires_at && <span className="muted small"> · 有效期至 {formatTime(a.expires_at)}</span>}
              </div>
              <div className="small muted mt8" style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 560,
              }}>{a.content}</div>
              <div className="small muted mt8">{a.author || '管理员'} · {formatTime(a.created_at)}</div>
            </div>
            <div className="flex">
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>编辑</button>
              <button className="btn btn-red btn-sm" onClick={() => remove(a)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <form className="modal wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3>{editing === 'new' ? '发布公告' : `编辑公告 #${editing.id}`}</h3>
            <div className="form-grid">
              <div className="form-group full">
                <label>公告标题 *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group full">
                <label>公告内容 *（支持换行）</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                  style={{ minHeight: 160 }} required />
              </div>
              <div className="form-group">
                <label>过期时间（留空则长期有效）</label>
                <input type="datetime-local" value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </div>
              <div className="form-group flex" style={{ alignItems: 'center' }}>
                <label style={{ margin: 0 }}>
                  <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={form.is_pinned}
                    onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} />
                  置顶（用户端顶部滚动显示）
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn">{editing === 'new' ? '发布' : '保存'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
