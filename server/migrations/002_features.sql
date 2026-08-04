-- 002_features.sql — 第二批功能：通知/更新日志/申诉/评分/搜索记录/成就/评论回复

-- 通知
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- 游戏更新日志
CREATE TABLE IF NOT EXISTS game_updates (
  id BIGSERIAL PRIMARY KEY,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version VARCHAR(40) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_game_updates_game ON game_updates(game_id, created_at DESC);

-- 封禁申诉
CREATE TABLE IF NOT EXISTS ban_appeals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reply TEXT,
  handled_by BIGINT REFERENCES users(id),
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON ban_appeals(status, created_at DESC);

-- 评分（1-5 星，一人一评可改）
CREATE TABLE IF NOT EXISTS ratings (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

-- 搜索记录（热门搜索词统计）
CREATE TABLE IF NOT EXISTS search_logs (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_logs_time ON search_logs(created_at);

-- 游玩记录（按用户统计游玩成就）
CREATE TABLE IF NOT EXISTS play_logs (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

-- 成就定义
CREATE TABLE IF NOT EXISTS achievements (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  exp INTEGER NOT NULL DEFAULT 10,
  condition_type TEXT NOT NULL,
  condition_value INTEGER NOT NULL DEFAULT 1
);

-- 用户已解锁成就
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id BIGINT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- 评论回复（楼中楼）
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- 访问日志增加来源页字段
ALTER TABLE visit_logs ADD COLUMN IF NOT EXISTS referer TEXT;
-- 访问日志增加地区字段（异步 IP 归属增强填充）
ALTER TABLE visit_logs ADD COLUMN IF NOT EXISTS country TEXT;

-- 成就种子数据（幂等）
INSERT INTO achievements (code, name, description, icon, exp, condition_type, condition_value) VALUES
  ('first_comment', '初出茅庐', '发表第一条评论', '🗨️', 10, 'comment_count', 1),
  ('comment_10', '侃侃而谈', '累计发表 10 条评论', '💬', 30, 'comment_count', 10),
  ('first_like', '点个赞', '第一次给游戏点赞', '👍', 10, 'likes_count', 1),
  ('like_20', '点赞狂魔', '累计点赞 20 次', '🔥', 30, 'likes_count', 20),
  ('first_favorite', '收藏家', '第一次收藏游戏', '⭐', 10, 'favorites_count', 1),
  ('favorite_10', '收藏达人', '累计收藏 10 个游戏', '📚', 40, 'favorites_count', 10),
  ('first_save', '存档新手', '第一次上传存档', '💾', 10, 'saves_count', 1),
  ('save_5', '存档大师', '累计上传 5 个存档', '🗃️', 40, 'saves_count', 5),
  ('save_approved_3', '优质贡献者', '3 个存档通过审核', '✅', 60, 'saves_approved', 3),
  ('first_report', '正义使者', '第一次举报违规内容', '🚩', 10, 'reports_count', 1),
  ('report_adopted', '明察秋毫', '举报被管理员采纳', '🕵️', 50, 'report_adopted', 1),
  ('play_5', '游戏达人', '游玩过 5 个不同游戏', '▶️', 30, 'play_count', 5),
  ('play_20', '资深玩家', '游玩过 20 个不同游戏', '🎮', 50, 'play_count', 20),
  ('login_7', '常客', '累计登录 7 次', '🔑', 20, 'login_count', 7)
ON CONFLICT (code) DO NOTHING;
