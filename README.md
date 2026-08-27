<div align="center">

# 🟠 J-nify

**Jennifer — 你的低打扰行动秘书**

> 不急，但我帮您盯着。

把「不急、但会忘」的事交给 Jennifer，她不会催你，只会在*真正顺手*的那一刻，轻轻递到你面前。

**现在做 · 晚点做 · 算了 · 帮我兜底** —— 你永远有体面的退路。

[AGPL-3.0](LICENSE) · Flutter · FastAPI · SQLite

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

因为这是一款为 **J 型秩序感** 而生的工具 —— 用来照顾那些**计划感偏弱、但内心并不想乱**的人（P 人）。Jennfier 把 J 人的纪律，翻译成 P 人也能舒服接受的「时机提醒」。

## 工程实现

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 前端 | Flutter (Dart) + supabase_flutter | 认证（Supabase Auth）；三屏 UI + 录入/决策闭环；生产后端默认 `https://jnify.williamhvollita.dpdns.org` |
| 后端 | **Cloudflare Worker**：TypeScript + Hono | 部署=GitHub Actions `wrangler deploy`（push main 自动上线） |
| 数据 | **Supabase Postgres**（REST/PostgREST + RPC） | 15 实体表 + 事务 RPC；全表 RLS（客户端角色零数据访问） |
| 账户/邮件 | **Supabase Auth + 生产 SMTP** | 邮箱确认/重置经 j_nify@yeah.net（smtp.yeah.net:465） |
| 建模 | SPEC §6 的 15 个实体 | USER / ITEM_COMMITMENT / OPPORTUNITY_WINDOW / NUDGE / DECISION … |

**运行时密钥**只在后端：`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`（CF Worker secrets）；前端仅用客户端级 publishable key 做 Auth；仓库无明文密钥。

## 快速开始

**后端（本地开发）：**

```bash
cd backend
npm ci                                  # 安装依赖
cp .dev.vars.example .dev.vars          # 填 SUPABASE_URL / SUPABASE_SERVICE_KEY / DATABASE_URL
npx wrangler dev                        # 本地起 Worker
```

**后端（部署）**：push `main`（改动 `backend/**`）→ GitHub Actions 自动 `wrangler deploy` 到生产；也可手动 Actions → Deploy Backend → Run workflow。

**前端（Flutter）：**

```bash
cd frontend
cp .env.example .env                    # 可选：覆盖 BACKEND_BASE_URL / SUPABASE_*（生产默认已内置）
flutter pub get
flutter run
# 发布安装包：见 docs/devops/release.md（打 tag vX.Y.Z 自动出 APK/AAB 并发布 GitHub Release）
```

📖 完整说明见 [`docs/QUICK_START.md`](docs/QUICK_START.md)。

## 仓库结构

```
frontend/      Flutter 客户端（认证 + 三屏 + 录入/决策闭环）
backend/       Cloudflare Worker 后端（TS + Hono；Supabase REST/RPC 数据层）
docs/          文档：SPEC / ARCHITECTURE / API / QUICK_START / HANDOVER
docs/devops/   发布规范 / SMTP / 密钥台账
.github/       GitHub Actions（CI / 后端部署 / 前端发布）
LICENSE        AGPL-3.0
```

## 文档

- 📘 [`docs/SPEC.md`](docs/SPEC.md) —— 产品完整立项 Spec（数据模型 / 架构 / 交互 / 验收）
- 🏛️ [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— 系统架构
- 🔌 [`docs/API.md`](docs/API.md) —— REST API
- 🚀 [`docs/QUICK_START.md`](docs/QUICK_START.md) —— 快速开始
- 🗂️ [`docs/HANDOVER.md`](docs/HANDOVER.md) —— 项目状态交接（本仓库最新实现/部署/运维要点）

## CI/CD 与发布

- ✅ **CI 门禁**（`.github/workflows/ci.yml`）：push / PR 自动并行校验 —— 后端 `npm test` + typecheck，前端 `flutter analyze` + `flutter test`。
- 📦 **前端自动打包发布**（`.github/workflows/release-frontend.yml`）：推送 tag `vX.Y.Z` 触发，校验 tag 与 `frontend/pubspec.yaml` 的 version 一致后，构建 Android APK/AAB（ubuntu）并发布 GitHub Release；iOS 归档（xcarchive，macos）。`SUPABASE_URL/SUPABASE_ANON_KEY` 经 GH Secrets 注入构建（dart-define）。流程详见 [`docs/devops/release.md`](docs/devops/release.md)。
- 🚢 **后端部署**（`.github/workflows/deploy-backend.yml`）：push main（backend/**）自动 `wrangler deploy`，生产后端唯一 Base URL = **`https://jnify.williamhvollita.dpdns.org`**。
- 📧 **邮件与 SMTP**（Supabase 自定义 SMTP，j_nify@yeah.net）：已上线（confirm-email 开启），模板见 [`docs/devops/smtp.md`](docs/devops/smtp.md)。
- 🔐 **密钥台账**：所有 prod 密钥以 GitHub Actions Secrets / Cloudflare Worker Secrets / Supabase 平台存储，仓库内无明文密钥，见 [`docs/devops/SECRETS_REGISTRY.md`](docs/devops/SECRETS_REGISTRY.md)。

## 路线图

- ✅ **M0 骨架** — 录入 → 漂浮 → 手动窗口 → 三选项闭环（**v0.1.1 已发布**，Android 安装包见 GitHub Releases；v0.1.0 → v0.1.1 修复启动黑屏：`.env` 缺失时 `dotenv.load` 抛异常致 `main` 崩溃）
- ⏳ **M1 信号** — 日历 / 天气 / 粗粒度位置 / 使用状态 + 频控红线（信号摄入已可；真实数据源待接）
- ⏳ **M2 Jennifer 大脑** — LLM 多供应商热重载模型管理组件（部署侧零硬编码要求）
- ⏳ **M3 灰度** — 100–300 种子用户 + 指标看板

## 开源协议

本项目采用 [**GNU AGPL-3.0**](LICENSE) 开源许可证。完整协议原文见根目录 `LICENSE`。
