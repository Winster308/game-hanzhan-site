import { useCallback, useEffect, useState } from 'react';
import { api, formatTime, formatRemaining } from '../api.js';
import Pagination from '../components/Pagination.jsx';

export default function Appeals({ show }) {
  const [appeals, setAppeals] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const [handling, setHandling] = useState(null);
  const [reply, setReply] = useState('');

  const load = useCallback(() => {
    api(`/admin/appeals?page=${page}&pageSize=15&status=${status}`)
      .then((d) => {
        setAppeals(d.appeals); setTotal(d.total);
        if (page > 1 && d.appeals.length === 0 && d.total < (page - 1) * 15 + 1) setPage((p) => Math.max(1, p - 1));
      })
      .catch(() => {});
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const doHandle = async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/appeals/${handling.id}`, {
        method: 'PUT',
        body: { action: handling.approve ? 'approve' : 'reject', reply },
      });
      show(handling.approve ? '已批准并解封' : '已驳回申诉', 'ok');
      setHandling(null);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const banRemaining = (u) => {
    // 永久封禁：banned_until 为 Infinity 经 JSON 序列化为 null，但 ban_reason 仍在
    if (!u.banned_until && u.ban_reason) return null;
    if (!u.banned_until) return 0;
    const ms = new Date(u.banned_until).getTime() - Date.now();
    return ms > 0 ? ms : 0;
  };

  return (
    <div>
      <div className="main-header">
        <h1>🧾 封禁申诉审核</h1>
        <div className="flex">
          {[['pending', '待处理'], ['approved', '已通过'], ['rejected', '已驳回']].map(([v, l]) => (
            <button key={v} className={`btn btn-sm ${status === v ? '' : 'btn-ghost'}`}
              onClick={() => { setStatus(v); setPage(1); }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>用户</th><th>当前封禁</th><th>申诉内容</th><th>状态</th><th>时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {appeals.map((a) => {
              const remaining = banRemaining(a);
              return (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td style={{ fontWeight: 600 }}>{a.username} <span className="muted small">(#{a.user_id})</span></td>
                  <td>
                    {remaining === null
                      ? <span className="badge badge-red">永久封禁</span>
                      : remaining > 0
                        ? <span className="badge badge-red">封禁中（剩 {formatRemaining(remaining)}）</span>
                        : <span className="badge badge-green">已解封/正常</span>}
                  </td>
                  <td className="cell-clamp" style={{ maxWidth: 300 }}>{a.reason}</td>
                  <td>
                    {a.status === 'pending' ? <span className="badge badge-yellow">待处理</span>
                      : a.status === 'approved' ? <span className="badge badge-green">已通过</span>
                        : <span className="badge badge-red">已驳回</span>}
                  </td>
                  <td>{formatTime(a.created_at)}</td>
                  <td>
                    {a.status === 'pending' ? (
                      <div className="flex">
                        <button className="btn btn-green btn-sm" onClick={() => { setHandling({ ...a, approve: true }); setReply(''); }}>通过并解封</button>
                        <button className="btn btn-red btn-sm" onClick={() => { setHandling({ ...a, approve: false }); setReply(''); }}>驳回</button>
                      </div>
                    ) : <span className="muted small">{formatTime(a.handled_at)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {appeals.length === 0 && <div className="empty">暂无申诉</div>}
      </div>
      <Pagination page={page} total={total} pageSize={15} onChange={setPage} />

      {handling && (
        <div className="modal-mask" onClick={() => setHandling(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doHandle}>
            <h3>{handling.approve ? '通过申诉（将解封账号）' : '驳回申诉'}</h3>
            <div className="card" style={{ background: '#f8fafc', padding: 12, marginBottom: 14 }}>
              <p className="small"><strong>用户：</strong>{handling.username}（#{handling.user_id}）</p>
              <p className="small mt8"><strong>申诉内容：</strong>{handling.reason}</p>
              {handling.ban_reason && <p className="small mt8"><strong>原封禁原因：</strong>{handling.ban_reason}</p>}
            </div>
            <div className="form-group">
              <label>回复（申诉人会看到）</label>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)}
                placeholder={handling.approve ? '欢迎回来，请遵守社区规范' : '请说明驳回理由'} style={{ minHeight: 90 }} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setHandling(null)}>取消</button>
              <button className={`btn ${handling.approve ? 'btn-green' : 'btn-red'}`}>
                {handling.approve ? '确认解封' : '确认驳回'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
