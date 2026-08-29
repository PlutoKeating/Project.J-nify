# J-nify Frontend

Flutter（Dart）客户端，**无 Docker**。认证用 supabase_flutter（Supabase Auth）；业务 REST 调 Cloudflare Worker 后端（生产 `https://j-nify.williamhvollita.dpdns.org`，代码内置默认；`.env` 可覆盖）。

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

## v0.2.0（M0.5+M1）增量

- **执行层本地优先**：本地通知（flutter_local_notifications，通知内「别再提」action）、UsageStats 屏幕使用（平台通道 + 可选无障碍）、系统日历只读空闲时段、OpenWeather 天气（坐标模糊化）、geolocator + 天地图逆地理编码；原始信号仅本地，不上传。
- **本地窗口引擎**：Dart 移植后端 window-engine 规则（含节奏/冷却，默认 72h），驱动本地通知。
- **离线队列**（sqflite）：capture/decision/profile 离线暂存，重连自动同步。
- **对话闭环**：聊天入口（「现在」页右上角）→ `POST /v1/jennifer/chat`。
- **全部页**：进行中/已收口分组、每行窗口理由、长按多选硬删（二次确认）、清空已收口（软归档）。
- **设置/账户**：忘记密码入口、彻底注销（含 auth 账户）、时区变化提示、隐私说明修正、移除反打扰上限。
- **引导框架**：通用 feature-tour registry（onboarding v1，完成/跳过防二次触发，未来新功能复用）。
- **品牌**：Android/iOS 显示名统一 `J-nify`，启动图标品牌化（#FF5A4E + J）。
- **指标埋点**：capture/nudge_sent/nudge_opened/decision/rescue_action/complaint（匿名）→ `/v1/metrics/events`。

## v0.3.0（Jennifer 完整实现）增量

- **会话上下文纯客户端持久化**（`services/conversation_store.dart`，sqflite）：只存 user/assistant 文本消息；工具结果卡片与占位气泡不落库；服务端保持无状态。
- **流式对话（SSE）**：`ApiService.chatStream` 解析 `text/event-stream`（start/tool/delta/done/error）；`ChatScreen` 发送后立即插入 responding 占位气泡，首 token 原位增量渲染。
- **Markdown 渲染**：assistant 消息经 `flutter_markdown` 渲染（修复纯 Text 显示）。
- **数据改动卡片 + 一键撤销（R9）**：chat 响应的 `toolResults` 中带 `action_id` 的改动渲染为卡片（事项/节奏/护栏/记忆/拆解），卡片带撤销按钮调 `POST /v1/jennifer/undo`；卡片仅活跃会话内展示，退出 App 或开新会话即失效。
- **本地引擎消费节奏策略**：`JenniferLocalEngine` 经 `GET /v1/rhythm` 按类目拉取 agent 写入的 `rhythm_policies`（替换硬编码 72h 冷却），本地通知真正跟随 agent 策略。
