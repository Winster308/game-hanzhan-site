import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { GameCover } from '../components/GameCard.jsx';

export default function Leaderboard() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/games/leaderboard?limit=50', { auth: false })
      .then((d) => setGames(d.games))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">🏆 游戏排行榜</h1>
        <span className="muted small">实时更新 · 热度分 = 点赞×2 + 收藏×3 + 评论×4 + 游玩数</span>
      </div>
      <div className="card">
        {loading ? <div className="spin" /> : games.length === 0 ? (
          <div className="empty">暂无数据</div>
        ) : games.map((g, i) => (
          <div className="rank-item" key={g.id}>
            <span className={`rank-num ${i < 3 ? `top${i + 1}` : ''}`}>{i + 1}</span>
            <Link to={`/games/${g.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <GameCover game={g} className="rank-thumb" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{g.title}</div>
                <div className="small muted mt8">{g.tags.slice(0, 3).join(' · ')}</div>
              </div>
            </Link>
            <div className="small muted" style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
              <span>▶ {g.play_count}</span>
              <span>👍 {g.likes_count}</span>
              <span>⭐ {g.favorites_count}</span>
              <span>💬 {g.comments_count}</span>
            </div>
            <span className="rank-score">{g.score} 分</span>
          </div>
        ))}
      </div>
    </div>
  );
}
