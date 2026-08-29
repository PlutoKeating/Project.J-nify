# Jennifer Agent 设计与实现需求汇报与现状记录

> 记录时间：2026-08-29（v0.2.0 发布日）
> 范围：Jennifer agent（`/v1/jennifer/chat`）当前的设计与实现现状——LLM 调用构建、system prompt 组成、记忆设计、上下文取舍、前端对话入口与会话管理、人格设定修改途径、用户特殊设定/永久记忆现状，以及 2026-08-29 生产链路实测记录。
> 关联：`docs/ARCHITECTURE.md`（系统架构）、`docs/DECISION_REGISTER.md`（P2/P3/B6/B8/C1/C2 等定案）、`docs/API.md`（`POST /v1/jennifer/chat`）、`docs/compose/reports/2026-08-29-v020-release.md`（v0.2.0 验收报告）。

---

## 一、链路总览

```text
[ Flutter ChatScreen（frontend/lib/screens/chat_screen.dart）]
    │  POST /v1/jennifer/chat  { message, history(≤12 条, role=user/assistant) }
    ▼
[ backend/src/routes/jennifer.ts ]
    │  身份：Supabase JWT → userId（无会话 id、服务端无状态）
    ▼
[ backend/src/services/agent.ts · runAgent(db, userId, message, history) ]
    │  1. 读 LLM 配置（system_config.llm，热加载）
    │  2. 组装 messages = [system] + history + [user]
    │  3. 循环（≤ maxToolIterations 轮）：
    │     └→ callLlm → 按 order 条目/provider key 依次尝试 → chatOpenAI
    │     └→ 有 tool_calls → 执行 TOOL_REGISTRY → role=tool 回填 → 下一轮
    │     └→ 无 tool_calls → 返回文本回复
    ▼
[ backend/src/lib/llm.ts · callLlm / callLlmWithConfig / chatOpenAI ]
    │  POST {baseUrl}/chat/completions
    │  body: { model, messages, tools: TOOL_DEFS(9 个), tool_choice: "auto",
    │         temperature: 0.6, max_tokens: 1200 }
    │  timeout: 30s（AbortSignal.timeout）
    ▼
[ 外部 OpenAI 兼容服务（admin 配置的 provider，如 OpenRouter / OpenCode Go）]
```

## 二、LLM 调用构建方式

### 2.1 入口与消息组装（`services/agent.ts`）

`POST /v1/jennifer/chat` 由 `routes/jennifer.ts` 接收，body 为 `{ message, history }`，历史最多截取 12 条：

```ts
const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
const out = await runAgent(db, userId, message, history);
```

`runAgent` 组装 messages：

```ts
messages = [
  { role: 'system', content: buildSystemPrompt(new Date(), timezone) },  // 人设 + 当前日期/时区
  ...history,                                                            // 客户端携带的 user/assistant 文本，≤12 条
  { role: 'user', content: userMessage },
]
```

### 2.2 调用与失败切换（`lib/llm.ts`）

- `callLlm(db, ...)` → `loadLlmConfig(db)`（`system_config.llm`，TTL 缓存 + admin PUT 主动失效）→ `callLlmWithConfig(cfg, ...)`。
- 尝试顺序 = 配置的 `order` 数组，元素为 **`providerID/modelID` 复合条目**（v0.2.0 起，兼容旧纯 provider id）。
- 单个条目内按该 provider 的 `apiKeys` 数组轮换 key；`HTTP 非 2xx / 超时 / 空完成` 均记为失败，切换到下一个条目。
- 全部失败 → 抛出聚合错误，`runAgent` 返回降级文案（`degraded: true`）：
  > "Jennifer 暂时无法连接智能服务（…）。请管理员在后台完成 LLM 配置后重试；您的数据没有丢失。"
- **空完成处理（2026-08-29 修复）**：返回内容为空且无工具调用时视为该条目失败（`assertNonEmpty`），继续尝试下一个条目，杜绝"好的，已记下。"式假确认。

### 2.3 工具循环（agent harness）

- 工具定义 `TOOL_DEFS` 共 **9 个**：`items_list / items_get / items_create / items_update / items_delete / rhythm_get / rhythm_set / guardrails_get / draft_generate`（MCP 风格 JSON Schema，`type: 'function'`）。
- 工具执行 `TOOL_REGISTRY`：解析 `tool_calls[].arguments` JSON → 调用对应 handler（读写 Supabase）→ 结果以 `{ role: 'tool', content: JSON.stringify(result), tool_call_id }` 回填 messages → 下一轮。
- 循环上限 = `maxToolIterations`（生产配置 12 轮）；超出返回"步骤较多，请再说一次"（degraded）。
- `draft_generate` 目前是**模板降级实现**（非 LLM 生成），返回 `degraded: true`。

### 2.4 请求参数

| 参数 | 值 | 说明 |
| --- | --- | --- |
| `model` | order 条目中的 model id | 如 `nvidia/nemotron-3-ultra-550b-a55b:free` |
| `messages` | system + history + user（工具循环中追加 assistant/tool） | 见 2.1/2.3 |
| `tools` | 9 个工具 JSON Schema | 每次请求都携带 |
| `tool_choice` | `"auto"` | 模型自主决定 |
| `temperature` | `0.6` | 固定 |
| `max_tokens` | `1200` | 单次输出上限 |
| 超时 | `timeoutMs`（生产 30s） | 单次调用 |

## 三、System Prompt 组成

`SYSTEM_PROMPT` 为代码常量（`services/agent.ts`），`buildSystemPrompt(now, timezone)` 在其后追加**当前时间上下文**。共 5 部分：

1. **人设与口号**：你是 Jennifer，J-nify 的低打扰行动秘书，一位懂 P 人的 J 人助理。品牌口号：「不急，但我帮您盯着。」
2. **行为准则（5 条）**：
   - 不命令、不羞辱（禁用"你必须""你又拖了"等表达）；永远给理由、给退路；
   - 每次出现都要能回答"为什么是现在"；没有真实信号依据时不得编造理由（如"您比较放松"仅在有用信号时可说）；
   - 让下一步足够小（30 秒—15 分钟），永远提供四选项：现在做 / 晚点换个窗口 / 这件事算了 / 帮我兜底；
   - 涉及真实动作（付款、外发、下单）必须二次确认；只能生成草稿与清单，无真实外部执行权限；
   - 提醒节奏、冷却、窗口理由、兜底方式由 agent 自主决定并通过工具（`rhythm_set` 等）管理，系统不强制模板。
3. **话术参考（5 条，标注"仅供参考，非强制模板"）**：录入后 / 窗口出现 / 晚点 / 算了 / 兜底。
4. **收尾约束**：可用工具对用户事项完整增删改查与统筹；用简体中文、简洁、像秘书而非机器人。
5. **【新增，2026-08-29】当前时间上下文**：`今天是 YYYY-MM-DD（用户时区：{tz}）`；涉及"今天/明天/这周/月底"等相对时间时必须按当前日期计算，**不得使用训练数据中的年份**。

> 注：昵称、头像、用户画像、事项概览等均**未**注入 prompt（见 §六）。

## 四、Memory 设计（现状：无长期记忆）

- **没有**记忆表、向量库、会话存储或 embedding。
- 当前"记忆"= **数据库状态**（`item_commitments` / `rhythm_policies` / `guardrails`），通过工具按需读取，不主动注入 prompt。
- 对话历史由客户端每轮携带（仅 user/assistant 文本），服务端无状态、不落库。
- 节奏策略（`rhythm_policies`，默认见 `services/rhythm.ts`：账单 10/3 天、退货 3/5/1 天、作业 10/5/3 天、无死线冷却 72h）是当前唯一"可被 agent 写入的长期状态"。

## 五、上下文取舍

| 维度 | 现状 |
| --- | --- |
| 对话历史 | 客户端每轮上传；后端 `slice(-12)`；仅 role/content，不含工具中间过程 |
| Token 预算 | 无全局预算管理；单次输出上限 1200 tokens |
| 检索/RAG | 无；不注入事项摘要、护栏、时区之外的用户数据 |
| 按需取数 | 全部依赖工具调用（items/rhythm/guardrails） |
| 时间上下文 | v0.2.0 起注入当前日期 + 用户时区（`getTimezone`，失败回退 UTC） |

## 六、对话前端位置与会话管理

### 6.1 前端入口

- 对话界面：`frontend/lib/screens/chat_screen.dart` 的 `ChatScreen`，由「现在」页右上角进入（`now_screen.dart`）。
- 消息列表 `_messages` 为 StatefulWidget **内存态**，初始问候语硬编码。
- 发送：`ApiService.chat(message, history)` → `POST /v1/jennifer/chat` → 一次性返回 `{ reply, toolResults, degraded }`，追加到列表。
- **无流式输出、无持久化**（退出/刷新即丢失）。

### 6.2 会话管理机制（现状：无）

- 无 conversation/session id；后端无状态；身份仅由 Supabase JWT 解析出的 `userId` 承担。
- 连续对话依赖客户端持续携带历史；任何一端重启即断。

## 七、人格设定修改途径（现状：仅代码）

- 唯一途径：修改 `services/agent.ts` 的 `SYSTEM_PROMPT` 常量（及 `buildSystemPrompt`）→ 部署 Worker 后对所有用户生效。
- **无** admin UI 配置、**无** `system_config` 覆盖、**无**多人格/多模型人格分流。

## 八、注入的人格设定文件 / 用户特殊设定 / 永久记忆（现状：均无）

- 无 persona 文件或模板目录；
- 无 per-user special 指令/设定表；
- 无用户永久记忆（用户昵称 `users.nickname` 等资料存在，但**未**注入 prompt）；
- 当前唯一"用户相关"输入 = 对话历史 + 工具读取的数据库数据。

## 九、生产链路实测记录（2026-08-29）

### 9.1 生产配置快照

`system_config.llm`（version 2）：`timeoutMs=30000`，`maxToolIterations=12`，order 共 8 条：

```text
opencode-go/gpt-5.6-luna
opencode-go/muse-spark-1.2-contributor
opencode-go/grok-4.6
openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
openrouter/z-ai/glm-5.2:free
openrouter/nvidia/nemotron-3-super-120b-a12b:free
openrouter/minimax/minimax-m3:free
openrouter/thinkingmachines/inkling:free
```

### 9.2 实测样例（"帮我记一下：月底前把房租转给房东，大概要 15 分钟。"）

- 链路可通：最终经 `openrouter / nvidia/nemotron-3-ultra-550b-a55b:free` 返回 `items_create` 工具调用：
  `{"title":"把房租转给房东","category":"bill","est_minutes":15,"due_at":"2025-08-31T23:59:59+08:00"}`。
- ⚠️ **实测发现 due_at 年份幻觉成 2025**（当前 2026）→ 触发日期注入修复（§三.5）。
- ⚠️ 同模型另一次调用返回**空完成**（无文本、无工具）→ 触发空完成切换修复（§二.2）。

### 9.3 逐条目诊断

| order 条目 | 结果 |
| --- | --- |
| opencode-go/gpt-5.6-luna | ❌ 429（GoUsageLimitError：周配额达上限） |
| opencode-go/muse-spark-1.2-contributor | ❌ 429（同上） |
| opencode-go/grok-4.6 | ❌ 401（ModelError：模型不支持该格式） |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | ✅ 可用（tools=1） |
| openrouter/z-ai/glm-5.2:free | ❌ 429（Provider returned error） |
| openrouter/nvidia/nemotron-3-super-120b-a12b:free | ✅ 可用（tools=1） |
| openrouter/minimax/minimax-m3:free | ✅ 可用（返回文本 + 工具） |
| openrouter/thinkingmachines/inkling:free | ❌ 403（仅限 agentic 平台） |

> 建议：admin 中把可用模型（minimax-m3 / nemotron 系列）前移，删除或后置 opencode-go 失效条目（配置操作，无需改代码）。

## 十、2026-08-29 已实施的修复

| # | 修复 | 影响 |
| --- | --- | --- |
| ① | system prompt 注入当前日期 + 用户时区（`buildSystemPrompt`） | 消除相对时间年份幻觉；时区读取失败回退 UTC 不阻塞 |
| ② | LLM 空完成视为失败，继续切换下一 order 条目（`assertNonEmpty`） | 杜绝"好的，已记下。"假确认 |
| ③ | order 支持 `providerID/modelID` 复合条目 + 停用 provider 保留（`normalizeLlmConfig`/`callLlmWithConfig`） | admin 模型级尝试顺序真正生效 |

验证：`npm run typecheck` 全绿；`npm test` 74 passed / 5 skipped（含 `agent.test.ts` 日期注入、`llm-config.test.ts` 空完成切换等用例）。

## 十一、现状缺口与 M2 建议（决策点，待拍板）

| 缺口 | 现状 | M2 建议 |
| --- | --- | --- |
| 会话管理 | 无 conversation id、前端内存态、刷新即丢 | 客户端本地持久化历史（sqflite/SharedPreferences）+ 可选服务端会话表 |
| 永久记忆 | 无记忆表 | 新增 `agent_memories` 表（用户级、agent 可写、可向量化），或先用"用户备忘"表最小实现 |
| 人格配置化 | 代码常量唯一途径 | admin 增加"人格设定"配置项（system prompt 模板可编辑 + 版本化），或 `system_config` 覆盖 |
| 用户特殊设定 | 无 per-user 指令 | 新增 `users.agent_prefs`（语气/称呼/偏好类目/禁提主题）注入 prompt |
| 上下文增强 | 无事项概览/RAG | 首轮注入用户事项摘要（≤N 条）+ 护栏概要，控制 token 预算 |
| 流式输出 | 一次性返回 | 前端 SSE/流式渲染（M2） |

## 十二、相关代码与文档索引

| 内容 | 位置 |
| --- | --- |
| 对话路由 | `backend/src/routes/jennifer.ts` |
| agent harness / 工具 / system prompt | `backend/src/services/agent.ts` |
| LLM 网关（多 provider/顺序/空完成切换） | `backend/src/lib/llm.ts` |
| 节奏策略默认值 | `backend/src/services/rhythm.ts` |
| 前端对话 UI | `frontend/lib/screens/chat_screen.dart` |
| 前端对话 API | `frontend/lib/services/api_service.dart`（`chat()`） |
| 接口文档 | `docs/API.md`（`POST /v1/jennifer/chat`） |
| 决策定案 | `docs/DECISION_REGISTER.md`（P2/P3/B6/B8/C1/C2） |

---

## 十三、v0.3.0 完整实现落地记录（2026-08-29）

> 依据：`docs/compose/specs/2026-08-29-jennifer-agent-complete-spec.md`（v2 定稿，含 R0–R11 逐项定案）。

### 13.1 已落地能力（相对 §十一 缺口表）

| §十一 缺口 | v0.3.0 落地 |
| --- | --- |
| 会话管理 | 会话上下文纯客户端 sqflite 持久化（`conversation_store.dart`），服务端无状态；`session_id`/`new_session` 标志驱动记忆注入 |
| 永久记忆 | `agent_memories` 结构化表 + `memory_read/write/delete` 工具 + 编译「用户记忆文档」新会话注入；workflow 文档含记忆沉淀强制条款 |
| 人格配置化 | `agent_docs` 官方文档集（identity/workflow/tools + 任意 skill/custom md），admin 面板在线编辑、排序、启停，保存即热重载 |
| 用户特殊设定 | 用户记忆文档（偏好/事实/事件/经验）随新会话注入 system prompt |
| 上下文增强 | chat 请求 `context`（设备本地数据完整原文，MCP 风格）+ history role 白名单；首轮不再注入事项概览（保持按需取数，预算可控） |
| 流式输出 | SSE（start/tool/delta/done/error）+ 前端增量渲染 + responding 占位气泡 + Markdown 渲染 |
| 数据改动可感知 | `agent_action_logs` + `POST /v1/jennifer/undo`；前端改动卡片 + 一键撤销（活跃会话内，纯前端，不入库、不进上下文） |
| 告警自动评估 | 维持手动测试通道（R6）；`agent_call_logs` 已落库供成本/降级看板 |

### 13.2 新增工具（TOOL_DEFS 现为 15 个）

`guardrails_set`（写护栏）、`feedback_read`（决策/投诉聚合）、`steps_get/steps_set`（拆解）、`memory_read/memory_write/memory_delete`（记忆）、`draft_generate`（LLM 化，kind 含 breakdown）；`items_delete` 增加 `confirm` 二次确认语义；`items_create` 移除硬编码 `escalation_policies.max_nudges=3`。

### 13.3 新增端点

`POST /v1/jennifer/undo`、`GET /v1/rhythm`；admin：`/api/docs*`、`/api/memories*`、`/api/playground`、`/api/costs`；chat 请求扩展 `context/session_id/new_session/stream`。

### 13.4 验证

- 后端：`npm run typecheck` 全绿；`npm test` **79 passed / 5 skipped**（新增 agent-full.test.ts：文档装配顺序、记忆分区编译、历史白名单全链路、热重载失效等）；
- 前端：`flutter analyze` 0 issues；`flutter test` 11 passed；
- 官网：`npm run build` 通过；21 tests 通过。
