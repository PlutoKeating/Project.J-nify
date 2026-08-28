# API 文档

基于 SPEC §7.2 的 API 草案实现于 Cloudflare Worker 后端。生产 Base URL：**`https://jnify.williamhvollita.dpdns.org`**（本地开发 `http://localhost:8787`，`wrangler dev`）。

所有接口 base path 为 `/v1`。**鉴权**：`Authorization: Bearer <Supabase Auth JWT>`（邮箱注册/登录后由 supabase_flutter 取得）；缺失/无效 → `401 {"detail":"unauthorized"}`。错误统一 `{"detail":"<msg>"}`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/items/capture` | 一句话 / 分享 / 语音转写录入 → parked |
| GET | `/v1/now` | 返回当前唯一 best window（含 reason/fit/options）或空态 |
| POST | `/v1/items/{id}/decision` | `now / later / drop / rescue`（响应含中文 message） |
| GET | `/v1/items?status=` | 全部事项列表（可选按状态过滤） |
| POST | `/v1/signals` | 端侧信号上报，受 privacy scope 限制（403） |
| GET | `/v1/guardrails` | 安静时段 / 授权 / 提醒预算 |
| PUT | `/v1/guardrails` | 更新护栏（持久化到 user_preferences） |
| DELETE | `/v1/me/data` | 可验证删除（级联清空业务数据） |
| POST | `/v1/llm/draft` | 草稿生成（当前模板降级 stub） |
| GET | `/v1/me/profile` | 当前用户资料（`{ id, nickname }`；昵称来自 `users` 表，可空） |
| PUT | `/v1/me/profile` | 更新昵称（用户名，**非唯一**）：`{ nickname }`，空/超 64 字符 → 400 |
| GET | `/health` | 健康检查 |

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