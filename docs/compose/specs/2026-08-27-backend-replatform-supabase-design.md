# J-nify 后端 Serverless 重构设计（Cloudflare Workers + Supabase）

- 日期：2026-08-27
- 状态：已批准（用户拍板）
- 关联：docs/SPEC.md（产品 Spec，业务契约不变）、docs/API.md（API 契约微调见 [S5]）、README.md（工程栈描述需更新）

> ⚠️ **历史快照（2026-08-27）**：设计时后端端点为 **11**；现为 **13**（新增 `GET/PUT /v1/me/profile`，昵称/资料）。本文件仅作当时设计留档，当前契约以 `docs/ARCHITECTURE.md`、`docs/API.md`、`docs/HANDOVER.md` 为准。

---

## [S1] 背景与目标

当前后端为 FastAPI + SQLAlchemy + SQLite 模块化单体（`backend/`，Python）。本项目处于初步开发阶段，无既有存量数据需要迁移。

用户决策：**完整移除 Python 后端**，将 `backend/` 清空并重写为适用于 **Cloudflare Workers** 部署与上线发布的 serverless 后端，业务内容与 API 服务**完全等价**；数据库改用 **Supabase**（账户管理 + 数据库）；push 到 main 自动触发后端上线（Cloudflare Dashboard git 集成）。

目标：

- API 契约 11 端点全部保留，前端零感知（除认证头变化，见 [S6]）。
- 15 实体数据模型等价迁移至 Supabase Postgres。
- 完整邮箱账户体系（Supabase Auth）。
- 顺带落地此前评审出的 MVP 缺口：护栏持久化、窗口/Nudge 落库（状态机真实化）、deferred 回流、频控/安静时段生效、前端 Toast/rescue/分类与期限录入/安静时段上送。

非目标（本阶段不做）：

- 真实 LLM 接线（`jennifer_brain` 保持模板降级 stub，env 预留）。
- 通知推送调度器 / CF Cron Triggers（M1 以后）。
- M2/M3（灰度、看板）。

## [S2] 架构总览

```text
Flutter 前端 (frontend/)
  ├─ supabase_flutter  ──► Supabase Auth（邮箱注册/登录/登出，拿 access token JWT）
  └─ ApiClient(BASE_URL) ──► Cloudflare Worker 后端 (backend/)
                                 │  Hono 路由（11 端点）
                                 │  Drizzle ORM ──postgres.js──► Supabase Postgres（pooler 事务模式 :6543，prepare:false）
                                 │  jose JWKS 验签（{SUPABASE_URL}/auth/v1/.well-known/jwks.json，进程内缓存）
                                 └─ wrangler.toml + CF Dashboard git 集成（push main 自动部署，Root directory=backend）
```

关键约束：

- `service_role`/secret 级凭据只存在于 Worker 端（CF Dashboard secrets / 本地 `.dev.vars`），**绝不进入前端或入库**。
- Worker 无本地磁盘：无本地文件缓存；ratelimit 为进程内近似（[S7]）。
- 时间统一 `timestamptz`（UTC 存储，展示层本地化）。

## [S3] 技术选型（用户已拍板）

| 决策点 | 选择 | 备注 |
| --- | --- | --- |
| 语言/框架 | TypeScript + Hono | Worker 主流方案，本地 node v24 可验证 |
| DB 访问 | Drizzle ORM + postgres.js 驱动 | 直接 SQL + 事务，状态机原子性；pooler 事务模式必须 `prepare:false`（官方文档 Caution） |
| 认证 | Supabase Auth 完整邮箱体系 | 前端 supabase_flutter；Worker JWKS 验签；JWT `sub` = user_id |
| 迁移 | supabase CLI migrations | `backend/supabase/migrations/*.sql`；golden rule：远端库只经迁移文件变更 |
| 部署 | Cloudflare Dashboard git 集成 | 用户配置；仓库提供 `backend/wrangler.toml` |
| 本地验证 | vitest 单测 + `wrangler dev` + 托管 dev 项目集成测试 | 本机无 docker/flutter |

依赖清单（backend/package.json 意图）：`hono`、`drizzle-orm`、`postgres`（postgres.js）、`jose`；dev：`wrangler`、`drizzle-kit`、`vitest`、`@cloudflare/workers-types`、`supabase`（CLI）、`tsx`。

## [S4] 数据模型与数据库迁移

映射规则（SPEC §6 ER → Postgres）：

- 15 实体全部建表（snake_case）：`users`、`user_preferences`、`integration_sources`、`signal_events`、`context_snapshots`、`item_commitments`、`item_steps`、`escalation_policies`、`opportunity_windows`、`message_templates`、`nudges`、`nudge_options`、`decisions`、`feedback`、`memory_notes`；另加 M2M `context_snapshot_signals`。
- `users.id uuid primary key references auth.users(id) on delete cascade` — 真实账户绑定，取代 `ensure_user` demo 模式。
- 业务表 `user_id` 一律 FK → `users.id`；`json` 字段用 `jsonb`；时间用 `timestamptz not null default now()`。
- 护栏持久化：`user_preferences`（scene='guardrails'，key/value 如 `quiet_hours_start`、`max_nudge_budget`、`privacy_scope`）。
- 状态枚举沿用 SPEC §6.1：`captured/parked/window_candidate/nudged/done/deferred/abandoned/rescued`。
- 迁移文件目录 `backend/supabase/migrations/`（时间戳命名，如 `20260827000000_init.sql`）；seed 可选 `supabase/seed.sql`（测试用户数据，不必要不建）。
- 应用方式：`supabase db push`（用户 PAT）或经 direct 连接串用 psql/postgres.js 等价执行；**绝不直接改远端库**。

## [S5] API 契约

11 端点与后端响应格式保持等价（见 docs/API.md + 现 schemas.py）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | root 信息 |
| GET | `/health` | 健康检查（含 DB 连通探测） |
| POST | `/v1/items/capture` | 录入 → parked |
| GET | `/v1/items?status=` | 列表 |
| POST | `/v1/items/{id}/decision` | 三选项 + rescue 闭环 |
| GET | `/v1/now` | 唯一 best window 或空态 |
| POST | `/v1/signals` | 信号入库 → ContextSnapshot |
| GET/PUT | `/v1/guardrails` | 护栏（DB 持久化） |
| DELETE | `/v1/me/data` | 可验证删除（级联） |
| POST | `/v1/llm/draft` | draft stub（恒 degraded 模板） |

变更点：

- 认证：`X-User-Id` 头移除 → `Authorization: Bearer <supabase access token>`；未带/无效 → 401。
- decision 取值统一 **`now / later / drop / rescue`**（文档矛盾随之修正：SPEC.md:674、API.md:11 的 `do` 改为 `now`）。
- decision 响应体增加 `message`（验收文案：now→「完成。这个窗口有效，Jennifer 记住了。」、later→「好，晚点。它不会消失…」、drop→「已体面放弃…」、rescue→「已接手兜底…」）。
- 错误统一 `{ "detail": "<msg>" }`，与 FastAPI 兼容（前端 ApiException 已按此解析）。

## [S6] 认证与账户

- Supabase Auth 邮箱密码注册/登录/登出，前端 `supabase_flutter`。
- 开发期若邮箱确认卡流程：Auth settings → 关闭 `Confirm email`（用户可选）；生产开启。
- Worker 验签：`jose` + JWKS（`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`），首次请求拉取并缓存（KV 或进程内）。
- 首访落库：`INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING`。
- 删除数据（`DELETE /v1/me/data`）：级联清理业务表 + 保留 `auth.users` 账户本身（前端登出可另删账户，本阶段不做）。

## [S7] 后端模块迁移清单

| 原 Python 模块 | TS 目标 | 要点 |
| --- | --- | --- |
| `common/auth.py` | `src/lib/auth.ts` | jose JWKS 验签 + ensure_user upsert（移除 X-User-Id） |
| `common/privacy_scope.py` | `src/lib/privacy.ts` | 信号 scope 白/黑名单判断，等价迁移 |
| `common/rate_limit.py` | `src/lib/rate-limit.ts` | 进程内滑动窗口；注明生产应换 CF Rate Limiting |
| `common/audit.py` | `src/lib/audit.ts` | 结构化日志（开源版保留日志落点，不建表） |
| `services/capture_service.py` | `src/services/capture.ts` | raw_text→title、category/due_at 透传、建 ItemCommitment+EscalationPolicy，captured→parked |
| `services/opportunity_window_engine.py` | `src/services/window-engine.ts` | 确定性 fit/reason（due_soon/weather/usage_state/manual_window），**读最近 ContextSnapshot features**；窗口落库（status 'served'） |
| `services/escalation_engine.py` | `src/services/escalation.ts` | quiet hours/**nudge budget 读库内护栏**（不再是 settings 常量）；warm-up intensity |
| `services/jennifer_brain.py` | `src/services/brain.ts` | 模板降级 stub；LLM env 预留；options 按 category 含 rescue |
| `services/notification_orchestrator.py` | `src/services/orchestrator.ts` | build_nudge：reason-gate + should_nudge + Nudge/NudgeOption 落库 + nudge_count++；**接入 /v1/now 与 decision 流程** |
| `services/context_engine.py` | `src/services/context.ts` | SignalEvent→ContextSnapshot 聚合 |
| `services/decision_feedback_service.py` | `src/services/decision-feedback.ts` | 状态机 + Decision/MemoryNote 落库 + 决策 message；**later→deferred→parked（同一事务内回 park 并 touch `updated_at`，Decision 行记录 later）**；/v1/now 按 `updated_at` 升序取候选 → 刚「晚点」的事项落队尾；`deferred` 不作为停留态出现在候选集 |
| — | `src/db/index.ts` | Drizzle client（pooler 事务模式，prepare:false；SSL） |
| — | `src/config.ts` | env 读取 + 默认值 |

M0 行为修正（一并落地）：

- `/v1/now`：候选 = parked/window_candidate/nudged（**不含 deferred**），逐项 compute 后取 `fit_score` 最高（平局 created_at 升序）；带最近 ContextSnapshot features 进 compute；served 窗口落库；fresh 窗口不重复建 Nudge（按窗口 created_at 窗口期判断）。
- 护栏 GET/PUT 读写 `user_preferences`，默认值回落 config。
- 频控红线真实生效：`build_nudge` 只在该事项 policy 允许时建 Nudge 并递增 `nudge_count`（预算耗尽/安静时段 → 仍可被动可见，但不产生 Nudge）。

## [S8] 前端（Flutter）补齐

- 依赖：`supabase_flutter`（Supabase.init：url + anon/publishable key）。
- 认证：新增登录/注册页（邮箱+密码）、登出入口；`main.dart` 加 AuthGate（未登录 → 登录页）。
- ApiClient：附 `Authorization: Bearer <access_token>`；401 时触发重新登录。
- 录入：捕获框加分类 chips（life/chore/bill/return/study/social）+ 可选期限快捷项（无/明天/7天/两周）；capture 请求带 `category` + `due_at`。
- FocusCard：**按后端 options 渲染按钮**（now/later/drop + 条件出现的 rescue「帮我兜底」），不再硬编码 3 个。
- Toast 收口：SnackBar（顶部居中 pill、2.2s 自动消失，SPEC §3.5），capture/decision 复用后端 message。
- MeScreen：安静时段开关、粗粒度位置、提醒上限 **全部真实读写**（PUT guardrails），切页/重启后回读。
- 环境变量：`SUPABASE_URL`、`SUPABASE_ANON_KEY`(publishable)、`BACKEND_BASE_URL`。

## [S9] 部署与配置

- `backend/wrangler.toml`：`name = "jnify-backend"`（占位，用户 CF 侧命名可改）、`compatibility_date`、`main = "src/index.ts"`、vars。
- CF Dashboard git 集成：Root directory = `backend`；push main 自动部署；环境变量/secret 在 CF Dashboard（Worker → Settings → Variables and Secrets）注入，**不落仓库**。
- 本地开发：`.dev.vars.example`（提交）→ 复制 `.dev.vars`（忽略）；`wrangler dev` 起本地 Worker。
- env 映射（16 旧项 → 新）：

| 用途 | 新 env | 说明 |
| --- | --- | --- |
| Supabase URL | `SUPABASE_URL` | JWKS 来源 + 前端 Auth 同源 |
| DB 运行时 | `DATABASE_URL` | pooler transaction :6543，prepare:false |
| DB 迁移 | `DIRECT_DATABASE_URL` | 仅本机/CI 用，不进 Worker 运行时 |
| 护栏默认 | `QUIET_HOURS_START/END`、`MAX_NUDGE_BUDGET` | 默认值，运行时以库内为准 |
| LLM 预留 | `LLM_API_BASE`、`LLM_API_KEY`、`LLM_MODEL` | 空则模板降级 |
| 其他 | `APP_ENV`、`APP_VERSION`、`CORS_ORIGINS`、`RATE_LIMIT_PER_MINUTE`、`LOG_LEVEL` | 等价迁移；`APP_HOST/APP_PORT` 由 Worker URL 取代、`SESSION_TTL_SECONDS` 由 Supabase Auth 会话管理取代 |

## [S10] 验证策略

- 单测（vitest，纯逻辑）：window-engine 四分支、escalation 安静时段/预算、brain 模板与 rescue 条件、decision 状态机映射。
- 集成测试（vitest，连托管 dev 项目）：经 Supabase Auth 真实注册用户 → 拿 JWT → 全 11 端点走查：capture→(now×2 验证 deferred 不连续回顶)→decision 四选项→guardrails PUT→重启语义（重连验证护栏仍在）→signals→me/data 删除。
- 本地冒烟：`wrangler dev` + curl 走 capture/now。
- 前端：本机无 flutter，静态审查 + `flutter analyze` 由用户在有工具链的机器执行（README 记录验证边界）。
- CI 例行：`npm run typecheck`、`npm test`（依赖 CF git 集成可选构建钩子，本阶段人工执行）。

## [S11] Supabase 接入清单（用户操作）

用户按以下步骤操作（URL 于 2026-08 对照官方文档核验）：

1. 打开 https://supabase.com/dashboard → 注册/登录（GitHub 即可）。
2. 创建项目 https://supabase.com/dashboard/new → 项目名 `jnify-dev`、Database region 就近（如 Southeast Asia (Singapore)）、**设置并记牢数据库密码**、Free tier。
3. 项目进入后点顶部 **Connect**（直达 https://supabase.com/dashboard/project/_?showConnect=true），复制以下 4 样值发给实施者：
   - **Project URL**：`https://<project-ref>.supabase.co`
   - **publishable key**（API Keys 标签，`sb_publishable_...`；旧 UI 则用 `anon`）
   - **transaction pooler 连接串**（Transactions 标签）：`postgres://postgres.<ref>:<密码>@aws-<region>.pooler.supabase.com:6543/postgres`
   - **direct 连接串**（General 标签）：`postgresql://postgres:<密码>@db.<ref>.supabase.co:5432/postgres`
4. （可选，授权实施者代跑迁移）https://supabase.com/dashboard/account/tokens → Generate new token（命名 `jnify-cli`）→ 发出。不授权则实施者用 direct 连接串以脚本方式等价建表。
5. （可后置，不阻塞开发）Cloudflare Dashboard 创建 Worker 并绑定本仓库 git 集成，Root directory = `backend`，push main 自动部署。

收到值后实施者：落 `.dev.vars`/配置模板 → 编写迁移 SQL → 应用至 dev 项目 → 跑集成测试。

## [S12] 验收标准

- [ ] backend/ 无 Python 残留；TS 项目 typecheck + vitest 全绿。
- [ ] 11 端点等价；401 语义正确；decision 取值统一 four options。
- [ ] 数据库 15+1 表经迁移文件建成；users 关联 auth.users。
- [ ] 端到端闭环：注册 → 录入(chore+due) → /v1/now 显示带理由窗口 → 四按钮（含 rescue 条件出现）→ 决策后状态迁移正确、Toast 显示后端 message。
- [ ] 「晚点」后 /v1/now 不立即回顶（deferred 回流语义）。
- [ ] 护栏 PUT 后持久化（重连可见）；安静时段/预算在 escalation 生效（库内值）。
- [ ] OPPORTUNITY_WINDOW/NUDGE 表有真实行（窗口落库、nudge_count 递增）。
- [ ] 前端缺口闭合：Toast、rescue、分类/期限录入、安静时段上送（静态审查通过；`flutter analyze` 由用户验证后回补确认）。
- [ ] 文档矛盾修正：SPEC.md:674 / API.md:11 的 `do`→`now`；README 工程栈、仓库结构、scripts/ 行更新为 serverless 描述。

## [S13] 风险与注意事项

- **凭据卫生**：publishable key 可入前端；DB 密码/secret 类只进 CF secrets 与本地被忽略的 `.dev.vars`；聊天传递凭据仅限本会话。
- **pooler 事务模式不支持 prepared statements**：postgres.js 必须 `prepare:false`，否则 42P05 类错误。
- **direct 连接为 IPv6**（或需 IPv4 add-on）：迁移/psql 在本机执行时需确认网络可达；不行则走 pooler session/transaction 执行 DDL（事务模式 DDL 亦可，逐条执行）。
- **邮箱确认**：开发期需在 Auth settings 关闭 Confirm email，否则注册后无法登录。
- **ratelimit 进程内近似**：多 isolate 下计数不准；上线前评估 CF Rate Limiting。
- **前端本地无法验证**：本机无 flutter/docker；验证边界写入 README。
- **迁移 golden rule**：任何环境不得用 Dashboard/SQL Editor 直接改远端表结构，只走 `supabase/migrations`。