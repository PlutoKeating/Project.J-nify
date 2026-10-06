# 快速开始（QUICK START）

前置：Node.js 24（jnify-data 用内置的 node:sqlite，需 ≥ 22.18）、Flutter SDK（stable）；不需要任何外部数据库。生产环境密钥见 `docs/devops/SECRETS_REGISTRY.md`。

## 数据服务（jnify-data）

```bash
cd data
npm ci
npm run dev                     # http://127.0.0.1:8789，数据在 data/.dev/（gitignored），开发密钥写在 dev 脚本里
```

- 表结构：`data/src/schema.sql`（23 表 + 闭环率视图），服务启动时自动建表；改结构就改这个文件。说明见 [`data/README.md`](../data/README.md)。

## 后端（Cloudflare Worker）

```bash
cd backend
npm ci                          # 安装依赖
cp .dev.vars.example .dev.vars  # 默认已指向本地 jnify-data（JNIFY_DATA_URL=http://127.0.0.1:8789，JNIFY_DATA_KEY 与 data 的 dev 脚本相同）
npx wrangler dev                # 本地起 Worker（http://localhost:8787）
```

- 业务接口要 PlutoKeating 账号的访问令牌（`ID_ISSUER` 缺省 `https://id.plutokeating.beer/`）。本地调接口最省事的办法是用 App 登录后发请求；自动化测试见下方「验证清单」，用本机假 JWKS，不需要真账号。

**部署（生产）**：push `main` 且改动 `backend/**` → GitHub Actions 自动 `wrangler deploy` 到
`https://j-nify.williamhvollita.dpdns.org`；亦可 Dashboard → Actions → Deploy Backend → Run workflow 手动触发。

## 前端（Flutter）

```bash
cd frontend
cp .env.example .env    # 可选：覆盖 BACKEND_BASE_URL（如指向本地 wrangler dev）等；登录固定用 PlutoKeating 账号
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

- 登录（PlutoKeating 账号：邮箱验证码 / 通行密钥 / GitHub，第一次用自动建账号）→ 录入 → 决策 → 登出。
- 「我的」页改昵称走 `GET/PUT /v1/me/profile`（昵称非唯一）；邮箱、通行密钥、关联 GitHub 在设置页「PlutoKeating 账号」点开的账号设置页里管理；「删除我的数据」只删 J-nify 的数据。
- 数据服务测试：`cd data && npm test && npm run typecheck`。
- 本地集成测试：`cd data && npm ci`，再 `cd backend && npm run test:integration`：真实 Worker 应用 + 进程内 jnify-data（临时目录里的 SQLite）+ 本机假 JWKS，不需要任何外部服务。CI 自动执行这 5 项测试。
- 生产只读冒烟：`cd backend && npm run smoke:production`；提供 `ADMIN_USERNAME/ADMIN_PASSWORD` 与 `SMOKE_REQUIRE_ADMIN=1` 时同时验证 Admin 登录、会话、文档和成本接口。

## 生产运维速查

- 当前工作状态、最新验证记录和未完成项：`docs/HANDOVER.md`。
- 查 CI/部署/冒烟：`gh run list --limit 20`；查某次失败：`gh run view <run-id> --log-failed`。
- 后端部署：`backend/**` 推入 `main` 自动触发 `Deploy Backend`。官网部署：`website/**` 推入 `main` 自动触发 `Deploy Website`。
- 生产冒烟：每日 UTC 01:17（北京时间 09:17）自动运行，也可手动运行 `Production Smoke`；包含公开端点、Admin 只读链路和 Android 安装启动。
- Admin 凭据轮换：先更新 GH Secrets，再运行 `Configure Worker Secrets (Ops)`（`confirm=YES`），最后手动运行 `Production Smoke`；真值不入库。
- 密钥名称、所属系统和轮换规则：`docs/devops/SECRETS_REGISTRY.md`。发布、官网与告警邮件分别见 `docs/devops/release.md`、`website-deploy.md`、`smtp.md`；数据服务的部署与备份见 `data/README.md`。
