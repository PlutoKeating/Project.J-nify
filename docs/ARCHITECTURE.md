# 系统架构

J-nify 采用「Flutter 客户端 + Cloudflare Worker 后端 + Supabase（Postgres/Auth）」架构，前后端通过 REST API 通信。完整设计见 [`SPEC.md`](SPEC.md)（§5 架构思维导图、§6 数据模型 ER、§7 模块与接口）。

## 总览

```
[ Flutter 前端 frontend/ ]
    │  supabase_flutter（Auth：注册/登录/登出，拿 JWT）
    │  REST(JSON) + Authorization: Bearer <JWT>
    ▼
[ Cloudflare Worker 后端 backend/ ]   （TS + Hono）
    │  jose JWKS 验签（Supabase Auth JWT）
    │  Supabase REST（PostgREST；service key，标准 HTTPS）
    ▼
[ Supabase：Postgres 23 表 + RPC（fn_decide / fn_create_nudge / fn_ingest_signal）]
    │  SMTP（j_nify@yeah.net）发确认/重置邮件
    ▼
[ 用户邮箱 ]
```

- **前端**：Flutter（`frontend/`），supabase_flutter 认证；生产后端默认 `https://j-nify.williamhvollita.dpdns.org`。
- **后端**：Cloudflare Worker（`backend/`），TypeScript + Hono。部署 = GitHub Actions `wrangler deploy`（push main 自动）。
- **数据层**：Supabase Postgres。**Worker 内不使用 postgres.js 直连**（Supavisor 私有根 CA 不被 workerd 信任，ca 注入无效、Hyperdrive 未开通）→ 全部经 **PostgREST (HTTPS)** + **事务性 RPC**；详情与踩坑见 §「数据访问层」。

## 前端（Flutter）

- `core/config/` — `AppConfig`（dotenv 读 `.env`；`prodBackendBaseUrl` 为生产默认值）+ `Env` 常量。
- `auth/` — `AuthGate`（authStateChanges → Login/HomeShell）+ 登录/注册页（`supabase_flutter`）。
- `core/api/` — `ApiClient`：Bearer JWT 注入；401 → 静默登出（回登录页）；未初始化 guard。
- `services/` — `ApiService` 封装 `/v1/...`（capture/now/items/decision/guardrails/signals）。
- `models/` — `ItemCommitment`（含 const 构造器与 `options` 字段）。
- `screens/ + widgets/` — `现在/全部/我的` 三视图；焦点卡按后端 options 渲染（含 rescue）；录入分类 chips+期限；Toast 顶部 pill（SPEC §3.5）；护栏真实读写。`HomeShell` body 包 `SafeArea` 避开刘海/状态栏；`我的` 页含资料卡（昵称+邮箱）+ 设置入口，`SettingsScreen` 分组改昵称/密码/邮箱；「隐私说明」「关于」用 `ExpansionTile` 默认折叠。
- **资料/昵称**：昵称存 `public.users.nickname`（**非唯一**），因 RLS 客户端零数据访问，读写经后端 `GET/PUT /v1/me/profile`（service key）；邮箱来自 Supabase Auth（`auth.currentUser.email`），更改经 `auth.updateUser` 触发确认邮件并回跳 App（App Link）。
- **邮件回调/会话（Deep Link）**：确认/重置邮件 `{{ .ConfirmationURL }}` 由 Supabase **Site URL** 生成；生产 Site URL 已从历史的 `http://localhost:3000` 改为 `https://j-nify.arr2018.dpdns.org`，Additional Redirect URL 与 30 天滑动会话配置已生效。App 用 `app_links` 订阅深链，`token_hash`+`type` → `auth.verifyOTP`，`code`/`access_token` → `getSessionFromUrl`；Android App Link 校验资产已部署在 `website/public/.well-known/`。App 显式启用 `autoRefreshToken/persistSession`，`AuthGate` 启动时 `refreshSession()` 滑动重置未活动时钟（见 `docs/devops/email-callback.md`）。

## 后端（Cloudflare Worker）

| 模块 | 职责 |
| --- | --- |
| `src/db/` | PostgREST 客户端（restGet/restInsert/restUpdate/restDelete/restRpc）+ 护栏/上下文/时区读取 + auth admin 删除 |
| `services/` | capture / window-engine / escalation（频控：安静时段+窗口去重）/ brain（模板降级 stub）/ decision-feedback / context / orchestrator（晚点冷却 + 全 defer 抑制 nudge）/ **rhythm（节奏策略，agent 可写）** / **agent（Jennifer harness + MCP 风格工具集）** |
| `routes/` | 业务端点 + **`/admin`（管理面板 SPA + API）** + **`/v1/jennifer/chat`** + **`/v1/metrics/events`** |
| `lib/` | auth（JWKS 验签 + ensureUser upsert）、privacy scope、rate-limit（进程内）、audit（日志）、**admin-auth（会话）**、**llm（多 provider 网关 + models.dev）**、**alerts（GitHub Issues + SMTP）**、**config-store（system_config 热加载）** |

**身份与授权**：Supabase Auth 签发 JWT → Worker `jose` 从 `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` 验签（模块级缓存），`sub`=user_id；任何客户端凭据不能读写数据表（RLS 全拒，见下）。

### v0.2.0 新增：admin 管理面 / Jennifer agent / 执行层本地优先

- **admin 面板**：同域 `/admin` 单页应用 + `/admin/api/*`。登录凭据来自 CF 环境变量（`ADMIN_USERNAME`/`ADMIN_PASSWORD`/`SESSION_SECRET`），HMAC 签名 session cookie。LLM 配置（多 provider / 多 key / 多模型 / 模型级尝试顺序）存 `system_config` 表（JSON + version），Worker 内 TTL 缓存 + PUT 主动失效 → **保存即热加载**；models.dev 公开 API 提供**供应商下拉点选录入（字典序，自动带出 id/名称/Base URL）、按供应商过滤的模型模糊搜索点选添加、key/模型动态 chip 列表（每项独立删除）、模型尝试顺序列表（`providerID/modelID` 条目，＋/− 增删 + 拖拽排序，保存时自动剔除已失效条目）**（同时保留手填）。指标看板（闭环率 SQL 视图 `v_closure_rate`）与告警阈值配置同面板。
- **Jennifer agent**：`POST /v1/jennifer/chat` 工具调用循环。工具集按 MCP 风格 JSON Schema 定义：事项 CRUD、节奏策略读写（`rhythm_policies`）、护栏读写、话术/兜底草稿、静默。LLM 调用按 admin 配置的 provider/key/model 优先级依次尝试，失败自动切换；无可用 LLM 时诚实报错，不做硬编码兜底话术。system prompt 含品牌人设与**参考话术列表（仅参考、非强制）**、真实性红线（无信号不得编造理由）、真实动作二次确认。
- **执行层本地优先**（Q3/Q8 定案）：原始信号（屏幕使用/日历/天气/位置）只在 App 本地处理，不上传；App 本地窗口引擎驱动本地通知；云端仅存事项/决策/策略与匿名指标。`/v1/signals` 保留但 App 不再调用。
- **频控（Q1 定案）**：移除 `max_nudge_budget` 硬门；保留安静时段（按 `users.timezone` 本地时间）与窗口级 nudge 去重（同 `window_id` 已有 nudge 则复用）；冷却/节奏由 Jennifer 通过 `rhythm_policies` 管理（初始默认：账单 10/3 天、退货 3/5/1 天、作业 10/5/3 天、无死线同理由冷却 72h）。
- **指标与告警**：`metrics_events` 匿名事件（不含内容）+ `v_closure_rate` 视图；告警双通道 = GitHub Issues（`GH_PAT`，最小权限）+ SMTP 邮件（`SMTP_HOST/PORT/USER/AUTH`），阈值经 admin 配置。

### v0.3.0 新增：Jennifer agent 完整实现（官方文档集 / 结构化记忆 / 流式 / 撤销 / 管理面）

- **官方文档集（`agent_docs` 表）**：identity 人设 / workflow 工作流程规范 / tools 工具与使用规范三件套 + 任意自定义/skill 文档；admin 面板在线增删改、排序、启停，保存即热重载（`config-store` 同款 TTL + 显式失效）；system prompt 按 `identity → workflow → tools → custom/skill → 时间上下文 →（新会话）用户记忆文档` 装配。
- **MCP 风格上下文**：`/v1/jennifer/chat` 接收 `context`（设备本地日历/天气/usage/窗口摘要**完整原文**），服务端不落库、不记日志，原样拼入本轮 prompt；`history` 服务端白名单（仅 user/assistant）阻断 prompt 注入。
- **结构化记忆（`agent_memories`）**：用户级（FK 级联），类型 preference/fact/event/lesson，agent 经 `memory_read/write/delete` 工具主动沉淀；`buildUserMemoryDoc` 编译为「用户记忆文档」，新会话随文档集注入一次。
- **工具集扩展**：guardrails_set（写护栏）、feedback_read（决策/投诉聚合）、steps_get/set（拆解）、memory 三件套、draft_generate LLM 化（兜底/问候语/拆解草稿，降级回模板并标 degraded）；items_delete 需 `confirm: true` 二次确认。
- **数据改动留痕与撤销**：每次实际改动写 `agent_action_logs`（before/after 快照）；`POST /v1/jennifer/undo` 按逆操作还原（24h 保留期）；前端把改动渲染为**活跃会话内**的卡片 + 一键撤销（纯前端、不落库、不进 LLM 上下文，退出即失效）。
- **流式输出（SSE）**：`stream: true` 时返回 `text/event-stream`（start/tool/delta/done/error）；LLM 网关支持 OpenAI 兼容流式接口（`stream: true` + SSE 解析），失败仍按顺序切换。
- **节奏下发**：`GET /v1/rhythm` 供本地执行引擎按类目拉取 agent 写入的 `rhythm_policies`（替换本地硬编码 72h 冷却，P2 真正生效）。
- **可观测/成本**：`agent_call_logs` 记录每次 LLM 调用（provider/model/ok/degraded/延迟/tokens）；admin 新增成本/降级看板与 LLM playground；告警自动评估维持手动测试通道（R6 本期不做）。
- **admin 扩展**：文档管理、用户记忆查看/删除、playground、成本看板（`/admin/api/docs|memories|playground|costs`）。

## 数据访问层（PostgREST + RPC，含踩坑）

- 运行时一律 REST：`GET/POST/PATCH/DELETE /rest/v1/<table>`（service key 头部 `apikey` + `Authorization: Bearer`）。
- **事务性操作走 RPC**（`supabase/migrations/20260827000002+0003` 定义）：
  - `fn_decide(item_id,user_id,decision,reason)` — 决策 + 状态迁移（later 两步队列尾）+ memory note；
  - `fn_create_nudge(...)` — nudge/options 落库 + `nudge_count` SQL 自增（频控红线）；
  - `fn_ingest_signal(...)` — signal/snapshot/M2M 三写原子。
- PostgREST 语法要点：
  - 操作符在**值侧**：`?column=in.(a,b)`、`?column=gt.v`；
  - 含 uuid 的普通值**必须显式 `eq.`**（隐式 eq 会 400 PGRST100）；
  - upsert：`on_conflict` 查询参数 + `Prefer: resolution=merge-duplicates`；
  - jsonb 列写数值须 `to_jsonb(...)`（RPC 内）。

## 安全（2026-08-27 加固）

- **RLS**：全部 23 表开启 Row Level Security + 回收 `anon`/`authenticated` 权限 → 客户端角色（含 publishable key 直连 REST）**零数据访问**；仅 service_role（BYPASSRLS）可读写。
- 密钥纪律：`SUPABASE_SERVICE_KEY` 只存 CF Worker secrets 与 `.dev.vars`；前端只持有 publishable key（仅 Auth 用）；APK 不含 `.env`/密钥。
- 邮箱确认开启（`mailer_autoconfirm=false`），确认/重置邮件走生产 SMTP。

## 配置与部署

- **后端**：CF Worker secrets：`SUPABASE_URL`、`SUPABASE_SERVICE_KEY`；本地 `.dev.vars`（gitignored）；迁移用 `supabase/migrations/*.sql` + `npm run db:migrate`（golden rule：禁 Dashboard 直改结构）。
- **部署**：push main（backend/**）→ Actions `wrangler deploy` → 生产 URL `https://j-nify.williamhvollita.dpdns.org`；CI 门禁另跑 test/typecheck。
- **官网**：push main（website/**）→ Actions 完成 test/lint/build 后直发 Cloudflare Pages；不依赖 Dashboard Git 集成。
- **生产监测**：`smoke-production.yml` 每日 01:17 UTC（北京时间 09:17）及手动执行，覆盖官网 SPA 路由、Worker `/health`、Admin 登录/会话/只读端点与 Android API 31 模拟器安装启动。
- **发布**：tag `vX.Y.Z` → Actions 构建 APK/AAB/iOS 归档并发布 GitHub Release（详见 `docs/devops/release.md`）。Android **固定 release keystore 签名**（v0.1.2 起，keystore/口令走 GH Secrets，不入库；保证版本间签名一致、支持覆盖安装更新）。
- **前端**：生产构建无需 `.env`（`AppConfig.load` 用 `isOptional` 回退内置生产 Base URL + CI 注入的 SUPABASE dart-define）；**主 `AndroidManifest.xml` 声明 `INTERNET` 权限**（release 网络必需，Flutter 默认只在 debug/profile manifest 带）。
