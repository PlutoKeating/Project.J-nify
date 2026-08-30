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
flutter test       # 16 用例全绿（基础 UI + SSE/会话恢复/流式/撤销卡片/节奏策略）
flutter test integration_test/app_smoke_test.dart -d <android-device> --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
flutter build apk --release --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...   # 出手装包
```

Android 使用 Flutter 稳定版默认编译 SDK，最低运行版本为 API 31；CI 在启用 KVM 的 API 31 模拟器执行安装启动冒烟。`permission_handler` 固定在最新 12.x，直到 API 37 进入稳定 Android SDK 渠道。

> 最近远端验证（2026-08-30）：CI 的 analyze + 16 tests 通过；Production Smoke 在 API 31 模拟器上完成 App 构建、安装和启动到 `J-nify · Jennifer` 认证页。最新运行链接见根 `docs/HANDOVER.md` §0。

> 发布构建要点（v0.1.2 起）：
> - **主 `AndroidManifest.xml` 必须声明 `INTERNET` 权限**（Flutter 仅 debug/profile manifest 默认带，release 只合入 main 清单；缺失会导致 release 包任何网络请求立即失败——曾致注册报 `Failed host lookup (errno=7)`）。
> - **release 签名固定 keystore**：CI 经 secrets `ANDROID_KEYSTORE_BASE64/PASSWORD/ALIAS/KEY_PASSWORD` 注入（`build.gradle.kts` 读环境变量，未配置回退 debug）。固定签名是 APK 覆盖安装更新的前提（曾因每次 CI runner 生成的 debug keystore 不同导致无法覆盖更新）。
> - 本地构建验证签名：`apksigner verify --print-certs <apk>`；验证权限：`aapt dump permissions <apk>`。
>
> **功能/配置变更（v0.1.5 起）**：
> - 「我的」页加资料卡（昵称+邮箱）+ 设置入口；新增 `SettingsScreen`（改昵称/邮箱/密码）。昵称经后端 `GET/PUT /v1/me/profile`；邮箱/密码经 Supabase Auth。
> - 邮件确认/重置回调用 **App Link**：`main.dart` 用 `app_links` 订阅深链 → `auth.verifyOTP`/`getSessionFromUrl`；平台配置见根 `docs/devops/email-callback.md`（Android intent-filter 已在 `AndroidManifest.xml`；校验指纹在官网 `/.well-known/assetlinks.json`）。
> - 登录会话：`Supabase.initialize` 显式 `autoRefreshToken/persistSession`；`AuthGate` 启动 `refreshSession()` 滑动重置（服务端 Inactivity timeout=30 天）。
> - ⚠️ `pubspec.yaml` 的 `+N`（=Android versionCode）**必须随发版单调递增**（v0.1.3/v0.1.4 曾 `+1` 致 versionCode=1 < v0.1.2 的 3，覆盖安装被拒）。当前最大=6（v0.3.0=`+6`），下一版本须 ≥+7。

## 配置

`.env` 字段：

```
BACKEND_BASE_URL=https://j-nify.williamhvollita.dpdns.org   # 生产默认（代码内置）；本地开发改 http://localhost:8787
SUPABASE_URL=                                             # 生产 release 由 CI dart-define 注入
SUPABASE_ANON_KEY=
APP_ENV=development
API_TIMEOUT=15
```

> 生产/发布包无需 `.env`：后端地址内置为生产 Base URL；Supabase 配置（URL + publishable key）由 CI 构建时注入（GH Secrets）。注册后需邮箱确认（生产 SMTP 已接，j_nify@yeah.net）。

> v0.2.0 新增环境变量（release 用 `--dart-define` 注入，本地写 gitignored `.env`）：
> - `OPENWEATHER_API_KEY`（天气，免费可商用需署名 "Weather by OpenWeather"）
> - 天地图 Key 为**服务端配置**（CF Secret `TIANDITU_KEY`，App 经 `POST /v1/geo/reverse` 代理调用，坐标二次模糊化，key 不打包进 APK）
> 主要依赖：flutter_local_notifications / flutter_timezone / timezone / permission_handler / geolocator / sqflite / shared_preferences / path；Markdown 使用持续维护的 `flutter_markdown_plus`。
