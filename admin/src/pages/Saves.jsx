import { useCallback, useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';
import Pagination from '../components/Pagination.jsx';

export default function Saves({ show }) {
  const [saves, setSaves] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const [viewing, setViewing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    api(`/admin/saves?page=${page}&pageSize=15&status=${status}`)
      .then((d) => {
        setSaves(d.saves); setTotal(d.total);
        if (page > 1 && d.saves.length === 0 && d.total < (page - 1) * 15 + 1) setPage((p) => Math.max(1, p - 1));
      })
      .catch(() => {});
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const viewDetail = async (id) => {
    try {
      const d = await api(`/admin/saves/${id}`);
      setViewing(d.save);
    } catch (err) { show(err.message, 'error'); }
  };

  const approve = async (s) => {
    if (!window.confirm(`通过存档「${s.title}」？`)) return;
    try {
      await api(`/admin/saves/${s.id}`, { method: 'PUT', body: { action: 'approve' } });
      show('已通过', 'ok');
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const doReject = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) return show('请填写驳回原因', 'error');
    try {
      await api(`/admin/saves/${rejecting.id}`, { method: 'PUT', body: { action: 'reject', reason: rejectReason } });
      show('已驳回', 'ok');
      setRejecting(null);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div>
      <div className="main-header">
        <h1>💾 存档审核</h1>
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
              <th>ID</th><th>游戏</th><th>存档标题</th><th>上传者</th><th>内容预览</th>
              <th>下载</th><th>时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {saves.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td className="cell-clamp">{s.game_title}</td>
                <td style={{ fontWeight: 600 }}>{s.title}{s.filename ? <span className="muted small">（{s.filename}）</span> : <span className="badge badge-gray">剪贴板</span>}</td>
                <td>{s.uploader}</td>
                <td className="cell-clamp" style={{ maxWidth: 260 }}>{s.content_preview}…</td>
                <td>{s.download_count}</td>
                <td>{formatTime(s.created_at)}</td>
                <td>
                  <div className="flex">
                    <button className="btn btn-ghost btn-sm" onClick={() => viewDetail(s.id)}>查看</button>
                    {s.status === 'pending' && (
                      <>
                        <button className="btn btn-green btn-sm" onClick={() => approve(s)}>通过</button>
                        <button className="btn btn-red btn-sm" onClick={() => { setRejecting(s); setRejectReason(''); }}>驳回</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {saves.length === 0 && <div className="empty">暂无存档</div>}
      </div>
      <Pagination page={page} total={total} pageSize={15} onChange={setPage} />

      {/* 查看完整内容 */}
      {viewing && (
        <div className="modal-mask" onClick={() => setViewing(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="flex-between mb16">
              <h3>存档 #{viewing.id}：{viewing.title}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewing(null)}>关闭</button>
            </div>
            <p className="small muted mb16">
              {viewing.game_title} · 上传者 {viewing.uploader} · {formatTime(viewing.created_at)}
              {viewing.filename && ` · 文件：${viewing.filename}`}
            </p>
            <pre style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '52vh', overflow: 'auto',
              fontSize: 13, lineHeight: 1.6,
            }}>{viewing.content}</pre>
            <div className="form-actions">
              {viewing.status === 'pending' && (
                <>
                  <button className="btn btn-green" onClick={async () => {
                    try {
                      await api(`/admin/saves/${viewing.id}`, { method: 'PUT', body: { action: 'approve' } });
                      show('已通过', 'ok'); setViewing(null); load();
                    } catch (err) { show(err.message, 'error'); }
                  }}>通过</button>
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
            <h3>驳回存档「{rejecting.title}」</h3>
            <div className="form-group">
              <label>驳回原因 *（上传者会看到）</label>
              <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="如：存档内容与描述不符" required />
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
