import { useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';
import Pagination from '../components/Pagination.jsx';

export default function Saves() {
  const [saves, setSaves] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [games, setGames] = useState([]);
  const [gameFilter, setGameFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/games?page=1&pageSize=60', { auth: false }).then((d) => {
      setGames((d.games || []).filter((g) => g.save_bank_enabled));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = gameFilter ? `&game_id=${gameFilter}` : '';
    api(`/saves?page=${page}&pageSize=20${q}`, { auth: false })
      .then((d) => { setSaves(d.saves); setTotal(d.total); })
      .catch(() => { setSaves([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [page, gameFilter]);

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">💾 存档银行</h1>
        <span className="muted small">玩家共享存档 · 经管理员审核后公开</span>
      </div>

      {games.length > 0 && (
        <div className="flex mb16" style={{ flexWrap: 'wrap' }}>
          <span className="small muted">筛选游戏：</span>
          <button className={`btn btn-sm ${!gameFilter ? '' : 'btn-ghost'}`} onClick={() => { setGameFilter(''); setPage(1); }}>全部</button>
          {games.slice(0, 12).map((g) => (
            <button key={g.id} className={`btn btn-sm ${gameFilter === g.id ? '' : 'btn-ghost'}`}
              onClick={() => { setGameFilter(g.id); setPage(1); }}>
              {g.title}
            </button>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 20 }}>
        {loading ? <div className="spin" /> : saves.length === 0 ? (
          <div className="empty">暂无存档，快去第一个上传吧！</div>
        ) : saves.map((s) => (
          <div key={s.id} className="flex-between" style={{ padding: '12px 4px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <a href={`/games/${s.game_id}`} style={{ fontWeight: 700 }}>{s.title}</a>
              <div className="small muted mt8">
                {s.game_title} · 上传者 {s.uploader} · {formatTime(s.created_at)} · 下载 {s.download_count} 次
              </div>
            </div>
            <a href={`/games/${s.game_id}`} className="btn btn-ghost btn-sm">前往查看</a>
          </div>
        ))}
        <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
      </div>
    </div>
  );
}
