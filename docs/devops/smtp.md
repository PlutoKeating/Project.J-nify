# SMTP（告警邮件）

> 现状（2026-10-07 起）：本项目的 SMTP 只用于 **Worker 告警邮件**（`backend/src/lib/alerts.ts`，nodejs_compat 下的最小 SMTP 客户端）。
> 登录不再发邮件链接：登录 / 注册用 PlutoKeating 账号（邮箱验证码、通行密钥或 GitHub），验证码邮件由账号服务发送，不经这里。
> 原先的 Supabase 自定义 SMTP 配置步骤与「确认邮箱」「重置密码」邮件模板已随 Supabase 一起停用，需要时到 git 历史里查本文件的旧版本。
> **本文件不包含任何真实密钥**：敏感值只以 Secret 名出现（见 `docs/devops/SECRETS_REGISTRY.md`）。

## 1. 用到的密钥

| Secret 名（GitHub Actions） | Worker 里的名字 | 值（不在此处展示） | 说明 |
| --- | --- | --- | --- |
| `SMTP_HOST` | `SMTP_HOST` | `smtp.yeah.net` | SMTP 服务器 |
| `SMTP_PORT` | `SMTP_PORT` | `465` | SSL 端口 |
| `SMTP_USER` | `SMTP_USER` | `j_nify@yeah.net` | 发件邮箱 |
| `SMTP_AUTH_PROD` | `SMTP_AUTH` | （yeah.net 客户端授权码） | SMTP 密码，**非**登录密码 |

## 2. 同步到 Worker

运行 Actions → `Configure Worker Secrets (Ops)`，`confirm` 填 `YES`：把上表的值从 GitHub Actions Secrets 写进 Worker Secrets（`wrangler secret bulk`，不回显真值）。授权码失效时先在网易邮箱「设置 → 客户端授权密码」重新生成，`gh secret set SMTP_AUTH_PROD` 后再运行一次。

## 3. 收件人与阈值

告警收件邮箱与阈值在 admin 面板配置（`/admin/api/config/alerts`），存在 `system_config` 里；另一条告警通道是 GitHub Issues（`GH_PAT`）。
