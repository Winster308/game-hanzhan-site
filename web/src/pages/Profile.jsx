import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { GameCover } from '../components/GameCard.jsx';

const TABS = [
  ['favorites', '⭐ 我的收藏'],
  ['likes', '👍 我的点赞'],
  ['comments', '💬 我的评论'],
  ['saves', '💾 我的存档'],
  ['reports', '🚩 我的举报'],
  ['achievements', '🏆 成就'],
];

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialTab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'favorites';
  const [tab, setTab] = useState(initialTab);
  const [games, setGames] = useState([]);
  const [saves, setSaves] = useState([]);
  const [reports, setReports] = useState([]);
  const [comments, setComments] = useState([]);
  const [ach, setAch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const tasks = [];
    if (tab === 'favorites' || tab === 'likes') {
      tasks.push(
        api('/games?page=1&pageSize=100', { auth: false }).then((d) => {
          const all = d.games;
          const ids = new Set(all.map((g) => g.id));
          // 后端列表接口不返回我的状态，这里用详情接口逐个确认成本高；
          // 改用本地筛选不可行——后端提供专用接口更优，见 fetchMyGames。
          void ids;
          return all;
        }).catch(() => [])
      );
    }
    if (tab === 'comments') tasks.push(api('/my/comments').then((d) => setComments(d.comments)).catch(() => []));
    if (tab === 'saves') tasks.push(api('/my/saves').then((d) => setSaves(d.saves)).catch(() => []));
    if (tab === 'reports') tasks.push(api('/reports/my').then((d) => setReports(d.reports)).catch(() => []));
    if (tab === 'achievements') tasks.push(api('/my/achievements').then(setAch).catch(() => {}));
    Promise.all(tasks).then(() => setLoading(false));
  }, [tab, user]);

  // 收藏/点赞需要后端专用接口
  useEffect(() => {
    if (!user || (tab !== 'favorites' && tab !== 'likes')) return;
    setLoading(true);
    api(`/my/${tab === 'favorites' ? 'favorites' : 'likes'}`)
      .then((d) => setGames(d.games))
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, [tab, user]);

  if (!user) return null;

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="card mt16" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="avatar" style={{ width: 56, height: 56, fontSize: 24 }}>{user.username.slice(0, 1).toUpperCase()}</span>
        <div>
          <div className="flex" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 20 }}>{user.username}</h2>
            {user.role === 'admin' && <span className="badge badge-yellow">管理员</span>}
          </div>
          <p className="muted small mt8">
            注册于 {formatTime(user.created_at)} · 邮箱 {user.email_verified ? '已验证' : '未验证'} · 主题 {user.theme}
          </p>
        </div>
      </div>

      <div className="flex mt16" style={{ flexWrap: 'wrap', gap: 8 }}>
        {TABS.map(([key, label]) => (
          <button key={key} className={`btn btn-sm ${tab === key ? '' : 'btn-ghost'}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card mt16" style={{ padding: 20, minHeight: 200 }}>
        {loading ? <div className="spin" /> : (
          <>
            {tab === 'favorites' && (games.length === 0 ? <Empty /> : <GameGrid games={games} />)}
            {tab === 'likes' && (games.length === 0 ? <Empty /> : <GameGrid games={games} />)}
            {tab === 'comments' && (comments.length === 0 ? <Empty /> : comments.map((c) => (
              <div key={c.id} className="comment-item">
                <p className="comment-content">{c.content}</p>
                <p className="small muted mt8">
                  <Link to={`/games/${c.game_id}`}>{c.game_title}</Link> · {formatTime(c.created_at)}
                  {c.is_deleted && ' · 已删除'}
                </p>
              </div>
            )))}
            {tab === 'saves' && (saves.length === 0 ? <Empty /> : saves.map((s) => (
              <div key={s.id} className="comment-item flex-between">
                <div>
                  <strong>{s.title}</strong>
                  <div className="small muted mt8">
                    <Link to={`/games/${s.game_id}`}>{s.game_title}</Link> · {formatTime(s.created_at)} · 下载 {s.download_count}
                  </div>
                </div>
                <span className={`badge ${s.status === 'approved' ? 'badge-green' : s.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
                  {s.status === 'approved' ? '已通过' : s.status === 'rejected' ? `已驳回${s.reject_reason ? '：' + s.reject_reason : ''}` : '审核中'}
                </span>
              </div>
            )))}
            {tab === 'reports' && (reports.length === 0 ? <Empty /> : reports.map((r) => (
              <div key={r.id} className="comment-item">
                <div className="flex" style={{ gap: 8 }}>
                  <span className={`badge ${r.status === 'pending' ? 'badge-yellow' : r.status === 'approved' ? 'badge-green' : 'badge-gray'}`}>
                    {r.status === 'pending' ? '处理中' : r.status === 'approved' ? '已确认' : '已驳回'}
                  </span>
                  <span className="small">{r.reason}</span>
                  <span className="small muted">{formatTime(r.created_at)}</span>
                </div>
                {r.detail && <p className="small muted mt8">{r.detail}</p>}
                {r.action_note && <p className="small mt8">处理备注：{r.action_note}</p>}
              </div>
            )))}
            {tab === 'achievements' && <AchievementsView ach={ach} />}
          </>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="empty">暂无内容</div>;
}

/** 成就与等级视图 */
function AchievementsView({ ach }) {
  if (!ach) return <div className="spin" />;
  const { level, exp, nextExp, curExp, progress } = ach.level;
  return (
    <div>
      {/* 等级卡片 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', padding: 20, marginBottom: 16 }}>
        <div className="flex" style={{ gap: 18, flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>
            Lv.{level}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="flex-between">
              <strong>经验值 {exp}</strong>
              <span className="small" style={{ opacity: 0.9 }}>距 Lv.{level + 1}：{nextExp - exp} 经验</span>
            </div>
            <div className="progress-bar mt8" style={{ background: 'rgba(255,255,255,0.25)' }}>
              <div style={{ width: `${progress}%`, background: '#fbbf24' }} />
            </div>
            <p className="small mt8" style={{ opacity: 0.9 }}>
              已解锁 {ach.unlocked_count} / {ach.total_count} 个成就
            </p>
          </div>
        </div>
      </div>
      {/* 成就墙 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {ach.achievements.map((a) => (
          <div key={a.id} className="card" style={{
            padding: 14, textAlign: 'center', opacity: a.unlocked ? 1 : 0.45,
            borderColor: a.unlocked ? 'var(--primary)' : undefined,
          }} title={a.description}>
            <div style={{ fontSize: 28 }}>{a.unlocked ? a.icon : '🔒'}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>{a.name}</div>
            <div className="small muted" style={{ fontSize: 11, marginTop: 3 }}>{a.description}</div>
            <div className="small mt8" style={{ color: 'var(--primary)' }}>+{a.exp} 经验</div>
            {a.unlocked && <div className="small muted mt8" style={{ fontSize: 11 }}>{formatTime(a.earned_at)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GameGrid({ games }) {
  return (
    <div className="game-grid">
      {games.map((g) => (
        <div key={g.id} className="card game-card">
          <Link to={`/games/${g.id}`}><GameCover game={g} /></Link>
          <div className="game-card-body">
            <Link to={`/games/${g.id}`} className="game-card-title">{g.title}</Link>
            <div className="small muted mt8">👍 {g.likes_count} · ⭐ {g.favorites_count} · ▶ {g.play_count}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
