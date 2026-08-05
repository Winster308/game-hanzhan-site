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
# 启动：index.js 内部自动执行数据库迁移 + 管理员幂等引导
CMD ["node", "src/index.js"]
