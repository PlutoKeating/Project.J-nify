# API 文档

基于 SPEC §7.2 的 API 草案实现于 Cloudflare Worker 后端。生产 Base URL：**`https://jnify.williamhvollita.dpdns.org`**（本地开发 `http://localhost:8787`，`wrangler dev`）。

所有接口 base path 为 `/v1`。**鉴权**：`Authorization: Bearer <Supabase Auth JWT>`（邮箱注册/登录后由 supabase_flutter 取得）；缺失/无效 → `401 {"detail":"unauthorized"}`。错误统一 `{"detail":"<msg>"}`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/items/capture` | 一句话 / 分享 / 语音转写录入 → parked |
| PATCH | `/v1/items/{id}` | 编辑标题/类目/期限/预计耗时；`muted: true`=「别再提」一次生效 |
| DELETE | `/v1/items/{id}` | 彻底删除（硬删，需用户二次确认） |
| GET | `/v1/now` | 返回当前唯一 best window（含 reason/fit/options）或空态 |
| POST | `/v1/items/{id}/decision` | `now / later / drop / rescue`（响应含中文 message） |
| GET | `/v1/items?status=` | 全部事项列表（可选按状态过滤） |
| POST | `/v1/signals` | 端侧信号上报，受 privacy scope 限制（403） |
| GET | `/v1/guardrails` | 安静时段 / 授权 / 提醒预算 |
| PUT | `/v1/guardrails` | 更新护栏（持久化到 user_preferences） |
| DELETE | `/v1/me/data` | 可验证删除（级联清空业务数据 + **删除 Supabase Auth 账户**，彻底注销） |
| POST | `/v1/llm/draft` | 草稿生成（当前模板降级 stub） |
| GET | `/v1/me/profile` | 当前用户资料（`{ id, nickname }`；昵称来自 `users` 表，可空） |
| PUT | `/v1/me/profile` | 更新昵称（用户名，**非唯一**）：`{ nickname }`，空/超 64 字符 → 400 |
| PUT | `/v1/me/timezone` | 更新用户时区（IANA，如 `Asia/Shanghai`）；静默时段按该时区计算 |
| POST | `/v1/jennifer/chat` | 与 Jennifer 对话：`{ message, history? }` → 自然语言事项 CRUD / 节奏策略 / 草稿，返回 `{ reply, toolResults, degraded }` |
| POST | `/v1/metrics/events` | 匿名指标事件：`event_type ∈ capture/nudge_sent/nudge_opened/decision/rescue_action/complaint`（不含事项内容） |
| GET | `/health` | 健康检查 |

### Admin 面板（浏览器 `/admin`，管理员登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/admin/api/login` | 登录（CF 环境变量 `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`SESSION_SECRET`，签名 session cookie） |
| GET | `/admin/api/session` | 会话状态 |
| GET/PUT | `/admin/api/config/llm` | LLM 多 provider 配置（baseUrl/多 key/多模型/优先级/超时），保存即热加载 |
| GET | `/admin/api/models/providers` | models.dev 动态模型列表（公开 API） |
| GET | `/admin/api/models/provider/{id}` | 某 provider 的模型列表 |
| GET/PUT | `/admin/api/config/alerts` | 告警阈值（投诉率/降级率/收件邮箱） |
| POST | `/admin/api/alerts/test` | 测试告警（GitHub Issues + SMTP 双通道） |
| GET | `/admin/api/metrics/closure?days=N` | 闭环率看板（72h 内 done/deferred/abandoned/rescued 比例） |
| GET | `/admin` | 管理面板 SPA |

> 频控口径（Q1 定案）：**无硬编码提醒次数上限**；仅保留安静时段（按用户时区）与窗口级 nudge 去重；频率管理由 Jennifer agent 通过节奏策略（`rhythm_policies`）动态决定。

## 示例（生产 URL）

### 录入

```sh
curl -X POST https://jnify.williamhvollita.dpdns.org/v1/items/capture \
  -H "Authorization: Bearer <JWT>" -H 'Content-Type: application/json' \
  -d '{"raw_text":"月底还信用卡账单","category":"bill","due_at":"2026-09-25T00:00:00"}'
```

### 获取当前最佳窗口

```sh
curl https://jnify.williamhvollita.dpdns.org/v1/now -H "Authorization: Bearer <JWT>"
```

### 决策（三选项 + 兜底）

```sh
curl -X POST https://jnify.williamhvollita.dpdns.org/v1/items/<id>/decision \
  -H "Authorization: Bearer <JWT>" -H 'Content-Type: application/json' \
  -d '{"decision":"later"}'
```

> 说明：决策文案由后端返回（`message`），前端 Toast 直接展示；`decision` 取值统一 `now/later/drop/rescue`（`do` 为旧文档笔误，已废弃）。
> 鉴权：Worker 用 jose 从 Supabase JWKS 验签；数据访问在 Worker 内以 service key 走 PostgREST —— **客户端不需要也拿不到 service key**。
