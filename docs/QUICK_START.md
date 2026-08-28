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
- 当前迁移含：15+1 表（0000）、护栏唯一索引（0001）、事务 RPC（0002/0003）、RLS 加固（0004）。

**部署（生产）**：push `main` 且改动 `backend/**` → GitHub Actions 自动 `wrangler deploy` 到
`https://jnify.williamhvollita.dpdns.org`；亦可 Dashboard → Actions → Deploy Backend → Run workflow 手动触发。

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
- 本地集成测试（可选）：`SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_KEY/DATABASE_URL` 环境下
  `npx vitest run test/integration.test.ts`（5 用例：注册用 service key 建已确认用户再真实登录）。