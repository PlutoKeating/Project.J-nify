-- J-nify v0.2.0 迁移：admin 配置存储 / Jennifer agent 策略 / 匿名指标 / 静默事项

-- 1) 系统配置（admin 面板热加载：JSON + version，版本变更即缓存失效）
create table if not exists public.system_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- 2) 提醒节奏策略（Jennifer agent 可读写的用户级覆盖；类目默认值在代码 DEFAULT_RHYTHMS）
create table if not exists public.rhythm_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,                 -- bill/return/study/social/chore/life
  due_offsets jsonb not null default '[]'::jsonb,  -- [{"days_before":10,"max_nudges":1}, ...]
  cooldown_hours integer not null default 72,      -- 无死线同理由冷却
  agent_managed boolean not null default true,     -- 是否由 Jennifer agent 接管
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_rhythm_policies_user_category
  on public.rhythm_policies (user_id, category);

-- 3) 匿名指标事件（不含任何事项内容）
create table if not exists public.metrics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,              -- capture/nudge_sent/nudge_opened/decision/rescue_action/complaint
  item_id uuid,
  category text,
  status text,
  decision text,
  duration_minutes integer,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_metrics_events_user_time on public.metrics_events (user_id, occurred_at desc);
create index if not exists idx_metrics_events_type_time on public.metrics_events (event_type, occurred_at desc);

-- 4) 事项静默（"别再提"一次生效；本地通知 action 与 PATCH muted 均写此列）
alter table public.item_commitments add column if not exists muted_at timestamptz;

-- 5) 闭环率视图（SPEC §9.1：进入窗口后 72h 内完成/延期/放弃/兜底比例）
create or replace view public.v_closure_rate as
with decision_windows as (
  select
    d.user_id,
    d.item_id,
    d.decision,
    d.decided_at,
    w.created_at as window_at,
    (d.decided_at - w.created_at) as latency
  from public.decisions d
  left join public.nudges n on n.id = d.nudge_id
  left join public.opportunity_windows w on w.id = n.window_id
  where d.decided_at is not null
)
select
  date_trunc('day', window_at) as day,
  count(*) filter (where latency <= interval '72 hours') as closed_within_72h,
  count(*) filter (where latency <= interval '72 hours' and decision = 'now') as done,
  count(*) filter (where latency <= interval '72 hours' and decision = 'later') as deferred,
  count(*) filter (where latency <= interval '72 hours' and decision = 'drop') as abandoned,
  count(*) filter (where latency <= interval '72 hours' and decision = 'rescue') as rescued,
  count(*) as total
from decision_windows
where window_at is not null
group by 1
order by 1 desc;

-- RLS：新表同样零客户端权限（仅 service_role 可读写）
alter table public.system_config enable row level security;
alter table public.rhythm_policies enable row level security;
alter table public.metrics_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
