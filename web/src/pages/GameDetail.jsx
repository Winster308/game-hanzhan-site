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
  const [updates, setUpdates] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentPage, setCommentPage] = useState(1);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // {id, username}
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetail, setReportDetail] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const loadGame = useCallback(() => {
    api(`/games/${id}`, { auth: !!user }).then((d) => setGame(d.game)).catch(() => {});
  }, [id, user]);

  const loadComments = useCallback(() => {
    api(`/games/${id}/comments?page=${commentPage}&pageSize=20`).then((d) => {
      setComments(d.comments);
      setCommentTotal(d.total);
    }).catch(() => {});
  }, [id, commentPage]);

  // 切换游戏（同路由仅 params 变化）时丢弃过期响应，避免显示/操作错对象
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    Promise.all([
      api(`/games/${id}`, { auth: !!user }).then((d) => { if (!ignore) setGame(d.game); }),
      api(`/games/${id}/updates`, { auth: false }).then((d) => { if (!ignore) setUpdates(d.updates); }).catch(() => {}),
    ]).catch((e) => { if (!ignore) show(e.message, 'error'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [id, user, show]);

  // 评论翻页时丢弃过期响应
  useEffect(() => {
    let ignore = false;
    api(`/games/${id}/comments?page=${commentPage}&pageSize=20`).then((d) => {
      if (!ignore) { setComments(d.comments); setCommentTotal(d.total); }
    }).catch(() => {});
    return () => { ignore = true; };
  }, [id, commentPage]);

  if (loading) return <div className="spin" />;
  if (!game) return <div className="empty">游戏不存在</div>;

  const toggleLike = async () => {
    if (!user) return navigate('/login');
    try {
      const d = await api(`/games/${game.id}/like`, { method: 'POST' });
      setGame((prev) => ({ ...prev, is_liked: d.liked, likes_count: d.likes_count }));
    } catch (e) { show(e.message, 'error'); }
  };

  const toggleFavorite = async () => {
    if (!user) return navigate('/login');
    try {
      const d = await api(`/games/${game.id}/favorite`, { method: 'POST' });
      setGame((prev) => ({ ...prev, is_favorited: d.favorited, favorites_count: d.favorites_count }));
    } catch (e) { show(e.message, 'error'); }
  };

  /** 评分（1-5 星，可改） */
  const rate = async (score) => {
    if (!user) return navigate('/login');
    try {
      const d = await api(`/games/${game.id}/rating`, { method: 'POST', body: { score } });
      setGame((prev) => ({ ...prev, my_rating: d.my_rating, rating_avg: d.rating_avg, rating_count: d.rating_count }));
      show(`已评 ${score} 星`, 'ok');
    } catch (e) { show(e.message, 'error'); }
  };

  const clearRating = async () => {
    try {
      const d = await api(`/games/${game.id}/rating`, { method: 'DELETE' });
      setGame((prev) => ({ ...prev, my_rating: null, rating_avg: d.rating_avg, rating_count: d.rating_count }));
    } catch (e) { show(e.message, 'error'); }
  };

  /** 点击去玩：上报游玩数并新窗口打开 */
  const play = (url) => {
    api(`/games/${game.id}/play`, { method: 'POST', auth: false }).catch(() => {});
    window.open(url, '_blank', 'noopener');
    setGame((prev) => ({ ...prev, play_count: (prev.play_count || 0) + 1 }));
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login');
    if (commentSubmitting) return; // 防重复提交
    const isReply = !!replyingTo;
    setCommentSubmitting(true);
    try {
      await api(`/games/${game.id}/comments`, {
        method: 'POST',
        body: isReply ? { content: replyContent, parent_id: replyingTo.id } : { content: newComment },
      });
      setNewComment('');
      setReplyContent('');
      setReplyingTo(null);
      show(isReply ? '回复成功' : '评论发表成功', 'ok');
      loadGame();
      loadComments();
    } catch (err) { show(err.message, 'error'); } finally { setCommentSubmitting(false); }
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

  const stars = (score) => '★'.repeat(Math.round(score || 0)) + '☆'.repeat(5 - Math.round(score || 0));

  /** 单条评论渲染（含回复列表） */
  const renderComment = (c, isReply = false) => (
    <div key={c.id} className="comment-item" style={isReply ? { padding: '10px 0 10px 14px', borderLeft: '2px solid var(--border)', marginLeft: 8 } : {}}>
      <div className="comment-head">
        <span className="avatar" style={{ width: 24, height: 24, fontSize: 11 }}>{c.username.slice(0, 1).toUpperCase()}</span>
        <span className="comment-user" style={{ fontSize: 13 }}>{c.username}</span>
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
          <p className="comment-content" style={{ fontSize: 13.5 }}>{c.content}</p>
          <div className="comment-actions">
            {user && (
              <button onClick={() => { setReplyingTo({ id: c.id, username: c.username }); setReplyContent(''); }}>
                回复
              </button>
            )}
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
  );

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
          {/* 评分区 */}
          <div className="flex mt16" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              {game.rating_avg != null ? (
                <>
                  <span style={{ color: '#f59e0b', fontSize: 20, letterSpacing: 2 }}>{stars(game.rating_avg)}</span>
                  <span className="small muted"> {game.rating_avg} / 5（{game.rating_count || 0} 人评分）</span>
                </>
              ) : (
                <span className="small muted">暂无评分</span>
              )}
            </div>
            {user && (
              <div className="flex" style={{ gap: 4 }}>
                <span className="small muted">我的评分：</span>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} className="btn btn-ghost btn-sm" style={{ padding: '2px 7px' }}
                    onClick={() => rate(s)} title={`评 ${s} 星`}>
                    {game.my_rating >= s ? '★' : '☆'}
                  </button>
                ))}
                {game.my_rating && (
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 7px' }} onClick={clearRating}>取消</button>
                )}
              </div>
            )}
          </div>
          <p className="muted small mt16">原版链接：<a href={game.original_url} target="_blank" rel="noreferrer">{game.original_url}</a></p>
          <p className="muted small">汉化链接：<a href={game.localized_url} target="_blank" rel="noreferrer">{game.localized_url}</a></p>
        </div>
      </div>

      <div className="card mt16" style={{ padding: 22 }}>
        <h2 className="mb16" style={{ fontSize: 18 }}>游戏简介</h2>
        <p className="game-detail-desc">{game.description}</p>
      </div>

      {/* 更新日志 */}
      {updates.length > 0 && (
        <div className="card mt16" style={{ padding: 22 }}>
          <h2 className="mb16" style={{ fontSize: 18 }}>📦 更新日志</h2>
          {updates.map((u) => (
            <div key={u.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="flex-between">
                <strong><span className="badge badge-blue">{u.version}</span></strong>
                <span className="small muted">{formatTime(u.created_at)}</span>
              </div>
              <p className="small mt8" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{u.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* 存档银行（每个游戏内置） */}
      <SaveBank gameId={game.id} />

      {/* 评论区 */}
      <div className="card mt16" style={{ padding: 22 }}>
        <div className="flex-between mb16">
          <h2 style={{ fontSize: 18 }}>评论 <span className="muted small">（{commentTotal}）</span></h2>
        </div>

        {user ? (
          <form onSubmit={submitComment} className="mb16">
            <textarea
              placeholder={replyingTo ? `回复 @${replyingTo.username}：` : `分享你的游戏体验（${3}-${500} 字，每分钟最多 5 条）`}
              value={replyingTo ? replyContent : newComment}
              onChange={(e) => (replyingTo ? setReplyContent(e.target.value) : setNewComment(e.target.value))}
              style={{ width: '100%', minHeight: 70 }}
            />
            <div className="flex-between mt8">
              <div className="flex">
                {replyingTo && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyingTo(null)}>
                    取消回复 @{replyingTo.username}
                  </button>
                )}
                <span className="small muted">{(replyingTo ? replyContent : newComment).length}/500</span>
              </div>
              <button className="btn btn-sm" disabled={(replyingTo ? replyContent : newComment).trim().length < 3 || commentSubmitting}>
                {commentSubmitting ? '发送中…' : (replyingTo ? '发表回复' : '发表评论')}
              </button>
            </div>
          </form>
        ) : (
          <p className="muted mb16">
            <a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>登录</a> 后参与评论
          </p>
        )}

        {comments.map((c) => (
          <div key={c.id}>
            {renderComment(c)}
            {c.replies && c.replies.length > 0 && (
              <div style={{ marginLeft: 18 }}>
                {c.replies.map((r) => renderComment(r, true))}
              </div>
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
