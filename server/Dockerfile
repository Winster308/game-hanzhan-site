# ── API 服务（Express + PostgreSQL） ─────────────────
# 自包含构建：Railway 服务 Root Directory 设为 server/，构建上下文即本目录

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
RUN npm install --omit=dev --no-audit --no-fund
# 启动时自动执行数据库迁移 + 幂等 seed（确保管理员账号存在），再启动 API
CMD ["sh", "-c", "node src/migrate.js && node scripts/seed.js && node src/index.js"]
