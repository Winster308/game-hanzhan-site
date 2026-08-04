# ── API 服务（Express + PostgreSQL） ─────────────────
# 依赖根目录 workspaces 安装，因此从仓库根构建

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
RUN npm ci --no-audit --no-fund

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY --from=deps /app/node_modules ./node_modules
COPY server ./server
WORKDIR /app/server
# 启动时自动执行数据库迁移 + 幂等 seed（确保管理员账号存在），再启动 API
CMD ["sh", "-c", "node src/migrate.js && node scripts/seed.js && node src/index.js"]
