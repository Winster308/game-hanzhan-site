# ── 管理后台（React 静态站 + nginx，独立站点） ────────
# 自包含构建：Railway 服务 Root Directory 设为 admin/，构建上下文即本目录

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY index.html vite.config.js ./
COPY src ./src
# 构建时注入 API 地址（Railway 服务变量默认作为 build args 传入）
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm install --no-audit --no-fund && npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
