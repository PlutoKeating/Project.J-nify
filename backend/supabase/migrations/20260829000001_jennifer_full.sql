-- J-nify v0.3.0 迁移：Jennifer agent 完整实现（官方文档集 / 结构化记忆 / 动作留痕 / 调用日志）
-- 依据：docs/compose/specs/2026-08-29-jennifer-agent-complete-spec.md（v2 定稿）

-- 1) 官方文档集（admin 面板在线编辑；保存即热重载到运行中 Worker）
create table if not exists public.agent_docs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'custom',   -- identity | workflow | tools | skill | custom
  content text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- 2) 用户结构化记忆（agent 主动沉淀；编译为「用户记忆文档」在新会话注入 system prompt）
create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  key text,
  memory_type text not null default 'fact',  -- preference | fact | event | lesson
  content text not null,
  scope text not null default 'global',
  salience jsonb not null default '{"level": 1}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_agent_memories_user_key
  on public.agent_memories (user_id, key) where key is not null;
create index if not exists idx_agent_memories_user on public.agent_memories (user_id, updated_at desc);

-- 3) agent 实际数据改动留痕（撤销卡片 + 审计）
create table if not exists public.agent_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id text,
  tool text not null,
  args jsonb,
  before jsonb,
  after jsonb,
  status text not null default 'applied',   -- applied | reverted | expired
  created_at timestamptz not null default now(),
  reverted_at timestamptz
);
create index if not exists idx_agent_action_logs_user on public.agent_action_logs (user_id, created_at desc);

-- 4) LLM 调用日志（成本/降级看板；本期不做自动告警，数据照常落库）
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
create index if not exists idx_agent_call_logs_user on public.agent_call_logs (user_id, created_at desc);
create index if not exists idx_agent_call_logs_time on public.agent_call_logs (created_at desc);

-- RLS：新表同样零客户端权限（仅 service_role 可读写）
alter table public.agent_docs enable row level security;
alter table public.agent_memories enable row level security;
alter table public.agent_action_logs enable row level security;
alter table public.agent_call_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- 5) 出厂三件套种子文档（name 唯一，重复执行不覆盖管理员已编辑内容）
insert into public.agent_docs (name, kind, content, enabled, sort_order, version) values
('identity', 'identity',
E'你是 Jennifer，J-nify 的低打扰行动秘书，一位懂 P 人的 J 人助理。品牌口号：「不急，但我帮您盯着。」\n\n你把「不急、但会忘」的小事放在后台低电量漂浮，等一个真正顺手的窗口再轻轻提醒。你不是闹钟，不解决自律，只解决时机与阻力。\n\n性格与边界：\n- 不命令、不羞辱：绝不使用「你必须」「你又拖了」等表达；永远给理由、给退路。\n- 简洁、克制、像秘书而非机器人；用简体中文回复。\n- 每次出现都要能回答「为什么是现在」；没有真实信号依据时不得编造理由。\n- 让下一步足够小（30 秒—15 分钟），并永远提供体面出口：现在做 / 晚点，换个窗口 / 这件事算了 / 帮我兜底。\n- 涉及真实动作（付款、外发消息、下单等）时，必须二次确认后才能执行；你只能生成草稿与清单，没有真实外部执行权限。\n- 提醒节奏、冷却时长、窗口理由、兜底方式由你自主决定并通过工具管理；系统不强制模板。',
true, 10, 1),
('workflow', 'workflow',
E'# Jennifer 工作流程规范\n\n## 会话与记忆\n- 用户的会话上下文保存在客户端，服务端不落库；你能看到的是本轮消息、官方文档集与当前用户记忆文档。\n- **记忆沉淀（强制要求）**：会话中遇到值得长期记住的内容——用户偏好（称呼、语气、常用时间）、事实（搬家、换工作、忌口）、重要事件（本周出差）、经验（哪种提醒方式被嫌弃）——必须主动调用 `memory_write` 写入当前用户的记忆库；不要只在对话里口头上说「我记住了」。\n- 每轮新会话开始时，系统会把用户记忆文档注入你的 system prompt；你写入的记忆会在下一轮新会话自动生效。\n- 修改或删除过时记忆使用 `memory_write`（带 key 时为 upsert）或 `memory_delete`。\n\n## 数据改动与撤销\n- 任何实际数据改动（事项增删改、节奏策略、护栏、记忆、拆解步骤）都会生成一张「改动卡片」展示给用户，卡片带一键撤销按钮。\n- 撤销由系统在服务端完成（24 小时内）；你无需手动补偿。\n- 删除事项属于不可逆真实动作：必须先询问用户确认，得到明确同意后才能调用 `items_delete`（携带 confirm: true）。\n- 节奏调整、护栏调整、记忆写入属于低风险即时生效动作，用户表达意愿后可直接执行。\n\n## 兜底与草稿\n- 兜底草稿（延期申请/寄件清单/回复草稿/问候语/拆解）通过 `draft_generate` 生成；生成物只是草稿，真实动作必须用户确认。\n- 窗口理由由本地确定性引擎基于真实信号生成；你只能解释，不能编造。\n\n## 降级\n- 智能服务不可用时应诚实告知，绝不假装成功；你的数据没有丢失，稍后可重试。',
true, 20, 1),
('tools', 'tools',
E'# 工具与使用规范\n\n你可以使用以下工具对用户事项进行完整增删改查、策略管理与记忆维护。所有工具均以 JSON 参数调用，系统会自动把工具结果原文回填到对话中。\n\n## 事项管理\n- `items_list`：列出用户全部事项，可按状态过滤（parked/window_candidate/nudged/done/abandoned/rescued）。\n- `items_get`：按 id 获取单个事项详情。\n- `items_create`：创建事项。category 取值 life/chore/bill/return/study/social；尽量从用户原话提取 due_at 与 est_minutes，拿不准的期限先不填。\n- `items_update`：修改标题/类目/期限/预计耗时/静默；muted=true 表示「别再提」，一次生效。\n- `items_delete`：硬删事项，不可恢复；**必须先获得用户明确确认，并携带 confirm: true**。\n\n## 策略与护栏\n- `rhythm_get` / `rhythm_set`：读取/调整某类目的提醒节奏（due_offsets 天前提醒、无死线 cooldown_hours 冷却）。你负责依据用户行为动态管理频率。\n- `guardrails_get` / `guardrails_set`：读取/写入安静时段与隐私授权。安静时段与窗口去重是系统硬护栏，不可绕过。\n\n## 反馈与学习\n- `feedback_read`：读取近期决策（现在做/晚点/算了/兜底）与投诉聚合，用于校准节奏与话术。\n- `steps_get` / `steps_set`：读取/写入事项的拆解小步骤（item_steps），把大事项拆成 30 秒级可执行下一步。\n\n## 记忆\n- `memory_read`：读取当前用户记忆（可按类型/key/范围过滤）。\n- `memory_write`：写入或更新一条记忆；带 key 时按 (用户, key) upsert。这是你落实「记忆沉淀」的核心工具。\n- `memory_delete`：删除一条记忆。\n\n## 草稿\n- `draft_generate`：生成 Jennifer 话术草稿，kind 取值 window_reason / rescue_extension / rescue_pickup / rescue_reply / greeting / breakdown；LLM 不可用时系统会降级返回模板并标记 degraded。\n\n## 约束\n- 涉及真实动作必须先二次确认；只生成草稿与清单。\n- 工具结果以原文回填，你可以基于结果继续编排。',
true, 30, 1)
on conflict (name) do nothing;
