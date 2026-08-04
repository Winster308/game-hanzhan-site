import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from './Toast.jsx';

const MAX_CHARS = 20000;

export default function SaveBank({ gameId }) {
  const { user } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [saves, setSaves] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api(`/games/${gameId}/saves?page=1&pageSize=20`, { auth: false }).then((d) => setSaves(d.saves)).catch(() => {});
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  /** 读取 txt 文件内容 */
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      return show('仅支持 .txt 文件', 'error');
    }
    if (file.size > 2 * 1024 * 1024) return show('文件不能超过 2MB', 'error');
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result || ''));
      setFilename(file.name);
    };
    reader.readAsText(file, 'utf-8');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login');
    if (content.length > MAX_CHARS) return show(`内容不能超过 ${MAX_CHARS} 字`, 'error');
    setSubmitting(true);
    try {
      await api(`/games/${gameId}/saves`, {
        method: 'POST',
        body: { title, content, filename },
      });
      setTitle(''); setContent(''); setFilename(null);
      show('存档已提交，等待管理员审核', 'ok');
    } catch (err) { show(err.message, 'error'); } finally { setSubmitting(false); }
  };

  const view = async (id) => {
    try {
      const d = await api(`/saves/${id}`, { auth: false });
      setViewing(d.save);
    } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div className="card mt16" style={{ padding: 22 }}>
      <div className="flex-between mb16">
        <h2 style={{ fontSize: 18 }}>💾 存档银行</h2>
        <span className="small muted">玩家共享存档，需管理员审核后可见</span>
      </div>

      {/* 上传 */}
      {user ? (
        <form onSubmit={submit} className="mb16" style={{ background: 'var(--bg-hover)', padding: 16, borderRadius: 10 }}>
          <div className="flex" style={{ flexWrap: 'wrap', gap: 10 }}>
            <input
              placeholder="存档标题（如：全收集通关存档）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
              required
            />
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              📄 上传 .txt 文件
              <input type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={handleFile} />
            </label>
          </div>
          <textarea
            className="mt8"
            placeholder="或直接粘贴存档内容到剪贴板…（最大 20000 字）"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ width: '100%', minHeight: 100 }}
            required
          />
          <div className="flex-between mt8">
            <span className="small muted">
              {filename ? `已读取文件：${filename} · ` : ''}{content.length}/{MAX_CHARS} 字
            </span>
            <button className="btn btn-sm" disabled={submitting || content.length < 1}>提交审核</button>
          </div>
        </form>
      ) : (
        <p className="muted mb16"><a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>登录</a> 后可上传存档</p>
      )}

      {/* 列表 */}
      {saves.length === 0 ? (
        <p className="empty" style={{ padding: 20 }}>暂无已审核存档</p>
      ) : (
        <div>
          {saves.map((s) => (
            <div key={s.id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <strong>{s.title}</strong>
                <div className="small muted mt8">上传者：{s.uploader} · {formatTime(s.created_at)} · 下载 {s.download_count} 次</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => view(s.id)}>查看</button>
            </div>
          ))}
        </div>
      )}

      {/* 查看弹窗 */}
      {viewing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setViewing(null)}>
          <div className="card" style={{ padding: 24, width: 640, maxWidth: '94vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between mb16">
              <h3>{viewing.title}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewing(null)}>关闭</button>
            </div>
            <p className="small muted mb16">上传者：{viewing.uploader} · {formatTime(viewing.created_at)} · 已下载 {viewing.download_count} 次</p>
            <pre style={{
              flex: 1, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              background: 'var(--bg-hover)', padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.6,
            }}>{viewing.content}</pre>
            <div className="flex mt16" style={{ justifyContent: 'flex-end' }}>
              <a
                className="btn"
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(viewing.content)}`}
                download={`${viewing.title || 'save'}.txt`}
              >
                ⬇ 下载 .txt
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
