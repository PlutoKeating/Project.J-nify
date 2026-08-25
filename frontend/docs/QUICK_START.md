# Frontend 快速开始

前置条件：安装 [Flutter SDK](https://flutter.dev)。

> 本仓库交付的是完整 Flutter **工程代码**。首次在装有 Flutter SDK 的机器上运行前：
> `flutter create .`（生成平台目录，若尚未生成），再 `flutter pub get`。

## 运行

```sh
cd frontend
cp .env.example .env        # 修改 BACKEND_BASE_URL 指向后端
flutter pub get
flutter run                 # 选择目标设备/平台
```

## 配置

`.env`：

```
BACKEND_BASE_URL=http://localhost:8000   # 后端地址（开发/生产可切换）
APP_ENV=development
API_TIMEOUT=15
```

启动前请确保后端已运行（见 backend `docs/QUICK_START.md`），并让 `BACKEND_BASE_URL` 指向它。
