import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import GameCard from '../components/GameCard.jsx';
import Pagination from '../components/Pagination.jsx';

export default function Home() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const tag = params.get('tag') || '';
  const sort = params.get('sort') || 'latest';
  const page = Number(params.get('page')) || 1;

  const [games, setGames] = useState([]);
  const [tags, setTags] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    api(`/games?page=${page}&pageSize=24&sort=${sort}${search ? `&search=${encodeURIComponent(search)}` : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`, { auth: false })
      .then((d) => { if (!ignore) { setGames(d.games); setTotal(d.total); } })
      .catch(() => { if (!ignore) setGames([]); }) // 失败时保留旧数据并提示由 UI 兜底
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [page, sort, search, tag]);

  useEffect(() => {
    api('/games/tags', { auth: false }).then((d) => setTags(d.tags)).catch(() => {});
  }, []);

  const setParam = useCallback((key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  }, [params, setParams]);

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">{search ? `搜索："${search}"` : '最新游戏'}</h1>
        <div className="flex" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
          {['latest', 'popular', 'most-played'].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${sort === s ? '' : 'btn-ghost'}`}
              onClick={() => setParam('sort', s)}
            >
              {s === 'latest' ? '最新' : s === 'popular' ? '最热' : '最多游玩'}
            </button>
          ))}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex mb16" style={{ flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${!tag ? '' : 'btn-ghost'}`} onClick={() => setParam('tag', '')}>全部</button>
          {tags.map((t) => (
            <button key={t} className={`btn btn-sm ${tag === t ? '' : 'btn-ghost'}`} onClick={() => setParam('tag', t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {loading ? <div className="spin" /> : games.length === 0 ? (
        <div className="empty">暂无游戏，敬请期待 🎮</div>
      ) : (
        <>
          <div className="game-grid">
            {games.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
          <Pagination page={page} total={total} pageSize={24}
            onChange={(p) => setParam('page', String(p))} />
        </>
      )}
    </div>
  );
}
