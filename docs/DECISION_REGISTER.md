# J-nify 决策定案登记（DECISION REGISTER）

> 状态：**已定案（2026-08-29；2026-08-30 工程验证决策更新）**。本文档是问卷 `docs/DECISION_QUESTIONNAIRE.md` 的最终裁决结果与实施输入，亦是「暂不做内容」的官方留档（对应 A1 备注要求：后续条件成熟时可随时发现缺口并补齐）。
> 三模块并行实施以此为唯一权威依据；与本文档冲突的旧文档口径以本文档为准并需同步修正。

---

## 一、核心定案总则（最高优先级）

| # | 定案 |
| --- | --- |
| P1 | **提醒执行本地优先**：Android 本地通知（系统通知通道）为主，不引入 Firebase / FCM / 任何新的外部推送服务；FCM 与后端主动推送记为缺口（GAP-FCM）。 |
| P2 | **Jennifer agent 完全接管策略决策**：节奏、冷却、理由、兜底类目与动作、阈值参数均由 agent 决定并可通过工具写入策略表；系统**不硬编码**强制模板、次数上限、阈值。 |
| P3 | **隐私边界（Q8 定案 A）**：原始信号（屏幕使用、日历内容、精确位置、天气上下文）只在本地处理、不上传；事项（标题/期限/分类/状态）与决策历史上云（RLS + 匿名化 + 传输加密）；指标事件仅匿名（不含内容）。 |
| P4 | **外部服务白名单**：天地图（用户已有 key）、天气源 OpenWeather（免费可商用，需署名，见 §五）、models.dev（公开模型列表）、GitHub API（已有）。其他一律不引入。 |
| P5 | **频控（Q1 定案）**：删除硬编码提醒次数上限；仅保留 安静时段 + 窗口级去重 两道硬护栏；频率管理交由 Jennifer 按用户行为动态调整。 |
| P6 | **宣传口径（Q2 定案）**：保留愿景文案不动，但官网/README 必须增加「已发布 / 进行中 / 规划中」状态标注；只有已发布能力可进正文（A5 生效）。 |
| P7 | **集成测试**：不引入生产库测试；CI 启动一次性本地 Supabase 栈并执行 5 项真实 Auth/PostgREST/RPC 集成测试，无需生产凭据。 |

---

## 二、问卷 58 项定案表

### A · 核心承诺与产品主线

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| A1 | 推送通道：**本地通知为主**，FCM 不引入 | 原选 A 被 Q3 覆盖；GAP-FCM 留档 |
| A2 | 事件=窗口出现才提醒；文案=Jennifer 生成（参考话术列表，非强制模板）；同窗口去重；点击回「现在」页 | Q7 落为完整对话闭环 |
| A3 | **删除次数上限**；保留安静时段+窗口去重；Jennifer 动态管理频率 | Q1 定案；设置页移除"反打扰上限"下拉 |
| A4 | 只补功能；文案保留愿景（但叠加 H1 状态标注） | Q2 定案 |
| A5 | 只有已发布（含验收）能力可进官网正文；规划中只进路线图 | 与 H1 联动 |

### B · 信号与窗口引擎

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| B1 | 四信号源本期全部实现：usage + 系统日历 + 天气 + 位置 | Q4 定案；OAuth 日历源 = GAP-CAL-OAUTH |
| B2 | UsageStatsManager 为主（本地聚合、分钟级）+ 无障碍服务为可选进阶开关 | Q5 定案；隐私承诺：检测仅本地 |
| B3 | 系统日历只读空闲时段；第三方日历源本期不接 | Q6 定案；GAP-CAL-OAUTH 留档 |
| B4 | 天气=OpenWeather（免费可商用，署名）；位置=用户授权精确位置，经 天地图 逆地理编码取城市/区域（坐标先模糊化）；阈值由 Jennifer 设置 | Q10 定案 |
| B5 | 位置同 B4；不做连续轨迹上报 | 天地图 key 用户已有 |
| B6 | 提醒节奏表落库（初始默认值见 Q15），Jennifer 可读写调整 | 重点实现 agent harness + 工具链 |
| B7 | 无死线事项冷却策略由 Jennifer 决定；初始默认 72h | Q15 认可 |
| B8 | social 理由由 Jennifer 决定；无信号时不得编造"比较放松" | 真实性红线保留 |
| B9 | 每次启动采集设备时区；变化时显式弹窗询问；写入 users.timezone；静默时段按用户时区 | 设置页可手动覆盖 |
| B10 | 逾期文案改为"已到期，仍为您保留，随时可处理"；不推送升级；保留三选项 | — |
| B11 | 每窗口至多 1 条 nudge（窗口级去重） | — |

### C · 兜底与决策闭环

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| C1 | 兜底类目范围由 Jennifer 决定；初始映射：bill/study→延期申请、return→寄件清单、social→回复草稿、chore→通用 | Q14 定案：以 agent 接管为主 |
| C2 | 兜底动作=Jennifer 生成物 + 用户二次确认；**本期无真实外部执行** | 不做未经确认的真实付款/外发 |
| C3 | rescued 后允许选择 done / 回到 parked；全部页显示兜底动作状态 | — |
| C4 | 不建强制话术模板；提供参考话术列表，system prompt 表述为"仅供参考" | — |
| C5 | 保留"算了可恢复"；全部页长按单选/多选**硬删**（二次确认） | — |
| C6 | 按"进行中/已收口"分组，收口组默认折叠；"清空已收口"=**软归档**（保留决策历史供指标） | Q16 定案 |

### D · 账户、数据与合规

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| D1 | 登录页补"忘记密码"（resetPasswordForEmail → recovery 深链） | — |
| D2 | 事项编辑（标题/分类/期限/时长）；**自然语言对话 CRUD 完整落地**（聊天 UI + agent harness + MCP 风格工具） | Q7 定案 |
| D3 | 设置页"删除我的数据/注销账户"+ 二次确认（输入密码或键入"删除"）；**彻底注销**（含 auth 账户） | Q17 定案 |
| D4 | 数据导出暂不做 | GAP-EXPORT（M3） |
| D5 | 原始信号仅本地；事项/决策上云匿名+加密；App 隐私说明与官网隐私政策页同步修正 | Q8 定案 A |
| D6 | 邮箱变更后保留"重新登录"流程 | — |
| D7 | 保留 30 天滑动会话 | — |

### E · 用户体验

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| E1 | 焦点卡补三 chips（为什么是现在/约 X 分钟/可晚点）；录入加预计耗时（30s/5/15/30min） | — |
| E2 | 全部页每行显示窗口理由 | — |
| E3 | 空输入 Toast"一句话就够" | — |
| E4 | 失败反馈 + **离线暂存完整落地**（本地队列，重连自动同步） | 不等后续 |
| E5 | 「现在/全部」下拉刷新 + 错误态重试按钮 | — |
| E6 | 品牌名全端统一 **J-nify**（严格大小写）；图标品牌化（#FF5A4E + 简单符号） | — |
| E7 | 问候语按真实星期/时段动态生成，可由 Jennifer 生成（可选） | — |
| E8 | 首启引导 + **通用新功能引导框架**（feature-tour registry：key/version/status，记录完成/跳过，防二次触发；未来新功能复用） | — |
| E9 | 官网 `/auth/verify` 回退页 | — |
| E10 | 通知权限引导（首启或首次录入成功后请求，品牌口径文案；拒绝后可在设置页开启） | — |

### F · 架构与工程

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| F1 | `/v1/now` 候选 limit 20 + 并行窗口计算 + P95 基准脚本 | — |
| F2 | 进程内限流维持，记录限制与后续 CF Rate Limiting 选项 | — |
| F3 | **集成测试接入本地 Supabase CI、仍不碰生产库**；push/PR 自动执行 5 项真实 Auth/PostgREST/RPC 测试 | 2026-08-30 以本地栈方案取代凭据型测试 |
| F4 | 邮件模板贴入 Supabase（Dashboard 人工步骤），内测时再验证 | — |
| F5 | 后端版本以 `APP_VERSION` 部署变量为准，随发版更新 | — |
| F6 | **admin/ 管理面板**（浏览器页面 + API）：LLM 多 provider/多 key/多模型（models.dev 动态列表）、模型优先级与故障切换、热加载；Jennifer agent 完整 harness | Q13/G2 定案；Q18 采纳 |
| F7 | 决策层在云端（agent），**执行层本地优先**（App 内本地调度/通知） | Q3/Q8 联动 |
| F8 | 保持"全走后端"架构；决策记录留档，未来可重新评估 | — |

### G · 可观测与指标

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| G1 | 埋点 6 事件（capture/nudge_sent/nudge_opened/decision/rescue_action/complaint）+ 闭环率 SQL 视图 | 匿名，不含内容 |
| G2 | 指标看板并入 **admin 面板**；唯一管理员（`ADMIN_USERNAME`/`ADMIN_PASSWORD` 存 CF Worker env）+ 登录会话 | — |
| G3 | 告警**双通道**：GitHub Issues（GH_PAT，最小权限）+ 邮件（复用 SMTP） | Q13 定案 |

### H · 宣传口径与文档治理

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| H1 | 首页保留愿景 + 增加"已发布/规划中"状态标注；Features 支柱标注状态；场景标注"示意，即将上线" | Q2 联动 |
| H2 | README/官网统一三态徽章；发布 checklist 强制同步 README/官网/release.md/HANDOVER | — |
| H3 | SPEC 五用例拆"手动窗口判定/M1 信号窗口判定"两列；M1 完成定义 = 四信号源 + 本地执行闭环 + 节奏表生效 | — |
| H4 | 修正 release.md v0.1.5 状态；README 文档索引补登记/计划 | ✅ 已完成；2026-08-30 又完成一次全量文档/运维时效性审计 |

### I · 发布与里程碑

| 编号 | 定案 | 备注 |
| --- | --- | --- |
| I1 | v0.2.0 = 本期 P0/P1 集合；2–4 周/版 | — |
| I2 | M0.5 = 本地提醒 + 账户/隐私/宣传修正 + admin/agent 基础；M1 = 四信号源 + 对话闭环 + 节奏表；M2 = agent 深度（LLM 话术/拆解/兜底草稿）；M3 = 灰度（先看板） | 用户重排 |
| I3 | 本期只做指标看板（admin），种子用户招募/分发不做 | — |
| I4 | iOS 全线暂缓（安装包/Universal Link/APNs），恢复前置 = Apple 开发者账号 + macOS 签名 | — |

---

## 三、Q1–Q17 追加裁决记录（问卷外问题）

| 编号 | 问题 | 定案 |
| --- | --- | --- |
| Q1 | 删频控上限的精确语义 | **备选方案**：无硬编码上限；保留安静时段 + 窗口级去重；Jennifer 动态管理频率（含冷却） |
| Q2 | A4「文案不动」与 H1/A5 冲突 | **推荐**：保留愿景文案 + 状态标注（H1/A5 生效） |
| Q3 | FCM vs 本地执行 | **推荐 + 用户修正**：本地通知为主；**不使用 Firebase、不引入其他推送服务**；FCM 记为 GAP-FCM |
| Q4 | 四信号源批次 | **推荐**：批1 = usage + 系统日历 + 天气 + 位置；批2（OAuth 日历源）本期不接，记录缺口 |
| Q5 | 屏幕时间检测机制 | **推荐**：UsageStatsManager 为主 + 无障碍服务可选进阶开关 |
| Q6 | 日历第三方范围 | **同 Q4**：系统日历本期接入；OAuth 源（Google/Outlook/飞书/钉钉）与微信本期不接，记录缺口 |
| Q7 | 对话范围 | **推荐**：完整工程化落地（聊天 UI + harness + MCP 风格工具） |
| Q8 | 本地/云端边界 | **方案 A**：原始信号本地；事项/决策上云（匿名+加密） |
| Q9 | Firebase | 无 Firebase 项目、不引入该框架 |
| Q10 | 天气/天地图 key | 天地图已有；天气源=**OpenWeather 免费可商用（需署名）**；**OpenWeather prod key 已由用户提供（2026-08-29），存于 GH Secret `OPENWEATHER_API_KEY`** |
| Q11 | OAuth 凭据 | **同 Q4**：本期不接，记录缺口 |
| Q12 | 生产库集成测试 | **仍不做**：不新增生产 service key 到 CI；改用一次性本地 Supabase 栈自动验证 |
| Q13 | 告警通道 | **两个都做**：GitHub Issues（GH_PAT 最小权限）+ SMTP 邮件；secret 创建指引见 §五 |
| Q14 | 兜底 fallback | **以 Jennifer agent 完全接管为主**；不做硬编码兜底话术；agent 不可用时诚实报错+重试 |
| Q15 | 初始默认节奏 | 认可：账单 10/3 天、退货 3/5/1 天、作业 5/10/13 天、无死线同理由冷却 72h（均可被 agent 调整） |
| Q16 | 清空已收口 | 确认：软归档（保留记录供指标）；长按硬删才真删 |
| Q17 | 注销语义 | 确认：彻底注销（业务数据 + auth 账户） |

---

## 四、缺口登记（GAP REGISTER —— 暂不实现，条件成熟时补齐）

| 编号 | 缺口 | 触发条件/备注 |
| --- | --- | --- |
| GAP-FCM | 后端主动推送（FCM/APNs） | 当前本地通知已覆盖核心体验；若未来需要"后端跨端主动触达"，需 Firebase/APNs 凭据 |
| GAP-CAL-OAUTH | 第三方日历源：Google / Outlook / 飞书 / 钉钉 OAuth 接入 | 需各平台 OAuth 应用凭据（Client ID/Secret）与企业授权；框架已预留 provider 适配器 |
| GAP-WECHAT | 微信消息/日程读取 | 个人微信无官方 API（企业微信会话存档为付费企业功能）；替代=分享到 J-nify / 手动录入 |
| GAP-EXPORT | 数据导出（JSON） | M3 再做（D4 定案） |
| GAP-IOS | iOS 安装包 / Universal Link / APNs | 需 Apple Developer 账号 + macOS 签名链路（I4 定案） |
| GAP-RATE-LIMIT | CF Rate Limiting 跨实例限流 | 单实例规模内进程内限流够用；多实例部署前接入（F2 定案） |
| GAP-PUSH-ACTION | 通知内交互动作（如"别再提"按钮） | 本地通知本期支持通知内 action；系统级富交互受限时记录 |
| GAP-OFFLINE-CLOUD | 弱网/离线状态下的云端同步冲突策略 | 本期离线队列先做 last-write-wins；冲突合并策略后续细化 |
| GAP-DUAL-ENGINE | 本地窗口引擎与后端 /v1/now 双实现 | 执行层本地优先后，两端规则需保持同步；建议后续统一为共享规则文档 |

---

## 五、外部凭据获取与配置指引（用户执行）

### 5.1 天气源：OpenWeather（免费可商用）
1. **状态：已就绪（2026-08-29）**。用户提供的 prod key 已存入 GH Actions Secret `OPENWEATHER_API_KEY`（release 构建经 `--dart-define=OPENWEATHER_API_KEY=...` 注入，本地开发走 gitignored `.env`；**真值不落库**）。
2. 免费计划额度：60 次/分钟、1,000,000 次/月；**商用允许，但必须在 App「关于/隐私」页与官网注明"Weather by OpenWeather"**（署名义务）。
3. App 侧使用要求：位置模糊化后请求，仅取天气结果，结果本地缓存。
> 说明：天地图 Key 用户已有；逆地理编码仅用于把模糊化坐标转成城市/区域名，坐标先取整（约 1km 精度）再调用。

> ⚠️ **天地图 Key 类型定案（2026-08-29）**：用户选择「**浏览器端**」类型 key，白名单仅配置 `https://j-nify.williamhvollita.dpdns.org`。
> 原因：浏览器端与服务端类型的实际区别仅为白名单控制类别——浏览器端=域名白名单，服务端=固定 IP 白名单；Cloudflare Worker 出口 IP 不固定/不可控，域名白名单更贴合部署形态。
> 实现：后端 `/v1/geo/reverse` 代理请求显式携带 `Referer: https://j-nify.williamhvollita.dpdns.org/` 以通过域名白名单校验；key 存 CF Secret `TIANDITU_KEY`，不打进 APK。
> Key 真值只存 GH/CF Secrets，文档仅登记名称 `TIANDITU_KEY`。历史版文档曾误写真值，2026-08-30 已移除；按公开仓库凭据泄露流程应在天地图控制台轮换，再更新 GH Secret 并同步 Worker。

### 5.2 GitHub 告警 Token（最小权限）
1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token。
2. Repository access：**Only select repositories** → 只选 `PlutoKeating/Project.J-nify`。
3. Permissions：只开 **Issues → Read and write**（不要授 repo contents/admin 等其他权限）。
4. 当前已配置。轮换时将新 token 存为 GH Actions Secret `GH_PAT`，再运行 `configure-worker-secrets` 工作流（main，`confirm=YES`）同步到 CF Worker。

### 5.3 管理员账号（admin 面板）
1. 生成强随机口令（建议 20+ 位，大小写+数字+符号）。
2. **状态：`SESSION_SECRET`、`ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 均已配置**；后两项于 2026-08-30 由管理员更新 GH Secrets，同步 Worker 后通过只读生产冒烟。
3. 轮换：`gh secret set ADMIN_USERNAME` / `gh secret set ADMIN_PASSWORD`，然后手动运行 `configure-worker-secrets`（confirm 填 YES），最后运行 `Production Smoke`。

### 5.4 SMTP 告警（复用现有邮箱）
1. **状态：已全部配置到 CF Worker（2026-08-29）**：`SMTP_HOST=smtp.yeah.net`、`SMTP_PORT=465`、`SMTP_USER=j_nify@yeah.net`、`SMTP_AUTH=<yeah.net 客户端授权码>`，经 `configure-worker-secrets` 工作流从 GH Secrets 同步，已 `wrangler secret list` 验证。
2. 后端告警邮件实现统一读取 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_AUTH`。

### 5.5 提交到台账
上述新增 secret 名称统一登记到 `docs/devops/SECRETS_REGISTRY.md`（已完成 2026-08-29），真值不落库。

### 5.6 凭据同步工作流（权威）
`.github/workflows/configure-worker-secrets.yml`（main，2026-08-30 最近执行成功）：手动触发（confirm 填 YES），把 GH Actions Secrets 中的 `SMTP_HOST/PORT/USER/AUTH`、`SESSION_SECRET`、以及（若已配置）`ADMIN_USERNAME/ADMIN_PASSWORD/GH_PAT/TIANDITU_KEY` 同步为 CF Worker secrets，并以 `wrangler secret list` 验证。真值不落库、不写入日志（GitHub 自动掩码）。
> 注：早期特性分支 `chore/sync-worker-secrets` 上的同名工作流已废弃（功能并入 main 的 `configure-worker-secrets.yml`）。

---

## 六、待确认的少量解释（若与你的本意不符请指出）

1. Q6「同 4，先不做」：按 Q4 定案解释为 **系统日历本期接入**，第三方 OAuth 日历源不接；若你本意是系统日历也本期不做，请告知（影响 App 模块范围）。
2. Q1「采用备选方案」：按"完全无限制（仅安静时段+去重），Jennifer 动态管理频率"实施。
3. 天气源选择 OpenWeather（免费计划商用允许+署名）；如你更倾向国内源（和风），其免费订阅商用条款不清晰，需另行确认后切换（架构已做 provider 抽象，切换成本低）。
