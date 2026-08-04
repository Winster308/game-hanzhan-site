# ── 用户端（React 静态站 + nginx） ────────────────────
# nginx 会把 /api 请求代理到 API 服务（通过环境变量 API_UPSTREAM 注入）

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --no-audit --no-fund
COPY web ./web
RUN npm run build --workspace web

FROM nginx:1.27-alpine
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
