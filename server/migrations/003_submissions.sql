-- 003_submissions.sql — 游戏投稿 + 存档银行并入游戏（删除全局开关）

-- 游戏投稿（用户提交，管理员审核后转为正式游戏）
CREATE TABLE IF NOT EXISTS game_submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  cover_type TEXT NOT NULL DEFAULT 'url',
  cover_url TEXT,
  cover_data TEXT,
  original_url TEXT NOT NULL,
  localized_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  game_id BIGINT REFERENCES games(id) ON DELETE SET NULL,
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON game_submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON game_submissions(user_id, created_at DESC);

-- 存档银行已并入每个游戏详情页，删除全局开关字段
ALTER TABLE games DROP COLUMN IF EXISTS save_bank_enabled;
