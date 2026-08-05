# 🎮 游戏汉化站

汉化游戏分享一站式平台：游戏展示（图片 + 文字 + 标签）、原版/汉化双链接、点赞收藏评论、实时排行榜、存档银行、举报系统、公告栏，以及独立的管理后台。

## 技术栈

- **后端**：Node.js + Express + PostgreSQL（Railway Postgres）
- **用户端**：React 18 + Vite + React Router（仿 gityx.com 简洁风格）
- **管理后台**：独立 React 站点（独立域名部署）
- **邮件**：SMTP（QQ 邮箱授权码等）优先，Brevo 备选；未配置时自动降级为日志

## 项目结构

```
├── server/   # API 服务（Express + pg，含数据库迁移与 seed）
├── web/      # 用户端网站
├── admin/    # 管理后台（独立网站）
└── migrations/ → server/migrations/  # SQL 迁移
```

## 本地开发

```bash
npm install                 # 安装全部 workspace 依赖
# 1. 准备本地 PostgreSQL，创建数据库 game_hanzhan
# 2. 复制 .env.example 为 server/.env 并填写 DATABASE_URL
npm run migrate             # 建表
npm run seed                # 创建管理员（Winster / winster）+ 示例游戏
npm run dev:server          # API: http://localhost:3001
npm run dev:web             # 用户端: http://localhost:5173
npm run dev:admin           # 管理后台: http://localhost:5174
```

管理员初始密码由环境变量 `ADMIN_PASSWORD` 决定（默认 `Winster@2025`），部署后请立即修改密码。

## 功能清单

### 用户端
- 游戏卡片流（封面 / 简介 / 标签），搜索 + 标签筛选 + 排序（最新 / 最热 / 最多游玩）
- 游戏详情：原版链接与汉化链接一键开玩（点击计数）、点赞、收藏、热度分、1-5 星评分
- 游戏投稿：用户可提交游戏（标题/简介/标签/双链接/封面），管理员审核通过后自动上架，站内通知结果
- 评论：3-500 字，每分钟最多 5 条，可编辑 / 删除自己的评论，支持楼中楼回复（@用户）
- 排行榜：热度分 = 点赞×2 + 收藏×3 + 评论×4 + 游玩数，实时更新
- 存档银行：已并入每个游戏详情页，玩家以 .txt 文件或剪贴板上传该游戏存档，管理员审核后公开，可下载计数
- 游戏更新日志：版本号 + 更新内容，详情页展示
- 举报：辱骂 / 广告 / 色情 / 剧透 / 其他，附补充说明
- 公告栏：置顶公告 + 过期时间
- 通知中心：存档审核结果、举报处理结果、评论被回复、封禁 / 解封、成就解锁、新公告实时提醒（导航铃铛红点）
- 成就与等级：14 项成就 + 经验等级（Lv 随经验提升），个人中心成就墙
- 封禁申诉：被封禁可提交申诉，管理员处理后站内通知结果
- 账号与安全：登录 IP 记录、邮箱 / 密码 / 昵称每月可改一次、邮箱验证、找回密码
- 主题切换：亮色 / 暗色 / 跟随系统
- 个人中心：我的收藏 / 点赞 / 评论 / 存档 / 举报记录 / 成就

### 管理后台（独立站点，管理员 = 用户名 Winster / winster）
- 仪表盘：今日访问人数（独立 IP）、PV、昨日对比、实时在线、近 7 天柱状图、今日分时访问、访客地区分布、热门搜索词、来源 Top、热度 TOP10
- 游戏管理：增删改，图片可传 URL 或本地上传（≤5MB，存数据库），管理更新日志（版本 + 内容）
- 投稿审核：查看投稿完整信息，通过即自动上架游戏，或驳回（附原因，回传投稿者）
- 评论管理：修改 / 删除任意评论
- 用户管理：封禁（按小时或永久）与解封、设置 / 撤销管理员
- 举报审核：确认（可选封禁时长 / 永久封禁 / 同时删除评论）或驳回，处理备注回传给举报人
- 申诉审核：通过（解封）或驳回，回复回传申诉人
- 存档审核：查看完整内容、通过 / 驳回（附原因）
- 公告管理：发布 / 编辑 / 删除，置顶与过期时间（发布后全员站内通知）
- 审计日志：管理员全部操作留痕

### 安全与风控
- 密码 bcrypt 加盐哈希，JWT 认证
- 封禁账号：登录被拒并提示原因与剩余时间，评论 / 点赞 / 收藏 / 上传存档 / 举报均被拦截
- 登录尝试限流（每 IP+账号 5 次/分钟），评论限流（5 条/分钟）
- 举报目标防重复提交；管理员不可封禁其他管理员
- 用户 IP 由 `x-forwarded-for` 提取并校验格式，防伪造注入

## 部署到 Railway

1. **创建 PostgreSQL**：Railway 中 Add New → Database → PostgreSQL，`DATABASE_URL` 变量会自动注入到同项目内的服务。
2. **创建 3 个服务**（Add New → Empty Service → 选择本仓库 `Winster308/game-hanzhan-site`）：
   - 每个服务创建后，**必须**在 Settings → Source 中把 **Root Directory（根目录）** 设置为对应子目录：
     - API 服务 → `server/`
     - 用户端 → `web/`
     - 管理后台 → `admin/`
   - Railway 会在该目录中找到 `Dockerfile` 并以该目录为构建上下文（自包含构建，不依赖仓库根）。
3. **环境变量**（每个服务）：
   - server：`JWT_SECRET`（随机长串）、`ADMIN_PASSWORD`（管理员初始密码）、`BREVO_API_KEY`（可选）、`MAIL_FROM`、`WEB_URL`
   - web：`API_UPSTREAM=http://<api 服务域名>`
   - admin：`API_UPSTREAM=http://<api 服务域名>`
4. 为 web / admin 生成域名（Settings → Networking → Generate Domain），为 server 生成域名。
5. 部署后 API 自动执行迁移与 seed；登录 `<admin域名>` 使用 Winster 账号（`ADMIN_PASSWORD` 值）进入管理后台。

> 注意：三个子包（server / web / admin）互不依赖，各自独立 `npm install` 构建；开发时使用仓库根 workspaces 统一管理。

## 常见问题

- **邮件不发送**：未配置 `BREVO_API_KEY`，功能正常但验证/找回邮件仅打印日志，配置后重启即生效。
- **图片存储**：上传图片以 base64 存于数据库（≤5MB），适合中小站；量大后可迁移对象存储。
- **多实例部署**：内存限流（登录尝试）为单实例设计，多副本请换 Redis。
