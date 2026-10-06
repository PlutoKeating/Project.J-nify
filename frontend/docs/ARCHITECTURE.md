# Frontend 架构

纯客户端（Flutter），登录用 **PlutoKeating 账号**（flutter_appauth，OIDC 授权码 + PKCE），业务数据经 Cloudflare Worker 后端（REST）获取 —— 客户端**不直接访问数据服务**（只有 Worker 持有 jnify-data 的服务密钥，见根 `docs/ARCHITECTURE.md`）。

## 分层

- **认证层** `auth/`：`Account`（单例，`ChangeNotifier`）：`signIn()` 打开 `https://id.plutokeating.beer` 的登录页（邮箱验证码、通行密钥或 GitHub；第一次用自动建账号，没有密码），client `jnify-app`，回调 `com.plutokeating.jnify://callback`，scope 含 `jnify.items.read`/`jnify.items.write`；令牌存 flutter_secure_storage；`accessToken()` 在访问令牌快过期时用刷新令牌静默换新（并发只刷新一次），刷新被拒时清掉本机登录状态；邮箱与名字从 ID 令牌读，只用于显示。`AuthGate` 跟着 `Account` 切 LoginScreen / HomeShell；登录页只有一个「登录」按钮；登出在「我的」页。
- **配置层** `core/config/`：`AppConfig`（`flutter_dotenv` 读 `.env`）：`backendBaseUrl`（**生产默认 `https://jnify.plutokeating.beer`**）、`openWeatherApiKey`；账号服务地址与 client 固定在 `Account` 里，不走配置；`Env` 常量（`String.fromEnvironment` 支持 dart-define）。
- **会话**：访问令牌 1 小时，刷新令牌 30 天（滑动）；`main.dart` 启动时 `Account.load()` 只读本机存储、不触网。不再有邮件链接与 App Link。
- **网络层** `core/api/`：`ApiClient` 自动附 `Authorization: Bearer <访问令牌>`（取令牌时按需静默刷新；401 → 清掉本机登录状态回登录页；安全存储不可用的测试环境下不带令牌）。
- **服务层** `services/`：`ApiService` 封装 `/v1/...`（含可独立测试的 SSE 解码）；`ConversationStore` 恢复最近会话并仅持久化 user/assistant 文本；`NotificationsService`（本地通知 + 别再提 action）；`SignalCollectors`（usage/日历/天气/位置，仅本地）；`LocalWindowEngine`（Dart 窗口规则）；`OfflineQueue`（sqflite 离线暂存）；`TourRegistry`（通用引导框架）；`TimezoneService`（时区检测/提示）；`JenniferLocalEngine`（本地评估 + 通知 + 静默）。
- **模型层** `models/`：`ItemCommitment`（const 构造器 + `options` 字段）。
- **UI 层** `screens/ + widgets/`：现在/全部/我的；焦点卡按**后端 options** 渲染（now 主按钮/later/drop/条件 rescue）；录入分类 chips（life/chore/bill/return/study/social）+ 期限（无/明天/一周/两周）；Toast 顶部 pill（SPEC §3.5）收口（capture 用后端 message）。`HomeShell` body 包 `SafeArea` 避开刘海/状态栏；「隐私说明」「关于」用 `ExpansionTile` 默认折叠。

## 与 SPEC 的对应

- 「现在」页：首屏只给一件最顺手的事（§2 / §4.3）：headline + 录入 + 焦点卡/空态。
- 焦点卡：四选项闭环 现在做/晚点/算了/帮我兜底（§4.2 / §4.4；rescue 后端按 category 提供）。
- 「全部」页：任务列表 + 状态徽章 + 勾选（§4.3）。
- 「我的」页：资料卡（昵称+邮箱）+ 设置入口 → `SettingsScreen`（改昵称；「PlutoKeating 账号」点开账号设置页管理邮箱、通行密钥、关联 GitHub；「删除我的数据」只删 J-nify 的数据）；安静时段与隐私授权真实读写 + 退出登录（§9.4）。`max_nudge_budget` 仅为后端兼容字段，不是提醒次数硬门。

## 配置

`.env`（不入库，模板见 `.env.example`）：

```
BACKEND_BASE_URL=https://jnify.plutokeating.beer   # 生产默认（代码内置）；本地开发改为 http://localhost:8787
APP_ENV=development
API_TIMEOUT=15
OPENWEATHER_API_KEY=      # 本地开发用；release 由 CI 以 dart-define 注入
```

> 发布构建：release 包开箱即用（后端地址内置，账号服务地址固定在代码里，`OPENWEATHER_API_KEY` 由 CI 以 dart-define 注入；`AppConfig.load()` 用 `isOptional:true` 读 `.env`，缺失静默回退 dart-define/内置默认值——避免 release 无 `.env` 资产时抛异常黑屏）。
> 平台层要求（v0.1.2 起）：主 `AndroidManifest.xml` 声明 `INTERNET` 权限（release 只合入 main 清单）；release 构建用**固定 keystore 签名**（环境变量注入，未配置回退 debug），保证版本间签名一致可覆盖安装更新。
> v0.2.0 平台层：`POST_NOTIFICATIONS`/`ACCESS_FINE_LOCATION`/`READ_CALENDAR`/`PACKAGE_USAGE_STATS` 权限；`MainActivity.kt` 平台通道 `jnify/usage`（UsageStatsManager）与 `jnify/calendar`（CalendarContract 只读空闲时段）。
