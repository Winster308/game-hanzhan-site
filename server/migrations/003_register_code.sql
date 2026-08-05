-- 003_register_code.sql — 注册邮箱验证码支持
-- email_tokens 允许 user_id 为空（注册验证码发生在用户创建前），并增加 email 列

ALTER TABLE email_tokens ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE email_tokens ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_email_tokens_email_kind ON email_tokens(email, kind);
