# 系统架构

J-nify 采用「前端客户端 + 后端模块化单体」的架构，前后端通过 REST API 通信。完整设计见 [`SPEC.md`](SPEC.md)（§5 架构思维导图、§6 数据模型 ER、§7 模块与接口）。

## 总览

```
[ Flutter 前端 frontend/ ]  ── REST(JSON) ──►  [ FastAPI 后端 backend/ ]
                                                        │
                                                    SQLite
```

- **前端**：Flutter（`frontend/`），无 Docker。
- **后端**：FastAPI（`backend/`），模块化单体（modular monolith），SQLite 持久化，全部 Docker 部署。

## 前端（Flutter）

分层清晰、可扩展：

- `lib/core/config/` — `.env` 配置加载（`BACKEND_BASE_URL` 等完全由 `.env` 控制）
- `lib/core/api/` — HTTP 客户端
- `lib/services/` — 业务 API 封装
- `lib/models/` — 数据模型（对应后端 `ItemCommitment`）
- `lib/screens/` — 三个视图：`现在 / 全部 / 我的`
- `lib/widgets/` — 复用组件（焦点卡、录入、任务行）

## 后端（FastAPI）

模块化单体，各服务边界严格对应 SPEC §7.1：

| 模块 | 职责 |
| --- | --- |
| `services/capture_service` | raw_text → ItemCommitment + 初始策略 |
| `services/context_engine` | SignalEvent → ContextSnapshot |
| `services/opportunity_window_engine` | Item+Context → OpportunityWindow（fit/reason） |
| `services/escalation_engine` | 频控：intensity / should_nudge（遵守安静时段与预算） |
| `services/jennifer_brain` | LLM 网关（stub，模板降级）：title/body/options |
| `services/decision_feedback_service` | 决策闭环 → 状态迁移 + 记忆 |
| `services/notification_orchestrator` | 无理由不通知（reason gate） |

API 边缘（`routers/` + `common/`）：`auth`、`rate_limit`、`privacy_scope`、`audit_log`。

## 数据层

SQLAlchemy 模型**严格对应 SPEC §6 全部 15 个实体**（USER、USER_PREFERENCE、INTEGRATION_SOURCE、SIGNAL_EVENT、CONTEXT_SNAPSHOT、ITEM_COMMITMENT、ITEM_STEP、ESCALATION_POLICY、OPPORTUNITY_WINDOW、MESSAGE_TEMPLATE、NUDGE、NUDGE_OPTION、DECISION、FEEDBACK、MEMORY_NOTE）。SQLite 映射：UUID→String(36)、JSON→JSON(文本)、DateTime→DateTime。

## 配置与部署

- 后端端口 / 数据库等完全由 `.env` 控制（见 [backend QS](QUICK_START.md)）。
- 前端后端地址完全由 `.env` 控制（见 frontend docs）。
