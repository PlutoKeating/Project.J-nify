# J-nify Backend

FastAPI + SQLAlchemy（SQLite）+ uvicorn 搭建的模块化单体后端，严格按 SPEC §6 数据模型建模。

结构：

```
backend/
├── app/
│   ├── main.py            # FastAPI 应用入口（/docs Swagger）
│   ├── config.py          # .env 配置（APP_PORT 等完全可控）
│   ├── database.py        # SQLAlchemy 引擎 / 会话 / create_all
│   ├── models.py          # 全部 15 个实体（SPEC §6 ER）
│   ├── schemas.py         # Pydantic 请求/响应模型
│   ├── routers/           # /v1/... 端点
│   ├── services/          # 模块化单体各服务（SPEC §7.1）
│   └── common/            # auth / rate_limit / privacy_scope / audit
├── Dockerfile
├── docker-compose.yml     # 暴露唯一端口（由 .env 控制）
├── requirements.txt
└── .env.example
```

相关文档：[ARCHITECTURE.md](ARCHITECTURE.md)、[QUICK_START.md](QUICK_START.md)。
