import { useCallback, useEffect, useState } from 'react';
import { api, formatTime, formatRemaining } from '../api.js';
import Pagination from '../components/Pagination.jsx';

export default function Users({ show }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [banning, setBanning] = useState(null);
  const [banForm, setBanForm] = useState({ hours: 24, permanent: false, reason: '' });

  const load = useCallback(() => {
    api(`/admin/users?page=${page}&pageSize=15${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then((d) => { setUsers(d.users); setTotal(d.total); })
      .catch(() => {});
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const doBan = async (e) => {
    e.preventDefault();
    if (!banForm.reason.trim()) return show('请填写封禁原因', 'error');
    try {
      await api(`/admin/users/${banning.id}/ban`, {
        method: 'PUT',
        body: { hours: Number(banForm.hours), permanent: banForm.permanent, reason: banForm.reason },
      });
      show(`已封禁 ${banning.username}`, 'ok');
      setBanning(null);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const unban = async (u) => {
    try {
      await api(`/admin/users/${u.id}/unban`, { method: 'PUT' });
      show(`已解封 ${u.username}`, 'ok');
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const setRole = async (u, role) => {
    if (!window.confirm(`确定将 ${u.username} 设为${role === 'admin' ? '管理员' : '普通用户'}吗？`)) return;
    try {
      await api(`/admin/users/${u.id}/role`, { method: 'PUT', body: { role } });
      show('角色已更新', 'ok');
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const banRemaining = (u) => {
    if (!u.banned_until) return 0;
    const ms = new Date(u.banned_until).getTime() - Date.now();
    return ms > 0 ? ms : 0;
  };

  return (
    <div>
      <div className="main-header">
        <h1>👥 用户管理</h1>
        <span className="muted small">共 {total} 名用户</span>
      </div>

      <div className="toolbar">
        <input placeholder="搜索用户名 / 邮箱…" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
        <button className="btn btn-ghost" onClick={() => { setPage(1); load(); }}>搜索</button>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>邮箱验证</th>
              <th>封禁状态</th><th>注册时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const remaining = banRemaining(u);
              return (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td style={{ fontWeight: 600 }}>{u.username}</td>
                  <td className="cell-clamp">{u.email}</td>
                  <td>{u.role === 'admin' ? <span className="badge badge-purple">管理员</span> : <span className="badge badge-gray">用户</span>}</td>
                  <td>{u.email_verified ? <span className="badge badge-green">已验证</span> : <span className="badge badge-yellow">未验证</span>}</td>
                  <td>
                    {remaining > 0
                      ? <span className="badge badge-red">封禁中（剩 {formatRemaining(remaining)}）</span>
                      : <span className="badge badge-green">正常</span>}
                  </td>
                  <td>{formatTime(u.created_at)}</td>
                  <td>
                    <div className="flex" style={{ flexWrap: 'wrap' }}>
                      {remaining > 0 ? (
                        <button className="btn btn-green btn-sm" onClick={() => unban(u)}>解封</button>
                      ) : (
                        <button className="btn btn-red btn-sm" onClick={() => { setBanning(u); setBanForm({ hours: 24, permanent: false, reason: '' }); }}>封禁</button>
                      )}
                      {u.role === 'admin'
                        ? <button className="btn btn-ghost btn-sm" onClick={() => setRole(u, 'user')}>撤销管理员</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => setRole(u, 'admin')}>设为管理员</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && <div className="empty">暂无用户</div>}
      </div>
      <Pagination page={page} total={total} pageSize={15} onChange={setPage} />

      {banning && (
        <div className="modal-mask" onClick={() => setBanning(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doBan}>
            <h3>封禁用户「{banning.username}」</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>封禁时长（小时）</label>
                <input type="number" min="1" max="8760" value={banForm.hours}
                  disabled={banForm.permanent}
                  onChange={(e) => setBanForm({ ...banForm, hours: e.target.value })} />
              </div>
              <div className="form-group flex" style={{ alignItems: 'center' }}>
                <label style={{ margin: 0 }}>
                  <input type="checkbox" style={{ width: 'auto', marginRight: 6 }}
                    checked={banForm.permanent}
                    onChange={(e) => setBanForm({ ...banForm, permanent: e.target.checked })} />
                  永久封禁
                </label>
              </div>
              <div className="form-group full">
                <label>封禁原因 *（用户登录时会看到）</label>
                <input value={banForm.reason} onChange={(e) => setBanForm({ ...banForm, reason: e.target.value })}
                  placeholder="如：发布违规评论" required />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setBanning(null)}>取消</button>
              <button className="btn btn-red">确认封禁</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
