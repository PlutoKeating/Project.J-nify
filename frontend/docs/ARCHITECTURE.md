# Frontend 架构

纯客户端（Flutter），无后端/无 Docker。分层清晰，便于后续扩展。

## 分层

- **配置层** `core/config/`：`AppConfig` 用 `flutter_dotenv` 读 `.env`，暴露
  `backendBaseUrl`、`appEnv`、`apiTimeoutSeconds`，**后端地址完全由 `.env` 控制**。
- **网络层** `core/api/`：`ApiClient`（http）顶层 GET/POST/PUT/DELETE 封装。
- **服务层** `services/`：`ApiService` 封装 `/v1/...` 端点（capture / now / items / decision / guardrails / signals）。
- **模型层** `models/`：`ItemCommitment`，对应后端返回字段。
- **UI 层** `screens/ + widgets/`：三个视图（现在/全部/我的）+ 复用组件（焦点卡/录入/任务行）。

## 与 SPEC 的对应

- 「现在」页：首屏只给一件最顺手的事（§2 / §4.3）。
- 焦点卡：三选项闭环 现在做/晚点/算了（§4.2 / §4.4）。
- 「全部」页：任务列表 + 状态徽章 + 勾选（§4.3）。
- 「我的」页：护栏开关 + 隐私说明（§9.4）。

## 配置

`.env`（不入库，交付 `.env.example`）：

```
BACKEND_BASE_URL=http://localhost:8000   # 生产唯一地址：https://jnify.williamhvollita.dpdns.org（代码默认值）
APP_ENV=development
API_TIMEOUT=15
```
