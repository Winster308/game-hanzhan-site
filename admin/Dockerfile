# ── 管理后台（React 静态站 + nginx，独立站点） ────────

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY admin/package.json admin/package.json
RUN npm ci --no-audit --no-fund
COPY admin ./admin
RUN npm run build --workspace admin

FROM nginx:1.27-alpine
COPY admin/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/admin/dist /usr/share/nginx/html
EXPOSE 80
