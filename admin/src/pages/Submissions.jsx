import { useCallback, useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';
import Pagination from '../components/Pagination.jsx';

export default function Submissions({ show }) {
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const [viewing, setViewing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    api(`/admin/submissions?page=${page}&pageSize=15&status=${status}`)
      .then((d) => { setSubmissions(d.submissions); setTotal(d.total); })
      .catch(() => {});
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const viewDetail = async (id) => {
    try {
      const d = await api(`/admin/submissions/${id}`);
      setViewing(d.submission);
    } catch (err) { show(err.message, 'error'); }
  };

  const approve = async (s) => {
    if (!window.confirm(`通过投稿「${s.title}」并上架？`)) return;
    try {
      await api(`/admin/submissions/${s.id}`, { method: 'PUT', body: { action: 'approve' } });
      show('已通过并上架', 'ok');
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const doReject = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) return show('请填写驳回原因', 'error');
    try {
      await api(`/admin/submissions/${rejecting.id}`, { method: 'PUT', body: { action: 'reject', reason: rejectReason } });
      show('已驳回', 'ok');
      setRejecting(null);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div>
      <div className="main-header">
        <h1>📮 投稿审核</h1>
        <div className="flex">
          {[['pending', '待审核'], ['approved', '已通过'], ['rejected', '已驳回']].map(([v, l]) => (
            <button key={v} className={`btn btn-sm ${status === v ? '' : 'btn-ghost'}`}
              onClick={() => { setStatus(v); setPage(1); }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>标题</th><th>标签</th><th>投稿者</th><th>原版链接</th>
              <th>汉化链接</th><th>状态</th><th>时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td style={{ fontWeight: 600 }}>{s.title}</td>
                <td className="cell-clamp">{(s.tags || []).join(', ') || '未分类'}</td>
                <td>{s.submitter}</td>
                <td className="cell-clamp" style={{ maxWidth: 160 }}>{s.original_url}</td>
                <td className="cell-clamp" style={{ maxWidth: 160 }}>{s.localized_url}</td>
                <td>
                  {s.status === 'pending' ? <span className="badge badge-yellow">待审核</span>
                    : s.status === 'approved' ? <span className="badge badge-green">已通过{s.game_id ? `（#${s.game_id}）` : ''}</span>
                      : <span className="badge badge-red">已驳回</span>}
                </td>
                <td>{formatTime(s.created_at)}</td>
                <td>
                  <div className="flex">
                    <button className="btn btn-ghost btn-sm" onClick={() => viewDetail(s.id)}>查看</button>
                    {s.status === 'pending' && (
                      <>
                        <button className="btn btn-green btn-sm" onClick={() => approve(s)}>通过并上架</button>
                        <button className="btn btn-red btn-sm" onClick={() => { setRejecting(s); setRejectReason(''); }}>驳回</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {submissions.length === 0 && <div className="empty">暂无投稿</div>}
      </div>
      <Pagination page={page} total={total} pageSize={15} onChange={setPage} />

      {/* 查看完整内容 */}
      {viewing && (
        <div className="modal-mask" onClick={() => setViewing(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="flex-between mb16">
              <h3>投稿 #{viewing.id}：{viewing.title}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewing(null)}>关闭</button>
            </div>
            <p className="small muted mb16">
              投稿者 {viewing.submitter} · {formatTime(viewing.created_at)}
              {viewing.reviewed_at && ` · 审核于 ${formatTime(viewing.reviewed_at)}`}
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {viewing.cover_type === 'upload' ? (
                <img src={viewing.cover_data} alt="封面" style={{ height: 90, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              ) : viewing.cover_url ? (
                <img src={viewing.cover_url} alt="封面" style={{ height: 90, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              ) : <span className="muted small">无封面</span>}
              <div className="small" style={{ display: 'grid', gap: 4, alignSelf: 'center' }}>
                <div>标签：<span className="muted">{(viewing.tags || []).join(', ') || '未分类'}</span></div>
                <div>原版链接：<a href={viewing.original_url} target="_blank" rel="noreferrer" className="muted">{viewing.original_url}</a></div>
                <div>汉化链接：<a href={viewing.localized_url} target="_blank" rel="noreferrer" className="muted">{viewing.localized_url}</a></div>
              </div>
            </div>
            <pre style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '40vh', overflow: 'auto',
              fontSize: 13, lineHeight: 1.6,
            }}>{viewing.description}</pre>
            <div className="form-actions">
              {viewing.status === 'pending' && (
                <>
                  <button className="btn btn-green" onClick={async () => {
                    await api(`/admin/submissions/${viewing.id}`, { method: 'PUT', body: { action: 'approve' } });
                    show('已通过并上架', 'ok'); setViewing(null); load();
                  }}>通过并上架</button>
                  <button className="btn btn-red" onClick={() => { setRejecting(viewing); setViewing(null); }}>驳回</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 驳回弹窗 */}
      {rejecting && (
        <div className="modal-mask" onClick={() => setRejecting(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={doReject}>
            <h3>驳回投稿「{rejecting.title}」</h3>
            <div className="form-group">
              <label>驳回原因 *（投稿者会看到）</label>
              <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="如：链接失效 / 信息不完整 / 内容违规" required />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRejecting(null)}>取消</button>
              <button className="btn btn-red">确认驳回</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
