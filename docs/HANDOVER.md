# J-nify 项目交接文档（HANDOVER）— v0.3.0

> 更新：2026-08-30（v0.3.0 发布后工程质量收口）。目的：让**新 session 可立即找回工作状态**。
> 权威信息源：`docs/DECISION_REGISTER.md`（决策定案）、`docs/compose/specs/2026-08-29-jennifer-agent-complete-spec.md`（Jennifer 完整实现 spec，R0–R11 定案）、`docs/JENNIFER_AGENT_REPORT.md`（agent 设计与现状）、`docs/devops/SECRETS_REGISTRY.md`（密钥台账）。
> ⚠️ 仓库 **public**：本文不含任何密钥明文，只列「名称 + 存放位置」；真值在 GitHub Actions Secrets / CF Dashboard Worker secrets / 本机 `backend/.dev.vars`（gitignored）/ 密码管理器。

## 0. 当前工作与运维快照（2026-08-30）

| 项目 | 状态 | 可复核证据 |
| --- | --- | --- |
| 代码同步 | ✅ | 2026-08-30 已完成 `main` 与受影响 tags 的历史清洗和强制同步；当前 SHA 以 `git rev-parse HEAD origin/main` 实时复核 |
| CI | ✅ | [run 33297116059](https://github.com/PlutoKeating/Project.J-nify/actions/runs/33297116059)：后端单测+类型、本地 Supabase 5/5 集成、Flutter analyze+16 tests、官网 21 tests+lint+build 全绿 |
| 生产冒烟 | ✅ | [run 33297145574](https://github.com/PlutoKeating/Project.J-nify/actions/runs/33297145574)：官网/Worker 公开端点、Admin 登录+会话+只读 docs/costs、Android API 31 安装启动全绿 |
| 后端/官网部署 | ✅ | [Backend run 33295560193](https://github.com/PlutoKeating/Project.J-nify/actions/runs/33295560193) / [Website run 33295560180](https://github.com/PlutoKeating/Project.J-nify/actions/runs/33295560180) |
| Admin 凭据 | ✅ | `ADMIN_USERNAME` / `ADMIN_PASSWORD` 已由管理员更新到 GH Secrets，并经 [Configure Worker Secrets run 33296295275](https://github.com/PlutoKeating/Project.J-nify/actions/runs/33296295275) 同步到 Worker；随后只读生产冒烟通过 |
| 最新 Release | ✅ | [`v0.3.0`](https://github.com/PlutoKeating/Project.J-nify/releases/tag/v0.3.0)（2026-08-29）；APK + AAB，versionCode=6 |
| 凭据安全 | ⚠️ 需轮换 | 历史版 `DECISION_REGISTER.md` 曾误写 `TIANDITU_KEY` 真值；2026-08-30 已重写 `main`、`v0.2.0`、`v0.3.0`，并验证 168 个可达提交中剩余匹配为 0。旧 clone/fork/平台缓存仍可能保留已曝光值，仍需在天地图控制台轮换，更新 GH Secret 后同步 Worker 并冒烟验证 |

**当前无等待中的部署或 CI 人工输入；但 `TIANDITU_KEY` 轮换是待运维者执行的安全项。** 另一非阻断项：GitHub 托管 Action `actions/checkout@v4` / `actions/setup-node@v4` 仍会产生 Node.js 20 runtime 弃用警告（GitHub 当前强制转用 Node.js 24），不影响现有作业结论，待官方 Action 主版升级时跟进。

> 快照会随新提交自然过时；日常复核以 `git status --short --branch`、`gh run list`、`gh release view` 和生产冒烟的最新输出为准。

---

> 📌 **已发版功能增量（2026-08-28，v0.1.5 已发布）**：
> - **资料/设置**：`我的` 页资料卡（昵称+邮箱）+ 齿轮进入 `SettingsScreen`（分组：改昵称 / 改邮箱 / 改密码）；后端新增 `GET/PUT /v1/me/profile`（昵称存 `users.nickname`，非唯一）；邮箱改经 `auth.updateUser` 触发确认邮件并回跳 App。
> - **邮件回调（App Link）**：根因=Supabase **Site URL=`http://localhost:3000`**。Site URL 已改 `https://j-nify.arr2018.dpdns.org` + 加 Additional Redirect URL；App 用 `app_links`+`verifyOTP` 接收；App Link 校验指纹（真实值）在 `website/public/.well-known/assetlinks.json`（`9d9018a5…369d6b3`）。详见 `docs/devops/email-callback.md`。
> - **会话 30 天**：`main.dart` 显式 `autoRefreshToken/persistSession`；`AuthGate` 启动 `refreshSession()` 滑动重置；服务端 Inactivity timeout=720h / 关 time-box（后台人工步骤，Pro+，已完成）。
> - **SafeArea**：`HomeShell` body 包 `SafeArea` 避开刘海/状态栏。「隐私说明」「关于」改 `ExpansionTile` 默认折叠。登录/注册密码框加显示明文眼睛。
> - ⚠️ **versionCode 降级坑点**：`pubspec.yaml` 的 `+N`=Android versionCode。v0.1.3/v0.1.4 误用 `+1`（versionCode=1）< v0.1.2 的 `+3`(3)，导致从 v0.1.2 覆盖安装 v0.1.4 被系统拒（`INSTALL_FAILED_VERSION_DOWNGRADE`）。本版升到 `0.1.5+4`(4)，已可覆盖安装 v0.1.2 及更早。**规则：`+N` 须单调递增且 > 历史最大值（当前=3，新版本须 ≥+4）**。见 `docs/devops/release.md`「版本号规则」。
> - **iOS Universal Link**：⏳ 暂缓（记录为待办，未做）；见 `docs/devops/email-callback.md §4.1`。
> - **验证**：后端 `tsc + vitest` 全绿（52 通过）；前端 `flutter analyze` + `flutter test`（11 通过）；`website npm run build` 通过（`dist/.well-known/` + `_headers` 已产出）；v0.1.5 APK `versionCode='4'`、证书=指纹 `9d9018a5…369d6b3`。

> ✅ **v0.2.0（M0.5+M1）已发布（2026-08-29，Release `v0.2.0`，versionCode=5）**：决策定案见 `docs/DECISION_REGISTER.md`，实施计划见 `docs/compose/plans/2026-08-29-v020-m0.5-m1-implementation.md`，验收报告见 `docs/compose/reports/2026-08-29-v020-release.md`。
> 后端已交付：admin 面板（/admin + /admin/api/*，LLM 多 provider 热加载 + models.dev 供应商字典序点选录入/模型模糊搜索点选/chip 式 key 与模型管理/`providerID/modelID` 尝试顺序拖拽排序 + 指标看板 + 告警配置）、Jennifer agent harness（/v1/jennifer/chat + MCP 风格工具集）、事项 PATCH/DELETE、列表理由、`/v1/me/timezone`、`DELETE /v1/me/data` 彻底注销（含 auth 账户）、频控重构（Q1：无硬上限，仅安静时段+窗口去重）、节奏策略（rhythm_policies）、匿名指标 `/v1/metrics/events` + `v_closure_rate` 视图、告警双通道（GH_PAT + SMTP）、迁移 `20260829000000_v020_admin_agent_metrics.sql`；`npm test` 72 通过 + typecheck 全绿。
> CF Worker secrets 当时先配置了 `SMTP_HOST/PORT/USER/AUTH`、`SESSION_SECRET`；`GH_PAT` 与 `ADMIN_USERNAME/ADMIN_PASSWORD` 已在后续运维中补齐，并于 2026-08-30 再次同步、冒烟验证。
> App 已交付：本地通知（含「别再提」action）、四信号采集（UsageStats/系统日历/OpenWeather/天地图，仅本地）、本地窗口引擎、离线队列（sqflite）、对话 UI（/v1/jennifer/chat）、引导框架（TourRegistry）、全部页分组/理由/多选删除/编辑、忘记密码、彻底注销、时区提示、隐私文案修正、品牌名统一 J-nify + 图标；`flutter analyze` 0 issues + `flutter test` 11 通过。
> 官网/文档已交付：首页/功能页状态标注、/auth/verify 回退页、/privacy 隐私页、OpenWeather 署名（官网 + App 关于页）、README（中英）三态徽章与路线图更新、SPEC §9.4/§9.5 修订、release.md 状态修正、GAPS.md 缺口登记。
> **v0.2.0 修复记录**：① release 构建需启用 core library desugaring（`build.gradle.kts`）；② release 流水线注入 `OPENWEATHER_API_KEY`；③ Jennifer agent system prompt 注入当前日期+用户时区（防相对时间幻觉年份）；④ LLM 空完成视为失败继续切换下一顺序条目（防假确认）。`npm test` 74 通过 + typecheck 全绿。

> ✅ **v0.3.0（Jennifer 完整实现）已发布（2026-08-29，Release `v0.3.0`，versionCode=6）**：需求定稿见 `docs/compose/specs/2026-08-29-jennifer-agent-complete-spec.md`（R0–R11 定案），验收见 `docs/compose/reports/2026-08-29-v030-release.md`。
> 后端已交付：`agent_docs` 官方文档集（identity/workflow/tools + 任意 skill/custom md，admin 在线编辑、保存即热重载，system prompt 按序装配）+ `agent_memories` 结构化记忆（agent 工具沉淀 + 用户记忆文档新会话注入）+ 工具集扩展至 15 个（guardrails_set/feedback_read/steps/memory/draft LLM 化/items_delete 确认语义）+ MCP 风格 `context` 原文进 prompt + history role 白名单 + SSE 流式（start/tool/delta/done/error）+ `agent_action_logs` 与 `POST /v1/jennifer/undo`（24h 逆操作）+ `GET /v1/rhythm`（本地引擎消费节奏）+ `agent_call_logs`（成本/降级数据）；admin 新增文档管理/记忆管理/playground/成本看板；迁移 `20260829000001_jennifer_full.sql`（4 新表 + 三件套种子）。`npm test` 79 通过 + typecheck 全绿。
> App 已交付：会话上下文纯客户端持久化（sqflite，只存文本消息）、SSE 流式对话、Markdown 渲染、发送后立即 responding 占位气泡、数据改动卡片 + 一键撤销（活跃会话内纯前端）、本地窗口引擎按 `GET /v1/rhythm` 消费 agent 节奏（替换硬编码 72h）；`flutter analyze` 0 issues + `flutter test` 11 通过。
> 官网已交付：功能状态与路线图如实更新（M1/M2 已发布、护栏口径修正为窗口级去重）、v0.3.0 Release 同步；`npm run build` + 21 tests 通过。

---

## 1. 项目定位与技术栈（定案版）

- **产品**：J-nify ——「低打扰行动秘书」Jennifer。P 人友好：录入一句话 → 低电量漂浮 → 顺手窗口出现 → 四选项（现在做/晚点/算了/帮我兜底）。不催、不羞辱、每次给理由、永远有体面退路。
- **仓库**：`PlutoKeating/Project.J-nify`（GitHub，**public**，AGPL-3.0）。分支 `main`（本地=远端）。

| 层 | 技术 | 备注 |
|---|---|---|
| 前端 | Flutter (Dart) 3.47.1 stable | supabase_flutter 2.17.2（Auth）；android/ios/web；minSdk 31；iOS target 15.0 |
| 后端 | **Cloudflare Worker**：TypeScript + Hono | 部署=GitHub Actions `wrangler deploy`（push main 自动）；生产 URL `https://j-nify.williamhvollita.dpdns.org` |
| **DB 访问** | **Supabase REST (PostgREST) + Postgres RPC** | 2026-08-27 定案：worker 内 postgres.js 直连不可行（Supavisor 私有根 CA 不被 workerd 信任、Hyperdrive 未开通）→ 全部走标准 HTTPS fetch；事务写走 `fn_decide`/`fn_create_nudge`/`fn_ingest_signal` |
| 认证 | **Supabase Auth（当前项目即生产）** | 完整邮箱体系；邮箱确认开启，确认/重置邮件经 **j_nify@yeah.net** SMTP；Worker JWKS 验签 |
| CI/CD | GitHub Actions：`ci.yml` + `deploy-backend.yml` + `deploy-website.yml` + `release-frontend.yml` + `configure-worker-secrets.yml` + `sync-worker-domain.yml` + `smoke-production.yml` | 三端 CI、本地 Supabase 集成、每日生产/Admin/Android 冒烟、自动部署与发布 |

**生产环境定案（2026-08-27 用户纠正）**：用户提供的 Supabase 项目 `ajeratjsxyxtdqtmtvxh` 与邮箱 `j_nify@yeah.net` **即生产环境** —— 不存在「待建生产项目」。

---

## 2. 生产上线状态（v0.3.0）

| 能力 | 状态 | 说明 |
|---|---|---|
| 后端业务端点 | ✅ 生产可用 | `/v1/*`：items(capture/list/patch/delete/decision)、now、guardrails×2、me(profile×2/timezone/data)、llm/draft、signals、metrics/events、geo/reverse、**jennifer/chat（含 SSE 流式）/undo**、**rhythm** + /health |
| 后端管理面 | ✅ 生产可用 | `/admin` SPA + `/admin/api/*`：LLM 多 provider 热加载、指标看板、告警配置/测试、**文档集 docs、记忆 memories、playground、成本 costs** |
| 数据库 | ✅ | 迁移 `0000..0004` + `20260829000000_v020_*` + `20260829000001_jennifer_full` 全应用；共 23 表 + RPC + 视图（含 agent_docs / agent_memories / agent_action_logs / agent_call_logs） |
| **数据安全 RLS** | ✅ | 全表 RLS + anon/authenticated 权限回收；publishable key 直读数据 → 401（解包攻击路径封死） |
| **生产邮件** | ✅ | SMTP live：`smtp.yeah.net:465`、`j_nify@yeah.net`、sender `J-nify Jennifer`、`mailer_autoconfirm=false`（确认开启） |
| 前端认证 | ✅ | 注册→邮箱确认→登录→登出→401 自动重登（gotrue 源码级验证） |
| **安装包** | ✅ | 最新 **v0.3.0** Release：`app-release.apk` + `app-release.aab`（**release keystore 签名**，versionCode=6，内置生产 Supabase 配置 + INTERNET 权限）；v0.1.2 起签名一致可覆盖安装更新 |
| CI/CD+部署 | ✅ | 7 条工作流；push/PR 三端门禁 + 本地 Supabase 集成，push main 自动部署后端/官网，tag 自动发布，生产冒烟每日/手动执行 |
| 密钥与文档 | ✅ | GH Secrets / CF Worker secrets / 台账 / 本 HANDOVER 同步（详见 §5/§6） |

---

## 3. 后端（架构与实现要点）

- **目录**：`backend/src/{config,app,index}.ts` + `lib/{auth,audit,privacy,rate-limit,admin-auth,config-store,llm,alerts}.ts` + `services/{capture,context,decision-feedback,window-engine,escalation,brain,orchestrator,rhythm,agent,agent-docs,memory}.ts` + `routes/{health,items,now,signals,guardrails,me,llm,jennifer,rhythm,metrics,geo,admin}.ts` + `db/index.ts`（REST 层 `restGet/restInsert/restUpdate/restDelete/restRpc` + `robustGuardrails/robustPrivacyScope/latestContext`）。
- **运行时 secrets**：`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`（仅 CF Worker secrets + 本机 `.dev.vars`）；「前端/仓库永不出现 service key」。
- **postgres.js 仅剩**：`scripts/apply-migrations.ts`（迁移）与 `test/integration.test.ts`（真库断言）—— Node 侧 devDep，绝不在 Worker 运行时。
- **PostgREST 经验（避免重踩）**：操作符在值侧（`key=in.(a,b)`/`key=gt.v`）；带 uuid 的普通值必须显式 `eq.`（隐式 eq 报 PGRST100）；upsert 用 **`on_conflict` 查询参数** + `Prefer: resolution=merge-duplicates`（不能写成 header）；jsonb 列写数值须 `to_jsonb`（RPC 内）。
- **频控红线（v0.2.0 Q1 定案）**：无硬编码提醒次数上限；仅保留安静时段（按用户时区）+ 窗口级去重；频率/冷却由 Jennifer agent 经 `rhythm_policies` 管理；`redline.test.ts` 以源码断言钉住。
- **Jennifer agent（v0.3.0）**：官方文档集 `agent_docs`（identity/workflow/tools + 任意 skill/custom md，admin 编辑保存即热重载）→ system prompt 按序装配；结构化记忆 `agent_memories`（preference/fact/event/lesson + 用户记忆文档新会话注入）；工具集 15 个（items CRUD/rhythm/guardrails/feedback/steps/memory/draft LLM 化，items_delete 需 confirm）；MCP 风格 `context` 原文进 prompt（不落库）；history role 白名单；SSE 流式；`agent_action_logs` + `/v1/jennifer/undo`（24h 逆操作）；`GET /v1/rhythm` 供本地引擎消费；`agent_call_logs` 供成本/降级看板。
- **测试**：单元 **80 passed / 5 skipped**；CI 另启动一次性本地 Supabase 执行 **5/5** Auth/PostgREST/RPC 集成测试，不使用生产 service key。新增用例钉住 `on_conflict` 查询参数语义。

---

## 4. 前端

- `lib/core/config/app_config.dart`：`prodBackendBaseUrl = https://j-nify.williamhvollita.dpdns.org`（默认）；Supabase url/anon 经 `String.fromEnvironment`（release 由 CI dart-define 注入）。
- 认证：`lib/auth/auth_gate.dart`（authStateChanges → LoginScreen/HomeShell）+ `login_screen.dart`（登录/注册切换、确认邮件提示）+ `me_screen.dart` 退出登录；`api_client.dart` Bearer 注入 + 401→静默登出 + 未初始化 guard（try/catch 包 `Supabase.instance`）。
- 执行层本地优先（v0.2.0）：`notifications_service`（本地通知 + 别再提 action）、`signal_collectors`（UsageStats/系统日历/OpenWeather/天地图，仅本地）、`local_window_engine` + `jennifer_local_engine`（本地窗口评估 → 通知；v0.3.0 起按 `GET /v1/rhythm` 消费 agent 节奏）、`offline_queue`（sqflite）、`tour_registry`、`metrics_reporter`。
- **Jennifer 对话（v0.3.0）**：`chat_screen.dart`（SSE 首 token 原位显示、`flutter_markdown_plus`、responding 占位气泡、数据改动卡片 + 一键撤销）、`conversation_store.dart`（sqflite 恢复最近会话，只存文本消息）、`api_service.chatStream/undoAgentAction/fetchRhythm`、`api_client.streamPost`（dart:io SSE）。
- 测试：**16/16** 单元/widget（含 SSE、SQLite 会话恢复、流式 UI、卡片撤销、节奏解析）+ `flutter analyze` 0 issues；另有 Android 模拟器启动集成测试。
- **依赖维护（2026-08-30）**：Flutter 直接依赖升级到稳定工具链可用版本，停用的 `flutter_markdown` 已替换为 `flutter_markdown_plus`；后端锁文件更新至约束内最新版；官网升级 ESLint 10 / react-hooks 7 / jest-dom 7。官网 TypeScript 保持 5.9（`typescript-eslint` 当前 peer 上限 `<6.1`），不是遗漏升级。
- **Android 编译基线**：App 跟随 Flutter 稳定版默认 `compileSdk`，`minSdk=31`，生产冒烟在启用 KVM 的 API 31 模拟器验证安装启动；`permission_handler` 暂留最新 12.x，因为 13.x 要求的 API 37 尚未进入稳定 Android SDK 渠道。
- **构建**：release 必须带 `--dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...`（CI secrets 已配；本机构建示例见 §7）。**勿在构建中途 kill Gradle 守护进程**（会致 assembleRelease 失败；`/tmp FileAlreadyExistsException` 为良性告警）。

---

## 5. CI/CD（GitHub Actions，7 条工作流）

| 工作流 | 触发 | 内容 |
|---|---|---|
| `ci.yml` | push/PR | backend 单测+typecheck；一次性本地 Supabase 5 项集成；frontend analyze+16 tests；website test+lint+build |
| `deploy-backend.yml` | push main（backend/**）+ workflow_dispatch | wrangler deploy（node 24；secrets: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID） |
| `deploy-website.yml` | push main（website/**）+ workflow_dispatch | Cloudflare Pages 部署官网 |
| `release-frontend.yml` | tag `v*` | 校验 tag=pubspec 版本 → Android APK+AAB（ubuntu）+ iOS xcarchive（macos）→ GitHub Release（secrets: SUPABASE_URL/SUPABASE_ANON_KEY/OPENWEATHER_API_KEY dart-define） |
| `configure-worker-secrets.yml` | 手动（confirm=YES 门控） | 把 GH Secrets 中 SMTP/SESSION_SECRET/ADMIN/GH_PAT/TIANDITU_KEY 同步为 CF Worker secrets + 验证 |
| `sync-worker-domain.yml` | 手动 | Worker 自定义域名同步（j-nify.williamhvollita.dpdns.org） |
| `smoke-production.yml` | 每日+手动 | 官网/健康检查/只读 Admin API + Android 模拟器安装启动冒烟 |

生产冒烟的定时值为 `17 1 * * *`（UTC 01:17 / 北京时间 09:17）。Admin 作业显式设置 `SMOKE_REQUIRE_ADMIN=1`，因此 GH 端凭据缺失或与 Worker 不一致会直接使作业失败，不会静默跳过。Android 作业先授予 `/dev/kvm` 访问，再用 API 31 x86_64 模拟器运行 `integration_test/app_smoke_test.dart`。

**GH Secrets（已设）**：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`SMTP_AUTH_PROD`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SUPABASE_ANON_KEY`、`SUPABASE_URL`、`OPENWEATHER_API_KEY`、`SESSION_SECRET`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`GH_PAT`、`TIANDITU_KEY`。
**CF Worker secrets**：`SUPABASE_URL`、`SUPABASE_SERVICE_KEY`、SMTP 四项、`SESSION_SECRET`、`ADMIN_USERNAME/ADMIN_PASSWORD`、`GH_PAT`、`TIANDITU_KEY`（DEBUG 已删）。**App Link 校验指纹**（`assetlinks.json` 的 SHA-256）是**公开值非密钥**，直接入仓库 `website/public/.well-known/assetlinks.json`。
- 推送提示：本机 remote 为 SSH（github-personal）可用；Clash 开启时 SSH 不通则临时用 HTTPS：`TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/PlutoKeating/Project.J-nify.git" <ref>`（不改配置）。

---

## 6. 密钥与运维

- 台账：`docs/devops/SECRETS_REGISTRY.md`（SMTP 四项、Supabase URL/SERVICE_KEY、CF token、OPENWEATHER_API_KEY、TIANDITU_KEY、SESSION_SECRET、ADMIN、GH_PAT、连接串等的位置与轮换方式；真值不进仓库）。
- 迁移 golden rule：改表/函数一律 `backend/supabase/migrations/<ts>_<name>.sql` + `npm run db:migrate`（DIRECT_DATABASE_URL=pooler 串），禁 Dashboard 直改。
- 临时文件约定：探针等放 `backend/.scratch/`（已 gitignore），收尾整体清一次；**工作途中不执行 rm**。
- 邮件模板：默认 Supabase 文案在用；自设计模板（docs/devops/smtp.md 内 HTML）可后续贴入 Auth → Email Templates。
- **Jennifer 运维要点（v0.3.0）**：① agent 人设/流程/工具规范 = `agent_docs` 三件套，admin `/admin` → Jennifer 文档集 在线编辑，**保存即热重载**，无需重新部署；② 用户记忆在 `agent_memories`（新会话注入 system prompt），admin 可查看/删除；③ 撤销入口仅在活跃会话内（前端卡片），服务端 `agent_action_logs` 保留 24h；④ 成本/降级看板数据源 = `agent_call_logs`，告警自动评估按 R6 暂缓（后续接 CF cron 即可复用）；⑤ LLM provider 配置仍在 `system_config.llm`（admin 热加载），API key 明文存库（RLS+service key 保护，已知风险）。
- **Admin 凭据轮换顺序**：先在 GitHub 更新 `ADMIN_USERNAME` / `ADMIN_PASSWORD`，再手动运行 `Configure Worker Secrets (Ops)` 且 `confirm=YES`，最后运行 `Production Smoke`。不要只改 Worker 后直接运行同步，否则 GH 中的旧值会覆盖 Worker。

---

## 7. 常用命令速查

```bash
# 后端（backend/）
npm test && npm run typecheck          # 80 unit（生产凭据缺失时 5 项集成套件跳过）
npx supabase start                     # 自动应用 migrations；CI 使用同一方案
# 将 `supabase status -o env` 的 API_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL 映射后：
npm run test:integration               # 5/5，不接触生产库
npm run smoke:production               # 生产公开端点；Admin 凭据可选
DIRECT_DATABASE_URL=<pooler串> npm run db:migrate

# 前端（frontend/；flutter 在 ~/.local/bin）
flutter analyze && flutter test        # 16/16
flutter test integration_test/app_smoke_test.dart -d <android-device> --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
flutter build apk --release \
  --dart-define=SUPABASE_URL=https://ajeratjsxyxtdqtmtvxh.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<GH secret 值或本地变量> \
  --dart-define=OPENWEATHER_API_KEY=<GH secret 值或本地变量>

# 官网（website/）
npm test && npm run lint && npm run build  # 21 tests + lint + build

# 发布（用户/CI）
git tag v<pubspec 版本> && git push origin v<tag>   # 触发 Release 工作流
```

---

## 8. 剩余工作（v0.3.0 之后）

> **优先运维项**：轮换曾出现于公开 Git 历史的 `TIANDITU_KEY`，然后更新 GH Secret、运行 `Configure Worker Secrets (Ops)` 和 `Production Smoke`。可达历史已重写并验证无剩余匹配，但旧 clone/fork/平台缓存可能保留已曝光值；在供应商端轮换前风险不算关闭。

1. **完整人工真机验收（用户）**：CI/本机模拟器已自动验证安装启动；仍需侧载正式 APK 验证真实邮件、权限、天气/日历/UsageStats、对话改动与重启恢复等硬件/账户链路。
2. **Admin 写操作验收（管理员）**：每日工作流已只读验证登录、会话、文档和成本接口；编辑 identity、playground LLM 调用等有成本/写入的操作仍由管理员人工验收。
3. **告警自动评估**（R6 暂缓）：`agent_call_logs` / `metrics_events` 数据已具备，后续加 CF Cron Trigger 即可启用投诉率/降级率自动告警（现有 admin 手动测试通道可用）。
4. **M3 灰度**：100–300 种子用户招募与分发（指标看板已具备）。
5. iOS 发布签名（需 Apple Developer 账号 + macOS 签名链路，GAP-IOS）；数据导出（GAP-EXPORT）；FCM/APNs 后端推送（GAP-FCM）；第三方日历 OAuth（GAP-CAL-OAUTH）。
6. 邮件模板美化（可用 smtp.md 内 HTML 贴入 Supabase Auth → Email Templates）。

---

## 9. 会话运维经验（防重踩）

- **不要在构建中 kill Gradle 守护进程**（曾致 assembleRelease 失败）；`/tmp FileAlreadyExistsException` 是良性警告。
- 子代理环境多次崩溃/挂死：判定卡死先看进程级证据（ps 里 gradle/java/dart 是否在跑），再 cancel+重派；任务树记得清理重复项（曾有 T5/T8 重复）。
- Clash 开启时 SSH（ssh.github.com:443）不通：一律用 HTTPS 推送（已配 workflow scope）。本机 remote 仍为 SSH，可用 `TOKEN=$(gh auth token); git push "https://x-access-token:${TOKEN}@github.com/PlutoKeating/Project.J-nify.git" <ref>` 临时走 HTTPS（不改配置）。
- 本机 Clash fake-ip 劫持全部 UDP:53（任意 DNS 服务器都返回 198.18.0.0/15 段）：「域名能否解析」诊断必须走 **DoH**（`https://cloudflare-dns.com/dns-query?name=X&type=A` / `https://dns.google/resolve?name=X` / `https://223.5.5.5/resolve?name=X`），本机 nslookup/dig/原生 UDP 查询结果不可信。
- 排查移动端 DNS 类报错（`Failed host lookup, errno=7`）先排除 app 侧再谈网络：从 APK 提取 `lib/<abi>/libapp.so` → `strings | rg "supabase\.co"` 字节级确认注入 URL 无隐藏字符（尾随换行等）；再 DoH 公网解析 + 服务端 `curl -w "%{http_code}"` 健康检查。注意「同一 WiFi 电脑能访问 ≠ 手机能访问」：电脑可能走代理，需确认对比环境一致。
- 沙箱直连 Supabase :5432 被黑洞：用 pooler `:6543`；本地 node postgres.js 正常。
## 10. 发布与 CI/CD 已踩坑（补充记录，v0.1.0 起）

- **upload-artifact@v4 会剥离共同根目录**：`frontend/build/app/outputs/...` 上传后内容为 `flutter-apk/...` + `bundle/release/...`；Release 挂载与下载解压后的结构必须按**真实产物结构**写（验 ZIP 再改，勿盲试）。
- **`--no-codesign` 只产 xcarchive**（无 ipa）；Release 现只挂 Android 产物，iOS 归档留在 CI Artifacts。
- **release 作业只依赖 android**（iOS 独立、不阻塞发布）。
- **改工作流后发布须重切 tag**（tag 内嵌工作流快照）：`git tag -d` + 删远端 + 重打。
- **构建期间勿 kill Gradle 守护进程**（曾直接导致 assembleRelease 失败）；`/tmp FileAlreadyExistsException` 良性；首次 release 构建慢（R8）。
- 发布前确认 GH Secrets `SUPABASE_URL/SUPABASE_ANON_KEY` 已设（release 包否则会指向 localhost、无法登录）。
- v0.1.0 正式发布：GitHub Releases「J-nify v0.1.0」（Latest），资产 `app-release.apk`（52.9MB）+ `app-release.aab`（51.5MB）。
- **v0.1.1 热修复（启动黑屏）**：v0.1.0 APK 安装后完全黑屏。根因=`AppConfig.load()` 中 `dotenv.load('.env')` 默认 `isOptional:false`，release 包无 `.env` 资产 → 抛 `FileNotFoundError` → `runApp` 未执行。修复=改 `isOptional:true` 回退编译期默认值；回归测试 `frontend/test/app_config_test.dart`；本机验证 8/8 测试通过、release APK 构建成功（dart-define 注入正确、无 localhost）。
- **v0.1.2 修复（注册 DNS 失败 + 升级签名）**：
  - **注册报 `Failed host lookup (errno=7)`**：根因=`src/main/AndroidManifest.xml` **缺 `INTERNET` 权限**（Flutter 仅 debug/profile manifest 默认带该权限，release 只合入 main 清单）→ release APK 无网络权限，任何网络请求（含 DNS）立即失败、与 WiFi/卡/代理无关、瞬间报错。修复=主清单加 `<uses-permission android:name="android.permission.INTERNET"/>`。
  - **APK 无法覆盖更新**：根因=v0.1.0 与 v0.1.1 由**不同的 debug keystore 签名**（CI 每次全新 runner 自动生成新 keystore）→ 签名不一致被 Android 拒绝。修复=固定 release keystore 签名（secrets `ANDROID_KEYSTORE_BASE64` 等 4 项，v0.1.2 起签名一致可覆盖更新）。⚠️ 从旧版（debug 签名）升级到首个签名版 v0.1.2 **仍须卸载重装一次**，后续版本正常覆盖。
  - **教训**：Flutter 网络 app 必须在**主** AndroidManifest 显式声明 `INTERNET`，不要依赖 debug/profile manifest；release 签名务必固定 keystore，且首次发布签名需长期保留/备份。
  - **GitHub Actions job 级 `env` 不可用 `runner` 上下文（v0.1.2 踩坑）**：`jobs.<id>.env` 写 `${{ runner.temp }}/...` 致 workflow 解析失败（run 0s failure、tag 不触发任何 run）；job 级 env 改用 `${{ github.workspace }}`（`runner` 仅 step 级可用）。
