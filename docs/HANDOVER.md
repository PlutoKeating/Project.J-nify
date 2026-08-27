# J-nify 项目交接文档（HANDOVER）— v0.1.0

> 更新：2026-08-27（v0.1.0 正式版发布日）。目的：让**新 session 可立即找回工作状态**。
> 权威信息源：`docs/compose/specs/2026-08-27-backend-replatform-supabase-design.md`、`docs/compose/plans/2026-08-27-backend-serverless-replatform.md`、`docs/devops/SECRETS_REGISTRY.md`（密钥台账）。
> ⚠️ 仓库 **public**：本文不含任何密钥明文，只列「名称 + 存放位置」；真值在 GitHub Actions Secrets / CF Dashboard Worker secrets / 本机 `backend/.dev.vars`（gitignored）/ 密码管理器。

---

## 1. 项目定位与技术栈（定案版）

- **产品**：J-nify ——「低打扰行动秘书」Jennifer。P 人友好：录入一句话 → 低电量漂浮 → 顺手窗口出现 → 四选项（现在做/晚点/算了/帮我兜底）。不催、不羞辱、每次给理由、永远有体面退路。
- **仓库**：`PlutoKeating/Project.J-nify`（GitHub，**public**，AGPL-3.0）。分支 `main`（本地=远端）。

| 层 | 技术 | 备注 |
|---|---|---|
| 前端 | Flutter (Dart) 3.47.1 stable | supabase_flutter 2.17.2（Auth）；android/ios/web；minSdk 31；iOS target 15.0 |
| 后端 | **Cloudflare Worker**：TypeScript + Hono | 部署=GitHub Actions `wrangler deploy`（push main 自动）；生产 URL `https://jnify.williamhvollita.dpdns.org` |
| **DB 访问** | **Supabase REST (PostgREST) + Postgres RPC** | 2026-08-27 定案：worker 内 postgres.js 直连不可行（Supavisor 私有根 CA 不被 workerd 信任、Hyperdrive 未开通）→ 全部走标准 HTTPS fetch；事务写走 `fn_decide`/`fn_create_nudge`/`fn_ingest_signal` |
| 认证 | **Supabase Auth（当前项目即生产）** | 完整邮箱体系；邮箱确认开启，确认/重置邮件经 **j_nify@yeah.net** SMTP；Worker JWKS 验签 |
| CI/CD | GitHub Actions：`ci.yml` + `release-frontend.yml` + `deploy-backend.yml` | 后端部署在 Actions；前端 tag 自动出 APK/AAB/ipa 并发布 Release |

**生产环境定案（2026-08-27 用户纠正）**：用户提供的 Supabase 项目 `ajeratjsxyxtdqtmtvxh` 与邮箱 `j_nify@yeah.net` **即生产环境** —— 不存在「待建生产项目」。

---

## 2. 生产上线状态（v0.1.0）

| 能力 | 状态 | 说明 |
|---|---|---|
| 后端 11 端点 | ✅ 生产可用 | capture/list/decision/now/signals/guardrails/me.data/llm.draft + root/health；全链路真实探测 200 |
| 数据库 | ✅ | 15+1 表 + RPC，迁移 `0000..0004` 全应用（supabase/migrations/） |
| **数据安全 RLS** | ✅ | 全表 RLS + anon/authenticated 权限回收；publishable key 直读数据 → 401（解包攻击路径封死） |
| **生产邮件** | ✅ | SMTP live：`smtp.yeah.net:465`、`j_nify@yeah.net`、sender `J-nify Jennifer`、`mailer_autoconfirm=false`（确认开启） |
| 前端认证 | ✅ | 注册→邮箱确认→登录→登出→401 自动重登（gotrue 源码级验证） |
| 前端 M0 缺口 | ✅ | Toast 收口（顶部 pill 2.2s + 后端文案）、rescue 按钮（后端 options 驱动）、分类/期限录入、护栏真实读写 |
| **安装包** | ✅ | `frontend/build/app/outputs/flutter-apk/app-release.apk`（52.9MB，内置生产 Supabase 配置）；debug 包同目录 app-debug.apk |
| CI/CD+部署 | ✅ | 三工作流全绿；push main 自动上线；**v0.1.0 正式发布流程运行中**（Release 将含 APK/AAB/ipa） |
| 密钥与文档 | ✅ | GH Secrets（9 项）/ CF Worker secrets（SUPABASE_URL/SERVICE_KEY）/ 台账 / 本 HANDOVER 同步 |

---

## 3. 后端（架构与实现要点）

- **目录**：`backend/src/{config,app,index}.ts` + `lib/{auth,audit,privacy,rate-limit}.ts` + `services/{capture,context,decision-feedback,window-engine,escalation,brain,orchestrator}.ts` + `routes/{health,items,now,signals,guardrails,me,llm}.ts` + `db/index.ts`（REST 层 `restGet/restInsert/restUpdate/restDelete/restRpc` + `robustGuardrails/robustPrivacyScope/latestContext`）。
- **运行时 secrets**：`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`（仅 CF Worker secrets + 本机 `.dev.vars`）；「前端/仓库永不出现 service key」。
- **postgres.js 仅剩**：`scripts/apply-migrations.ts`（迁移）与 `test/integration.test.ts`（真库断言）—— Node 侧 devDep，绝不在 Worker 运行时。
- **PostgREST 经验（避免重踩）**：操作符在值侧（`key=in.(a,b)`/`key=gt.v`）；带 uuid 的普通值必须显式 `eq.`（隐式 eq 报 PGRST100）；upsert 用 `on-conflict` + `Prefer: resolution=merge-duplicates`；jsonb 列写数值须 `to_jsonb`（RPC 内）。
- **频控红线**：`shouldNudge` 预算门读事务内最新 `nudge_count`；RPC `fn_create_nudge` 内 SQL 自增（`nudge_count = nudge_count + 1`）；晚点冷却（8h 内 later → 队列尾，全 defer 回退服务最久未打扰项并抑制 nudge）—— redline.test.ts 以源码断言钉住。
- **测试**：单元 48（+集成 5 独立）；集成测试在确认邮件开启下用 service key `auth.admin.createUser({email_confirm:true})` + 真实登录拿会话。

---

## 4. 前端

- `lib/core/config/app_config.dart`：`prodBackendBaseUrl = https://jnify.williamhvollita.dpdns.org`（默认）；Supabase url/anon 经 `String.fromEnvironment`（release 由 CI dart-define 注入）。
- 认证：`lib/auth/auth_gate.dart`（authStateChanges → LoginScreen/HomeShell）+ `login_screen.dart`（登录/注册切换、确认邮件提示）+ `me_screen.dart` 退出登录；`api_client.dart` Bearer 注入 + 401→静默登出 + 未初始化 guard（try/catch 包 `Supabase.instance`）。
- M0：`capture_input` 分类 chips+期限；`focus_card` 按后端 options 渲染（now 主按钮/later/drop/rescue tonal）；Toast 顶部 pill；`me_screen` 护栏真实读写（安静时段开关='00:00' 关闭约定）。
- 测试：7/7 widget（纯组件、不 mock 网络策略）+ `flutter analyze` 0 issues。
- **构建**：release 必须带 `--dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...`（CI secrets 已配；本机构建示例见 §7）。**勿在构建中途 kill Gradle 守护进程**（会致 assembleRelease 失败；`/tmp FileAlreadyExistsException` 为良性告警）。

---

## 5. CI/CD（GitHub Actions，3 条 + 1 触发）

| 工作流 | 触发 | 内容 |
|---|---|---|
| `ci.yml` | push/PR | backend: npm ci+test+typecheck；frontend: flutter analyze+test |
| `deploy-backend.yml` | push main（backend/**）+ workflow_dispatch | wrangler deploy（node 24；secrets: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID） |
| `release-frontend.yml` | tag `v*` | 校验 tag=pubspec 版本 → Android APK+AAB（ubuntu）+ iOS ipa --no-codesign（macos）→ GitHub Release（secrets: SUPABASE_URL/SUPABASE_ANON_KEY dart-define） |

**GH Secrets 清单（9 项已设）**：CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_API_TOKEN、SMTP_AUTH_PROD、SMTP_HOST、SMTP_PORT、SMTP_USER、SUPABASE_ANON_KEY、SUPABASE_URL。**CF Worker secrets**：SUPABASE_URL、SUPABASE_SERVICE_KEY（DEBUG 已删）。
- 推送提示：gh token 已补 workflow scope → **所有推送（含 workflow 文件）直接 HTTPS**；SSH（ssh.github.com:443）在 Clash 环境下不通，勿再用。

---

## 6. 密钥与运维

- 台账：`docs/devops/SECRETS_REGISTRY.md`（SMTP 四项、Supabase URL/SERVICE_KEY、CF token、连接串等的位置与轮换方式；真值不进仓库）。
- 迁移 golden rule：改表/函数一律 `backend/supabase/migrations/<ts>_<name>.sql` + `npm run db:migrate`（DIRECT_DATABASE_URL=pooler 串），禁 Dashboard 直改。
- 临时文件约定：探针等放 `backend/.scratch/`（已 gitignore），收尾整体清一次；**工作途中不执行 rm**。
- 邮件模板：默认 Supabase 文案在用；自设计模板（docs/devops/smtp.md 内 HTML）可后续贴入 Auth → Email Templates。

---

## 7. 常用命令速查

```bash
# 后端（backend/）
npm test && npm run typecheck          # 48 unit（集成 5 需 env 自动跑）
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... DATABASE_URL=<pooler串> \
  npx vitest run test/integration.test.ts   # 5/5（确认邮件开启流程）
DIRECT_DATABASE_URL=<pooler串> npm run db:migrate

# 前端（frontend/；flutter 在 ~/.local/bin）
flutter analyze && flutter test
flutter build apk --release \
  --dart-define=SUPABASE_URL=https://ajeratjsxyxtdqtmtvxh.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<GH secret 值或本地变量>

# 发布（用户/CI）
git tag v<pubspec 版本> && git push origin v<tag>   # 触发 Release 工作流
```

---

## 8. 剩余工作（均非 v0.1.0 阻塞）

1. **真机冒烟**（用户）：侧载 `app-release.apk` → 注册（收确认邮件）→ 确认 → 登录 → 录入 → 决策 → 登出。
2. 邮件模板美化（可用 smtp.md 内 HTML）。
3. Android 商店签名 keystore（侧载不需）；iOS 发布签名（需 macOS + 开发者账号）。
4. 文档打磨：frontend/docs 同步认证/M0（此前评审 Minor）；`SPEC.md:674`/`API.md` 的 decision `do→now` 修正（T12 计划项）；app_config Supabase 配置 fail-fast（T12 计划项）。
5. 质量硬化测试批次（T3.16）：audit 单测、rate-limit 过期测试、window-engine 边界、escalation 同日窗口/空回落、brain 空白标题、decision 精确文案+effectMetrics。
6. 验收报告（T15，docs/compose/reports/）。
7. M1 信号源（日历/天气/位置/使用状态真实采集）、真实推送通道（FCM/APNs，Nudge 已落库未推送）、M2 LLM 接线（当前 brain 恒模板降级；用户要求多供应商热重载模型管理组件，部署侧零硬编码）。

---

## 9. 会话运维经验（防重踩）

- **不要在构建中 kill Gradle 守护进程**（曾致 assembleRelease 失败）；`/tmp FileAlreadyExistsException` 是良性警告。
- 子代理环境多次崩溃/挂死：判定卡死先看进程级证据（ps 里 gradle/java/dart 是否在跑），再 cancel+重派；任务树记得清理重复项（曾有 T5/T8 重复）。
- Clash 开启时 SSH（ssh.github.com:443）不通：一律用 HTTPS 推送（已配 workflow scope）。
- 沙箱直连 Supabase :5432 被黑洞：用 pooler `:6543`；本地 node postgres.js 正常。
## 10. 发布与 CI/CD 已踩坑（补充记录，2026-08-27 v0.1.0）

- **upload-artifact@v4 会剥离共同根目录**：`frontend/build/app/outputs/...` 上传后内容为 `flutter-apk/...` + `bundle/release/...`；Release 挂载与下载解压后的结构必须按**真实产物结构**写（验 ZIP 再改，勿盲试）。
- **`--no-codesign` 只产 xcarchive**（无 ipa）；Release 现只挂 Android 产物，iOS 归档留在 CI Artifacts。
- **release 作业只依赖 android**（iOS 独立、不阻塞发布）。
- **改工作流后发布须重切 tag**（tag 内嵌工作流快照）：`git tag -d` + 删远端 + 重打。
- **构建期间勿 kill Gradle 守护进程**（曾直接导致 assembleRelease 失败）；`/tmp FileAlreadyExistsException` 良性；首次 release 构建慢（R8）。
- 发布前确认 GH Secrets `SUPABASE_URL/SUPABASE_ANON_KEY` 已设（release 包否则会指向 localhost、无法登录）。
- v0.1.0 正式发布：GitHub Releases「J-nify v0.1.0」（Latest），资产 `app-release.apk`（52.9MB）+ `app-release.aab`（51.5MB）。
- **v0.1.1 热修复（启动黑屏）**：v0.1.0 APK 安装后完全黑屏。根因=`AppConfig.load()` 中 `dotenv.load('.env')` 默认 `isOptional:false`，release 包无 `.env` 资产 → 抛 `FileNotFoundError` → `runApp` 未执行。修复=改 `isOptional:true` 回退编译期默认值；回归测试 `frontend/test/app_config_test.dart`；本机验证 8/8 测试通过、release APK 构建成功（dart-define 注入正确、无 localhost）。
