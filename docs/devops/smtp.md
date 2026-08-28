# SMTP 与邮件模板（Supabase 自定义 SMTP）

> 目的：生产环境用 `j_nify@yeah.net`（网易 yeah.net 邮箱）经 **Supabase 自定义 SMTP** 发送
> 确认邮箱 / 重置密码邮件，绕开 Supabase 内置邮件配额。
> **本文件不包含任何真实密钥**：所有敏感值以 GitHub Actions Secrets 名占位（见 `docs/devops/SECRETS_REGISTRY.md`），
> 真值只存在于 GitHub Actions Secrets / Supabase 平台 / 密码管理器。

## 1. 前置：密钥已就绪

以下四项已登记于 GitHub Actions Secrets（`gh secret set <NAME>`），后续填入 Supabase：

| Secret 名 | 值（不在此处展示） | 说明 |
| --- | --- | --- |
| `SMTP_HOST` | `smtp.yeah.net` | SMTP 服务器 |
| `SMTP_PORT` | `465` | SSL 端口 |
| `SMTP_USER` | `j_nify@yeah.net` | 发件邮箱 |
| `SMTP_AUTH_PROD` | （yeah.net 客户端授权码） | SMTP 密码，**非**登录密码 |

> 若尚未配置：`gh secret set SMTP_HOST` 等依次设置即可（值从密码管理器取用，切勿粘贴进任何入库文件）。

## 2. 配置步骤（Supabase Dashboard）

1. 登录 Supabase Dashboard → 选择**生产项目**。
2. 左侧 `Authentication` → `Settings`（或 `Emails` 面板）→ 找到 **SMTP** 区，开启 **Enable Custom SMTP**。
3. 依次填入（对应上表 Secret 名，真值取自 GitHub Actions Secrets）：
   - **Host**：`SMTP_HOST`（`smtp.yeah.net`）
   - **Port**：`SMTP_PORT`（`465`，SSL）
   - **User**：`SMTP_USER`（`j_nify@yeah.net`）
   - **Password**：`SMTP_AUTH_PROD`（yeah.net 客户端授权码，非登录密码）
   - **Sender name**：`J-nify`（发件显示名）
   - **Sender email**：`SMTP_USER`（`j_nify@yeah.net`）
4. 点击 **Send test email** 验证连通；若失败，先确认授权码正确（网易邮箱 → 设置 → 客户端授权密码生成，465/SSL 需要授权码而非网页登录密码）。
5. 保存后，GoTrue 发出的确认 / 重置邮件即走自定义 SMTP，不再消耗 Supabase 邮件配额。

## 3. 邮件模板（Authentication → Emails → Templates）

分别在 **Confirm signup**（确认邮箱）与 **Reset password**（重置密码）模板中：
- **Subject**：按下表填写主题行；
- **Body**：粘贴下方「完整 HTML」（模板使用 GoTrue 变量，`{{ .ConfirmationURL }}` 为跳转链接）。

### 3.1 确认您的邮箱（Confirm signup）

**Subject**：`J-nify · 确认您的邮箱`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>J-nify · 确认您的邮箱</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F7F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F7F4; padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #ECECE6;">
        <tr>
          <td style="padding:36px 32px 24px 32px;">
            <p style="margin:0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:20px; font-weight:bold; color:#2E2E33; letter-spacing:0.5px;">J-nify</p>
            <p style="margin:8px 0 0 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:13px; color:#76767D;">不急，但我帮您盯着。</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 8px 32px;">
            <p style="margin:0 0 12px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:17px; font-weight:bold; color:#2E2E33;">确认您的邮箱</p>
            <p style="margin:0 0 16px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:14px; line-height:1.8; color:#76767D;">
              您好！欢迎使用 J-nify。请点击下方按钮确认这是您的邮箱，完成注册。<br />
              链接 <strong style="color:#2E2E33;">20 分钟内有效</strong>，过期后请在 App 内重新发起验证。
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td align="center" style="border-radius:8px; background-color:#FF5A4E;">
                  <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block; padding:12px 32px; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:14px; font-weight:bold; color:#FFFFFF; text-decoration:none;">确认邮箱</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:13px; line-height:1.8; color:#76767D;">
              如果按钮无法点击，请复制以下链接到浏览器打开：<br />
              <a href="{{ .ConfirmationURL }}" style="color:#FF5A4E; word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>
            <p style="margin:0 0 16px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:13px; line-height:1.8; color:#76767D;">
              如果这不是您本人操作，请忽略本邮件，您的账户不会受到影响。
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px 32px; border-top:1px solid #ECECE6;">
            <p style="margin:0 0 4px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:12px; color:#76767D;">
              此邮件由系统自动发送，<strong>请勿直接回复</strong>；如需帮助，请在 App 内联系我们。
            </p>
            <p style="margin:0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:12px; color:#76767D;">J-nify · 不急，但我帮您盯着。</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

### 3.2 重置密码（Reset password）

**Subject**：`J-nify · 重置密码`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>J-nify · 重置密码</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F7F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F7F4; padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #ECECE6;">
        <tr>
          <td style="padding:36px 32px 24px 32px;">
            <p style="margin:0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:20px; font-weight:bold; color:#2E2E33; letter-spacing:0.5px;">J-nify</p>
            <p style="margin:8px 0 0 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:13px; color:#76767D;">不急，但我帮您盯着。</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 8px 32px;">
            <p style="margin:0 0 12px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:17px; font-weight:bold; color:#2E2E33;">重置密码</p>
            <p style="margin:0 0 16px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:14px; line-height:1.8; color:#76767D;">
              您好！我们收到了重置您 J-nify 账户密码的请求。请点击下方按钮设置新密码。<br />
              链接 <strong style="color:#2E2E33;">20 分钟内有效</strong>，过期后请在 App 内重新发起重置。
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td align="center" style="border-radius:8px; background-color:#FF5A4E;">
                  <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block; padding:12px 32px; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:14px; font-weight:bold; color:#FFFFFF; text-decoration:none;">重置密码</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:13px; line-height:1.8; color:#76767D;">
              如果按钮无法点击，请复制以下链接到浏览器打开：<br />
              <a href="{{ .ConfirmationURL }}" style="color:#FF5A4E; word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>
            <p style="margin:0 0 16px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:13px; line-height:1.8; color:#76767D;">
              如果这不是您本人操作，请忽略本邮件，您的密码不会被修改。
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px 32px; border-top:1px solid #ECECE6;">
            <p style="margin:0 0 4px 0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:12px; color:#76767D;">
              此邮件由系统自动发送，<strong>请勿直接回复</strong>；如需帮助，请在 App 内联系我们。
            </p>
            <p style="margin:0; font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif; font-size:12px; color:#76767D;">J-nify · 不急，但我帮您盯着。</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

### 3.3 模板变量说明

- `{{ .ConfirmationURL }}`：跳转链接（确认邮箱 / 重置密码共用该变量，由 GoTrue 生成）。
- 模板其余占位（如 `{{ .Email }}`、`{{ .Token }}`、`{{ .SiteURL }}`）可按需补充，本模板未使用。
- 邮件正文注明「20 分钟有效」；实际过期时间以 Supabase `Authentication → Settings` 的过期配置为准，如需严格对齐请在平台调整后同步文案。

## 4. 生产环境说明

- 前端生产构建默认后端地址 = **`https://j-nify.williamhvollita.dpdns.org`**（Cloudflare Worker，`frontend/lib/core/config/app_config.dart` 的 `prodBackendBaseUrl`；发布构建无需 `.env`）。
- 邮件中的跳转链接目标由 Supabase 项目 **Site URL / RedirectTo** 配置决定。⚠️ **曾因 Site URL 为默认 `http://localhost:3000`，所有邮件的 `{{ .ConfirmationURL }}` 都指向 localhost（手机上无效）**。现 Site URL 已改为 **`https://j-nify.arr2018.dpdns.org`**（App Link 域），退回 App 内处理（`app_links` + `verifyOTP`）。完整配置（Site URL / Redirect URL / App Link 校验资产 / 会话时长）见 `docs/devops/email-callback.md`。
- 密钥维护与轮换见 `docs/devops/SECRETS_REGISTRY.md`。
