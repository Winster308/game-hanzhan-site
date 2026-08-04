# ── 用户端（React 静态站 + nginx） ────────────────────
# 自包含构建：Railway 服务 Root Directory 设为 web/，构建上下文即本目录
# nginx 会把 /api 请求代理到 API 服务（通过环境变量 API_UPSTREAM 注入）

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY index.html vite.config.js ./
COPY src ./src
RUN npm install --no-audit --no-fund && npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
