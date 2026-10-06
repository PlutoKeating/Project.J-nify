# DevOps 密钥台账（SECRETS REGISTRY）

> 规则（用户定案 2026-08-27）：**prod 密钥一律以 secret 机制存储**（GitHub Actions Secrets / Cloudflare Worker Secrets / 服务器上的 `data/.env`），**本仓库为 public，任何密钥明文一律不得入库**；本文件只登记「名称 / 用途 / 存放位置 / 维护方式」，不含任何真实值。
> 权威副本：GitHub Secrets（可通过本机 `gh secret list` / 任意设备 GitHub Web 复核）与对应平台控制台；人类记忆副本建议另存于密码管理器。

| 密钥/配置 | 用途 | 存放位置 | 维护方式 |
| --- | --- | --- | --- |
| `SMTP_HOST` = smtp.yeah.net | Worker 告警邮件 | GitHub Actions Secrets（已存）+ CF Worker Secrets `SMTP_HOST`（已同步 2026-08-29）| `configure-worker-secrets` 工作流 / `gh secret set` |
| `SMTP_PORT` = 465 (SSL) | 同上 | GitHub Actions Secrets（已存）+ CF Worker Secrets `SMTP_PORT`（已同步 2026-08-29）| 同上 |
| `SMTP_USER` = j_nify@yeah.net | 告警发件邮箱 | GitHub Actions Secrets（已存）+ CF Worker Secrets `SMTP_USER`（已同步 2026-08-29）| 同上 |
| `SMTP_AUTH_PROD` | yeah.net 客户端授权码（SMTP 密码，非登录密码） | GitHub Actions Secrets（已存）；CF Worker Secrets `SMTP_AUTH`（已同步 2026-08-29）| `gh secret set SMTP_AUTH_PROD`；切勿发公开渠道 |
| `SESSION_SECRET` | admin 面板登录会话签名（随机 64 位 hex，2026-08-29 生成） | GitHub Actions Secrets（已存）+ CF Worker Secrets（已同步 2026-08-29）| `gh secret set SESSION_SECRET`；轮换=重新生成后重新同步 |
| `OPENWEATHER_API_KEY` | App 本地天气查询（免费可商用，需署名 "Weather by OpenWeather"；2026-08-29 用户提供 prod key） | GitHub Actions Secrets（已存）；release 构建经 `--dart-define` 注入，本地开发走 gitignored `.env` | `gh secret set OPENWEATHER_API_KEY` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | admin 面板登录账号口令；生产只读冒烟使用 | GitHub Actions Secrets（管理员 2026-08-30 更新）+ CF Worker Secrets（同日已同步） | 先 `gh secret set`，再运行 `configure-worker-secrets`，最后运行 `smoke-production.yml` 验证登录 |
| `GH_PAT` | 告警自动建 GitHub Issue（fine-grained，仅 Issues read/write） | GitHub Actions Secrets（已存）+ CF Worker Secrets（已同步） | 创建/轮换指引见 `docs/DECISION_REGISTER.md` §5.2 |
| `TIANDITU_KEY` | 天地图逆地理编码（**浏览器端**类型 key，域名白名单 `jnify.plutokeating.beer`（Worker 代理调用时带的 Referer）；App 经 `/v1/geo/reverse` 代理调用，不打包进 APK；代理请求携带 Referer 过白名单，见 DECISION_REGISTER §5.1） | 已配置（2026-08-29，用户提供）→ CF Worker Secrets | 天地图控制台申请「浏览器端」key → 白名单配本站域名 |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler 定位 Cloudflare 账户 | GitHub Actions Secrets（已存） | 部署/运维工作流使用；更换账户时更新 |
| `CLOUDFLARE_API_TOKEN` | Worker 部署（官网 + 接口）与 Worker secrets | GitHub Actions Secrets（已存） | Cloudflare 控制台轮换后 `gh secret set`；权限保持最小化 |
| `JNIFY_DATA_URL` | Worker 访问 jnify-data 的地址（生产 `https://data.jnify.plutokeating.beer`，经 Cloudflare Tunnel） | CF Worker Secrets；本地 `backend/.dev.vars` 指向 `http://127.0.0.1:8789` | `wrangler secret put JNIFY_DATA_URL` |
| `JNIFY_DATA_KEY` | jnify-data 的服务密钥（只有 Worker 持有；App 不持有） | 服务器上 `data/.env`（`./start.sh` 第一次运行时生成，权限 600）+ CF Worker Secrets，两边必须相同 | 轮换：改 `data/.env` 后 `./start.sh`，再 `wrangler secret put JNIFY_DATA_KEY`；`./start.sh --key` 只在服务器终端查看 |
| `ID_ISSUER`（可选） | Worker 验签用的账号服务地址（PlutoKeating 账号，OIDC issuer） | 非敏感；缺省 `https://id.plutokeating.beer/`，一般不设 | 只在换账号服务时设置 |
| `LLM_API_BASE/LLM_API_KEY/LLM_MODEL` | 旧版兼容环境变量，非 v0.3 Jennifer 主配置通道 | CF 变量/密钥（可留空） | 当前 provider/key/model 由 Admin 写入 `system_config.llm` 并热加载；不应在文档或仓库写真值 |
| Android 签名 keystore 及口令 | 前端 release APK/AAB 签名（v0.1.2 起固定签名，支持覆盖更新） | GitHub Actions Secrets：`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`（已存）+ 本机 `~/.android/jnify-release.jks`（**不入库，务必备份**） | `gh secret set` |
| App Link 校验指纹（SHA-256） | 原用于邮件确认/重置回调唤起 App；2026-10-07 起 App 不再声明 App Link，文件仍在 `website/public/.well-known/assetlinks.json` | **公开值，非密钥** → 直接入仓库该 JSON（无需 secret）；值=`9d9018a5…369d6b3`（release 证书，轮换签名才需更新） | 证书轮换时更新 JSON |
| 本地开发配置 | 本地 `wrangler dev`（`JNIFY_DATA_URL/KEY` 指向本地 jnify-data，开发密钥写在 `data` 的 dev 脚本里） | `backend/.dev.vars`（gitignored，模板 `.dev.vars.example`） | 本机维护 |

> **凭据同步机制（权威）**：`.github/workflows/configure-worker-secrets.yml`（main，`confirm=YES` 门控）手动触发，将 GH Actions Secrets 中登记的值同步为 CF Worker Secrets（`wrangler secret bulk` + `secret list` 验证），真值不落库。2026-08-30 已在 Admin 凭据更新后执行成功，并由生产只读冒烟验证。

### 轮换顺序与验证

1. 在源系统生成/更新值，立即更新对应 GitHub Actions Secret。
2. 对 Worker 运行 `Configure Worker Secrets (Ops)`，输入 `YES`。GH 是该工作流的输入源，**不得用旧 GH 值覆盖已手动更新的 Worker 值**。
3. 运行 `Production Smoke`；Admin 凭据是强制项（`SMOKE_REQUIRE_ADMIN=1`），错配会显式失败。
4. 只用 `gh secret list` / `wrangler secret list` 核对“名称与更新时间”，不在终端、Issue、Actions 日志或文档中回显真值。

## 轮换与泄露处置
- **已停用（2026-10-07）**：`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_KEY`、`DATABASE_URL`/`DIRECT_DATABASE_URL`。代码与工作流已不再读取；GitHub Actions Secrets、CF Worker Secrets 里若还留着可以删除，Supabase 项目停用后对应密钥一并作废。
- **当前待办（2026-08-30）**：`TIANDITU_KEY` 曾误写入公开仓库文档。`main`、`v0.2.0`、`v0.3.0` 的可达历史已重写，168 个可达提交验证无剩余匹配；但旧 clone/fork/平台缓存可能保留已曝光值。必须在天地图控制台轮换，然后更新 GH Secret、同步 Worker 并运行生产冒烟；未轮换前不得标记为已处置。
- 任一密钥疑似泄露：立即在对应平台轮换（网易授权码→设置页重新生成；CF→控制台重新生成；`JNIFY_DATA_KEY`→见上表），随后 `gh secret set` 覆盖，并更新本台账。
- SMTP 现在只用于 Worker 告警邮件，见 `docs/devops/smtp.md`。登录相关邮件（验证码）由 PlutoKeating 账号服务发送，不经本项目的 SMTP。
