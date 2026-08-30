# 快速开始（QUICK START）

前置：Node.js ≥ 20（建议 24）、Flutter SDK（stable）、Supabase 项目（迁移已含在仓库）；生产环境密钥见 `docs/devops/SECRETS_REGISTRY.md`。

## 后端（Cloudflare Worker）

```bash
cd backend
npm ci                          # 安装依赖
cp .dev.vars.example .dev.vars  # 填：
                                #   SUPABASE_URL / SUPABASE_SERVICE_KEY（后端专用）
                                #   DATABASE_URL=pooler 事务连接串（迁移/测试用，Node 侧）
npx wrangler dev                # 本地起 Worker（http://localhost:8787）
```

**数据库迁移（结构即代码）**：

```bash
DIRECT_DATABASE_URL='postgres://...pooler.../postgres' npm run db:migrate
```

- 迁移文件：`backend/supabase/migrations/*.sql`（golden rule：**任何环境不得用 Dashboard 直接改表结构**）。
- 当前迁移含：基础 16 表（0000）、护栏唯一索引（0001）、事务 RPC（0002/0003）、RLS 加固（0004）、v0.2 的 3 表与 v0.3 的 4 表，共 23 表。

**部署（生产）**：push `main` 且改动 `backend/**` → GitHub Actions 自动 `wrangler deploy` 到
`https://j-nify.williamhvollita.dpdns.org`；亦可 Dashboard → Actions → Deploy Backend → Run workflow 手动触发。

## 前端（Flutter）

```bash
cd frontend
cp .env.example .env    # 可选：覆盖 BACKEND_BASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY（publishable，仅 Auth）
flutter pub get
flutter run
```

> 提示：iOS 需 macOS（`flutter build ipa --no-codesign` 仅产 xcarchive）；Android `flutter build apk --release` 侧载安装；
> 正式安装包从 GitHub Releases 下载（不是从仓库 build 目录分发）。

## 官网（React 落地页）

- 源码：`website/`
- 本地预览：`cd website && npm ci && npm run dev`
- 构建：`cd website && npm run build`（产物 `website/dist/`）
- 生产域名：**https://j-nify.arr2018.dpdns.org**（Cloudflare Pages，push `main` 自动发布）；部署说明见 `docs/devops/website-deploy.md`。

## 验证清单

- 注册 → 邮箱确认（生产 SMTP 已接，j_nify@yeah.net）→ 登录 → 录入 → 决策 → 登出。
- 「我的」页改昵称走 `GET/PUT /v1/me/profile`（昵称非唯一）；邮箱/密码经 Supabase Auth，邮箱改需到新邮箱点确认链接（回调回 App，App Link，见 `docs/devops/email-callback.md`）。
- 本地集成测试：`cd backend && npx supabase start` 启动一次性本地 Supabase 栈，按 `npx supabase status -o env` 映射 `API_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL` 后运行 `npm run test:integration`。CI 自动执行这 5 项测试，不接触生产库或生产 service key。
- 生产只读冒烟：`cd backend && npm run smoke:production`；提供 `ADMIN_USERNAME/ADMIN_PASSWORD` 与 `SMOKE_REQUIRE_ADMIN=1` 时同时验证 Admin 登录、会话、文档和成本接口。

## 生产运维速查

- 当前工作状态、最新验证记录和未完成项：`docs/HANDOVER.md`。
- 查 CI/部署/冒烟：`gh run list --limit 20`；查某次失败：`gh run view <run-id> --log-failed`。
- 后端部署：`backend/**` 推入 `main` 自动触发 `Deploy Backend`。官网部署：`website/**` 推入 `main` 自动触发 `Deploy Website`。
- 生产冒烟：每日 UTC 01:17（北京时间 09:17）自动运行，也可手动运行 `Production Smoke`；包含公开端点、Admin 只读链路和 Android 安装启动。
- Admin 凭据轮换：先更新 GH Secrets，再运行 `Configure Worker Secrets (Ops)`（`confirm=YES`），最后手动运行 `Production Smoke`；真值不入库。
- 密钥名称、所属系统和轮换规则：`docs/devops/SECRETS_REGISTRY.md`。发布、官网与邮件分别见 `docs/devops/release.md`、`website-deploy.md`、`email-callback.md`。
