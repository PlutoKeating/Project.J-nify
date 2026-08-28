# Frontend 快速开始

前置：Flutter SDK（stable）。仓库已含 `lib/`、`android/ ios/ web/` 平台目录、`pubspec.lock`、`test/`；首次仍需 `flutter pub get`。

## 运行

```sh
cd frontend
cp .env.example .env        # 可选：本地开发将 BACKEND_BASE_URL 指向 http://localhost:8787（后端 wrangler dev）
flutter pub get
flutter run
```

## 验证（本机已通过：Flutter 3.47.1）

```sh
flutter analyze    # 0 issues
flutter test       # 8 用例全绿（登录/注册表单、HomeShell、MeScreen 登出、焦点卡 options、AppConfig .env 缺失回退）
flutter build apk --release --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...   # 出手装包
```

> 发布构建要点（v0.1.2 起）：
> - **主 `AndroidManifest.xml` 必须声明 `INTERNET` 权限**（Flutter 仅 debug/profile manifest 默认带，release 只合入 main 清单；缺失会导致 release 包任何网络请求立即失败——曾致注册报 `Failed host lookup (errno=7)`）。
> - **release 签名固定 keystore**：CI 经 secrets `ANDROID_KEYSTORE_BASE64/PASSWORD/ALIAS/KEY_PASSWORD` 注入（`build.gradle.kts` 读环境变量，未配置回退 debug）。固定签名是 APK 覆盖安装更新的前提（曾因每次 CI runner 生成的 debug keystore 不同导致无法覆盖更新）。
> - 本地构建验证签名：`apksigner verify --print-certs <apk>`；验证权限：`aapt dump permissions <apk>`。

## 配置

`.env` 字段：

```
BACKEND_BASE_URL=https://jnify.williamhvollita.dpdns.org   # 生产默认（代码内置）；本地开发改 http://localhost:8787
SUPABASE_URL=                                             # 生产 release 由 CI dart-define 注入
SUPABASE_ANON_KEY=
APP_ENV=development
API_TIMEOUT=15
```

> 生产/发布包无需 `.env`：后端地址内置为生产 Base URL；Supabase 配置（URL + publishable key）由 CI 构建时注入（GH Secrets）。注册后需邮箱确认（生产 SMTP 已接，j_nify@yeah.net）。