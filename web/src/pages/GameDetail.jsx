import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { GameCover } from '../components/GameCard.jsx';
import Pagination from '../components/Pagination.jsx';
import SaveBank from '../components/SaveBank.jsx';

const REPORT_REASONS = ['辱骂/人身攻击', '广告/引流', '色情/低俗', '剧透', '其他'];

export default function GameDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();

  const [game, setGame] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentPage, setCommentPage] = useState(1);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetail, setReportDetail] = useState('');
  const [loading, setLoading] = useState(true);

  const loadGame = useCallback(() => {
    api(`/games/${id}`, { auth: !!user }).then((d) => setGame(d.game)).catch(() => {});
  }, [id, user]);

  const loadComments = useCallback(() => {
    api(`/games/${id}/comments?page=${commentPage}&pageSize=20`).then((d) => {
      setComments(d.comments);
      setCommentTotal(d.total);
    }).catch(() => {});
  }, [id, commentPage]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api(`/games/${id}`, { auth: !!user }).then((d) => setGame(d.game)),
      api(`/games/${id}/comments?page=1&pageSize=20`).then((d) => {
        setComments(d.comments);
        setCommentTotal(d.total);
      }),
    ]).catch((e) => show(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [id, user, show]);

  useEffect(() => { loadComments(); }, [loadComments]);

  if (loading) return <div className="spin" />;
  if (!game) return <div className="empty">游戏不存在</div>;

  const toggleLike = async () => {
    if (!user) return navigate('/login');
    try {
      const d = await api(`/games/${game.id}/like`, { method: 'POST' });
      setGame({ ...game, is_liked: d.liked, likes_count: d.likes_count });
    } catch (e) { show(e.message, 'error'); }
  };

  const toggleFavorite = async () => {
    if (!user) return navigate('/login');
    try {
      const d = await api(`/games/${game.id}/favorite`, { method: 'POST' });
      setGame({ ...game, is_favorited: d.favorited, favorites_count: d.favorites_count });
    } catch (e) { show(e.message, 'error'); }
  };

  /** 点击去玩：上报游玩数并新窗口打开 */
  const play = (url) => {
    api(`/games/${game.id}/play`, { method: 'POST', auth: false }).catch(() => {});
    window.open(url, '_blank', 'noopener');
    setGame({ ...game, play_count: game.play_count + 1 });
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login');
    try {
      await api(`/games/${game.id}/comments`, { method: 'POST', body: { content: newComment } });
      setNewComment('');
      show('评论发表成功', 'ok');
      loadGame();
      loadComments();
    } catch (err) { show(err.message, 'error'); }
  };

  const saveEdit = async (commentId) => {
    try {
      await api(`/comments/${commentId}`, { method: 'PUT', body: { content: editContent } });
      setEditingId(null);
      show('评论已更新', 'ok');
      loadComments();
    } catch (err) { show(err.message, 'error'); }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm('确定删除这条评论吗？')) return;
    try {
      await api(`/comments/${commentId}`, { method: 'DELETE' });
      show('评论已删除', 'ok');
      loadGame();
      loadComments();
    } catch (err) { show(err.message, 'error'); }
  };

  const submitReport = async (e) => {
    e.preventDefault();
    try {
      await api('/reports', {
        method: 'POST',
        body: { target_type: reportTarget.type, target_id: reportTarget.id, reason: reportReason, detail: reportDetail },
      });
      setReportTarget(null);
      setReportDetail('');
      show('举报已提交，感谢反馈', 'ok');
    } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div className="container">
      <div className="card game-detail-hero mt16">
        <GameCover game={game} className="game-detail-cover" />
        <div className="game-detail-info">
          <h1 className="game-detail-title">{game.title}</h1>
          <div className="tags">{game.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          <div className="detail-stats">
            <div className="detail-stat"><div className="num">{game.play_count}</div><div className="lab">游玩</div></div>
            <div className="detail-stat"><div className="num">{game.likes_count}</div><div className="lab">点赞</div></div>
            <div className="detail-stat"><div className="num">{game.favorites_count}</div><div className="lab">收藏</div></div>
            <div className="detail-stat"><div className="num">{game.comments_count}</div><div className="lab">评论</div></div>
            <div className="detail-stat"><div className="num" style={{ color: 'var(--primary)' }}>{game.score}</div><div className="lab">热度分</div></div>
          </div>
          <div className="play-buttons">
            <button className="btn" onClick={() => play(game.localized_url)}>▶ 玩汉化版</button>
            <button className="btn btn-outline" onClick={() => play(game.original_url)}>🌐 原版链接</button>
            <button className={`btn ${game.is_liked ? 'btn-danger' : 'btn-ghost'}`} onClick={toggleLike}>
              {game.is_liked ? '👍 已赞' : '👍 点赞'}
            </button>
            <button className={`btn ${game.is_favorited ? 'btn-danger' : 'btn-ghost'}`} onClick={toggleFavorite}>
              {game.is_favorited ? '⭐ 已收藏' : '⭐ 收藏'}
            </button>
          </div>
          <p className="muted small mt16">原版链接：<a href={game.original_url} target="_blank" rel="noreferrer">{game.original_url}</a></p>
          <p className="muted small">汉化链接：<a href={game.localized_url} target="_blank" rel="noreferrer">{game.localized_url}</a></p>
        </div>
      </div>

      <div className="card mt16" style={{ padding: 22 }}>
        <h2 className="mb16" style={{ fontSize: 18 }}>游戏简介</h2>
        <p className="game-detail-desc">{game.description}</p>
      </div>

      {/* 存档银行 */}
      {game.save_bank_enabled && <SaveBank gameId={game.id} />}

      {/* 评论区 */}
      <div className="card mt16" style={{ padding: 22 }}>
        <div className="flex-between mb16">
          <h2 style={{ fontSize: 18 }}>评论 <span className="muted small">（{commentTotal}）</span></h2>
        </div>

        {user ? (
          <form onSubmit={submitComment} className="mb16">
            <textarea
              placeholder={`分享你的游戏体验（${3}-${500} 字，每分钟最多 5 条）`}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              style={{ width: '100%', minHeight: 70 }}
            />
            <div className="flex-between mt8">
              <span className="small muted">{newComment.length}/500</span>
              <button className="btn btn-sm" disabled={newComment.trim().length < 3}>发表评论</button>
            </div>
          </form>
        ) : (
          <p className="muted mb16">
            <a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>登录</a> 后参与评论
          </p>
        )}

        {comments.map((c) => (
          <div className="comment-item" key={c.id}>
            <div className="comment-head">
              <span className="avatar" style={{ width: 26, height: 26, fontSize: 12 }}>{c.username.slice(0, 1).toUpperCase()}</span>
              <span className="comment-user">{c.username}</span>
              <span className="comment-time">{formatTime(c.created_at)}{c.edited_at && ' · 已编辑'}</span>
            </div>
            {c.is_deleted ? (
              <p className="comment-deleted">该评论已被删除</p>
            ) : editingId === c.id ? (
              <div className="mt8">
                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ width: '100%' }} />
                <div className="flex mt8">
                  <button className="btn btn-sm" onClick={() => saveEdit(c.id)}>保存</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>取消</button>
                </div>
              </div>
            ) : (
              <>
                <p className="comment-content">{c.content}</p>
                <div className="comment-actions">
                  {user && (user.id === c.user_id || user.role === 'admin') && (
                    <>
                      <button onClick={() => { setEditingId(c.id); setEditContent(c.content); }}>编辑</button>
                      <button onClick={() => deleteComment(c.id)}>删除</button>
                    </>
                  )}
                  {user && user.id !== c.user_id && (
                    <button onClick={() => setReportTarget({ type: 'comment', id: c.id })}>举报</button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {comments.length === 0 && <p className="empty" style={{ padding: 24 }}>还没有评论，来抢沙发吧～</p>}
        <Pagination page={commentPage} total={commentTotal} pageSize={20} onChange={setCommentPage} />
      </div>

      {/* 举报弹窗 */}
      {reportTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setReportTarget(null)}>
          <div className="card" style={{ padding: 24, width: 420, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 14 }}>举报不良内容</h3>
            <form onSubmit={submitReport}>
              <div className="form-group">
                <label>举报原因</label>
                <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>补充说明（选填，500 字内）</label>
                <textarea value={reportDetail} onChange={(e) => setReportDetail(e.target.value)} />
              </div>
              <div className="flex" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setReportTarget(null)}>取消</button>
                <button type="submit" className="btn btn-danger">提交举报</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
