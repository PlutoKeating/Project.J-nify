# 快速开始（QUICK START）

## 后端

后端 `backend/` 完全 Docker 化，端口由 `.env` 控制。

```sh
cd backend
cp .env.example .env          # 按需修改 APP_PORT 等（默认 8000）
docker compose up --build
```

- Swagger/OpenAPI：`http://localhost:8000/docs`
- 健康检查：`http://localhost:8000/health`

> 后端独立部署在云端服务器时：只需让 `.env` 中的 `APP_PORT` 绑定到唯一空闲端口，
> 再将内网穿透（如 frp/ngrok）指到该端口，即可映射到生产 URL。前端地址不参与后端端口决策。

### 本地运行（可选，不使用 Docker）

```sh
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 -m uvicorn app.main:app --host ${APP_HOST:-0.0.0.0} --port ${APP_PORT:-8000}
```

## 前端

前端为 Flutter（`frontend/`），**无 Docker**。后端地址完全由 `.env` 控制。

```sh
cd frontend
cp .env.example .env          # 修改 BACKEND_BASE_URL，例如 http://<后端>:<APP_PORT>
flutter pub get
flutter run
```

> 注意：本仓库交付的是完整 Flutter **工程代码**（`pubspec.yaml` + `lib/`）。
> 首次在装有 Flutter SDK 的机器上运行时，需执行 `flutter create .` 生成平台目录，再 `flutter pub get`。
