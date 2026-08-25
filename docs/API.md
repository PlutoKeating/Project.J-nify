# API 文档

基于 SPEC §7.2 的 API 草案实现。完整 OpenAPI/Swagger 见后端 `/docs`（FastAPI 自动生成）。

所有接口的 base path 为 `/v1`。鉴权为 scaffold 占位：默认使用 `X-User-Id` 请求头（缺省为演示用户）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/items/capture` | 一句话 / 分享 / 语音转写录入 |
| GET | `/v1/now` | 返回当前唯一 best window 或空态 |
| POST | `/v1/items/{id}/decision` | `do / later / drop / rescue` |
| GET | `/v1/items?status=` | 全部事项列表（可选按状态过滤） |
| POST | `/v1/signals` | 端侧信号批量上报，受 privacy scope 限制 |
| GET | `/v1/guardrails` | 安静时段 / 授权 / 提醒预算 |
| PUT | `/v1/guardrails` | 更新护栏 |
| DELETE | `/v1/me/data` | 可验证删除 |
| POST | `/v1/llm/draft` | 仅生成草稿，不直接执行真实动作 |

## 示例

### 录入

```sh
curl -X POST http://localhost:8000/v1/items/capture \
  -H 'Content-Type: application/json' \
  -d '{"raw_text":"月底还信用卡账单","category":"bill","due_at":"2026-09-25T00:00:00"}'
```

### 获取当前最佳窗口

```sh
curl http://localhost:8000/v1/now
```

### 决策（三选项闭环）

```sh
curl -X POST http://localhost:8000/v1/items/<id>/decision \
  -H 'Content-Type: application/json' \
  -d '{"decision":"now"}'
```
