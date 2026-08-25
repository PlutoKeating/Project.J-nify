# Backend 快速开始

## Docker 部署（推荐）

```sh
cd backend
cp .env.example .env       # 修改 APP_PORT 等
docker compose up --build
```

访问 Swagger：`http://localhost:<APP_PORT>/docs`

## 本地运行

```sh
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 -m uvicorn app.main:app --host ${APP_HOST:-0.0.0.0} --port ${APP_PORT:-8000}
```

## 验证核心闭环

```sh
# 录入
curl -X POST http://localhost:8000/v1/items/capture -H 'Content-Type: application/json' \
  -d '{"raw_text":"月底还信用卡账单","category":"bill"}'
# 当前最顺手
curl http://localhost:8000/v1/now
# 三选项决策
curl -X POST http://localhost:8000/v1/items/<id>/decision -H 'Content-Type: application/json' \
  -d '{"decision":"now"}'
```

## 环境变量

见 `.env.example`。核心：`APP_PORT`（唯一端口）、`DATABASE_URL`（SQLite）、`CORS_ORIGINS`、`MAX_NUDGE_BUDGET`。
