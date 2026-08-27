# DevOps 密钥台账（SECRETS REGISTRY）

> 规则（用户定案 2026-08-27）：**prod 密钥一律以 secret 机制存储**（GitHub Actions Secrets / Cloudflare Worker Secrets / Supabase 平台设置），**本仓库为 public，任何密钥明文一律不得入库**；本文件只登记「名称 / 用途 / 存放位置 / 维护方式」，不含任何真实值。
> 权威副本：GitHub Secrets（可通过本机 `gh secret list` / 任意设备 GitHub Web 复核）与对应平台控制台；人类记忆副本建议另存于密码管理器。

| 密钥/配置 | 用途 | 存放位置（唯一） | 维护方式 |
| --- | --- | --- | --- |
| `SMTP_HOST` = smtp.yeah.net | 生产发信（Supabase 自定义 SMTP） | GitHub Actions Secrets（已存）| `gh secret set SMTP_HOST` |
| `SMTP_PORT` = 465 (SSL) | 同上 | GitHub Actions Secrets（已存）| `gh secret set SMTP_PORT` |
| `SMTP_USER` = j_nify@yeah.net | 生产收发件邮箱 | GitHub Actions Secrets（已存）| `gh secret set SMTP_USER` |
| `SMTP_AUTH_PROD` | yeah.net 客户端授权码（SMTP 密码，非登录密码） | GitHub Actions Secrets（已存）+ 届时填入 Supabase 生产项目 Authentication → Settings → SMTP | `gh secret set SMTP_AUTH_PROD`；切勿发公开渠道 |
| 发件显示名 | 邮件发件人 | 非敏感 → `docs/devops/smtp.md`（模板随 Task 16 生成） | 文案审校 |
| `SUPABASE_URL`（生产项目） | Worker 验签 JWKS / Supabase 客户端 | CF Dashboard → Worker → Settings → Variables and Secrets（已存 dev 值；生产项目建立后更新） | Dashboard 维护 |
| `SUPABASE_SERVICE_KEY` | **后端 DB 访问（PostgREST，2026-08-27 起）** | CF Dashboard secrets（已存）+ 本机 `backend/.dev.vars`；**只进后端** | Dashboard / `wrangler secret put` 维护 |
| `DATABASE_URL`（pooler 事务模式 :6543） | 仅迁移脚本/集成测试（node 侧 postgres.js），**无需进 CF Worker** | 本机 `backend/.dev.vars` + GH Actions 集成测试 env | `.dev.vars` 维护 |
| `LLM_API_BASE/LLM_API_KEY/LLM_MODEL` | 预留 LLM 网关（空则模板降级） | CF Dashboard secrets（同上，暂空） | Dashboard 维护 |
| Android 签名 keystore 及口令 | 前端 release APK/AAB 签名（Task 16 引入） | GitHub Actions Secrets（届时添加） | `gh secret set` |
| 本地开发配置（dev 项目 URL/anon/连接串） | 本地 `wrangler dev`/测试 | `backend/.dev.vars`（gitignored） | 本机维护 |

## 轮换与泄露处置
- 任一密钥疑似泄露：立即在对应平台轮换（网易授权码→设置页重新生成；CF/Supabase→控制台重新生成），随后 `gh secret set` 覆盖，并更新本台账。
- 邮件模板与 SMTP 配置步骤见 `docs/devops/smtp.md`（Task 16 交付）。
- 生产 Supabase 项目创建后，按本台账把 SMTP 四项填入 Authentication → Settings → SMTP provider，即可用 j_nify@yeah.net 发送确认/重置邮件（绕开 Supabase 邮件额度）。
