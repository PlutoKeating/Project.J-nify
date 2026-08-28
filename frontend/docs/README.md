# J-nify Frontend

Flutter（Dart）客户端，**无 Docker**。认证用 supabase_flutter（Supabase Auth）；业务 REST 调 Cloudflare Worker 后端（生产 `https://jnify.williamhvollita.dpdns.org`，代码内置默认；`.env` 可覆盖）。

结构：

```
frontend/
├── lib/
│   ├── main.dart              # 入口：Supabase.initialize + app_links 深链(verifyOTP) + AuthGate
│   ├── auth/                  # AuthGate（登录态路由 + 启动 refreshSession）+ 登录/注册逻辑
│   ├── core/config/           # AppConfig（dotenv + 生产默认值 + appLinkHost/appLinkVerify）
│   ├── core/api/              # ApiClient（Bearer JWT 注入、401 静默登出）
│   ├── services/              # 业务 API 封装（含 /v1/me/profile：getProfile/updateNickname）
│   ├── models/                # ItemCommitment（含 options）
│   ├── screens/               # 现在/全部/我的 + 设置(settings_screen) + login
│   └── widgets/               # 焦点卡（后端 options 渲染）/录入（分类+期限）/任务行
├── android/ ios/ web/         # 平台目录（minSdk 31 / iOS target 15.0；Android 已加 App Link intent-filter）
├── pubspec.yaml               # 唯一版本来源（version:；`+N`=versionCode 必须单调递增）
└── .env.example               # BACKEND_BASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY（publishable）
```

相关文档：[ARCHITECTURE.md](ARCHITECTURE.md)、[QUICK_START.md](QUICK_START.md)；发布流程见 `docs/devops/release.md`。

## 发布/打包要点（v0.1.2 起）

- **主 `AndroidManifest.xml` 声明 `INTERNET` 权限**：Flutter 默认只在 debug/profile manifest 带该权限，release 只合入 main 清单；缺失 → release 包无网络（注册/登录报 `Failed host lookup`）。
- **固定 release 签名**：`build.gradle.kts` 从环境变量读 keystore（`ANDROID_KEYSTORE_PATH/PASSWORD/ALIAS/KEY_PASSWORD`，CI 经 GH Secrets 注入；未配置回退 debug）。签名固定才支持 APK 覆盖安装更新。
- `.env` 为可选（`isOptional:true`）：release 无 `.env` 资产时回退 dart-define/内置生产默认值。
- **App Link（v0.1.5 起）**：`AndroidManifest.xml` 的 `MainActivity` 已加 `android:autoVerify="true"` 的 VIEW intent-filter（`https://j-nify.arr2018.dpdns.org/auth`）；App Link 校验指纹在官网 `website/public/.well-known/assetlinks.json`（已填真实 release 证书 SHA-256）。
- ⚠️ **versionCode 规则（v0.1.5 起）**：`pubspec.yaml` 的 `+N`=Android versionCode，**须随发版严格递增且 > 历史最大值**（当前最大=3，v0.1.5=`+4`）。曾因 v0.1.3/v0.1.4 用 `+1`（versionCode=1 < v0.1.2 的 3）导致从 v0.1.2 覆盖安装被系统以"版本落后"拒绝。