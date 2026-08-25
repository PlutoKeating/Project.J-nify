# J-nify

> 不急，但我帮您盯着。

J-nify 不是待办清单，也不是闹钟；它是一位叫 **Jennifer** 的低打扰行动秘书。产品主线只有一条：用户把一件“不急但会忘”的事交给 Jennifer，让它在后台低电量漂浮，在天气、日历空档、位置、使用状态或死线距离组成的“顺手窗口”出现时，用最低阻力选择：**现在做 / 晚点做 / 算了 / 帮我兜底**。

完整产品与工程 Spec 见 [`docs/SPEC.md`](docs/SPEC.md)。

## 仓库结构

```
frontend/   Flutter（Dart）客户端 —— 无 Docker
backend/    FastAPI + SQLAlchemy + SQLite 后端（模块化单体）—— 全部 Docker 部署
docs/       全局文档（SPEC / ARCHITECTURE / API / QUICK_START）
scripts/    通用脚本
```

## 关键说明

- **后端独立部署**于云端服务器，暴露**唯一端口**，且端口全部由 `.env` 控制（`APP_HOST` / `APP_PORT`），便于后期挂载内网穿透到生产 URL。
- **前端**通过 `.env` 的 `BACKEND_BASE_URL` 完全控制所连后端地址（便于运维与版本控制）。
- Docker 相关文件**仅存在于 `backend/`**；`frontend/` 无任何 Docker 文件。

详细启动方式见 [`docs/QUICK_START.md`](docs/QUICK_START.md)。
