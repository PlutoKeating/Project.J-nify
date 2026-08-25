# Frontend 快速开始

前置条件：安装 [Flutter SDK](https://flutter.dev)。

> 本仓库已包含 Flutter 工程：`lib/`、`web/` 平台目录、`pubspec.yaml`、`pubspec.lock`、`test/`。首次在装有 Flutter SDK 的机器上仍需 `flutter pub get`。

## 运行

```sh
cd frontend
cp .env.example .env        # 修改 BACKEND_BASE_URL 指向后端
flutter pub get
flutter run                 # 选择目标设备/平台
```

## 验证（本机已通过）

```sh
flutter analyze         # 无问题
flutter test            # widget 冒烟测试通过
flutter build web --release   # 编译 build/web 成功
```

## 配置

`.env`：

```
BACKEND_BASE_URL=http://localhost:8000   # 后端地址（开发/生产可切换）
APP_ENV=development
API_TIMEOUT=15
```

启动前请确保后端已运行（见 backend `docs/QUICK_START.md`），并让 `BACKEND_BASE_URL` 指向它。
