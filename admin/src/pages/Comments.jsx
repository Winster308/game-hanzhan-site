import { useCallback, useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';
import Pagination from '../components/Pagination.jsx';

export default function Comments({ show }) {
  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState('');

  const load = useCallback(() => {
    api(`/admin/comments?page=${page}&pageSize=15${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then((d) => { setComments(d.comments); setTotal(d.total); })
      .catch(() => {});
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/comments/${editing.id}`, { method: 'PUT', body: { content: editContent } });
      show('评论已修改', 'ok');
      setEditing(null);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const remove = async (c) => {
    if (!window.confirm('确定删除这条评论吗？')) return;
    try {
      await api(`/admin/comments/${c.id}`, { method: 'DELETE' });
      show('评论已删除', 'ok');
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div>
      <div className="main-header">
        <h1>💬 评论管理</h1>
        <span className="muted small">共 {total} 条 · 可修改 / 删除任意评论</span>
      </div>

      <div className="toolbar">
        <input placeholder="搜索评论内容…" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
        <button className="btn btn-ghost" onClick={() => { setPage(1); load(); }}>搜索</button>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>用户</th><th>游戏</th><th>内容</th><th>状态</th><th>时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {comments.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td style={{ fontWeight: 600 }}>{c.username}</td>
                <td className="cell-clamp">{c.game_title}</td>
                <td className="cell-clamp" style={{ maxWidth: 320 }}>{c.is_deleted ? <span className="muted">（已删除）</span> : c.content}</td>
                <td>{c.is_deleted ? <span className="badge badge-red">已删除</span> : <span className="badge badge-green">正常</span>}</td>
                <td>{formatTime(c.created_at)}</td>
                <td>
                  <div className="flex">
                    <button className="btn btn-ghost btn-sm" disabled={c.is_deleted}
                      onClick={() => { setEditing(c); setEditContent(c.content); }}>修改</button>
                    <button className="btn btn-red btn-sm" disabled={c.is_deleted} onClick={() => remove(c)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {comments.length === 0 && <div className="empty">暂无评论</div>}
      </div>
      <Pagination page={page} total={total} pageSize={15} onChange={setPage} />

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <h3>修改评论 #{editing.id}（{editing.username} @ {editing.game_title}）</h3>
            <div className="form-group">
              <label>评论内容（3-500 字）</label>
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                style={{ minHeight: 110, width: '100%' }} required />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn">保存修改</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
