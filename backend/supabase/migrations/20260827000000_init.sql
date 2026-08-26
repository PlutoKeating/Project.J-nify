-- J-nify 全量建表（SPEC §6 ER 等价迁移）
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  timezone text default 'UTC',
  jennifer_tone text default 'default',
  privacy_scope jsonb default '{"calendar": true, "weather": true, "coarse_location": true}',
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  scene text not null,
  key text not null,
  value text not null,
  confidence jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  auth_status text default 'pending',
  scopes jsonb default '[]',
  connected_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.signal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_id uuid references public.integration_sources(id) on delete set null,
  signal_type text not null,
  payload jsonb not null,
  confidence jsonb,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now()
);
create index if not exists idx_signal_events_user on public.signal_events (user_id, occurred_at desc);

create table if not exists public.context_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  snapshot_key text not null,
  context_features jsonb not null,
  availability_score jsonb,
  friction_score jsonb,
  computed_at timestamptz not null default now()
);
create index if not exists idx_context_snapshots_user on public.context_snapshots (user_id, computed_at desc);

create table if not exists public.context_snapshot_signals (
  context_snapshot_id uuid not null references public.context_snapshots(id) on delete cascade,
  signal_event_id uuid not null references public.signal_events(id) on delete cascade,
  primary key (context_snapshot_id, signal_event_id)
);

create table if not exists public.item_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  raw_text text not null,
  source_type text not null default 'text',
  category text not null default 'life',
  status text not null default 'parked',
  due_at timestamptz,
  window_start timestamptz,
  window_end timestamptz,
  importance integer not null default 1,
  urgency integer not null default 1,
  abandon_cost integer not null default 1,
  est_minutes integer not null default 5,
  constraints jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists idx_item_commitments_user_status on public.item_commitments (user_id, status);

create table if not exists public.item_steps (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.item_commitments(id) on delete cascade,
  step_order integer not null default 0,
  title text not null,
  est_minutes integer not null default 5,
  status text not null default 'pending',
  action_payload jsonb,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table if not exists public.escalation_policies (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.item_commitments(id) on delete cascade,
  policy_type text not null default 'default',
  max_nudges integer not null default 3,
  nudge_count integer not null default 0,
  warm_up_curve jsonb default '[1, 2, 3]',
  quiet_hours jsonb,
  rescue_actions jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.opportunity_windows (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.item_commitments(id) on delete cascade,
  context_id uuid references public.context_snapshots(id) on delete set null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  fit_score jsonb,
  reason_code text not null,
  reason_text text not null,
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  expired_at timestamptz
);
create index if not exists idx_opportunity_windows_item on public.opportunity_windows (item_id, created_at desc);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  scene text not null,
  tone text not null default 'default',
  intensity_band text not null default 'low',
  template_text text not null,
  variables jsonb,
  version integer not null default 1,
  status text not null default 'active'
);

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.item_commitments(id) on delete cascade,
  window_id uuid references public.opportunity_windows(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  intensity integer not null default 1,
  channel text not null default 'push',
  title text not null,
  body text not null,
  status text not null default 'scheduled',
  scheduled_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_nudges_item on public.nudges (item_id, created_at desc);

create table if not exists public.nudge_options (
  id uuid primary key default gen_random_uuid(),
  nudge_id uuid not null references public.nudges(id) on delete cascade,
  option_code text not null,
  label text not null,
  action_type text not null,
  action_payload jsonb,
  sort_order integer not null default 0
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid references public.item_commitments(id) on delete cascade,
  nudge_id uuid references public.nudges(id) on delete set null,
  option_id uuid references public.nudge_options(id) on delete set null,
  decision text not null,
  reason text not null default '',
  effect_metrics jsonb,
  decided_at timestamptz not null default now()
);
create index if not exists idx_decisions_user on public.decisions (user_id, decided_at desc);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  decision_id uuid references public.decisions(id) on delete set null,
  feedback_type text not null default 'implicit',
  rating integer,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.memory_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid references public.item_commitments(id) on delete cascade,
  decision_id uuid references public.decisions(id) on delete set null,
  memory_type text not null,
  content text not null,
  salience jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_memory_notes_user on public.memory_notes (user_id, created_at desc);