-- jnify-data 的表结构（SQLite）。由 backend/supabase/migrations 的 Postgres 表结构等价转写：
-- 列的声明类型决定读写时怎么换算（db.ts 的 coerce）：UUID / TEXT 原样；INTEGER / BIGINT / REAL 数字；BOOLEAN 存 0 / 1、读出 true / false；
-- JSONB 存 JSON 文本、读出对象；TIMESTAMPTZ 存 UTC 的 ISO 8601（毫秒，Z 结尾），字符串比较即时间先后。
-- UUID 主键没给时由服务生成（crypto.randomUUID），与 Postgres 的 gen_random_uuid() 一致。
-- 账号由 PlutoKeating 账号服务提供：users.id 是账号的 sub（UUID），不再引用 auth.users。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  nickname TEXT,
  timezone TEXT DEFAULT 'UTC',
  jennifer_tone TEXT DEFAULT 'default',
  privacy_scope JSONB DEFAULT '{"calendar": true, "weather": true, "coarse_location": true}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scene TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_preferences_user_scene_key ON user_preferences (user_id, scene, key);

CREATE TABLE IF NOT EXISTS integration_sources (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  auth_status TEXT DEFAULT 'pending',
  scopes JSONB DEFAULT '[]',
  connected_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS signal_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id UUID REFERENCES integration_sources(id) ON DELETE SET NULL,
  signal_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  confidence JSONB,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_signal_events_user ON signal_events (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_key TEXT NOT NULL,
  context_features JSONB NOT NULL,
  availability_score JSONB,
  friction_score JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_context_snapshots_user ON context_snapshots (user_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS context_snapshot_signals (
  context_snapshot_id UUID NOT NULL REFERENCES context_snapshots(id) ON DELETE CASCADE,
  signal_event_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,
  PRIMARY KEY (context_snapshot_id, signal_event_id)
);

CREATE TABLE IF NOT EXISTS item_commitments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'text',
  category TEXT NOT NULL DEFAULT 'life',
  status TEXT NOT NULL DEFAULT 'parked',
  due_at TIMESTAMPTZ,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  importance INTEGER NOT NULL DEFAULT 1,
  urgency INTEGER NOT NULL DEFAULT 1,
  abandon_cost INTEGER NOT NULL DEFAULT 1,
  est_minutes INTEGER NOT NULL DEFAULT 5,
  constraints JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at TIMESTAMPTZ,
  muted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_item_commitments_user_status ON item_commitments (user_id, status);

CREATE TABLE IF NOT EXISTS item_steps (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES item_commitments(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  est_minutes INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending',
  action_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  done_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_item_steps_item ON item_steps (item_id, step_order);

CREATE TABLE IF NOT EXISTS escalation_policies (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES item_commitments(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL DEFAULT 'default',
  max_nudges INTEGER NOT NULL DEFAULT 3,
  nudge_count INTEGER NOT NULL DEFAULT 0,
  warm_up_curve JSONB DEFAULT '[1, 2, 3]',
  quiet_hours JSONB,
  rescue_actions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_escalation_policies_item ON escalation_policies (item_id);

CREATE TABLE IF NOT EXISTS opportunity_windows (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES item_commitments(id) ON DELETE CASCADE,
  context_id UUID REFERENCES context_snapshots(id) ON DELETE SET NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  fit_score JSONB,
  reason_code TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expired_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_opportunity_windows_item ON opportunity_windows (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY,
  scene TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'default',
  intensity_band TEXT NOT NULL DEFAULT 'low',
  template_text TEXT NOT NULL,
  variables JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS nudges (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES item_commitments(id) ON DELETE CASCADE,
  window_id UUID REFERENCES opportunity_windows(id) ON DELETE SET NULL,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  intensity INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'push',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_nudges_item ON nudges (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nudge_options (
  id UUID PRIMARY KEY,
  nudge_id UUID NOT NULL REFERENCES nudges(id) ON DELETE CASCADE,
  option_code TEXT NOT NULL,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_payload JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID REFERENCES item_commitments(id) ON DELETE CASCADE,
  nudge_id UUID REFERENCES nudges(id) ON DELETE SET NULL,
  option_id UUID REFERENCES nudge_options(id) ON DELETE SET NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  effect_metrics JSONB,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_decisions_user ON decisions (user_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision_id UUID REFERENCES decisions(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL DEFAULT 'implicit',
  rating INTEGER,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memory_notes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID REFERENCES item_commitments(id) ON DELETE CASCADE,
  decision_id UUID REFERENCES decisions(id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  salience JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_notes_user ON memory_notes (user_id, created_at DESC);

-- v0.2.0：系统配置、节奏策略、匿名指标
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS rhythm_policies (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  due_offsets JSONB NOT NULL DEFAULT '[]',
  cooldown_hours INTEGER NOT NULL DEFAULT 72,
  agent_managed BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rhythm_policies_user_category ON rhythm_policies (user_id, category);

CREATE TABLE IF NOT EXISTS metrics_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  item_id UUID,
  category TEXT,
  status TEXT,
  decision TEXT,
  duration_minutes INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_metrics_events_user_time ON metrics_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_events_type_time ON metrics_events (event_type, occurred_at DESC);

-- 闭环率（SPEC §9.1：进入窗口后 72h 内完成 / 延期 / 放弃 / 兜底的比例），按窗口创建日（UTC）汇总
CREATE VIEW IF NOT EXISTS v_closure_rate AS
WITH decision_windows AS (
  SELECT d.decision, d.decided_at, w.created_at AS window_at,
         (julianday(d.decided_at) - julianday(w.created_at)) * 24 AS latency_hours
  FROM decisions d
  LEFT JOIN nudges n ON n.id = d.nudge_id
  LEFT JOIN opportunity_windows w ON w.id = n.window_id
  WHERE d.decided_at IS NOT NULL
)
SELECT
  substr(window_at, 1, 10) || 'T00:00:00.000Z' AS day,
  sum(latency_hours <= 72) AS closed_within_72h,
  sum(latency_hours <= 72 AND decision = 'now') AS done,
  sum(latency_hours <= 72 AND decision = 'later') AS deferred,
  sum(latency_hours <= 72 AND decision = 'drop') AS abandoned,
  sum(latency_hours <= 72 AND decision = 'rescue') AS rescued,
  count(*) AS total
FROM decision_windows
WHERE window_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

-- v0.3.0：Jennifer 官方文档集、结构化记忆、动作留痕、调用日志
CREATE TABLE IF NOT EXISTS agent_docs (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'custom',
  content TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT,
  memory_type TEXT NOT NULL DEFAULT 'fact',
  content TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  salience JSONB NOT NULL DEFAULT '{"level": 1}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_memories_user_key ON agent_memories (user_id, key) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memories_user ON agent_memories (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_action_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,
  tool TEXT NOT NULL,
  args JSONB,
  before JSONB,
  after JSONB,
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reverted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_action_logs_user ON agent_action_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_call_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,
  provider TEXT,
  model TEXT,
  ok BOOLEAN NOT NULL DEFAULT 1,
  degraded BOOLEAN NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_call_logs_user ON agent_call_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_call_logs_time ON agent_call_logs (created_at DESC);
