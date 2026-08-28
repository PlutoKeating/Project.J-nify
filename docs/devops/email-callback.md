# 邮件回调（Deep Link / App Link）与会话时长

> 主题：修复「用户收到的所有邮件回调地址都是 `localhost:3000`」的根因，并把确认/重置邮件回调接入安装版 App；同时把「登录状态保持时长」调为 30 天并随登录滑动重置。
> 本文不包含任何真实密钥/指纹，只给「配置在哪 + 要填什么 + 怎么拿」。真值（release 签名证书、Apple Team ID）在 GitHub Actions Secrets / 密码管理器 / 本机 keystore。

---

## 1. 问题根因：`localhost:3000`

- 邮件里的确认/重置链接由 Supabase Auth（GoTrue）生成，模板 `{{ .ConfirmationURL }}` 默认等于
  `{{ .SiteURL }}/auth/v1/verify?token_hash=...&type=...&redirect_to=...`。
- 项目的 **Supabase 项目 Site URL** 一直是默认值 **`http://localhost:3000`** → 于是所有邮件的回调都变成 `http://localhost:3000/auth/v1/verify?...`。
- 这是**配置问题**，不是代码硬编码。App 以「安装包」形式装在手机上，`localhost:3000` 对手机无意义 → 必须先改后台配置，再让 App 能接收并处理该回调。

## 2. 方案：Universal Link / App Link + `verifyOTP`

- 采用 **App Link（Android）/ Universal Link（iOS）**：回调用一个**受控的 https 域名**，即官网域 `https://j-nify.arr2018.dpdns.org`。装好 App 后，点邮件链接直接唤起 App，无需中间网页。
- App 端（`frontend/lib/main.dart`）用 `app_links` 订阅深链，命中该域后：
  - 带 `token_hash`+`type` 的 **verify 链接** → `auth.verifyOTP(...)`（邮件确认 / 邮箱变更 / 重置密码）；
  - 带 `code`/`access_token` 的 **OAuth/PKCE 链接** → `auth.getSessionFromUrl(...)`。

## 3. Supabase 后台配置（Dashboard，人工步骤）

进入 Supabase → **Authentication → URL Configuration（或 Auth → Settings → URL Configuration）**：

1. **Site URL** 改为 → `https://j-nify.arr2018.dpdns.org`
   （这决定了 `{{ .ConfirmationURL }}` 的域名；App Link 会接管 `/auth/v1/verify` 路径）。
2. **Additional Redirect URLs** 增加 → `https://j-nify.arr2018.dpdns.org/**`（或精确到 `/auth/**`），避免本地/预览地址冲突。
3. 可选：把邮件模板里的 `{{ .ConfirmationURL }}` 保持默认即可（其域名已由 Site URL 决定）；如需强制回 App，可改用 `{{ .RedirectTo }}`（需在客户端传 `redirectTo`，app 端已传 `https://j-nify.arr2018.dpdns.org/auth/verify`）。

> 第 1、2 步是让回调不再指向 `localhost:3000` 的关键；不改这两步，邮件链接依然是 `localhost:3000`。

## 4. App Link 验证资产（仓库已放结构，需替换占位值）

App Link / Universal Link 要「静默唤起 App」），必须让系统能从官方域名拉到**校验文件**：

- `website/public/.well-known/assetlinks.json`（Android）
- `website/public/.well-known/apple-app-site-association`（iOS，无扩展名）

两者目前是**占位值**，部署到 CF Pages 前必须替换为真实值：

| 文件 | 占位 | 替换为 |
| --- | --- | --- |
| `assetlinks.json` | `REPLACE_WITH_RELEASE_SIGNING_CERT_SHA256` | release 签名证书的 SHA-256（见下「如何拿」） |
| `apple-app-site-association` | `REPLACE_WITH_APPLE_TEAM_ID` | Apple Developer Team ID |

- **Android SHA-256**：release 用固定 keystore 签名（见 `docs/devops/release.md`）。在 CI/本机执行：
  `keytool -list -v -keystore <release.keystore> -alias <alias>` → 取「SHA256:」去掉冒号小写拼接；或在 GitHub Actions 里用签名证书输出。记入 `website/public/.well-known/assetlinks.json`。
- **Apple Team ID**：App Store Connect / Apple Developer 账号 → Membership 页；拼成 `<TEAM_ID>.com.jnify.jnifyApp`。
- **Content-Type**：仓库已在 `website/public/_headers` 为 `/\.well-known/apple-app-site-association` 强制 `Content-Type: application/json`（Apple 要求 `application/json` 或 `text/json`，且无重定向）。
- 校验文件必须能被 HTTPS 直达、无重定向：`https://j-nify.arr2018.dpdns.org/.well-known/assetlinks.json` / `.../apple-app-site-association`。
- 替换并部署后，Android `adb shell am start -a android.intent.action.VIEW -d "https://j-nify.arr2018.dpdns.org/auth/v1/verify?token_hash=x&type=signup"` 可直接唤起 App（验证 assetlinks 已生效）。

### 4.1 iOS 附加（Associated Domains）

要打 Universal Link 的 iOS 还需要在 Xcode 里给 target 加 **Associated Domains** 能力，值为 `applinks:j-nify.arr2018.dpdns.org`（即给 Runner 配置 `Runner.entitlements` 并在 Signing & Capabilities 勾选）。iOS 打包需 macOS，此仓库未验证，故作为人工步骤，未改动 pbxproj。

## 5. App 侧已做的深链配置

- `frontend/android/app/src/main/AndroidManifest.xml`：`MainActivity` 已加 `android:autoVerify="true"` 的 VIEW intent-filter，`scheme=https, host=j-nify.arr2018.dpdns.org, pathPrefix=/auth`。
- `frontend/lib/main.dart`：已 `app_links` 订阅 `uriLinkStream`（移动端冷启动的首链接也作为首事件进入，无需单独处理初始链接），命中域名后 `verifyOTP` / `getSessionFromUrl`。
- `frontend/lib/core/config/app_config.dart`：`appLinkHost = j-nify.arr2018.dpdns.org`、`appLinkVerify = https://j-nify.arr2018.dpdns.org/auth/verify`。
- 注册（`login_screen.dart` `signUp`）与邮箱变更（`settings_screen.dart` `updateUser`）已传 `redirectTo/emailRedirectTo` 指向 `appLinkVerify`。

## 6. 会话时长：登录状态至少保留 30 天（随登录滑动重置）

**根因**：你看到「半天就注销」，是因为 Supabase 项目在 **Auth → Sessions** 配置了过短的 **Inactivity timeout**（或 time-box）。Supabase 默认会话**永久有效**，只有当配置了超时/时箱才会自动注销。

**目标行为**：登录保持 ≥30 天；只要用户常登录/打开 App，就永不注销（滑动重置）。

**后台配置（人工，Pro 计划及以上才能设置）**：Supabase → **Authentication → Sessions**：

1. **Inactivity timeout（未活动超时）** 设为 **`720h`（30 天）** —— 会话在**每次刷新**后重置，而 App 在每次启动/运行时会自动刷新 → 只要 30 天内打开过 App，就永不注销。
2. **Time-box（时箱）** 置为 **空/关闭**（避免固定绝对时长提前掐断会话）。
3. **JWT expiry** 保持默认 1h（与刷新机制配合）。

**App 端已配合**（`frontend/lib/main.dart`）：
- `Supabase.initialize(authOptions: FlutterAuthClientOptions(autoRefreshToken: true, persistSession: true, detectSessionInUri: false))` —— 显式开启会话持久化 + 自动刷新。
- `frontend/lib/auth/auth_gate.dart`：启动时若已有持久化会话（自动登录），主动 `refreshSession()`：既拿到新 access token，也让服务端**刷新未活动时钟** → 每次成功进入 App 都重置 30 天窗口。

> 说明：`refreshSession()` 在会话有效时刷新（重置时钟、滚动续期）；当刷新令牌确实失效时会清理本地会话（这是正确行为，符合「过期即注销」）。App 每次冷启动即触发，无需用户重新输密码即可续期。

## 7. 验证清单

- [ ] `https://j-nify.arr2018.dpdns.org/.well-known/assetlinks.json` 返回真实 SHA-256，且与 release APK 签名一致。
- [ ] `https://j-nify.arr2018.dpdns.org/.well-known/apple-app-site-association` 返回 `Content-Type: application/json`。
- [ ] 邮件确认链接域名 = `j-nify.arr2018.dpdns.org`（不再是 `localhost:3000`），点后在已装 App 上直接打开并完成确认。
- [ ] 登录/注册后关闭重开 App，30 天内保持登录；退出后重新登录可续期。
