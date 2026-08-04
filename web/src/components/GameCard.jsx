import { Link } from 'react-router-dom';

/** 游戏封面：上传图用 base64，否则用 URL，无图显示占位 */
export function GameCover({ game, className = '' }) {
  const src = game.cover_type === 'upload' ? game.cover_data : game.cover_url;
  if (!src) {
    return <div className={`game-cover-placeholder ${className}`}>🎮</div>;
  }
  return <img src={src} alt={game.title} className={`game-cover ${className}`} loading="lazy" />;
}

export default function GameCard({ game }) {
  return (
    <div className="card game-card">
      <Link to={`/games/${game.id}`}>
        <GameCover game={game} />
      </Link>
      <div className="game-card-body">
        <Link to={`/games/${game.id}`} className="game-card-title">{game.title}</Link>
        <div className="game-card-desc">{game.description}</div>
        <div className="tags">
          {(game.tags || []).slice(0, 4).map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
        <div className="game-card-stats">
          <span>👍 {game.likes_count ?? 0}</span>
          <span>⭐ {game.favorites_count ?? 0}</span>
          <span>💬 {game.comments_count ?? 0}</span>
          <span>▶ {game.play_count ?? 0}</span>
        </div>
      </div>
    </div>
  );
}
