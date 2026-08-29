# Jennifer Agent 完整实现需求 Spec（v2 定稿）

> 记录时间：2026-08-29
> 范围：Jennifer agent（`/v1/jennifer/chat` 及其周边）从「现状 harness」升级为**完整实现**的需求规格——官方文档集与 system prompt 装配、MCP 风格上下文原文、结构化记忆与用户记忆文档、客户端会话、流式输出、数据改动卡片与一键撤销、admin 管理面扩展、可观测与成本。
> 依据：`docs/DECISION_REGISTER.md`（P2/P3/Q7/Q13/Q14/Q15 等定案）、`docs/JENNIFER_AGENT_REPORT.md`（现状与缺口）、2026-08-29 与用户的逐项沟通定案（本文 §0 决策记录）。
> 状态：**已定案（需求层面），待实施**。实施时以本文档为准；与旧文档冲突处以本文档 + DECISION_REGISTER 为准。

---

## 0. 本次沟通定案记录（2026-08-29）

| # | 定案 |
| --- | --- |
| R0 | **官方文档集**：identity 人设文档、agents 工作流程规范文档、tools 工具与使用规范及能力表述文档，至少这三份可在 admin 面板编辑；admin 可增删任意命名 md 文档或接入任何 skill 文档；全部文档统一拼接，用户会话首次灌入 system prompt；admin 保存后**立即热重载**到运行中后端实例 |
| R1 | 当 Jennifer 需要读取现有日程等数据、处理用户消息时，原始记录虽不入数据库，但**完整原文拼接进 LLM call prompt**（标准 agent MCP 实现语义） |
| R2 | 日程数据来源按推荐假设：本地日历空闲时段由客户端随 chat `context` 上送，服务端瞬态使用、不落库 |
| R3 | 记忆采用**结构化记忆** |
| R4 | 会话上下文**纯客户端**保存、不入数据库；会话中应沉淀的内容由 Jennifer **主动识别并调用 MCP 工具**写入/修改用户偏好与持久记忆文档；workflow 文档必须包含该要求表述；用户记忆文档保存于**当前用户账户名下**的数据库位置，作为 system prompt 的一部分，**每轮新会话开始时随官方文档集一起注入一次** |
| R5 | 流式输出必须做；修复 App 两处交互问题：Markdown 未正确渲染、发送后未立即出现 responding 占位气泡 |
| R6 | 告警自动评估维持现状（手动测试通道），低优先级，本期不做 |
| R7 | 数据改动二次确认按推荐方案：改节奏等低风险操作即时生效，硬删必须 agent 二次确认；**所有实际数据改动生效后**，改动涉及范围的事项以**卡片组件**显示在会话界面，卡片带**一键撤销**按钮 |
| R8 | admin 面板扩展全部做（文档管理 / 记忆管理 / LLM playground / 成本与降级看板），以 R0 的文档集机制为统一入口 |
| R9 | 卡片**仅活跃会话内展示、纯前端实现**：不注入 LLM 上下文、不保存到消息记录；退出 App 或开启新会话后卡片不可用（撤销入口随卡片消失） |
| R10 | MCP 语义按自研「MCP 风格」继续，不引入外部 MCP 运行时/协议栈；工具结果与 context 原文进 prompt 做到位 |
| R11 | skill 文档接入方式：admin 在面板粘贴 md 内容（本期），不做 GitHub/本地路径读取 |

---

## 1. 目标与原则

### 1.1 目标

把 Jennifer 从「工具调用循环 + 硬编码 system prompt」升级为：

1. **官方文档集驱动**：人设、工作流程、工具能力表述全部可由 admin 在线编辑并热重载；
2. **MCP 风格上下文**：本地数据原文以瞬态 context 完整拼入 LLM prompt，不入库；
3. **结构化记忆 + 用户记忆文档**：Jennifer 主动沉淀，新会话注入；
4. **完整对话体验**：客户端持久化会话、SSE 流式、Markdown 渲染、responding 占位；
5. **数据改动可感知、可撤销**：改动卡片 + 一键撤销（活跃会话内）；
6. **管理面完整**：文档、记忆、playground、成本/降级看板。

### 1.2 原则（沿用定案，不因本 spec 改变）

- **P2**：提醒节奏、冷却、理由、兜底由 agent 决定并写入策略；系统不硬编码模板与上限。
- **P3**：原始信号（屏幕使用/日历内容/精确位置/天气上下文）只在本地处理、不上传；事项/决策上云。
- **R10**：自研 MCP 风格 harness，不引外部 MCP 运行时。
- **R6**：告警自动评估本期不做，仅保留 admin 手动测试通道。
- **真实性红线**：无真实信号依据不得编造"为什么是现在"；窗口理由由本地确定性引擎生成，LLM 只做解释与话术。

---

## 2. 官方文档集（agent_docs）与 system prompt 装配

### 2.1 数据模型

新增迁移 `backend/supabase/migrations/<ts>_jennifer_docs_memory_stream.sql`：

```sql
create table if not exists public.agent_docs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,              -- 文档名（如 identity / workflow / tools / 自定义名）
  kind text not null default 'custom',    -- identity | workflow | tools | skill | custom
  content text not null,                  -- Markdown 全文
  enabled boolean not null default true,
  sort_order integer not null default 0,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.agent_docs enable row level security;
```

RLS 与既有表一致：仅 service_role 可读写；客户端零访问。文档读写全部经 admin API（service key）。

### 2.2 出厂三件套（默认内容要点）

| 文档 | kind | 内容要点 |
| --- | --- | --- |
| identity | identity | 品牌人设：Jennifer 是 J-nify 的低打扰行动秘书、懂 P 人的 J 人助理；品牌口号「不急，但我帮您盯着。」；性格边界（不命令不羞辱、给理由给退路）；现状 `SYSTEM_PROMPT` 人设段落迁移至此 |
| workflow | workflow | 行为准则（五条，迁移现状）+ **记忆沉淀强制条款**（R4：会话中遇到应沉淀的用户偏好/事实/事件/经验，必须主动调用 `memory_write` 写入当前用户记忆文档）+ 真实动作二次确认规则 + 数据改动与撤销语义 + 降级处理（无 LLM 时诚实报错） |
| tools | tools | 全部工具的能力表述与使用规范：每个工具的用途、参数约束、适用场景、不可用时的处理；**基线由代码 `TOOL_DEFS` 生成**，admin 可编辑覆盖描述文本 |

### 2.3 system prompt 装配

服务端编译顺序（`buildSystemPrompt` 升级为 `buildSystemPrompt(db, userId, { now, timezone, session })`）：

```text
[identity 文档]
[workflow 文档]
[tools 文档]
[其他 custom/skill 文档，按 sort_order 升序]
[当前时间上下文：日期 + 用户时区]
[用户记忆文档 —— 仅 new_session=true 时注入]
```

约束：

- 官方文档集（identity+workflow+tools+custom/skill）默认预算 ≤ 6000 tokens；用户记忆文档默认 ≤ 2000 tokens（超限按 salience 截断分区）；
- `context` 原文（§3）不在此预算内，单独 4KB 上限；
- **可执行工具注册表仍是代码**：admin 编辑的是"模型看到的工具能力描述/使用规范"文本；新增可执行工具仍需发版（R0 边界，已与用户确认）。

### 2.4 热重载

- 沿用 `config-store` 模式：`agent_docs` 查询带 TTL 缓存 + 文档版本号；admin PUT/POST/DELETE 后显式失效缓存 → **保存即对运行中 Worker 生效**，无需重新部署；
- 装配结果按 `manifestVersion = max(updated_at/version)` 缓存，任何文档变更后下次请求重建 prompt。

---

## 3. 上下文与 MCP 风格数据原文

### 3.1 `POST /v1/jennifer/chat` 请求扩展

```json
{
  "message": "现在适合处理晒被子吗？",
  "history": [{ "role": "user", "content": "..." }],
  "context": {
    "calendar_free_slots": ["2026-08-30T10:00:00+08:00", "..."],
    "weather": { "condition": "clear", "wind_mps": 3.2, "city": "上海" },
    "usage": { "total_foreground_minutes": 24 },
    "active_window": { "reason_code": "weather", "reason_text": "..." }
  },
  "session_id": "uuid",
  "new_session": true,
  "stream": true
}
```

语义：

- `context` 为**瞬态只读数据**：服务端不落库、不写日志、不入 memory，格式化后以**完整原文**拼入本轮 LLM 消息（user message 之前），等价于一次 MCP 工具结果回填；
- `context` 大小上限 4KB，超限截断并标记（防止注入超大 payload）；
- `history` 做服务端白名单：role 仅允许 `user` / `assistant`，content 必须为 string，长度钳制；**拒绝 system/tool 角色注入**（修复现状 prompt injection 口子）；
- `session_id`：客户端生成的会话标识；`new_session=true` 时服务端注入用户记忆文档（R4）；
- 会话上下文**纯客户端**保存，服务端无会话表（R4）。

### 3.2 本地数据原文进 prompt 的边界

- 只上送"本次对话需要解释窗口 / 处理日程"所需的最小原文（空闲时段、天气摘要、usage 分钟数、窗口 reason），不上送精确位置、不连续上报；
- 与 P3 不冲突：数据仍在客户端持有，仅随请求内存瞬态拼入 prompt。

---

## 4. 结构化记忆与用户记忆文档

### 4.1 数据模型

```sql
create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  key text,                                -- 可选稳定键（偏好类可 upsert）
  memory_type text not null,               -- preference | fact | event | lesson
  content text not null,                   -- 结构化内容（markdown 片段/条目）
  scope text not null default 'global',    -- global | category:<cat> | item:<id>
  salience jsonb not null default '{"level": 1}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_agent_memories_user_key
  on public.agent_memories (user_id, key) where key is not null;
alter table public.agent_memories enable row level security;
```

- 存储位置：当前用户账户名下（`user_id` FK + 级联删除）——满足 R4"保存到当前用户账户名下的数据库位置"；
- 现有 `memory_notes` 表（RPC 写入决策记忆）保留，作为决策溯源；`agent_memories` 是 agent 主动维护的用户记忆，两者职责分离，不互相替代。

### 4.2 编译用户记忆文档

`buildUserMemoryDoc(db, userId)` 把该用户的结构化行渲染为 Markdown：

```text
## Jennifer 对您的了解
### 偏好
- 称呼：……
- 语气：……
### 事实
- ……
### 事件
- ……
### 经验
- ……
```

### 4.3 注入时机（R4）

- **每轮新会话开始时**（`new_session=true`），用户记忆文档随官方文档集一起注入 system prompt **一次**；
- 会话中 `memory_write` 后，当轮通过 tool result 立即可见；下一轮新会话自动包含更新；
- 会话中途的更新不重复注入（控制 token 成本）。

### 4.4 agent 记忆工具

| 工具 | 说明 |
| --- | --- |
| `memory_read` | 按 type/key/scope 读取当前用户记忆（返回结构化行或编译文档片段） |
| `memory_write` | upsert（有 key）或插入一条记忆；`expires_at` 可空 |
| `memory_delete` | 按 id 或 key 删除一条记忆 |

### 4.5 生命周期

- 低 salience / 过期记忆可在会话中由 agent 主动清理，或 admin 按用户查看/删除；
- 用户注销（`DELETE /v1/me/data`）经 FK 级联清空；
- 记忆内容属于用户数据，admin 面板提供查看与删除（R8），不提供编辑（避免绕过 agent 的职责边界）。

---

## 5. 工具集扩展

### 5.1 现状工具保留与修复

- 保留：`items_list / items_get / items_create / items_update / items_delete / rhythm_get / rhythm_set / guardrails_get / draft_generate`；
- 修复：`items_create` 移除硬编码 `escalation_policies.max_nudges=3` 写入（Q1 已删硬上限，残留不一致）；
- `items_delete` 增加 `confirm: true` 必填参数：缺省时 harness 返回"请先确认"消息，不执行（R7 二次确认语义）。

### 5.2 新增工具

| 工具 | 说明 |
| --- | --- |
| `guardrails_set` | 写安静时段 / privacy_scope（P2 的写护栏补齐；仍保留安静时段+窗口去重两道硬护栏） |
| `feedback_read` | 读取近期 decisions（now/later/drop/rescue）与 complaint 事件聚合，供 agent 依据行为动态调频（SPEC 9.4） |
| `steps_get / steps_set` | 事项拆解 `item_steps` 的读写（把大事项拆成 30 秒级小步骤） |
| `memory_read / memory_write / memory_delete` | §4.4 |
| `draft_generate`（LLM 化） | 由模板 stub 升级为真 LLM 生成：window_reason / rescue_extension / rescue_pickup / rescue_reply / greeting / 拆解；LLM 不可用时降级返回模板并 `degraded: true`（Q14） |

### 5.3 草稿分发策略（本地优先）

- **窗口理由**：保持本地确定性生成（`LocalWindowEngine.reasonText`），保证真实信号对应（真实性红线）；LLM 不做窗口裁决；
- **LLM 草稿**（兜底/拆解/话术/问候语）：经 `draft_generate` 生成；App 在需要时获取，失败回退本地模板；
- 对话内的"为什么是现在"解释：基于 `context.active_window` 原文 + 云端可见事实（deadline/节奏），不编造。

### 5.4 决策反馈闭环

`feedback_read` + `rhythm_set` 联动：agent 观察到连续 later / complaint 时，主动调整该类目节奏（降频/加冷却），写入 `rhythm_policies` 并返回改动卡片（§6）。

---

## 6. 数据改动留痕、卡片与一键撤销

### 6.1 `agent_action_logs` 表

```sql
create table if not exists public.agent_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id text,
  tool text not null,
  args jsonb,
  before jsonb,          -- 变更前快照（delete 时为完整行）
  after jsonb,           -- 变更后快照
  status text not null default 'applied',  -- applied | reverted | expired
  created_at timestamptz not null default now(),
  reverted_at timestamptz
);
alter table public.agent_action_logs enable row level security;
```

- 每次**实际数据改动**（items 增删改、rhythm_set、guardrails_set、memory 写、steps 写）落一行；
- 服务端保留期默认 24h（可配置）；无 cron，采用访问时惰性过期判断 + admin 手动清理入口。

### 6.2 `POST /v1/jennifer/undo`

```json
{ "action_id": "uuid" }
```

逆操作映射：

| 工具 | 撤销动作 |
| --- | --- |
| items_create | 删除该事项（级联清理） |
| items_update | 按 `before` 还原字段 |
| items_delete | 按 `before` 快照重建（保留原 id；子表数据无法还原时在卡片提示） |
| rhythm_set | 还原 `before` 策略 |
| guardrails_set | 还原 `before` 护栏 |
| memory_write | 删除该条记忆 / 还原 before |
| steps_set | 还原 steps 快照 |

响应：`{ ok, reverted, tool, detail? }`。

### 6.3 前端卡片（R9 定案：纯前端、活跃会话内）

- 每次 chat 响应的 `toolResults` 若含数据改动，前端在**内存态**渲染事项卡片（标题/类目/期限/状态）或策略卡片（类目 + 新节奏），卡片带**一键撤销**按钮；
- 撤销调用 `POST /v1/jennifer/undo`；成功即从界面移除卡片并 Toast 提示；
- 卡片**不注入 LLM 上下文、不写入 sqflite 消息记录**（消息持久化只存 user/assistant 文本）；
- **退出 App 或开启新会话后卡片消失、撤销入口不可用**（服务端 action 行仍在保留期内，但无入口）；
- 硬删在执行前 agent 先询问确认；确认后的删除同样产生可撤销卡片。

---

## 7. 流式输出与前端 UI

### 7.1 SSE 协议

`POST /v1/jennifer/chat` 支持 `stream: true`（或独立 `/v1/jennifer/chat/stream`），响应 `text/event-stream`：

```text
event: start
data: {"session_id":"...","ts":"..."}

event: tool
data: {"name":"items_create","status":"started"}

event: tool
data: {"name":"items_create","status":"done","action_id":"..."}

event: delta
data: {"text":"记下了："}

event: done
data: {"reply":"...","toolResults":[...],"degraded":false}

event: error
data: {"detail":"..."}
```

- 工具循环阶段发 `tool` 进度事件；**仅最终 LLM 文本走 token 流**（`delta`）；
- 多 provider 故障切换不受影响：工具循环内失败切换发生在任何文本流之前；
- 30s 超时仍适用单次 LLM 调用；SSE 连接整体超时按配置放宽（如 120s）。

### 7.2 前端

- **responding 占位气泡**：发送后立即插入 assistant 占位气泡（动画 dots），首 token 到达后原位增量渲染；
- **Markdown 渲染**：接入 `flutter_markdown`，assistant 消息按 Markdown 渲染（修复现状纯 Text 显示）；
- 消息持久化（sqflite）只存 `{conversation_id, role, content}` 文本；占位气泡与卡片不持久化；
- 新会话时生成 `session_id` 并置 `new_session=true`，随首条消息上送。

---

## 8. admin 面板扩展（R8，全部做）

| 区块 | 能力 |
| --- | --- |
| 文档管理 | identity/workflow/tools 三件套编辑；新建/删除任意命名 md；skill 文档粘贴导入（R11）；启停、排序、版本号展示；**保存即热重载** |
| 记忆管理 | 按用户查看 `agent_memories`；删除（不提供编辑）；过期/低 salience 清理入口 |
| LLM playground | 输入消息 + 可选 context/会话标志 → 展示装配后的 system prompt、工具链执行过程、耗时、tokens、最终回复；支持流式预览 |
| 成本/降级看板 | 基于 `agent_call_logs` 按日/provider/model 聚合：调用量、成功率、降级率、耗时、tokens |
| 对话调试 | playground 内模拟（服务端无会话落库，不提供历史回放） |

新增 admin API：

```text
GET/POST/PUT/DELETE /admin/api/docs
PUT    /admin/api/docs/reorder
GET    /admin/api/memories?user_id=
DELETE /admin/api/memories/:id
POST   /admin/api/playground
GET    /admin/api/costs?days=
```

---

## 9. 可观测与成本

### 9.1 `agent_call_logs` 表

```sql
create table if not exists public.agent_call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id text,
  provider text,
  model text,
  ok boolean not null default true,
  degraded boolean not null default false,
  latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  error text,
  created_at timestamptz not null default now()
);
alter table public.agent_call_logs enable row level security;
```

- 每次 LLM 调用（含失败/切换）记一行；用于成本看板、降级率、耗时分析；
- **本期不做自动告警评估**（R6），但数据照常落库，后续接 cron 即可复用。

### 9.2 成本治理

- 先记录、可视化，不硬限额；
- 后续（P2 后期）再做 per-user/per-day 配额与免费模型优先策略，均可在 admin 配置。

---

## 10. 后端工程与安全

- **chat 独立限流**：`/v1/jennifer/chat` 与普通端点分离限流（如 10 次/分/用户），防止 LLM 预算被刷；
- **token 预算管理**：装配后的 system prompt + history + context 总量钳制（§2.3/§3.1），超限截断并告警日志；
- **history/context 白名单**：role 枚举 + 类型 + 长度校验（修复 prompt injection 口子）；
- **审计**：agent 工具动作接入 `audit.ts` 日志（action/tool/userId/result）；
- **密钥存储**：admin 配置的 provider API key 仍存 `system_config`（RLS + service key 保护），记录风险与后续可选加密方案，本期不阻塞。

---

## 11. 前端会话与数据

### 11.1 sqflite schema（仅文本消息）

```sql
conversations(id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER)
messages(id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, role TEXT, content TEXT, created_at INTEGER)
```

- 只存 user/assistant 文本；toolResults/卡片/占位气泡不落库（R9）；
- 服务端无状态，会话恢复 = 客户端重传 history + 原 session_id（`new_session=false`）。

### 11.2 本地执行层消费策略（补齐现状断点）

- 新增 `GET /v1/rhythm`（按类目返回当前用户 `rhythm_policies`）；
- `JenniferLocalEngine` 启动/同步时拉取，`LocalWindowEngine` 按类目传入真实 `dueOffsets/cooldownHours`，替换现状硬编码 `RhythmPolicy(dueOffsets: [], cooldownHours: 72)`；
- 这样 agent 写的节奏才真正影响本地提醒（P2 生效）。

---

## 12. API 变更清单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/jennifer/chat` | 扩展：`context` / `session_id` / `new_session` / `stream`；响应支持 SSE |
| POST | `/v1/jennifer/undo` | 一键撤销（`action_id`） |
| GET | `/v1/rhythm` | 本地引擎拉取当前用户节奏策略 |
| GET/POST/PUT/DELETE | `/admin/api/docs` | 官方文档集 CRUD（热重载） |
| PUT | `/admin/api/docs/reorder` | 文档排序 |
| GET | `/admin/api/memories` | 按用户查看记忆 |
| DELETE | `/admin/api/memories/:id` | 删除记忆 |
| POST | `/admin/api/playground` | LLM playground（prompt 装配 + 工具链 + 耗时） |
| GET | `/admin/api/costs` | 成本/降级聚合 |

---

## 13. 里程碑分期

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 基础管线 | `agent_docs` + 装配 + 热重载；chat 扩展（context/session/role 白名单/独立限流）；`GET /v1/rhythm` + 本地引擎消费；`agent_call_logs`；前端 sqflite 会话持久化 + Markdown 渲染 + responding 占位气泡 | 文档编辑保存即生效；本地提醒按 agent 节奏触发；会话刷新不丢；聊天消息正常渲染 Markdown |
| P1 大脑 | `agent_memories` + 编译文档 + 记忆工具 + 新会话注入；工具集扩展（guardrails_set/feedback_read/steps/memory/draft LLM 化）；`items_delete` 确认语义；`agent_action_logs` + undo + 前端改动卡片；SSE 流式 | 记忆沉淀可跨会话生效；硬删有确认；改动出现可撤销卡片且退出即失效；流式渲染 + 占位气泡 |
| P2 管理面 | admin 文档管理 / 记忆管理 / playground / 成本看板 | 面板功能完整，热重载、看板数据准确 |

**明确不做**（本期）：告警自动评估（R6）、外部 MCP 运行时（R10）、会话入服务端库（R4）、向量检索（后置）、skill 文档外部路径导入（R11）。

---

## 14. 验收标准（全局）

- 后端：`npm run typecheck` 全绿；`npm test` 全绿（新增：文档装配顺序与热重载失效、role 白名单、context 截断、undo 逆操作映射、memory upsert、流式事件序列、agent_call_logs 落库、新工具 handler）；
- 前端：`flutter analyze` 0 issues；`flutter test` 全绿（新增：Markdown 渲染、占位气泡时序、卡片渲染与撤销、sqflite 持久化 roundtrip）；
- 文档：本文档 + README 文档索引同步；实施完成后更新 `docs/JENNIFER_AGENT_REPORT.md` 与 `docs/API.md`、`docs/ARCHITECTURE.md`；
- 手工冒烟：admin 编辑 identity 文档 → 不重新部署、立即影响新会话 system prompt；对话中 agent 写入记忆 → 开新会话可复述；改动卡片撤销 → 数据还原。

---

## 15. 实施文件映射（供后续 agent 使用）

| 改动 | 位置 |
| --- | --- |
| 迁移（agent_docs / agent_memories / agent_action_logs / agent_call_logs） | `backend/supabase/migrations/<ts>_jennifer_full.sql` |
| 文档装配与热重载 | `backend/src/services/agent-docs.ts`（新增）、`backend/src/lib/config-store.ts`（扩展复用） |
| prompt 装配升级 | `backend/src/services/agent.ts` |
| 工具扩展 | `backend/src/services/agent.ts`（TOOL_DEFS / TOOL_REGISTRY） |
| 记忆编译与工具 | `backend/src/services/memory.ts`（新增） |
| chat 路由扩展 + SSE | `backend/src/routes/jennifer.ts` |
| undo | `backend/src/routes/jennifer.ts`（或 `routes/agent.ts`） |
| 节奏下发 | `backend/src/routes/rhythm.ts`（新增） |
| 调用日志 | `backend/src/lib/llm.ts` + `backend/src/services/agent.ts` |
| admin 扩展 | `backend/src/routes/admin.ts`（docs/memories/playground/costs） |
| 前端会话持久化 | `frontend/lib/services/conversation_store.dart`（新增） |
| 前端流式 + Markdown + 卡片 | `frontend/lib/screens/chat_screen.dart` + `frontend/pubspec.yaml`（flutter_markdown） |
| 本地引擎消费节奏 | `frontend/lib/services/jennifer_local_engine.dart` + `local_window_engine.dart` |

