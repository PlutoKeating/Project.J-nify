<div align="center">

# 🟠 J-nify

**Jennifer 说：「不急，但我帮您盯着。」**

把「不急、但会忘」的小事交给她，她会在真正顺手的那一刻，轻轻提醒你。

[English](README_EN.md) · [官网](https://j-nify.arr2018.dpdns.org) · [AGPL-3.0](LICENSE)

</div>

---

## 你有没有过这样的死循环？

> 不紧急 → 放一边 → 彻底消失 → 死线 panic → 完蛋

P 人不是不想做好，是很多事**一旦放下就真的会蒸发**。拖到最后一晚再通宵，或者干脆忘到天荒地老。

传统待办 App 的解法是「**到点响铃 + 逾期红字羞辱**」。但这只会让你更焦虑、更想关掉通知。

**J-nify 走一条完全不同的路。**

## Jennifer 不是闹钟，她是一个会「盯」的秘书

她不会给你设一个「下午 3 点必须做」的闹钟。她把你的每件事放在后台**低电量漂浮**，然后等一个真正的**顺手窗口**：

| 信号 | 她会在什么时候出现 |
| --- | --- |
| 📅 日历空档 | 你正好有空的那 15 分钟 |
| ☀️ 天气 | 连续晴天微风，适合晒被子 |
| 📍 顺路 | 你正要出门，楼下就是快递柜 |
| 📱 使用状态 | 你刷手机刚满 20 分钟，顺手回条消息 |
| ⏳ 死线距离 | 还剩 10 天，来得及，不是来不及 |

而且每次冒出来，她都会告诉你**为什么是现在**——没有理由，她就不出现。

> 💡 **核心原则：** Jennifer 不解决「自律」，她解决「时机」和「阻力」。她让下一步小到 30 秒就能做完，并永远给你留一条体面的退路。

## 一句话，交给 Jennifer

打开 App，你只需要说一句：「月底还信用卡」「有空把被子晒了」「帮我记着回小明」。

她记下，然后消失。等到**真正顺手**的那一刻，再带着理由和选项出现：

- ✅ **现在做** —— 顺势把这个小坑填了
- ⏰ **晚点，换个窗口** —— 她真的不再烦你
- 🚪 **这件事算了** —— 体面收口，不羞辱
- 🛟 **帮我兜底** —— 写延期申请 / 上门取件 / 替代表达

## 为什么叫 J-nify？

**J-nify 是产品的名字**，直白地说，就是「P 人变 J」——把计划感偏弱、容易拖延的人，变成更有秩序感的人。

而 **Jennifer**，是这款 App 里的智能体，也是品牌的吉祥物。她的名字取自 J-nify 对应的「**J-nifier**」——「把 P 人变成 J 的那个人」——的谐音。她是一位真正**懂 P 人的 J 人助理**：不替你逼出纪律，而是把 J 人的秩序感，翻译成 P 人也能舒服接受的「**时机提醒**」。

## 工程实现

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 前端 | Flutter (Dart) + flutter_appauth | 登录 PlutoKeating 账号（OIDC 授权码 + PKCE）；三屏 UI + 录入/决策闭环；生产后端默认 `https://j-nify.williamhvollita.dpdns.org` |
| 后端 | **Cloudflare Worker**：TypeScript + Hono | 部署=GitHub Actions `wrangler deploy`（push main 自动上线） |
| 数据 | **jnify-data**（`data/`：Node 24 + Hono + node:sqlite，Docker） | 23 张表 + 3 个事务操作；部署在作者的服务器（中国深圳），经 Cloudflare Tunnel 只对 Worker 开放 |
| 账号 | **PlutoKeating 账号**（`id.plutokeating.beer`） | 作者各产品共用的统一账号：邮箱验证码 / 通行密钥 / GitHub，没有密码 |
| 建模 | SPEC §6 的 15 个实体 | USER / ITEM_COMMITMENT / OPPORTUNITY_WINDOW / NUDGE / DECISION … |

**运行时密钥**只在后端：`JNIFY_DATA_URL` + `JNIFY_DATA_KEY`（CF Worker secrets）；App 不持有任何服务端密钥；仓库无明文密钥。

**数据存放（如实说明）**：事项、决定、记忆、节奏策略存在作者服务器（中国深圳）上的数据库里，按明文存储，靠「只有 Worker 持有服务密钥、每个请求都核对是本人账号」与服务器隔离保护——Jennifer 用模型时要看到事项内容，Quetzal 在你授权后也要能读。原始信号（日历 / 天气 / 位置 / 使用情况）只在设备上处理。

## 快速开始

**数据服务 + 后端（本地开发）：**

```bash
cd data && npm ci && npm run dev        # jnify-data，127.0.0.1:8789
cd backend
npm ci                                  # 安装依赖
cp .dev.vars.example .dev.vars          # 默认已指向本地 jnify-data
npx wrangler dev                        # 本地起 Worker
```

**后端（部署）**：push `main`（改动 `backend/**`）→ GitHub Actions 自动 `wrangler deploy` 到生产；也可手动 Actions → Deploy Backend → Run workflow。

**前端（Flutter）：**

```bash
cd frontend
cp .env.example .env                    # 可选：覆盖 BACKEND_BASE_URL（生产默认已内置）
flutter pub get
flutter run
# 发布安装包：见 docs/devops/release.md（打 tag vX.Y.Z 自动出 APK/AAB 并发布 GitHub Release）
```

📖 完整说明见 [`docs/QUICK_START.md`](docs/QUICK_START.md)。

## 仓库结构

```
frontend/      Flutter 客户端（登录 + 三屏 + 录入/决策闭环）
backend/       Cloudflare Worker 后端（TS + Hono；数据经 jnify-data）
data/          jnify-data 数据服务（Node + SQLite，Docker；见 data/README.md）
docs/          文档：SPEC / ARCHITECTURE / API / QUICK_START / HANDOVER
docs/devops/   发布规范 / 告警 SMTP / 密钥台账
.github/       GitHub Actions（CI / 后端与官网部署 / App 发布 / 运维 / 生产冒烟）
LICENSE        AGPL-3.0
```

## 文档

- 📘 [`docs/SPEC.md`](docs/SPEC.md) —— 产品完整立项 Spec（数据模型 / 架构 / 交互 / 验收）
- 🏛️ [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— 系统架构
- 🔌 [`docs/API.md`](docs/API.md) —— REST API
- 🚀 [`docs/QUICK_START.md`](docs/QUICK_START.md) —— 快速开始
- 🗂️ [`docs/HANDOVER.md`](docs/HANDOVER.md) —— 项目状态交接（2026-08-30 的实现/部署/运维快照）
- 🤖 [`docs/JENNIFER_AGENT_REPORT.md`](docs/JENNIFER_AGENT_REPORT.md) —— Jennifer agent 设计与实现现状记录（LLM 调用构建 / prompt / 记忆 / 会话 / 人格设定 / 实测与缺口）
- 📐 [`docs/compose/specs/2026-08-29-jennifer-agent-complete-spec.md`](docs/compose/specs/2026-08-29-jennifer-agent-complete-spec.md) —— Jennifer agent 完整实现需求 Spec（官方文档集 / MCP 风格上下文 / 结构化记忆 / 流式 / 改动卡片与撤销 / admin 管理面）
- 📋 [`docs/DECISION_QUESTIONNAIRE.md`](docs/DECISION_QUESTIONNAIRE.md) —— 产品决策问卷（v0.1.5 全链路审视汇总，已人工填写并定案）
- 📌 [`docs/DECISION_REGISTER.md`](docs/DECISION_REGISTER.md) —— 决策定案登记（权威定案 + 缺口登记 + 凭据指引）
- 🗺️ [`docs/compose/plans/2026-08-29-v020-m0.5-m1-implementation.md`](docs/compose/plans/2026-08-29-v020-m0.5-m1-implementation.md) —— v0.2.0 实施计划
- 🕳️ [`docs/GAPS.md`](docs/GAPS.md) —— 缺口登记（暂不实现，条件成熟时补齐）

> 文档时效性：`README` / `ARCHITECTURE` / `API` / `QUICK_START` / `data/README` / `docs/devops/*` 描述当前实现与运维状态；`docs/compose/plans|specs|reports` 与 `DECISION_QUESTIONNAIRE` 是带日期的过程档案，保留当时语境，不作为当前运维手册。[`docs/HANDOVER.md`](docs/HANDOVER.md) 停在 2026-08-30；2026-10-07 起数据与登录已换（见 `ARCHITECTURE` 与 `DECISION_REGISTER` §七），其中 Supabase 相关内容已过时。

## 官网

产品落地官网：[https://j-nify.arr2018.dpdns.org](https://j-nify.arr2018.dpdns.org)

- 源码：`website/`（Vite + React + TypeScript + React Router + Tailwind CSS 4）
- 内容：首页（营销）/ 功能详解 / 下载页（实时从 GitHub Release 读取最新版本，无需跳转）
- 部署：GitHub Actions `deploy-website.yml` 在 `main` 的 `website/**` 变更后校验并直发 Cloudflare Pages；自定义域名 `https://j-nify.arr2018.dpdns.org`
- 本地预览：`cd website && npm ci && npm run dev`
- 详细部署与自定义域名配置：[`docs/devops/website-deploy.md`](docs/devops/website-deploy.md)

## CI/CD 与发布

- ✅ **CI 门禁**（`.github/workflows/ci.yml`）：push / PR 自动并行校验 —— 数据服务测试+类型检查、后端单测+类型检查（含 5 项集成测试：真实 Worker + 进程内 jnify-data + 本机假 JWKS）、前端静态分析+测试、官网测试+lint+构建。
- 🩺 **生产冒烟**（`.github/workflows/smoke-production.yml`）：每日及手动执行官网/后端/只读 Admin API 检查，并在 Android 模拟器验证 App 可安装启动到认证页。
- 📦 **前端自动打包发布**（`.github/workflows/release-frontend.yml`）：推送 tag `vX.Y.Z` 触发，校验 tag 与 `frontend/pubspec.yaml` 的 version 一致后，构建 Android APK/AAB（ubuntu，**固定 release keystore 签名**）并发布 GitHub Release；iOS 归档（xcarchive，macos，未签名需 Apple 证书）。⚠️ `pubspec.yaml` 的 `+N`（=`versionCode`）必须随发版单调递增（曾因降级致覆盖安装被拒），流程详见 [`docs/devops/release.md`](docs/devops/release.md)。
- 🚢 **后端部署**（`.github/workflows/deploy-backend.yml`）：push main（backend/**）自动 `wrangler deploy`，生产后端唯一 Base URL = **`https://j-nify.williamhvollita.dpdns.org`**。
- 🗄️ **数据服务**：服务器上 `cd data && ./start.sh` 启动 / 更新（第一次生成 `.env` 与服务密钥）；每天备份，保留 7 份。见 [`data/README.md`](data/README.md)。
- 📧 **告警邮件**：Worker 告警经 SMTP 发出，见 [`docs/devops/smtp.md`](docs/devops/smtp.md)。登录不再发邮件链接（验证码由 PlutoKeating 账号服务发送）。
- 🔐 **密钥台账**：所有 prod 密钥以 GitHub Actions Secrets / Cloudflare Worker Secrets / 服务器上的 `data/.env` 存储，仓库内无明文密钥，见 [`docs/devops/SECRETS_REGISTRY.md`](docs/devops/SECRETS_REGISTRY.md)。

## 路线图

- ✅ **M0 骨架**（**v0.1.x 已发布**） — 录入 → 漂浮 → 手动窗口 → 四选项闭环；账户/设置/邮件深链/会话 30 天（v0.1.5）。
- ✅ **M0.5 + M1（v0.2.0 已发布，2026-08-29）** — 本地提醒执行层（本地通知 + 别再提）、四信号源（屏幕使用/系统日历/天气/位置，本地处理）、本地窗口引擎、离线队列、自然语言对话（Jennifer agent harness）、admin 管理面板（LLM 多 provider 热加载 + 指标看板 + 告警）、提醒节奏策略、匿名指标与闭环率。
- ✅ **M2 Jennifer 大脑（v0.3.0 已发布）** — 官方文档集（identity/workflow/tools + skill，admin 在线编辑热重载）、结构化记忆与用户记忆文档、MCP 风格本地数据原文、流式对话、数据改动卡片一键撤销、admin 文档/记忆/playground/成本看板、工具集 15 个（含兜底草稿 LLM 化）。
- ⏳ **M3 灰度** — 指标看板已具备（admin 面板）；种子用户招募与分发后续进行。

> **功能状态标注规范（H2）**：✅ 已发布 · 🚧 进行中 · ⏳ 规划中。只有已发布能力进入官网正文；规划中能力只进路线图。详见 [`docs/DECISION_REGISTER.md`](docs/DECISION_REGISTER.md)。

## 开源协议

本项目采用 [**GNU AGPL-3.0**](LICENSE) 开源许可证。完整协议原文见根目录 `LICENSE`。
