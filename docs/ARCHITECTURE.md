# 系统架构

J-nify 采用「Flutter 客户端 + Cloudflare Worker 后端 + jnify-data 数据服务 + PlutoKeating 账号」架构，前后端通过 REST API 通信。（2026-10-07 起数据从 Supabase 搬到 jnify-data，登录换成 PlutoKeating 账号，见 `DECISION_REGISTER.md`。）完整设计见 [`SPEC.md`](SPEC.md)（§5 架构思维导图、§6 数据模型 ER、§7 模块与接口）。

## 总览

```
[ PlutoKeating 账号 id.plutokeating.beer ]（OIDC；邮箱验证码 / 通行密钥 / GitHub，没有密码）
    ▲  flutter_appauth：授权码 + PKCE，拿访问令牌（JWT）与刷新令牌
    │
[ Flutter 前端 frontend/ ]
    │  REST(JSON) + Authorization: Bearer <访问令牌>
    ▼
[ Cloudflare Worker 后端 backend/ ]   （TS + Hono）
    │  jose 按 <ID_ISSUER>.well-known/jwks.json 验签 + 检查 scope
    │  /rest/v1/<表>、/rest/v1/rpc/<函数>（服务密钥 JNIFY_DATA_KEY，标准 HTTPS）
    ▼
[ Cloudflare Tunnel：jnify-data.plutokeating.beer ]
    ▼
[ jnify-data data/ ]（作者的服务器，中国深圳；Docker 容器，只监听 127.0.0.1:8789）
    SQLite（node:sqlite）23 表 + 视图 v_closure_rate + 事务（fn_decide / fn_create_nudge / fn_ingest_signal）
```

- **前端**：Flutter（`frontend/`），flutter_appauth 登录 PlutoKeating 账号；生产后端默认 `https://j-nify.williamhvollita.dpdns.org`。
- **后端**：Cloudflare Worker（`backend/`），TypeScript + Hono。部署 = GitHub Actions `wrangler deploy`（push main 自动）。
- **数据层**：jnify-data（`data/`，Node 24 + Hono + node:sqlite），部署在作者的服务器（中国深圳），与 Quetzal 同步服务的容器并存、互不共用。它提供 Supabase 数据接口（PostgREST）写法的一个子集，所以 Worker 的数据访问代码沿用原写法；详情见 §「数据访问层」与 [`data/README.md`](../data/README.md)。

## 前端（Flutter）

- `core/config/` — `AppConfig`（dotenv 读 `.env`；`prodBackendBaseUrl` 为生产默认值）+ `Env` 常量。
- `auth/` — `Account`（PlutoKeating 账号：flutter_appauth 授权码 + PKCE，client `jnify-app`，回调 `com.plutokeating.jnify://callback`；令牌存 flutter_secure_storage，访问令牌快过期时用刷新令牌静默换新）+ `AuthGate`（跟着登录状态切 Login/HomeShell）。登录页只有一个「登录」按钮，打开账号服务的登录页（邮箱验证码、通行密钥或 GitHub，第一次用自动建账号，没有密码）。
- `core/api/` — `ApiClient`：注入 `Authorization: Bearer <访问令牌>`；401 → 清掉本机登录状态（回登录页）。
- `services/` — `ApiService` 封装 `/v1/...`（capture/now/items/decision/guardrails/signals）。
- `models/` — `ItemCommitment`（含 const 构造器与 `options` 字段）。
- `screens/ + widgets/` — `现在/全部/我的` 三视图；焦点卡按后端 options 渲染（含 rescue）；录入分类 chips+期限；Toast 顶部 pill（SPEC §3.5）；护栏真实读写。`HomeShell` body 包 `SafeArea` 避开刘海/状态栏；`我的` 页含资料卡（昵称+邮箱）+ 设置入口，`SettingsScreen`：改昵称、「PlutoKeating 账号」（点开账号设置页管理邮箱、通行密钥、关联 GitHub）、「删除我的数据」（只删 J-nify 的数据）；「隐私说明」「关于」用 `ExpansionTile` 默认折叠。
- **资料/昵称**：昵称存 `users.nickname`（**非唯一**），App 不直接连数据服务，读写经后端 `GET/PUT /v1/me/profile`；邮箱从 ID 令牌里读，只用于显示，改邮箱在 PlutoKeating 账号设置里做。
- **会话**：访问令牌 1 小时，刷新令牌 30 天（滑动）；刷新失败（`invalid_grant`）或后端 401 时清掉本机令牌回登录页。不再有邮件确认 / 重置链接与 App Link（原 Supabase 邮件回调已废弃，见 `docs/devops/email-callback.md`）。

## 后端（Cloudflare Worker）

| 模块 | 职责 |
| --- | --- |
| `src/db/` | jnify-data 客户端（restGet/restInsert/restUpdate/restDelete/restRpc，PostgREST 写法）+ 护栏/上下文/时区读取 |
| `services/` | capture / window-engine / escalation（频控：安静时段+窗口去重）/ brain（模板降级 stub）/ decision-feedback / context / orchestrator（晚点冷却 + 全 defer 抑制 nudge）/ **rhythm（节奏策略，agent 可写）** / **agent（Jennifer harness + MCP 风格工具集）** |
| `routes/` | 业务端点 + **`/admin`（管理面板 SPA + API）** + **`/v1/jennifer/chat`** + **`/v1/metrics/events`** |
| `lib/` | auth（PlutoKeating 账号 JWKS 验签 + scope 检查 + ensureUser upsert）、privacy scope、rate-limit（进程内）、audit（日志）、**admin-auth（会话）**、**llm（多 provider 网关 + models.dev）**、**alerts（GitHub Issues + SMTP）**、**config-store（system_config 热加载）** |

**身份与授权**：PlutoKeating 账号服务（Ory Hydra）签发 JWT 访问令牌 → Worker `jose` 从 `<ID_ISSUER>.well-known/jwks.json` 验签（模块级缓存；`ID_ISSUER` 缺省 `https://id.plutokeating.beer/`），`sub`=账号编号（UUID）=`users.id`。读接口（GET）要 scope `jnify.items.read`，改动要 `jnify.items.write`：J-nify App（client `jnify-app`）两项都有；Quetzal 运行基座（client `quetzal-runtime`）只在用户在授权页点「允许」后拿到它申请的那几项，这是两个产品互通的方式。客户端拿不到数据服务的密钥，不能直接读写数据表（见下）。

### v0.2.0 新增：admin 管理面 / Jennifer agent / 执行层本地优先

- **admin 面板**：同域 `/admin` 单页应用 + `/admin/api/*`。登录凭据来自 CF 环境变量（`ADMIN_USERNAME`/`ADMIN_PASSWORD`/`SESSION_SECRET`），HMAC 签名 session cookie。LLM 配置（多 provider / 多 key / 多模型 / 模型级尝试顺序）存 `system_config` 表（JSON + version），Worker 内 TTL 缓存 + PUT 主动失效 → **保存即热加载**；models.dev 公开 API 提供**供应商下拉点选录入（字典序，自动带出 id/名称/Base URL）、按供应商过滤的模型模糊搜索点选添加、key/模型动态 chip 列表（每项独立删除）、模型尝试顺序列表（`providerID/modelID` 条目，＋/− 增删 + 拖拽排序，保存时自动剔除已失效条目）**（同时保留手填）。指标看板（闭环率视图 `v_closure_rate`）与告警阈值配置同面板。
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

## 数据访问层（jnify-data，PostgREST 写法的子集）

- Worker 经 `JNIFY_DATA_URL`（生产 `https://jnify-data.plutokeating.beer`，Cloudflare Tunnel 转到服务器本机 127.0.0.1:8789）访问 jnify-data：`GET/POST/PATCH/DELETE /rest/v1/<table>`，头部 `Authorization: Bearer <JNIFY_DATA_KEY>`。服务密钥只有 Worker 有，App 不直接连数据服务。
- 支持的写法只到后端实际用到的：`select=`；过滤 `eq/neq/gt/gte/lt/lte`、`in.(a,b)`、`is.null|true|false`（操作符在**值侧**，无前缀的值后端一律补 `eq.`）；`order`、`limit`、`offset`；插入带 `on_conflict` 即 upsert；按过滤条件更新、删除。表名、列名只认数据库里真实存在的，值一律参数绑定。
- **需要原子性的写操作走 RPC**（`POST /rest/v1/rpc/<fn>`，在 jnify-data 里用 SQLite 事务实现，`data/src/rpc.ts`）：
  - `fn_decide(item_id,user_id,decision,reason)` — 决策 + 状态迁移（later 两步队列尾）+ memory note；
  - `fn_create_nudge(...)` — nudge/options 落库 + `nudge_count` 自增（频控红线）；
  - `fn_ingest_signal(...)` — signal/snapshot/M2M 三写原子。
- 表结构：`data/src/schema.sql`（由原 Postgres 迁移等价转写；服务启动时建表）。Jennifer 出厂文档种子：`data/src/agent-docs.seed.json`（名字不存在才补，不覆盖管理员改过的内容）。
- 备份：每天 `VACUUM INTO` 到服务器的 `data/data/backups/`，保留 7 份。

## 安全

- **数据访问**：jnify-data 只认服务密钥（`JNIFY_DATA_KEY`），只有 Worker 持有；Worker 对每个请求核对访问令牌，只读写令牌 `sub` 对应用户的数据。App 与其他客户端拿不到服务密钥，不能直接访问数据服务。
- **存储如实说明**：事项、决定、记忆、节奏策略等按明文存在服务器（中国深圳）的 SQLite 里，靠上面的密钥与逐请求核对、以及服务器隔离（容器只发布到 127.0.0.1、经 Cloudflare Tunnel 对外、只读根文件系统、去掉全部 capabilities）保护。不像 Quetzal 那样服务器上没有内容：Jennifer 用模型时要看到事项内容，Quetzal 在用户授权后也要能读。原始信号（日历 / 天气 / 位置 / 使用情况）只在设备上处理。
- **账号**：由 PlutoKeating 账号服务保存邮箱、登录方式（没有密码；通行密钥只存公钥）与登录记录；J-nify 不保存任何登录凭据。
- 密钥纪律：`JNIFY_DATA_KEY` 只存 CF Worker secrets、服务器上的 `data/.env`（权限 600）与本地 `.dev.vars`；App 不含任何服务端密钥；APK 不含 `.env`。

## 配置与部署

- **后端**：CF Worker secrets：`JNIFY_DATA_URL`、`JNIFY_DATA_KEY`（可选 `ID_ISSUER`，缺省 `https://id.plutokeating.beer/`）；本地 `.dev.vars`（gitignored，见 `backend/.dev.vars.example`）。
- **数据服务**：服务器上 `cd data && ./start.sh`（第一次生成 `.env` 与服务密钥，`./start.sh --key` 打印密钥，填进 Worker 的 `JNIFY_DATA_KEY`）；表结构改动改 `data/src/schema.sql`，随服务重启生效。详见 [`data/README.md`](../data/README.md)。
- **部署**：push main（backend/**）→ Actions `wrangler deploy` → 生产 URL `https://j-nify.williamhvollita.dpdns.org`；CI 门禁另跑 test/typecheck（data 作业跑 jnify-data 的测试；backend 作业先装 data 的依赖，集成测试用真实 Worker 应用 + 进程内 jnify-data + 本机假 JWKS）。
- **官网**：push main（website/**）→ Actions 完成 test/lint/build 后直发 Cloudflare Pages；不依赖 Dashboard Git 集成。
- **生产监测**：`smoke-production.yml` 每日 01:17 UTC（北京时间 09:17）及手动执行，覆盖官网 SPA 路由、Worker `/health`、Admin 登录/会话/只读端点与 Android API 31 模拟器安装启动。
- **发布**：tag `vX.Y.Z` → Actions 构建 APK/AAB/iOS 归档并发布 GitHub Release（详见 `docs/devops/release.md`）。Android **固定 release keystore 签名**（v0.1.2 起，keystore/口令走 GH Secrets，不入库；保证版本间签名一致、支持覆盖安装更新）。
- **前端**：生产构建无需 `.env`（`AppConfig.load` 用 `isOptional` 回退内置生产 Base URL；账号服务地址与 client 固定在 `Account` 里）；**主 `AndroidManifest.xml` 声明 `INTERNET` 权限**（release 网络必需，Flutter 默认只在 debug/profile manifest 带）。
