import { useCallback, useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';
import Pagination from '../components/Pagination.jsx';

const STATUS_LABEL = { pending: ['处理中', 'badge-yellow'], approved: ['已确认', 'badge-green'], rejected: ['已驳回', 'badge-gray'] };

export default function Reports({ show }) {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const [handling, setHandling] = useState(null);
  const [form, setForm] = useState({ ban_hours: 24, permanent: false, reason: '', note: '', delete_comment: false });

  const load = useCallback(() => {
    api(`/admin/reports?page=${page}&pageSize=15&status=${status}`)
      .then((d) => { setReports(d.reports); setTotal(d.total); })
      .catch(() => {});
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const targetDesc = (r) => {
    if (r.target_type === 'comment') return `评论 #${r.target_id}（${r.comment_author || '?'}：${(r.comment_content || '').slice(0, 40)}…）`;
    if (r.target_type === 'user') return `用户 ${r.target_username || '#' + r.target_id}`;
    return `游戏 ${r.game_title || '#' + r.target_id}`;
  };

  const doHandle = async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/reports/${handling.id}`, {
        method: 'PUT',
        body: { action: 'approve', ...form, ban_hours: Number(form.ban_hours) },
      });
      show('处理完成', 'ok');
      setHandling(null);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const doReject = async (r) => {
    try {
      await api(`/admin/reports/${r.id}`, { method: 'PUT', body: { action: 'reject', note: '经核查，不构成违规' } });
      show('已驳回举报', 'ok');
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div>
      <div className="main-header">
        <h1>🚩 举报审核</h1>
        <div className="flex">
          {[['pending', '待处理'], ['approved', '已确认'], ['rejected', '已驳回']].map(([v, l]) => (
            <button key={v} className={`btn btn-sm ${status === v ? '' : 'btn-ghost'}`}
              onClick={() => { setStatus(v); setPage(1); }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>举报人</th><th>举报对象</th><th>原因</th><th>补充说明</th><th>状态</th><th>时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const [label, cls] = STATUS_LABEL[r.status];
              return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.reporter}</td>
                  <td className="cell-clamp" style={{ maxWidth: 240 }}>{targetDesc(r)}</td>
                  <td><span className="badge badge-blue">{r.reason}</span></td>
                  <td className="cell-clamp" style={{ maxWidth: 160 }}>{r.detail || '-'}</td>
                  <td><span className={`badge ${cls}`}>{label}</span></td>
                  <td>{formatTime(r.created_at)}</td>
                  <td>
                    {r.status === 'pending' ? (
                      <div className="flex">
                        <button className="btn btn-sm" onClick={() => { setHandling(r); setForm({ ban_hours: 24, permanent: false, reason: '', note: '', delete_comment: true }); }}>确认处理</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => doReject(r)}>驳回</button>
                      </div>
                    ) : <span className="muted small">{formatTime(r.handled_at)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {reports.length === 0 && <div className="empty">暂无举报</div>}
      </div>
      <Pagination page={page} total={total} pageSize={15} onChange={setPage} />

      {handling && (
        <div className="modal-mask" onClick={() => setHandling(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doHandle}>
            <h3>确认举报 #{handling.id}</h3>
            <div className="card" style={{ background: '#f8fafc', padding: 12, marginBottom: 14 }}>
              <p className="small"><strong>对象：</strong>{targetDesc(handling)}</p>
              <p className="small mt8"><strong>原因：</strong>{handling.reason}</p>
              {handling.detail && <p className="small mt8"><strong>补充：</strong>{handling.detail}</p>}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>封禁时长（小时）</label>
                <input type="number" min="1" max="8760" value={form.ban_hours} disabled={form.permanent}
                  onChange={(e) => setForm({ ...form, ban_hours: e.target.value })} />
              </div>
              <div className="form-group flex" style={{ alignItems: 'center' }}>
                <label style={{ margin: 0 }}>
                  <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={form.permanent}
                    onChange={(e) => setForm({ ...form, permanent: e.target.checked })} />
                  永久封禁
                </label>
              </div>
              <div className="form-group full">
                <label>封禁原因（默认：违规内容被举报）</label>
                <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              {handling.target_type === 'comment' && (
                <div className="form-group full">
                  <label>
                    <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={form.delete_comment}
                      onChange={(e) => setForm({ ...form, delete_comment: e.target.checked })} />
                    同时删除被举报的评论
                  </label>
                </div>
              )}
              <div className="form-group full">
                <label>处理备注（举报人会看到）</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setHandling(null)}>取消</button>
              <button className="btn btn-red">确认并封禁</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
