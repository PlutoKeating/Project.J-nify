# 邮件回调（Deep Link / App Link）与会话时长 —— 已废弃

> **2026-10-07 起废弃。** 本文原先记录 Supabase Auth 邮件回调（Site URL、`/auth/v1/verify`、`app_links` + `verifyOTP`）与 Supabase 会话时长的配置。J-nify 已不用 Supabase：登录改为 PlutoKeating 账号，App 不再收邮件链接，也不再声明 App Link。旧内容见 git 历史里本文件的旧版本。

## 现在的做法

- **登录**：App 用 flutter_appauth 走 OIDC 授权码 + PKCE，打开 `https://id.plutokeating.beer` 的登录页（邮箱验证码、通行密钥或 GitHub；第一次用自动建账号，没有密码）。回调是自定义 scheme `com.plutokeating.jnify://callback`（安卓 `manifestPlaceholders` 的 `appAuthRedirectScheme`），不经网页。
- **会话**：访问令牌 1 小时，刷新令牌 30 天（滑动）；访问令牌快过期时 App 用刷新令牌静默换新，令牌存在 flutter_secure_storage。刷新失败或后端返回 401 时清掉本机登录状态，回到登录页。
- **改邮箱、通行密钥、关联 GitHub**：在 App 设置页「PlutoKeating 账号」点开账号设置页里做。

## 遗留

- `website/public/.well-known/assetlinks.json`、`apple-app-site-association` 仍在官网上，App 已不引用，可在下次整理官网时删掉。
- 官网 `/auth/verify` 页保留，只提示「这类链接已不再使用，请在 App 里登录」，给还留着旧邮件的人一个去处。
