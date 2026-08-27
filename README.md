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
| 前端 | Flutter (Dart) | 无 Docker；后端地址由 `.env` 的 `BACKEND_BASE_URL` 完全控制 |
| 后端 | FastAPI + SQLAlchemy + SQLite | 模块化单体；**全 Docker 化**；Docker 文件仅存在于 `backend/` |
| 建模 | SPEC §6 的 15 个实体 | USER / ITEM_COMMITMENT / OPPORTUNITY_WINDOW / NUDGE / DECISION … |

后端作为独立单元部署在云端服务器，暴露**唯一端口**，端口完全由 `.env` 控制（`APP_HOST` / `APP_PORT`），方便后期挂内网穿透映射到生产 URL。

## 快速开始

**后端（Docker）：**

```bash
cd backend
cp .env.example .env        # 按需改 APP_PORT
docker compose up --build
# Swagger: http://localhost:<APP_PORT>/docs
```

**前端（Flutter）：**

```bash
cd frontend
cp .env.example .env        # 改 BACKEND_BASE_URL 指向后端
flutter pub get
flutter run
```

📖 完整说明见 [`docs/QUICK_START.md`](docs/QUICK_START.md)。

## 仓库结构

```
frontend/      Flutter 客户端（无 Docker）
backend/       FastAPI 后端 + SQLite（全 Docker 化）
docs/          文档：SPEC / ARCHITECTURE / API / QUICK_START
scripts/       通用脚本
LICENSE        AGPL-3.0
```

## 文档

- 📘 [`docs/SPEC.md`](docs/SPEC.md) —— 产品完整立项 Spec（数据模型 / 架构 / 交互 / 验收）
- 🏛️ [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— 系统架构
- 🔌 [`docs/API.md`](docs/API.md) —— REST API
- 🚀 [`docs/QUICK_START.md`](docs/QUICK_START.md) —— 快速开始

## CI/CD 与发布

- ✅ **CI 门禁**（`.github/workflows/ci.yml`）：push / PR 自动并行校验 —— 后端 `npm test` + typecheck，前端 `flutter analyze` + `flutter test`。
- 📦 **前端自动打包发布**（`.github/workflows/release-frontend.yml`）：推送 tag `vX.Y.Z` 触发，校验 tag 与 `frontend/pubspec.yaml` 的 version 一致后，构建 Android APK/AAB（ubuntu）与 iOS 未签名 ipa（macos），汇总为 GitHub Release。流程详见 [`docs/devops/release.md`](docs/devops/release.md)。
- 🚢 **后端部署**：维持 Cloudflare Dashboard git 集成（Root directory=`backend`），不走 Actions。生产后端唯一 Base URL = **`https://jnify.williamhvollita.dpdns.org`**（前端生产构建默认指向该地址，见 `frontend/lib/core/config/app_config.dart`，无需 `.env`）。
- 📧 **邮件与 SMTP**（Supabase 自定义 SMTP，j_nify@yeah.net）：配置步骤与确认邮箱 / 重置密码模板见 [`docs/devops/smtp.md`](docs/devops/smtp.md)。
- 🔐 **密钥台账**：所有 prod 密钥以 GitHub Actions Secrets / Cloudflare Worker Secrets / Supabase 平台存储，仓库内无明文密钥，见 [`docs/devops/SECRETS_REGISTRY.md`](docs/devops/SECRETS_REGISTRY.md)。

## 路线图

- **M0 骨架** — 录入 → 漂浮 → 手动窗口 → 三选项闭环（✅ 已落地）
- **M1 信号** — 日历 / 天气 / 粗粒度位置 / 使用状态 + 频控红线
- **M2 Jennifer 大脑** — LLM 解析、拆解、话术、兜底草稿 + 降级护栏
- **M3 灰度** — 100–300 种子用户 + 指标看板

## 开源协议

本项目采用 [**GNU AGPL-3.0**](LICENSE) 开源许可证。完整协议原文见根目录 `LICENSE`。
