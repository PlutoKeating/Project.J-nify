# J-nify 项目交接文档（HANDOVER）

> 生成：2026-08-27（重构会话）。目的：让**新 session 可立即找回工作状态**。
> 与本仓库同级的权威信息源：`docs/compose/specs/2026-08-27-backend-replatform-supabase-design.md`（设计）、`docs/compose/plans/2026-08-27-backend-serverless-replatform.md`（实现计划）、`docs/devops/SECRETS_REGISTRY.md`（密钥台账）。
> ⚠️ 本仓库为 **public**：本文档不含任何密钥明文，只列「名称 + 存放位置」；真值见 `backend/.dev.vars`（gitignored）、GitHub Actions Secrets、CF Dashboard、Supabase 平台。

---

## 1. 项目定位与技术栈

- **产品**：J-nify ——「低打扰行动秘书」Jennifer。P 人友好：录入一句话 → 低电量漂浮 → 在顺手窗口（日历空档/天气/顺路/使用状态/死线距离）出现 → 四选项（现在做/晚点/算了/帮我兜底）。不催、不羞辱、每次给理由、永远有体面退路。
- **仓库**：`PlutoKeating/Project.J-nify`（GitHub，**public**），AGPL-3.0。
- **用户**（本会话）：PlutoKeating；GitHub 账号 github.com/PlutoKeating（gh 已登录，OAuth token）。

**技术栈（演进定案）**：

| 层 | 技术 | 备注 |
|---|---|---|
| 前端 | Flutter (Dart) 3.47.1 stable | supabase_flutter（认证，T13 引入）；android/ios/web 平台 |
| 后端 | **Cloudflare Worker**：TypeScript + Hono + Drizzle ORM + postgres.js | `prepare:false` + `ssl`；部署=CF Dashboard git 集成（push main 自动 wrangler deploy） |
| 数据库/账户 | **Supabase** Postgres + Auth（完整邮箱体系） | 表结构只经 `backend/supabase/migrations/*.sql`（golden rule）；JWKS 验签 |
| CI/CD | **GitHub Actions**（仅 CI 门禁 + 前端自动打包发布；后端部署维持 CF） | 见 `.github/workflows/` |

---

## 2. 仓库状态

- 分支：`main`（本地与远端 `origin/main` 同步）。远端默认分支=main；原 master 已删除。
- HEAD：`59107aa`（2026-08-27）。
- 目录要点：
  - `backend/`：Worker 源码（src/ 含 config/db/lib/services/routes）+ supabase 迁移 + scripts/apply-migrations.ts + test/（14 个测试文件）
  - `frontend/`：Flutter 应用（lib/ 三屏骨架 + android/ios 平台脚手架，minSdk 31）
  - `.github/workflows/`：ci.yml、release-frontend.yml
  - `docs/`：SPEC/ARCHITECTURE/API/QUICK_START + devops/（release/smtp/SECRETS_REGISTRY）+ compose/（spec/plan）
  - `AGENTS.md`（原 Agents.md 已改名）：Agent 工作规范（必读）

**推送方式（重要）**：含 `.github/workflows` 的提交**不能用 HTTPS+gh token 推送**（OAuth token 缺 `workflow` scope，GitHub 拒绝）；必须走 SSH 远端 `origin`（`ssh.github.com:443`，间歇性断管 → 重试 2-4 次 `git push origin main`）。普通提交两种皆可。

---

## 3. 已完成工作（全部双门评审通过 / 真实验证通过）

### 3.1 后端（T1–T11 全 done）—— 真实功能，零 mockup
- **11 端点**：`GET /`、`GET /health`、`POST /v1/items/capture`、`GET /v1/items?status=`、`POST /v1/items/{id}/decision`（now/later/drop/rescue，含 message）、`GET /v1/now`、`POST /v1/signals`、`GET|PUT /v1/guardrails`、`DELETE /v1/me/data`、`POST /v1/llm/draft`（模板降级 stub）。
- 认证：Supabase Auth 邮箱体系，`jose` JWKS 验签（模块级记忆化），`Authorization: Bearer`；users 懒创建（中间件 ensureUser）；401 语义完整；llm/draft 按 userId 隔离（修过 IDOR）。
- 业务：capture→parked；`/now` 候选仅 parked/window_candidate/nudged、updated_at 升序、fit_score 最高（稳定排序）、served 窗口落库、8h 窗口复用、**晚点冷却**（8h 内 later 决策 → 队列尾，全 defer 时服务最久未晚点项且抑制 nudge）；决策事务（later 两步 deferred→parked 触底 updated_at）；护栏持久化（user_preferences，唯一约束 user_id+scene+key）；signals→ContextSnapshot（确定性评分，事务）；me/data 级联删除；频控红线（预算门读事务内新鲜 nudgeCount + SQL 原子自增 + quiet hours，quiet hours 语义与 Python 原版一致 [start,end) UTC）。
- 质量：**51 单元测试绿**；**集成测试 5/5 真库绿**（注册→capture→now→later→guardrails→signals→me/data→全 defer 抑制 nudge）。
- 迁移：`20260827000000_init.sql`（15 实体+1 关联+7 索引）、`20260827000001_unique_user_preferences.sql`；已应用到 dev 项目；`npm run db:migrate` 幂等。

### 3.2 CI/CD 与运维基建
- `.github/workflows/ci.yml`：push/PR 门禁（backend npm test+typecheck；frontend flutter analyze+test）。
- `.github/workflows/release-frontend.yml`：tag `v*` → 校验 pubspec 版本 → APK/AAB（ubuntu）+ ipa --no-codesign（macos）→ softprops/action-gh-release 发布。
- `docs/devops/release.md`（发布规范）、`docs/devops/smtp.md`（SMTP 配置 + 邮件 HTML 模板）、`docs/devops/SECRETS_REGISTRY.md`（密钥台账）。
- prod SMTP 密钥已存 **GitHub Actions Secrets**：`SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_AUTH_PROD`。
- 生产后端 Base URL：`https://jnify.williamhvollita.dpdns.org`（用户已在 CF 配置；前端 `app_config.dart` 的 `prodBackendBaseUrl` 默认值已写入）。

### 3.3 前端（部分）
- 三屏 UI（now/all/me）+ ApiClient/ApiService（真实 API 调用）+ 模型。
- android/ios 平台脚手架（minSdk 31）已提交（`20cb2cc`）。
- **缺失**：认证与登录（T13）、M0 缺口（T14）——见 §6。

### 3.4 环境事实（dev）
- Supabase dev 项目 ref：`ajeratjsxyxtdqtmtvxh`（region ap-southeast-1；直连 :5432 在本沙箱被黑洞，**用 pooler** `aws-0-ap-southeast-1.pooler.supabase.com:6543`）。
- dev 凭据在 `backend/.dev.vars`（gitignored，含 SUPABASE_URL/ANON/DATABASE_URL(DIRECT 同池化串)）。
- Auth「Confirm email」已通过管理 API 关闭（mailer_autoconfirm=true，测试用；生产保持开启并走 SMTP）。
- 本地 `wrangler dev`/集成测试命令见 §8。

---

## 4. 任务树现状（task tool）

- **done**：T1（探索）、T1.1（spec）、T3.1–T3.11（后端全部任务，每任务 spec+质量双门）。
- **in_progress**：T3.17（Task 16 CI/CD —— 交付物已提交推送，**评审待补**）；T4（Flutter 工具链 —— 工具链已装好、平台骨架已提交，**APK 首包构建未完成**，见 §5；同义任务 T5/T8 已 abandoned）。
- **open**：T3.12（文档矛盾修正：SPEC.md:674 与 API.md:11 的 decision 值 `do→now`、README 栈描述/scripts 行、API.md 鉴权描述）、T3.13（前端认证）、T3.14（前端 M0 缺口）、T3.15（验收报告）、T3.16（质量硬化测试批次：audit 单测、rate-limit 过期测试、window-engine 边界、escalation 同日窗口/空回落、brain 空白标题、decision 精确文案+effectMetrics）。

---

## 5. 进行中事项（交接时刻）

1. **Flutter 首包构建（T4 尾部）**：会话结束时 general-51 仍在跑 `flutter build apk --debug`（Gradle 首次下载+编译，通常 20–40 分钟）。恢复步骤：`cd frontend && flutter build apk --debug` 直至出现 `build/app/outputs/flutter-apk/app-debug.apk`；再跑 `flutter analyze`、`flutter test`；若前序步骤全部完成且仅剩构建，直接构建即可。APK 产出后把路径记录进验收报告（T3.15）。
2. **T3.17 评审补票**：`.github/workflows` 两份 YAML（已通过 python yaml 校验、零密钥命中、结构符合 brief）→ 补一次 spec/质量评审后 `task done T3.17`。
3. **T3.11 复验**：修复提交 `59107aa`（e2e 邮箱 base36 唯一、now.ts 全 defer 显式回退+抑制 nudge、冷却查询加界 user_id+gt(since)、测试头注释、新增第 5 个 e2e 用例）——general-55 已实证 5/5 绿 + typecheck 0 错误，但建议新 session 快速复跑一次确认（命令见 §8）。

---

## 6. 待办工作（按优先级）

1. **T13 前端认证**（最大阻塞）：`supabase_flutter` 接入（Supabase.initialize 用 `SUPABASE_URL`+publishable key）、登录/注册页、AuthGate（authStateChanges → LoginScreen/HomeShell）、ApiClient 附 `Authorization: Bearer`（supabase_flutter 取 accessToken）、main.dart 重构；含 widget 测试（静态交付 + `flutter test` 本地验证，工具链已可用）。
2. **T14 前端 M0 缺口**：Toast 收口（SnackBar 顶部 pill 2.2s，复用后端 message）；FocusCard **按后端 options 渲染**（含 rescue「帮我兜底」，不再硬编码 3 按钮）；capture 输入分类 chips（life/chore/bill/return/study/social）+ 可选期限（无/明天/7天/两周）；MeScreen 安静时段/预算/位置**真实读写**（PUT guardrails）；models 补 options 字段与 const 构造器。
3. **T12 文档修正**：SPEC.md:674 `do→now`、API.md:11 同、API.md 鉴权段改 Bearer、README 栈描述（Worker/Supabase）、scripts/ 行、验证边界小节。
4. **T3.16 硬化测试批次**（见 §4 清单）。
5. **T3.15 验收报告**（docs/compose/reports/）：按 spec [S12] 逐项 ✅/⏳ + 证据命令输出 + 用户回补项（flutter 验证、CF 部署、真机安装）。
6. **用户侧运维**：生产 Supabase 项目创建 + SMTP（j_nify@yeah.net，smtp.yeah.net:465，授权码=GH Secret SMTP_AUTH_PROD）+ CF Worker secrets 注入（SUPABASE_URL/DATABASE_URL(pooler :6543)/LLM_*）；Android 签名 keystore（release 商店发布）；iOS 构建/签名（需 macOS）。

---

## 7. 真机可用 MVP 的必要先决条件与阻塞

| # | 项 | 性质 | 说明 |
|---|---|---|---|
| 1 | **T13 前端认证** | 代码 | 无登录页 → 装包也无法注册/登录 |
| 2 | **T14 前端 M0 缺口** | 代码 | 录入/决策体验不完整 |
| 3 | **生产 Supabase 项目 + SMTP** | 运维(用户) | 真机用户需进生产库；邮件走 j_nify@yeah.net（绕开 Supabase 邮件额度） |
| 4 | **CF Worker secrets 注入** | 运维(用户) | 不注入则生产服务无法连库 |
| 5 | **APK 产出** | 构建 | 首包仍在构建；产出后即可侧载安装（debug 包允许未知来源） |
| 6 | Android 签名 / iOS 构建签名 | 运维(用户) | 阻塞商店发布，不阻塞侧载 |
| 7 | 真实主动推送（FCM/APNs） | 业务 | Nudge 已落库但无推送通道；「主动提醒」尚未真实化（M1 后期） |

「拒绝 mockup」：后端全真实；前端全调真实 API；唯一 stub=llm/draft（设计内模板降级）。

---

## 8. 常用命令速查

```bash
# 后端测试（backend/ 下）
npm test                        # 51 unit（无环境）；集成 5 条无 env 自动 skip
npm run typecheck               # tsc --noEmit
# 集成测试（真库；用 pooler 串）
SUPABASE_URL=https://ajeratjsxyxtdqtmtvxh.supabase.co \
SUPABASE_ANON_KEY=<dev.vars 中的值> \
DATABASE_URL=<dev.vars 中的池化串> \
npx vitest run test/integration.test.ts   # 期待 5/5；冷启动偶发假红灯 → warm 复跑
# 迁移（幂等）
npm run db:migrate              # 需 DIRECT_DATABASE_URL env

# 本地起 Worker（backend/）
npx wrangler dev                # 读 .dev.vars

# 前端（frontend/；flutter 已在 ~/.local/bin）
flutter pub get && flutter analyze && flutter test
flutter build apk --debug       # 首包慢（Gradle）

# 发布（用户操作，规范见 docs/devops/release.md）
git tag v0.1.0 && git push origin v0.1.0   # 触发 Actions 自动构建+Release

# 推送（含 workflow 文件必须走 SSH 远端；断管重试）
git push origin main            # ssh.github.com:443，重试 2-4 次
```

---

## 9. 运维注意事项

- **SSH push**：workflow 文件推送被 gh token 的 scope 限制 → 一律 `git push origin main`（SSH）。普通提交可用 HTTPS/gh。
- **golden rule**：任何环境（含 Supabase SQL Editor/Table Editor）不得直接改远端表结构，只走 `backend/supabase/migrations/*.sql` + `npm run db:migrate`。
- **Sandbox 网络**：直连 Supabase `:5432` 在本机被黑洞 → 一律用 pooler `:6543`（`prepare:false` 已固定）；集成测试偶发 JWKS 冷启动 401 / pooler ECONNRESET → warm 复跑。
- **子代理稳定性**：本环境多次出现子代理进程重启/挂死（UnknownError/orphaned）；长命令（flutter/Gradle 下载）会让代理心跳长时间静默——**判定卡死前先查进程级证据**（`ps` 里 java/gradle/dartvm 是否在跑）；确认卡死则 cancel+重派，任务树注意清理重复项（如 T5/T8 已 abandoned）。
- **生产邮件**：Supabase Auth 自定义 SMTP 用 j_nify@yeah.net（模板在 docs/devops/smtp.md；显示名 J-nify · Jennifer）。
- **M1/M2 后续**：M1 信号源（日历/天气/位置/使用状态真实采集+scope 授权流程）、真实推送通道、M2 LLM 接线（jennifer_brain 目前恒 degraded 模板），均有架构预留。