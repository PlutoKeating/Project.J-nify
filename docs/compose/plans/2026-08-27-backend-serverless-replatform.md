# J-nify 后端 Serverless 重构实现计划（Cloudflare Workers + Supabase）

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ⚠️ **历史快照（2026-08-27）**：此计划记录的当时端点数为 **11**；现为 **13**（新增 `GET/PUT /v1/me/profile`，昵称/资料）。本文件仅作当时实现留档，当前架构以 `docs/ARCHITECTURE.md`、`docs/API.md`、`docs/HANDOVER.md` 为准。

**Goal:** 将 `backend/` 从 FastAPI/SQLAlchemy/SQLite 完整替换为 TS + Hono + Drizzle 的 Cloudflare Worker，数据库迁移到 Supabase Postgres（Supabase Auth 邮箱账户体系），并同步补齐前端 M0 缺口与文档矛盾。

**Architecture:** Flutter 前端（supabase_flutter 取 JWT）→ Cloudflare Worker（Hono 路由，jose JWKS 验签，Drizzle/postgres.js 直连 Supabase Postgres pooler 事务模式 :6543，prepare:false）→ Supabase（Postgres + Auth）。表结构由 `backend/supabase/migrations/*.sql` 管理（golden rule：远端库只经迁移文件变更）。部署：CF Dashboard git 集成（Root directory=backend，push main 自动部署）。

**Tech Stack:** TypeScript(5.x) + Hono(4.x) + Drizzle ORM + postgres.js(3.x, `prepare:false`) + jose(JWKS 验签) + wrangler(4.x) + vitest(3.x) + supabase CLI；前端 Flutter + supabase_flutter。

## Global Constraints

1. 业务契约等价：11 端点、15 实体、SPEC §6.1 状态机（captured/parked/window_candidate/nudged/done/deferred/abandoned/rescued）不变。
2. decision 取值统一 `now / later / drop / rescue`；错误体统一 `{ "detail": "<msg>" }`。
3. 认证：仅 `Authorization: Bearer <Supabase JWT>`；无 token/验签失败 → 401 `{ "detail": "unauthorized" }`；**彻底移除 X-User-Id**。
4. 凭据卫生：`DATABASE_URL`/`DIRECT_DATABASE_URL`/`LLM_API_KEY` 只进 `.dev.vars`（gitignore）与 CF Dashboard secrets，绝不写入源码/仓库；`SUPABASE_ANON_KEY`（publishable）可入前端。
5. postgres.js 必须 `prepare: false`（pooler 事务模式不支持 prepared statements）。
6. 时间用 `timestamptz`（UTC 存储）；JSON 字段用 `jsonb`。
7. 护栏运行时以库内 `user_preferences` 为准，配置值为默认兜底。
8. `/v1/now`：候选仅 `parked/window_candidate/nudged`；按 `updated_at` 升序；取 `fit_score` 最高（平局按候选序）；served 窗口落库；fresh 窗口不重复建 Nudge；「晚点」后事项回 parked 且 `updated_at` 置尾，不立即回顶。
9. 每次任务结束必须提交（git add 具体文件 + 明确 message）；不 push（由用户决定）。
10. 本机无 flutter/docker：前端任务以静态审查 + widget 测试代码交付，`flutter analyze/test` 由用户在有工具链的机器执行并回补结果；后端集成测试依赖用户提供的 Supabase 凭据（未提供时任务标记 blocked 并跳过，不伪造结果）。
11. 文档矛盾修正：`docs/SPEC.md:674`、`docs/API.md:11` 的 `do` 改为 `now`；README 工程栈/仓库结构/scripts 行更新为 serverless 描述。

## File Structure

```
backend/
  package.json                Task 1
  tsconfig.json               Task 1
  wrangler.toml               Task 1
  .gitignore                  Task 1
  .dev.vars.example           Task 1
  supabase/
    config.toml               Task 2    supabase CLI 项目配置（占位，link/push 用）
    migrations/
      20260827000000_init.sql Task 2    全量建表
  src/
    config.ts                 Task 1    Env 接口 + 默认值
    app.ts                    Task 10   makeApp(env) 组装 Hono 应用
    index.ts                  Task 10   Worker 入口（export default）
    db/
      schema.ts               Task 2    Drizzle 表定义（与 init.sql 对齐）
      index.ts                Task 9    createDb(env) + drizzle 包装 + 事务 helper
    lib/
      auth.ts                 Task 4    verifyJwt + ensureUser + requireAuth 中间件
      privacy.ts              Task 3    信号 scope 白名单
      rate-limit.ts           Task 3    进程内滑动窗口（fail-open）
      audit.ts                Task 3    结构化日志
    services/
      capture.ts              Task 8    录入（建 ItemCommitment + EscalationPolicy）
      context.ts              Task 9    信号→ContextSnapshot 聚合
      window-engine.ts        Task 5    确定性窗口计算（due_soon/weather/usage_state/manual_window）
      escalation.ts           Task 6    shouldNudge + 安静时段（读库内护栏）
      brain.ts                Task 7    draft 模板降级 + options（含 rescue）
      orchestrator.ts         Task 9    buildNudge（reason-gate + policy + 落库）
      decision-feedback.ts    Task 8    closeLoop 状态机 + message
    routes/
      items.ts                Task 10   capture/list/decision
      now.ts                  Task 10   GET /v1/now（选窗+落库+nudge）
      signals.ts              Task 10   POST /v1/signals
      guardrails.ts           Task 10   GET/PUT（user_preferences）
      me.ts                   Task 10   DELETE /v1/me/data
      llm.ts                  Task 10   POST /v1/llm/draft（stub）
      health.ts               Task 10   GET / 、GET /health
  scripts/
    apply-migrations.ts       Task 11   经 DIRECT_DATABASE_URL 逐条执行迁移 SQL（无 CLI/PAT 时）
  test/
    config.test.ts            Task 1
    rate-limit.test.ts        Task 3
    privacy.test.ts           Task 3
    auth.test.ts              Task 4
    window-engine.test.ts     Task 5
    escalation.test.ts        Task 6
    brain.test.ts             Task 7
    decision-feedback.test.ts Task 8
    capture.test.ts           Task 8
    integration.test.ts       Task 11  连托管 dev 项目端到端
frontend/
  pubspec.yaml                Task 13  加 supabase_flutter
  lib/core/config/env.dart    Task 13  加 SUPABASE_URL/SUPABASE_ANON_KEY
  lib/core/api/api_client.dart Task 13 附 Bearer token
  lib/auth/auth_gate.dart     Task 13  AuthGate（登录门）
  lib/screens/login_screen.dart Task 13 注册/登录页
  lib/main.dart               Task 13  Supabase.initialize + AuthGate
  lib/widgets/capture_input.dart Task 14 分类 chips + 期限快捷项
  lib/widgets/focus_card.dart Task 14  按 options 渲染（含 rescue）
  lib/screens/now_screen.dart Task 14  Toast 收口 + 决策 message
  lib/screens/me_screen.dart  Task 14  护栏真实读写
  test/widget_test.dart       Task 13/14 更新与新增
docs/
  SPEC.md / API.md / README.md Task 12 矛盾修正与栈描述更新
```

---

### Task 1: 后端项目脚手架（package/tsconfig/wrangler/env/config）

**Covers:** [S9]

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/wrangler.toml`
- Create: `backend/.gitignore`
- Create: `backend/.dev.vars.example`
- Create: `backend/src/config.ts`
- Test: `backend/test/config.test.ts`

**Interfaces:**
- Consumes: 无（仓库初建）
- Produces: `Env` 接口（src/config.ts，Task 4/9/10 全部消费）；`DEFAULTS` 常量；`num(env, key)` helper。

- [ ] **Step 1: 清空 backend/ 并创建基础文件**

```bash
rm -rf backend/app backend/docs backend/docker-compose.yml backend/Dockerfile backend/requirements.txt
mkdir -p backend/src/db backend/src/lib backend/src/services backend/src/routes backend/supabase/migrations backend/scripts backend/test
```

`backend/package.json`：

```json
{
  "name": "jnify-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:push": "supabase db push",
    "db:migrate": "tsx scripts/apply-migrations.ts"
  }
}
```

`backend/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "scripts"]
}
```

`backend/wrangler.toml`：

```toml
name = "jnify-backend"
main = "src/index.ts"
compatibility_date = "2026-08-01"
workers_dev = true

[vars]
APP_ENV = "production"
APP_VERSION = "0.1.0"
CORS_ORIGINS = "*"
LOG_LEVEL = "info"
RATE_LIMIT_PER_MINUTE = "60"
QUIET_HOURS_START = "23:30"
QUIET_HOURS_END = "08:30"
MAX_NUDGE_BUDGET = "3"
LLM_API_BASE = ""
LLM_MODEL = ""
# 注意：SUPABASE_URL/DATABASE_URL/LLM_API_KEY 为 secret，在 CF Dashboard 注入，
# 不写入本文件；本地开发放 .dev.vars（已被 .gitignore 忽略）。
```

`backend/.gitignore`：

```
node_modules/
.wrangler/
.dev.vars
dist/
coverage/
```

`backend/.dev.vars.example`：

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxx
DATABASE_URL=postgres://postgres.<ref>:<password>@aws-<region>.pooler.supabase.com:6543/postgres
DIRECT_DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
CORS_ORIGINS=*
RATE_LIMIT_PER_MINUTE=60
QUIET_HOURS_START=23:30
QUIET_HOURS_END=08:30
MAX_NUDGE_BUDGET=3
LLM_API_BASE=
LLM_API_KEY=
LLM_MODEL=
```

`backend/src/config.ts`：

```ts
export interface Env {
  SUPABASE_URL: string;
  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  APP_ENV?: string;
  APP_VERSION?: string;
  CORS_ORIGINS?: string;
  LOG_LEVEL?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  QUIET_HOURS_START?: string;
  QUIET_HOURS_END?: string;
  MAX_NUDGE_BUDGET?: string;
  LLM_API_BASE?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
}

export const DEFAULTS = {
  APP_ENV: 'development',
  APP_VERSION: '0.1.0',
  CORS_ORIGINS: '*',
  LOG_LEVEL: 'info',
  RATE_LIMIT_PER_MINUTE: 60,
  QUIET_HOURS_START: '23:30',
  QUIET_HOURS_END: '08:30',
  MAX_NUDGE_BUDGET: 3,
} as const;

export function num(env: Env, key: 'RATE_LIMIT_PER_MINUTE' | 'MAX_NUDGE_BUDGET'): number {
  const raw = env[key];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : DEFAULTS[key];
}
```

- [ ] **Step 2: 安装依赖**

```bash
cd backend
npm install hono drizzle-orm postgres jose
npm install -D wrangler drizzle-kit vitest typescript tsx supabase @cloudflare/workers-types
```

- [ ] **Step 3: 写失败测试**

`backend/test/config.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULTS, num } from '../src/config';

describe('config defaults', () => {
  it('falls back to defaults when env keys are missing', () => {
    expect(num({}, 'MAX_NUDGE_BUDGET')).toBe(DEFAULTS.MAX_NUDGE_BUDGET);
    expect(num({}, 'RATE_LIMIT_PER_MINUTE')).toBe(DEFAULTS.RATE_LIMIT_PER_MINUTE);
  });

  it('parses numeric env strings', () => {
    expect(num({ MAX_NUDGE_BUDGET: '5' }, 'MAX_NUDGE_BUDGET')).toBe(5);
  });

  it('ignores invalid numbers', () => {
    expect(num({ MAX_NUDGE_BUDGET: 'abc' }, 'MAX_NUDGE_BUDGET')).toBe(DEFAULTS.MAX_NUDGE_BUDGET);
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../src/config'`（文件尚未创建）

- [ ] **Step 5: 创建 src/config.ts（见 Step 1）并再次运行**

Run: `cd backend && npm test`
Expected: 3 passed

- [ ] **Step 6: 验证 typecheck + 提交**

```bash
cd backend && npm run typecheck
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/wrangler.toml backend/.gitignore backend/.dev.vars.example backend/src/config.ts backend/test/config.test.ts
git status --short   # 确认无 .dev.vars / node_modules 等误入
git commit -m "feat(backend): scaffold Cloudflare Worker (Hono + Drizzle + config)"
```

---

### Task 2: Drizzle schema + 全量建表迁移 SQL

**Covers:** [S4]

**Files:**
- Create: `backend/src/db/schema.ts`
- Create: `backend/supabase/config.toml`
- Create: `backend/supabase/migrations/20260827000000_init.sql`
- Test: `backend/test/schema.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: Drizzle 表对象（`users`、`userPreferences`、`integrationSources`、`signalEvents`、`contextSnapshots`、`itemCommitments`、`itemSteps`、`escalationPolicies`、`opportunityWindows`、`messageTemplates`、`nudges`、`nudgeOptions`、`decisions`、`feedback`、`memoryNotes`、`contextSnapshotSignals`）— Task 8/9/10 全部消费。
- 约定：表名 snake_case；字段名 snake_case；`schema.ts` 与 `init.sql` 必须逐列一致（schema 测试断言列名清单）。

- [ ] **Step 1: 写 schema 一致性失败测试**

`backend/test/schema.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';

describe('drizzle schema aligns with SUPABASE_ER', () => {
  it('exposes all 16 tables', () => {
    const names = Object.keys(schema).sort();
    expect(names).toEqual(
      [
        'contextSnapshotSignals', 'contextSnapshots', 'decisions', 'escalationPolicies',
        'feedback', 'integrationSources', 'itemCommitments', 'itemSteps',
        'memoryNotes', 'messageTemplates', 'nudgeOptions', 'nudges',
        'opportunityWindows', 'signalEvents', 'userPreferences', 'users',
      ].sort(),
    );
  });

  it('users references auth.users via uuid pk', () => {
    const u = schema.users;
    expect(u.id.dataType).toBe('uuid');
    expect(u.id.primaryKey).toBe(true);
  });

  it('item_commitments carries SPEC fields', () => {
    const cols = Object.keys(schema.itemCommitments);
    for (const c of ['title', 'rawText', 'category', 'status', 'dueAt', 'importance', 'urgency', 'abandonCost', 'estMinutes', 'closedAt']) {
      expect(cols).toContain(c);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../src/db/schema'`

- [ ] **Step 3: 创建 Drizzle schema（完整代码）**

`backend/src/db/schema.ts`：

```ts
import { pgTable, uuid, text, integer, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  nickname: text('nickname'),
  timezone: text('timezone').default('UTC'),
  jenniferTone: text('jennifer_tone').default('default'),
  privacyScope: jsonb('privacy_scope').$type<Record<string, boolean>>().default({ calendar: true, weather: true, coarse_location: true }),
  status: text('status').default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scene: text('scene').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  confidence: jsonb('confidence'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const integrationSources = pgTable('integration_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  authStatus: text('auth_status').default('pending'),
  scopes: jsonb('scopes').$type<string[]>().default([]),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const signalEvents = pgTable('signal_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceId: uuid('source_id').references(() => integrationSources.id, { onDelete: 'set null' }),
  signalType: text('signal_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  confidence: jsonb('confidence'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contextSnapshots = pgTable('context_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  snapshotKey: text('snapshot_key').notNull(),
  contextFeatures: jsonb('context_features').$type<Record<string, unknown>>().notNull(),
  availabilityScore: jsonb('availability_score'),
  frictionScore: jsonb('friction_score'),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contextSnapshotSignals = pgTable('context_snapshot_signals', {
  contextSnapshotId: uuid('context_snapshot_id').notNull().references(() => contextSnapshots.id, { onDelete: 'cascade' }),
  signalEventId: uuid('signal_event_id').notNull().references(() => signalEvents.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.contextSnapshotId, t.signalEventId] })]);

export const itemCommitments = pgTable('item_commitments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  rawText: text('raw_text').notNull(),
  sourceType: text('source_type').default('text').notNull(),
  category: text('category').default('life').notNull(),
  status: text('status').default('parked').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  windowStart: timestamp('window_start', { withTimezone: true }),
  windowEnd: timestamp('window_end', { withTimezone: true }),
  importance: integer('importance').default(1).notNull(),
  urgency: integer('urgency').default(1).notNull(),
  abandonCost: integer('abandon_cost').default(1).notNull(),
  estMinutes: integer('est_minutes').default(5).notNull(),
  constraints: jsonb('constraints').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

export const itemSteps = pgTable('item_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => itemCommitments.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').default(0).notNull(),
  title: text('title').notNull(),
  estMinutes: integer('est_minutes').default(5).notNull(),
  status: text('status').default('pending').notNull(),
  actionPayload: jsonb('action_payload').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  doneAt: timestamp('done_at', { withTimezone: true }),
});

export const escalationPolicies = pgTable('escalation_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => itemCommitments.id, { onDelete: 'cascade' }),
  policyType: text('policy_type').default('default').notNull(),
  maxNudges: integer('max_nudges').default(3).notNull(),
  nudgeCount: integer('nudge_count').default(0).notNull(),
  warmUpCurve: jsonb('warm_up_curve').$type<number[]>().default([1, 2, 3]),
  quietHours: jsonb('quiet_hours').$type<{ start: string; end: string }>(),
  rescueActions: jsonb('rescue_actions').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const opportunityWindows = pgTable('opportunity_windows', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => itemCommitments.id, { onDelete: 'cascade' }),
  contextId: uuid('context_id').references(() => contextSnapshots.id, { onDelete: 'set null' }),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  fitScore: jsonb('fit_score'),
  reasonCode: text('reason_code').notNull(),
  reasonText: text('reason_text').notNull(),
  status: text('status').default('candidate').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiredAt: timestamp('expired_at', { withTimezone: true }),
});

export const messageTemplates = pgTable('message_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  scene: text('scene').notNull(),
  tone: text('tone').default('default').notNull(),
  intensityBand: text('intensity_band').default('low').notNull(),
  templateText: text('template_text').notNull(),
  variables: jsonb('variables').$type<Record<string, unknown>>(),
  version: integer('version').default(1).notNull(),
  status: text('status').default('active').notNull(),
});

export const nudges = pgTable('nudges', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => itemCommitments.id, { onDelete: 'cascade' }),
  windowId: uuid('window_id').references(() => opportunityWindows.id, { onDelete: 'set null' }),
  templateId: uuid('template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),
  intensity: integer('intensity').default(1).notNull(),
  channel: text('channel').default('push').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status').default('scheduled').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const nudgeOptions = pgTable('nudge_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  nudgeId: uuid('nudge_id').notNull().references(() => nudges.id, { onDelete: 'cascade' }),
  optionCode: text('option_code').notNull(),
  label: text('label').notNull(),
  actionType: text('action_type').notNull(),
  actionPayload: jsonb('action_payload').$type<Record<string, unknown>>(),
  sortOrder: integer('sort_order').default(0).notNull(),
});

export const decisions = pgTable('decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').references(() => itemCommitments.id, { onDelete: 'cascade' }),
  nudgeId: uuid('nudge_id').references(() => nudges.id, { onDelete: 'set null' }),
  optionId: uuid('option_id').references(() => nudgeOptions.id, { onDelete: 'set null' }),
  decision: text('decision').notNull(),
  reason: text('reason').default('').notNull(),
  effectMetrics: jsonb('effect_metrics').$type<Record<string, unknown>>(),
  decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
});

export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  decisionId: uuid('decision_id').references(() => decisions.id, { onDelete: 'set null' }),
  feedbackType: text('feedback_type').default('implicit').notNull(),
  rating: integer('rating'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memoryNotes = pgTable('memory_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').references(() => itemCommitments.id, { onDelete: 'cascade' }),
  decisionId: uuid('decision_id').references(() => decisions.id, { onDelete: 'set null' }),
  memoryType: text('memory_type').notNull(),
  content: text('content').notNull(),
  salience: jsonb('salience'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

注意：`confidence`/`availabilityScore`/`frictionScore`/`fitScore`/`salience` 为等效便利用 `jsonb`（迁移 SQL 保持一致）；如改 numeric 列必须两端同步 — **本计划默认 jsonb（与 Python 端 JSON 语义对齐）**。

- [ ] **Step 4: 运行 schema 测试确认通过**

Run: `cd backend && npm test`
Expected: 3 passed（schema 测试）

- [ ] **Step 5: 创建迁移 SQL 与 supabase 配置（与 schema 逐列一致）**

`backend/supabase/config.toml`：

```toml
project_id = "jnify"
# 供 supabase CLI link/push 使用；本地栈(docker)无需启动，仅远端操作。
```

`backend/supabase/migrations/20260827000000_init.sql`：

```sql
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
```

- [ ] **Step 6: 弱校验 + 提交**

迁移 SQL 与 schema.ts 逐表比对（列名/类型/默认值一致）；`supabase db lint` 需 docker 本机不可用，跳过并注明。schema 单测全绿即收口。

```bash
git add backend/supabase backend/src/db/schema.ts backend/test/schema.test.ts
git commit -m "feat(backend): add drizzle schema + init migration for 15 entities"
```

---

### Task 3: 边缘库（audit / rate-limit / privacy）

**Covers:** [S7]

**Files:**
- Create: `backend/src/lib/audit.ts`
- Create: `backend/src/lib/rate-limit.ts`
- Create: `backend/src/lib/privacy.ts`
- Test: `backend/test/rate-limit.test.ts`
- Test: `backend/test/privacy.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `audit(c, event, data)`（打日志）；`slidingWindow(key, limit, windowMs)` 返回 `() => boolean`；`checkSignal(signalType, scope)` 返回 `{ allowed: boolean; reason?: string }`；`ALLOWED_SIGNALS` 常量。

- [ ] **Step 1: 写失败测试**

`backend/test/rate-limit.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { slidingWindow } from '../src/lib/rate-limit';

describe('slidingWindow', () => {
  it('allows up to limit then blocks', () => {
    const limit = slidingWindow('u1:/v1/items', 2, 60_000);
    expect(limit()).toBe(true);
    expect(limit()).toBe(true);
    expect(limit()).toBe(false);
  });

  it('independent per key', () => {
    const a = slidingWindow('a', 1, 60_000);
    const b = slidingWindow('b', 1, 60_000);
    a();
    expect(a()).toBe(false);
    expect(b()).toBe(true);
  });
});
```

`backend/test/privacy.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { checkSignal } from '../src/lib/privacy';

describe('checkSignal', () => {
  it('rejects unknown signal types', () => {
    expect(checkSignal('brain_wave', {}).allowed).toBe(false);
  });

  it('requires coarse_location scope for location', () => {
    expect(checkSignal('location', { coarse_location: false }).allowed).toBe(false);
    expect(checkSignal('location', { coarse_location: true }).allowed).toBe(true);
  });

  it('requires weather and calendar scope flags', () => {
    expect(checkSignal('weather', {}).allowed).toBe(false);
    expect(checkSignal('calendar', {}).allowed).toBe(false);
  });

  it('usage is always allowed', () => {
    expect(checkSignal('usage', {}).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test`
Expected: FAIL — module not found

- [ ] **Step 3: 实现三模块**

`backend/src/lib/audit.ts`：

```ts
import type { Context } from 'hono';
import type { Env } from '../config';

const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function audit(c: Context<{ Bindings: Env }>, event: string, data?: Record<string, unknown>): void {
  const level = (c.env.LOG_LEVEL ?? 'info').toLowerCase();
  const threshold = LEVELS[level] ?? LEVELS.info;
  const msgLevel = event.startsWith('error') ? 'error' : 'info';
  if (LEVELS[msgLevel] < threshold) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}
```

`backend/src/lib/rate-limit.ts`：

```ts
// 进程内滑动窗口。单 isolate 近似计数；多 isolate/生产应换 CF Rate Limiting。
const buckets = new Map<string, number[]>();

export function slidingWindow(key: string, limit: number, windowMs: number): () => boolean {
  return () => {
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      buckets.set(key, hits);
      return false;
    }
    hits.push(now);
    buckets.set(key, hits);
    return true;
  };
}
```

`backend/src/lib/privacy.ts`：

```ts
export const ALLOWED_SIGNALS = new Set(['calendar', 'weather', 'location', 'usage']);

const SCOPE_GATED: Record<string, string> = {
  weather: 'weather',
  calendar: 'calendar',
  location: 'coarse_location',
};

export function checkSignal(
  signalType: string,
  scope: Record<string, boolean>,
): { allowed: boolean; reason?: string } {
  if (!ALLOWED_SIGNALS.has(signalType)) return { allowed: false, reason: `unknown signal_type: ${signalType}` };
  if (signalType === 'usage') return { allowed: true };
  if (SCOPE_GATED[signalType] && scope[SCOPE_GATED[signalType]] !== true) {
    return { allowed: false, reason: `${SCOPE_GATED[signalType]} scope not granted` };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npm test`
Expected: 全部通过（config 3 + schema 3 + rate-limit 2 + privacy 4 = 12）

- [ ] **Step 5: 提交**

```bash
git add backend/src/lib backend/test/rate-limit.test.ts backend/test/privacy.test.ts
git commit -m "feat(backend): add audit / rate-limit / privacy-scope libs"
```

---

### Task 4: 认证（jose JWKS 验签 + ensureUser 中间件）

**Covers:** [S6]

**Files:**
- Create: `backend/src/lib/auth.ts`
- Test: `backend/test/auth.test.ts`

**Interfaces:**
- Consumes: `Env.SUPABASE_URL`；Drizzle `users` 表（Task 2）
- Produces: `verifyJwt(token, supabaseUrl)` → `Promise<string>`（返回 sub）；`requireAuth` Hono 中间件（`c.set('userId', sub)`，失败 401）；`ensureUser(db, userId)` → `Promise<void>`（`INSERT ... ON CONFLICT DO NOTHING`）。
- 注：`requireAuth` 的 DB 写入依赖 Task 9 的 db 类型；本任务实现时用最小接口 `{ insert(...): Promise<unknown> }` 的结构化类型，Task 9 后无需改动调用方。

- [ ] **Step 1: 写失败测试（本地生成 RSA 密钥对 + 本地 JWKS http server 模拟 Supabase）**

`backend/test/auth.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyJwt, ensureUser } from '../src/lib/auth';

describe('verifyJwt', () => {
  let server: Server;
  let jwksUrl: string;
  let signKey: CryptoKey;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    signKey = privateKey;
    const pubJwk = await exportJWK(publicKey);
    const jwks = JSON.stringify({ keys: [{ ...(pubJwk as object), kid: 'test', alg: 'RS256', use: 'sig' }] });
    server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(jwks);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    jwksUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('returns sub for a valid signed token', async () => {
    const token = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(`${jwksUrl}/auth/v1`)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(signKey);
    await expect(verifyJwt(token, jwksUrl)).resolves.toBe('user-123');
  });

  it('rejects a garbage token', async () => {
    await expect(verifyJwt('not-a-jwt', jwksUrl)).rejects.toThrow();
  });
});

describe('ensureUser', () => {
  it('is a no-op callable (sql shape deferred to integration)', () => {
    expect(typeof ensureUser).toBe('function');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test test/auth.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/auth'`

- [ ] **Step 3: 实现 auth.ts**

`backend/src/lib/auth.ts`：

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../config';
import { users as usersTable } from '../db/schema';

export function jwksFor(supabaseUrl: string) {
  return createRemoteJWKSet(
    new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`),
  );
}

export async function verifyJwt(token: string, supabaseUrl: string): Promise<string> {
  const { payload } = await jwtVerify(token, jwksFor(supabaseUrl), {
    issuer: `${supabaseUrl.replace(/\/$/, '')}/auth/v1`,
  });
  if (typeof payload.sub !== 'string') throw new Error('missing sub');
  return payload.sub;
}

interface MinimalDb {
  insert(table: unknown): Promise<unknown>;
  values(values: unknown): Promise<unknown>;
  onConflictDoNothing(): Promise<unknown>;
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: { userId: string } }> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ detail: 'unauthorized' }, 401);
  try {
    c.set('userId', await verifyJwt(header.slice(7), c.env.SUPABASE_URL));
    await next();
  } catch {
    return c.json({ detail: 'unauthorized' }, 401);
  }
};

export async function ensureUser(db: MinimalDb, userId: string): Promise<void> {
  await db.insert(usersTable as never).values({ id: userId }).onConflictDoNothing();
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npm test test/auth.test.ts`
Expected: PASS（2 passed；node 的 fetch 支持 data: URL）

- [ ] **Step 5: 提交**

```bash
git add backend/src/lib/auth.ts backend/test/auth.test.ts
git commit -m "feat(backend): add jose JWKS auth middleware + ensureUser"
```

---

### Task 5: 机会窗口引擎（window-engine）

**Covers:** [S7]

**Files:**
- Create: `backend/src/services/window-engine.ts`
- Test: `backend/test/window-engine.test.ts`

**Interfaces:**
- Consumes: 无（纯函数）
- Produces: `interface WindowResult { reasonCode: string; reasonText: string; fitScore: number; windowStart: Date; windowEnd: Date }`；`computeWindow(item: ItemLike, opts?: { contextFeatures?: Record<string, unknown>; now?: Date })` → `WindowResult`。
  - `ItemLike` = `{ id: string; category: string; dueAt: Date | null }`（结构化最小类型，Task 10 从 DB 行适配）。
- 分支（与 Python 版等价）：`due_soon`(≤10 天, fit 0.85) / `weather`(chore + ctx.sunny, fit 0.8) / `usage_state`(social, fit 0.75) / 兜底 `manual_window`(fit 0.5)；窗口时长 8h。

- [ ] **Step 1: 写失败测试**

`backend/test/window-engine.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { computeWindow } from '../src/services/window-engine';

const NOW = new Date('2026-08-27T04:00:00Z');

function item(over: Partial<{ category: string; dueAt: Date | null }> = {}) {
  return { id: 'i1', category: 'life', dueAt: null, ...over };
}

describe('computeWindow', () => {
  it('due_soon when due within 10 days', () => {
    const w = computeWindow(item({ dueAt: new Date('2026-09-01T00:00:00Z') }), { now: NOW });
    expect(w.reasonCode).toBe('due_soon');
    expect(w.fitScore).toBe(0.85);
  });

  it('weather when chore and sunny context', () => {
    const w = computeWindow(item({ category: 'chore' }), { now: NOW, contextFeatures: { sunny: true } });
    expect(w.reasonCode).toBe('weather');
    expect(w.fitScore).toBe(0.8);
  });

  it('usage_state for social', () => {
    const w = computeWindow(item({ category: 'social' }), { now: NOW });
    expect(w.reasonCode).toBe('usage_state');
  });

  it('manual_window default', () => {
    const w = computeWindow(item(), { now: NOW });
    expect(w.reasonCode).toBe('manual_window');
    expect(w.fitScore).toBe(0.5);
  });

  it('windows span 8h from now', () => {
    const w = computeWindow(item(), { now: NOW });
    expect(w.windowStart.toISOString()).toBe(NOW.toISOString());
    expect(w.windowEnd.getTime() - w.windowStart.getTime()).toBe(8 * 3600_000);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test test/window-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

`backend/src/services/window-engine.ts`：

```ts
export interface WindowResult {
  reasonCode: string;
  reasonText: string;
  fitScore: number;
  windowStart: Date;
  windowEnd: Date;
}

export interface ItemLike {
  id: string;
  category: string;
  dueAt: Date | null;
}

const WINDOW_HOURS = 8;
const DAYS_MS = 24 * 3600_000;

export function computeWindow(
  item: ItemLike,
  opts: { contextFeatures?: Record<string, unknown>; now?: Date } = {},
): WindowResult {
  const now = opts.now ?? new Date();
  const ctx = opts.contextFeatures ?? {};
  const start = now;
  const end = new Date(now.getTime() + WINDOW_HOURS * 3600_000);

  if (item.dueAt && item.dueAt.getTime() <= now.getTime() + 10 * DAYS_MS) {
    const days = Math.max(1, Math.ceil((item.dueAt.getTime() - now.getTime()) / DAYS_MS));
    return { reasonCode: 'due_soon', reasonText: `还有 ${days} 天到期，现在是顺手处理的好时机。`, fitScore: 0.85, windowStart: start, windowEnd: end };
  }
  if (item.category === 'chore' && ctx.sunny === true) {
    return { reasonCode: 'weather', reasonText: '这两天天气合适，正是顺手处理的好时候。', fitScore: 0.8, windowStart: start, windowEnd: end };
  }
  if (item.category === 'social') {
    return { reasonCode: 'usage_state', reasonText: '这会儿您比较放松，适合花一分钟收个尾。', fitScore: 0.75, windowStart: start, windowEnd: end };
  }
  return { reasonCode: 'manual_window', reasonText: '我把这件事放在了「最顺手」的位置，您随时可以处理。', fitScore: 0.5, windowStart: start, windowEnd: end };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npm test test/window-engine.test.ts`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/window-engine.ts backend/test/window-engine.test.ts
git commit -m "feat(backend): opportunity window engine (4 deterministic branches)"
```

---

### Task 6: 升级引擎（escalation，护栏驱动）

**Covers:** [S7]

**Files:**
- Create: `backend/src/services/escalation.ts`
- Test: `backend/test/escalation.test.ts`

**Interfaces:**
- Consumes: 无（纯函数）
- Produces: `interface GuardrailsLike { quietHoursStart: string; quietHoursEnd: string; maxNudgeBudget: number }`；`interface PolicyLike { maxNudges: number | null; nudgeCount: number | null }`；`shouldNudge(policy, guardrails, now?)` → `{ allowed: boolean; intensity: number }`；`inQuietHours(time: string, start: string, end: string)`（跨零点支持）。

- [ ] **Step 1: 写失败测试**

`backend/test/escalation.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { inQuietHours, shouldNudge } from '../src/services/escalation';

const G = { quietHoursStart: '23:30', quietHoursEnd: '08:30', maxNudgeBudget: 3 };
const P = { maxNudges: 3, nudgeCount: 0 };

describe('inQuietHours', () => {
  it('blocks inside quiet hours', () => {
    expect(inQuietHours('2026-08-27T02:00:00Z', '23:30', '08:30')).toBe(true);
    expect(inQuietHours('2026-08-27T23:45:00Z', '23:30', '08:30')).toBe(true);
  });
  it('allows outside quiet hours', () => {
    expect(inQuietHours('2026-08-27T10:00:00Z', '23:30', '08:30')).toBe(false);
  });
});

describe('shouldNudge', () => {
  it('allows within budget and outside quiet hours', () => {
    expect(shouldNudge(P, G, new Date('2026-08-27T10:00:00Z'))).toEqual({ allowed: true, intensity: 1 });
  });
  it('blocks when budget exhausted', () => {
    expect(shouldNudge({ maxNudges: 3, nudgeCount: 3 }, G, new Date('2026-08-27T10:00:00Z')).allowed).toBe(false);
  });
  it('blocks inside quiet hours', () => {
    expect(shouldNudge(P, G, new Date('2026-08-27T02:00:00Z')).allowed).toBe(false);
  });
  it('intensity grows with nudges, capped at 3', () => {
    expect(shouldNudge({ maxNudges: 3, nudgeCount: 2 }, G, new Date('2026-08-27T10:00:00Z')).intensity).toBe(3);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test test/escalation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

`backend/src/services/escalation.ts`：

```ts
export interface GuardrailsLike {
  quietHoursStart: string;
  quietHoursEnd: string;
  maxNudgeBudget: number;
}

export interface PolicyLike {
  maxNudges: number | null;
  nudgeCount: number | null;
}

export function inQuietHours(time: string | Date, start: string, end: string): boolean {
  const d = typeof time === 'string' ? new Date(time) : time;
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  const s = toMin(start);
  const e = toMin(end);
  if (s <= e) return minute >= s && minute < e;
  return minute >= s || minute < e;
}

export function shouldNudge(
  policy: PolicyLike,
  guardrails: GuardrailsLike,
  now: Date = new Date(),
): { allowed: boolean; intensity: number } {
  const budget = policy.maxNudges ?? guardrails.maxNudgeBudget;
  if ((policy.nudgeCount ?? 0) >= budget) return { allowed: false, intensity: 0 };
  if (inQuietHours(now, guardrails.quietHoursStart, guardrails.quietHoursEnd)) {
    return { allowed: false, intensity: 0 };
  }
  return { allowed: true, intensity: Math.min(3, (policy.nudgeCount ?? 0) + 1) };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npm test test/escalation.test.ts`
Expected: 6 passed

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/escalation.ts backend/test/escalation.test.ts
git commit -m "feat(backend): escalation engine driven by user guardrails"
```

---

### Task 7: Jennifer Brain（draft 模板 + options）

**Covers:** [S7]

**Files:**
- Create: `backend/src/services/brain.ts`
- Test: `backend/test/brain.test.ts`

**Interfaces:**
- Consumes: `WindowResult`（Task 5）
- Produces: `interface DraftOption { code: string; label: string; actionType: string }`；`draft(item: { title: string; category: string }, window: WindowResult | null)` → `{ title: string; body: string; options: DraftOption[]; degraded: boolean }`。
- 规则：degraded 恒 `true`（LLM 未接线）；options 默认 now/later/drop，`category ∈ {chore, return}` 追加 rescue「帮我兜底」。

- [ ] **Step 1: 写失败测试**

`backend/test/brain.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { draft } from '../src/services/brain';

const window = { reasonCode: 'manual_window', reasonText: '我把这件事放在了最顺手的位置。', fitScore: 0.5, windowStart: new Date(), windowEnd: new Date() };

describe('draft', () => {
  it('always degrades to template', () => {
    const d = draft({ title: '晒被子', category: 'chore' }, window);
    expect(d.degraded).toBe(true);
    expect(d.body).toBe(window.reasonText);
  });

  it('base options are now/later/drop', () => {
    const d = draft({ title: '回小明', category: 'social' }, null);
    expect(d.options.map((o) => o.code)).toEqual(['now', 'later', 'drop']);
  });

  it('adds rescue for chore and return', () => {
    for (const category of ['chore', 'return']) {
      const d = draft({ title: 'x', category }, window);
      expect(d.options.map((o) => o.code)).toContain('rescue');
    }
  });

  it('falls back title when missing', () => {
    const d = draft({ title: '', category: 'life' }, null);
    expect(d.title).toBe('有一件事');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test test/brain.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

`backend/src/services/brain.ts`：

```ts
import type { WindowResult } from './window-engine';

export interface DraftOption {
  code: string;
  label: string;
  actionType: string;
}

export function draft(
  item: { title: string; category: string },
  window: WindowResult | null,
): { title: string; body: string; options: DraftOption[]; degraded: boolean } {
  const title = item.title.trim() || '有一件事';
  const body = window?.reasonText ?? '不急，但我帮您盯着。';
  const options: DraftOption[] = [
    { code: 'now', label: '现在做', actionType: 'do' },
    { code: 'later', label: '晚点，换个窗口', actionType: 'defer' },
    { code: 'drop', label: '这件事算了', actionType: 'drop' },
  ];
  if (item.category === 'chore' || item.category === 'return') {
    options.push({ code: 'rescue', label: '帮我兜底', actionType: 'rescue' });
  }
  return { title, body, options, degraded: true };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npm test test/brain.test.ts`
Expected: 4 passed

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/brain.ts backend/test/brain.test.ts
git commit -m "feat(backend): jennifer brain template draft with conditional rescue"
```

---

### Task 8: 录人与决策反馈（capture + decision-feedback 纯逻辑）

**Covers:** [S7]

**Files:**
- Create: `backend/src/services/capture.ts`
- Create: `backend/src/services/decision-feedback.ts`
- Test: `backend/test/capture.test.ts`
- Test: `backend/test/decision-feedback.test.ts`

**Interfaces:**
- Consumes: 无（对外纯函数；DB 写入由 Task 9 的 `db` 注入）
- Produces:
  - `parseTitle(rawText: string)` → `string`；`captureValues({ rawText, sourceType, category, dueAt })` → `{ title, rawText, sourceType, category, dueAt, status: 'parked', ... }`（确定性字段）；`CAPTURE_MESSAGE = '记下了：不急，但我帮您盯着。'`
  - `DECISION_MESSAGES: Record<string, string>`（now/later/drop/rescue）；`nextState(decision)` → `{ status, closedAt: boolean, touchUpdatedAt: boolean }`；`decisionMessage(decision)`。
- 状态机：now→done(closed)、drop→abandoned(closed)、rescue→rescued、later→deferred(同事务回 parked 并 touch updated_at)。

- [ ] **Step 1: 写失败测试**

`backend/test/capture.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { CAPTURE_MESSAGE, captureValues, parseTitle } from '../src/services/capture';

describe('capture', () => {
  it('parses title from raw text', () => {
    expect(parseTitle('  月底还信用卡  ')).toBe('月底还信用卡');
  });
  it('falls back when blank', () => {
    expect(parseTitle('   ')).toBe('有一件事');
  });
  it('builds parked values with defaults', () => {
    const v = captureValues({ rawText: '晒被子', category: 'chore' });
    expect(v.status).toBe('parked');
    expect(v.category).toBe('chore');
    expect(v.dueAt).toBeNull();
    expect(v.importance).toBe(1);
    expect(v.estMinutes).toBe(5);
  });
  it('keeps capture message', () => {
    expect(CAPTURE_MESSAGE).toBe('记下了：不急，但我帮您盯着。');
  });
});
```

`backend/test/decision-feedback.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { decisionMessage, nextState } from '../src/services/decision-feedback';

describe('nextState', () => {
  it('now closes as done', () => {
    expect(nextState('now')).toEqual({ status: 'done', closedAt: true, touchUpdatedAt: false });
  });
  it('drop closes as abandoned', () => {
    expect(nextState('drop')).toEqual({ status: 'abandoned', closedAt: true, touchUpdatedAt: false });
  });
  it('later defers then returns to parked with touch', () => {
    expect(nextState('later')).toEqual({ status: 'deferred', closedAt: false, touchUpdatedAt: true });
  });
  it('rescue stays open', () => {
    const s = nextState('rescue');
    expect(s.status).toBe('rescued');
    expect(s.closedAt).toBe(false);
  });
  it('unknown decision keeps status', () => {
    expect(nextState('bogus').status).toBe('bogus');
  });
});

describe('decisionMessage', () => {
  it('has warm copy for all four decisions', () => {
    for (const d of ['now', 'later', 'drop', 'rescue']) {
      expect(decisionMessage(d).length).toBeGreaterThan(4);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test`（两个新文件）
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

`backend/src/services/capture.ts`：

```ts
export const CAPTURE_MESSAGE = '记下了：不急，但我帮您盯着。';

export function parseTitle(rawText: string): string {
  const title = rawText.trim();
  return title || '有一件事';
}

export type NewCommitment = {
  title: string;
  rawText: string;
  sourceType: string;
  category: string;
  status: string;
  dueAt: Date | null;
  importance: number;
  urgency: number;
  abandonCost: number;
  estMinutes: number;
};

export function captureValues(input: {
  rawText: string;
  sourceType?: string;
  category?: string;
  dueAt?: Date | null;
}): NewCommitment {
  return {
    title: parseTitle(input.rawText),
    rawText: input.rawText.trim(),
    sourceType: input.sourceType ?? 'text',
    category: input.category ?? 'life',
    status: 'parked',
    dueAt: input.dueAt ?? null,
    importance: 1,
    urgency: 1,
    abandonCost: 1,
    estMinutes: 5,
  };
}
```

`backend/src/services/decision-feedback.ts`：

```ts
export const DECISION_MESSAGES: Record<string, string> = {
  now: '完成。这个窗口有效，Jennifer 记住了。',
  later: '好，晚点。它不会消失，等下一个顺手窗口。',
  drop: '已体面放弃，这件事收口了。',
  rescue: '已接手兜底，需要真实动作时会先跟您确认。',
};

export function decisionMessage(decision: string): string {
  return DECISION_MESSAGES[decision] ?? '记下了。';
}

export function nextState(decision: string): { status: string; closedAt: boolean; touchUpdatedAt: boolean } {
  switch (decision) {
    case 'now':
      return { status: 'done', closedAt: true, touchUpdatedAt: false };
    case 'drop':
      return { status: 'abandoned', closedAt: true, touchUpdatedAt: false };
    case 'later':
      // 同一事务内回 parked：Task 10 的 DB 层执行时先置 deferred 再回 parked 并 touch updated_at
      return { status: 'deferred', closedAt: false, touchUpdatedAt: true };
    case 'rescue':
      return { status: 'rescued', closedAt: false, touchUpdatedAt: false };
    default:
      return { status: decision, closedAt: false, touchUpdatedAt: false };
  }
}

export function effectMetrics(decision: string, reason: string): Record<string, unknown> {
  return { decision, reason };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npm test`
Expected: capture 4 + decision-feedback 9 通过

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/capture.ts backend/src/services/decision-feedback.ts backend/test/capture.test.ts backend/test/decision-feedback.test.ts
git commit -m "feat(backend): capture values + decision state machine (pure logic)"
```

---

### Task 9: DB 客户端 + context 聚合 + notification orchestrator

**Covers:** [S4, S7]

**Files:**
- Create: `backend/src/db/index.ts`
- Create: `backend/src/services/context.ts`
- Create: `backend/src/services/orchestrator.ts`
- Test: `backend/test/db-shape.test.ts`（仅类型/形状，不连库）

**Interfaces:**
- Consumes: `Env.DATABASE_URL`（Task 1）；schema（Task 2）；`computeWindow`（Task 5）；`shouldNudge`（Task 6）；`draft`（Task 7）
- Produces:
  - `createDb(databaseUrl: string)` → Drizzle 实例（postgres.js，`prepare: false`，ssl）；`robustGuardrails(db, userId)` → `Promise<GuardrailsLike>`（读 user_preferences scene='guardrails'，缺省回落 DEFAULTS）；`robustPrivacyScope(db, userId)` → `Promise<Record<string, boolean>>`（读 privacy_scope，缺省 `{ calendar: true, weather: true, coarse_location: true }`）；`latestContext(db, userId)` → `Promise<Record<string, unknown> | null>`（最近 ContextSnapshot 的 context_features）。
  - `ingestSignal(db, userId, { signalType, payload, occurredAt })` → `Promise<void>`（建 signal_event + context_snapshot + M2M 行）。
  - `buildNudge(db, item, windowRow, policy, guardrails, options)` → `Promise<{ nudgeId: string | null }>`（reason-gate + shouldNudge；建 nudge + nudge_options；`nudge_count++`）。
- 事务：later 决策的两段状态（deferred→parked + touch updated_at）在 Task 10 的 `db.transaction` 内完成。

- [ ] **Step 1: 写形状测试（不连库）**

`backend/test/db-shape.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createDb, robustGuardrails, latestContext } from '../src/db';
import { ingestSignal } from '../src/services/context';
import { buildNudge } from '../src/services/orchestrator';

describe('db module shape', () => {
  it('createDb requires DATABASE_URL', () => {
    expect(() => createDb('')).toThrow();
  });
  it('exports services with expected arity', () => {
    expect(robustGuardrails.length).toBe(2);
    expect(latestContext.length).toBe(2);
    expect(ingestSignal.length).toBe(3);
    expect(buildNudge.length).toBe(6);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test test/db-shape.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 db/index.ts**

`backend/src/db/index.ts`：

```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from './schema';
import { DEFAULTS } from '../config';
import type { GuardrailsLike } from '../services/escalation';

export const dbSchema = schema;
export type Db = ReturnType<typeof createDb>;

const cache = new Map<string, Db>();

export function createDb(databaseUrl: string): Db {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const hit = cache.get(databaseUrl);
  if (hit) return hit;
  // pooler 事务模式不支持 prepared statements，必须 prepare:false
  const client = postgres(databaseUrl, { prepare: false, ssl: 'require' });
  const db = drizzle(client, { schema });
  cache.set(databaseUrl, db);
  return db;
}

export async function robustGuardrails(db: Db, userId: string): Promise<GuardrailsLike> {
  const rows = await db
    .select()
    .from(schema.userPreferences)
    .where(and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.scene, 'guardrails')));
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    quietHoursStart: m.get('quiet_hours_start') ?? DEFAULTS.QUIET_HOURS_START,
    quietHoursEnd: m.get('quiet_hours_end') ?? DEFAULTS.QUIET_HOURS_END,
    maxNudgeBudget: Number(m.get('max_nudge_budget') ?? DEFAULTS.MAX_NUDGE_BUDGET),
  };
}

export async function robustPrivacyScope(db: Db, userId: string): Promise<Record<string, boolean>> {
  const rows = await db
    .select()
    .from(schema.userPreferences)
    .where(and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.scene, 'guardrails')));
  const row = rows.find((r) => r.key === 'privacy_scope');
  if (!row) return { calendar: true, weather: true, coarse_location: true };
  const parsed = JSON.parse(row.value) as Record<string, boolean>;
  return { calendar: true, weather: true, coarse_location: true, ...parsed };
}

export async function latestContext(db: Db, userId: string): Promise<Record<string, unknown> | null> {
  const row = await db
    .select()
    .from(schema.contextSnapshots)
    .where(eq(schema.contextSnapshots.userId, userId))
    .orderBy(desc(schema.contextSnapshots.computedAt))
    .limit(1);
  return row[0]?.contextFeatures ?? null;
}
```

- [ ] **Step 4: 实现 context.ts**

`backend/src/services/context.ts`：

```ts
import type { Db } from '../db';
import { dbSchema as s } from '../db';

export async function ingestSignal(
  db: Db,
  userId: string,
  input: { signalType: string; payload: Record<string, unknown>; occurredAt: Date },
): Promise<void> {
  const occurredAt = input.occurredAt;
  const [signal] = await db
    .insert(s.signalEvents)
    .values({ userId, signalType: input.signalType, payload: input.payload, occurredAt })
    .returning({ id: s.signalEvents.id });
  const features = input.payload;
  const availability = features.free_slot ? 0.6 : 0.3;
  const friction = features.low_friction ? 0.2 : 0.7;
  const [snapshot] = await db
    .insert(s.contextSnapshots)
    .values({
      userId,
      snapshotKey: `${input.signalType}:${occurredAt.toISOString()}`,
      contextFeatures: features,
      availabilityScore: availability,
      frictionScore: friction,
    })
    .returning({ id: s.contextSnapshots.id });
  await db.insert(s.contextSnapshotSignals).values({ contextSnapshotId: snapshot.id, signalEventId: signal.id });
}
```

- [ ] **Step 5: 实现 orchestrator.ts**

`backend/src/services/orchestrator.ts`：

```ts
import type { Db } from '../db';
import { dbSchema as s } from '../db';
import { computeWindow, type WindowResult } from './window-engine';
import { shouldNudge, type GuardrailsLike } from './escalation';
import { draft, type DraftOption } from './brain';

export interface ItemRowLike {
  id: string;
  title: string;
  category: string;
  dueAt: Date | null;
}

// 若既有 window 未过期则复用（不重复 Nudge）；否则新建并落库。
export async function freshOrReuseWindow(
  db: Db,
  item: ItemRowLike,
  opts: { contextFeatures?: Record<string, unknown>; now?: Date } = {},
): Promise<{ windowId: string; result: WindowResult }> {
  const now = opts.now ?? new Date();
  const existing = await db
    .select()
    .from(s.opportunityWindows)
    .where(eq(s.opportunityWindows.itemId, item.id))
    .orderBy(desc(s.opportunityWindows.createdAt))
    .limit(1);
  if (existing[0] && new Date(existing[0].windowEnd).getTime() > now.getTime()) {
    return {
      windowId: existing[0].id,
      result: {
        reasonCode: existing[0].reasonCode,
        reasonText: existing[0].reasonText,
        fitScore: Number(existing[0].fitScore ?? 0),
        windowStart: new Date(existing[0].windowStart),
        windowEnd: new Date(existing[0].windowEnd),
      },
    };
  }
  const result = computeWindow(item, { contextFeatures: opts.contextFeatures, now });
  const [row] = await db
    .insert(s.opportunityWindows)
    .values({
      itemId: item.id,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
      fitScore: result.fitScore,
      reasonCode: result.reasonCode,
      reasonText: result.reasonText,
      status: 'served',
    })
    .returning({ id: s.opportunityWindows.id });
  return { windowId: row.id, result };
}

export async function buildNudge(
  db: Db,
  item: ItemRowLike,
  policy: { maxNudges: number; nudgeCount: number },
  guardrails: GuardrailsLike,
  windowId: string,
  result: WindowResult,
  now: Date = new Date(),
): Promise<string | null> {
  const g = await shouldNudge(policy, guardrails, now);
  if (!g.allowed) return null;
  if (!result.reasonText) return null; // 没有理由不通知
  const { title, body, options } = draft(item, result);
  const [nudge] = await db
    .insert(s.nudges)
    .values({
      itemId: item.id,
      windowId,
      intensity: g.intensity,
      channel: 'push',
      title,
      body,
      status: 'scheduled',
    })
    .returning({ id: s.nudges.id });
  await db.insert(s.nudgeOptions).values(
    options.map((o: DraftOption, i: number) => ({
      nudgeId: nudge.id,
      optionCode: o.code,
      label: o.label,
      actionType: o.actionType,
      sortOrder: i,
    })),
  );
  await db
    .update(s.escalationPolicies)
    .set({ nudgeCount: (policy.nudgeCount ?? 0) + 1 })
    .where(eq(s.escalationPolicies.itemId, item.id));
  return nudge.id;
}
```

- [ ] **Step 6: 运行确认通过 + 提交**

Run: `cd backend && npm test test/db-shape.test.ts`
Expected: PASS（注意：db-shape 不连库，仅验证 API 形状与 DATABASE_URL 校验）

```bash
git add backend/src/db/index.ts backend/src/services/context.ts backend/src/services/orchestrator.ts backend/test/db-shape.test.ts
git commit -m "feat(backend): db client (postgres prepare:false) + context ingest + nudge orchestrator"
```

---

### Task 10: 路由与应用组装（11 端点）

**Covers:** [S5, S6, S7, S8]

**Files:**
- Create: `backend/src/routes/items.ts`
- Create: `backend/src/routes/now.ts`
- Create: `backend/src/routes/signals.ts`
- Create: `backend/src/routes/guardrails.ts`
- Create: `backend/src/routes/me.ts`
- Create: `backend/src/routes/llm.ts`
- Create: `backend/src/routes/health.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/index.ts`
- Test: `backend/test/app-shape.test.ts`（无 DB 的组装/错误路径：401 语义 + JSON 错误包裹）

**Interfaces:**
- Consumes: Task 1-9 全部产出
- Produces: `makeApp(env: Env)` → `Hono` 应用（绑定 env；`/v1/*` 挂 `requireAuth` + rate-limit fail-open；CORS；全局错误处理器返回 `{ detail }`）；`index.ts` 导出 `default makeApp(process.env as unknown as Env)`（wrangler 绑定；本机 vitest 用显式 env 调用 makeApp）。

- [ ] **Step 1: 写组装与 401 失败测试**

`backend/test/app-shape.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { makeApp } from '../src/app';

const env = { SUPABASE_URL: 'https://x.supabase.co', DATABASE_URL: '' } as never;

describe('app assembly', () => {
  it('GET /v1/now without token returns 401', async () => {
    const res = await makeApp(env).request('/v1/now');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'unauthorized' });
  });

  it('unknown route returns 404 with detail', async () => {
    const res = await makeApp(env).request('/nope');
    expect(res.status).toBe(404);
    expect((await res.json()) as Record<string, unknown>).toHaveProperty('detail');
  });

  it('GET /health returns ok', async () => {
    const res = await makeApp(env).request('/health');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npm test test/app-shape.test.ts`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: 实现路由（完整代码；公共类型见 app.ts 的 `AppEnv`）**

`backend/src/routes/health.ts`：

```ts
import { Hono } from 'hono';
import type { AppEnv } from '../app';

export const health = new Hono<AppEnv>();

health.get('/', (c) =>
  c.json({ name: 'jnify-backend', version: c.env.APP_VERSION ?? '0.1.0', env: c.env.APP_ENV ?? 'development' }),
);

health.get('/health', (c) => c.json({ status: 'ok' }));
```

`backend/src/routes/items.ts`：

```ts
import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import type { AppEnv } from '../app';
import { dbSchema as s } from '../db';
import { ensureUser } from '../lib/auth';
import { CAPTURE_MESSAGE, captureValues } from '../services/capture';
import { decisionMessage, effectMetrics, nextState } from '../services/decision-feedback';

export const items = new Hono<AppEnv>();

items.post('/capture', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ raw_text?: string; source_type?: string; category?: string; due_at?: string }>();
  if (!body.raw_text?.trim()) return c.json({ detail: 'raw_text is required' }, 422);
  await ensureUser(db, userId);
  const values = captureValues({
    rawText: body.raw_text,
    sourceType: body.source_type,
    category: body.category,
    dueAt: body.due_at ? new Date(body.due_at) : null,
  });
  const [item] = await db
    .insert(s.itemCommitments)
    .values({ userId, ...values })
    .returning();
  await db.insert(s.escalationPolicies).values({ itemId: item.id, maxNudges: 3, nudgeCount: 0 });
  return c.json({ item, status: item.status, message: CAPTURE_MESSAGE });
});

items.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const status = c.req.query('status');
  const base = db.select().from(s.itemCommitments).where(eq(s.itemCommitments.userId, userId));
  const rows = status
    ? await base.where(eq(s.itemCommitments.status, status)).orderBy(desc(s.itemCommitments.createdAt))
    : await base.orderBy(desc(s.itemCommitments.createdAt));
  return c.json(rows);
});

items.post('/:itemId/decision', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const body = await c.req.json<{ decision?: string; reason?: string }>();
  const decision = body.decision ?? '';
  if (!['now', 'later', 'drop', 'rescue'].includes(decision)) {
    return c.json({ detail: `invalid decision: ${decision}` }, 422);
  }
  const [item] = await db.select().from(s.itemCommitments).where(eq(s.itemCommitments.id, itemId)).limit(1);
  if (!item || item.userId !== userId) return c.json({ detail: 'item not found' }, 404);
  const st = nextState(decision);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(s.decisions).values({
      userId,
      itemId,
      decision,
      reason: body.reason ?? '',
      effectMetrics: effectMetrics(decision, body.reason ?? ''),
    });
    if (decision === 'later') {
      // deferred → 立即回 parked 并 touch updated_at（队列尾语义）
      await tx.update(s.itemCommitments).set({ status: 'deferred', updatedAt: now }).where(eq(s.itemCommitments.id, itemId));
      await tx.update(s.itemCommitments).set({ status: 'parked', updatedAt: new Date(now.getTime() + 1) }).where(eq(s.itemCommitments.id, itemId));
    } else {
      await tx
        .update(s.itemCommitments)
        .set({
          status: st.status,
          ...(st.closedAt ? { closedAt: now } : {}),
          ...(st.touchUpdatedAt ? { updatedAt: now } : {}),
        })
        .where(eq(s.itemCommitments.id, itemId));
    }
    await tx.insert(s.memoryNotes).values({
      userId,
      itemId,
      memoryType: 'decision_effect',
      content: `decision=${decision}; reason=${body.reason ?? ''}`,
      salience: decision === 'rescue' ? 0.8 : 0.5,
    });
  });
  return c.json({ id: itemId, status: decision === 'later' ? 'parked' : st.status, message: decisionMessage(decision) });
});
```

`backend/src/routes/now.ts`：

```ts
import { Hono } from 'hono';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppEnv } from '../app';
import { dbSchema as s } from '../db';
import { latestContext, robustGuardrails } from '../db';
import { buildNudge, freshOrReuseWindow } from '../services/orchestrator';
import { draft } from '../services/brain';
import { ensureUser } from '../lib/auth';

export const now = new Hono<AppEnv>();

const ACTIVE = ['parked', 'window_candidate', 'nudged'];

now.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  await ensureUser(db, userId);
  const candidates = await db
    .select()
    .from(s.itemCommitments)
    .where(and(eq(s.itemCommitments.userId, userId), inArray(s.itemCommitments.status, ACTIVE)))
    .orderBy(asc(s.itemCommitments.updatedAt));
  if (candidates.length === 0) {
    return c.json({
      greeting: '周六上午 · 只被允许想一件事',
      headline: '现在，只递一件顺手的',
      item: null,
      empty_message: '没有必须此刻处理的事',
    });
  }
  const ctx = await latestContext(db, userId);
  const scored: { item: (typeof candidates)[number]; windowId: string; result: ReturnType<typeof computeWindow> }[] = [];
  for (const item of candidates) {
    const { windowId, result } = await freshOrReuseWindow(db, item, { contextFeatures: ctx });
    scored.push({ item, windowId, result });
  }
  scored.sort((a, b) => b.result.fitScore - a.result.fitScore); // fit_score 最高；稳定排序保留 updated_at 序
  const best = scored[0];
  const policy = await db.select().from(s.escalationPolicies).where(eq(s.escalationPolicies.itemId, best.item.id)).limit(1);
  const guardrails = await robustGuardrails(db, userId);
  const p = policy[0];
  // 预算以用户护栏为准（policy.maxNudges 仅作建档快照）
  const nudgeId = await buildNudge(
    db,
    best.item,
    { maxNudges: guardrails.maxNudgeBudget, nudgeCount: p?.nudgeCount ?? 0 },
    guardrails,
    best.windowId,
    best.result,
  );
  if (nudgeId) {
    await db.update(s.itemCommitments).set({ status: 'nudged' }).where(eq(s.itemCommitments.id, best.item.id));
  }
  const { title, body, options } = draft(best.item, best.result);
  return c.json({
    greeting: '周六上午 · 只被允许想一件事',
    headline: '现在，只递一件顺手的',
    item: {
      id: best.item.id,
      title: best.item.title,
      raw_text: best.item.rawText,
      category: best.item.category,
      status: nudgeId ? 'nudged' : best.item.status,
      due_at: best.item.dueAt,
      created_at: best.item.createdAt,
      updated_at: best.item.updatedAt,
      reason_code: best.result.reasonCode,
      reason_text: best.result.reasonText,
      fit_score: best.result.fitScore,
      options,
    },
    empty_message: null,
  });
});
```

`backend/src/routes/signals.ts`：

```ts
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { robustPrivacyScope } from '../db';
import { checkSignal } from '../lib/privacy';
import { ingestSignal } from '../services/context';

export const signals = new Hono<AppEnv>();

signals.post('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ signal_type?: string; payload?: Record<string, unknown>; occurred_at?: string }>();
  const scope = await robustPrivacyScope(db, userId);
  const gate = checkSignal(body.signal_type ?? '', scope);
  if (!gate.allowed) return c.json({ detail: gate.reason }, 403);
  await ingestSignal(db, userId, {
    signalType: body.signal_type!,
    payload: body.payload ?? {},
    occurredAt: body.occurred_at ? new Date(body.occurred_at) : new Date(),
  });
  return c.json({ ok: true });
});
```

`backend/src/routes/guardrails.ts`：

```ts
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { AppEnv } from '../app';
import { dbSchema as s, robustGuardrails, type Db } from '../db';

export const guardrails = new Hono<AppEnv>();

async function upsert(db: Db, userId: string, key: string, value: string) {
  const existing = await db
    .select()
    .from(s.userPreferences)
    .where(and(eq(s.userPreferences.userId, userId), eq(s.userPreferences.scene, 'guardrails'), eq(s.userPreferences.key, key)))
    .limit(1);
  if (existing[0]) {
    await db.update(s.userPreferences).set({ value, updatedAt: new Date() }).where(eq(s.userPreferences.id, existing[0].id));
  } else {
    await db.insert(s.userPreferences).values({ userId, scene: 'guardrails', key, value });
  }
}

guardrails.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const g = await robustGuardrails(db, userId);
  const rows = await db
    .select()
    .from(s.userPreferences)
    .where(and(eq(s.userPreferences.userId, userId), eq(s.userPreferences.scene, 'guardrails')));
  const row = rows.find((r) => r.key === 'privacy_scope');
  const privacy = row ? JSON.parse(row.value) : { calendar: true, weather: true, coarse_location: true };
  return c.json({ quiet_hours_start: g.quietHoursStart, quiet_hours_end: g.quietHoursEnd, max_nudge_budget: g.maxNudgeBudget, privacy_scope: privacy });
});

guardrails.put('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ quiet_hours_start?: string; quiet_hours_end?: string; max_nudge_budget?: number; privacy_scope?: Record<string, boolean> }>();
  if (body.quiet_hours_start !== undefined) await upsert(db, userId, 'quiet_hours_start', body.quiet_hours_start);
  if (body.quiet_hours_end !== undefined) await upsert(db, userId, 'quiet_hours_end', body.quiet_hours_end);
  if (body.max_nudge_budget !== undefined) await upsert(db, userId, 'max_nudge_budget', String(body.max_nudge_budget));
  if (body.privacy_scope !== undefined) await upsert(db, userId, 'privacy_scope', JSON.stringify(body.privacy_scope));
  const g = await robustGuardrails(db, userId);
  return c.json({ quiet_hours_start: g.quietHoursStart, quiet_hours_end: g.quietHoursEnd, max_nudge_budget: g.maxNudgeBudget, privacy_scope: body.privacy_scope ?? { calendar: true, weather: true, coarse_location: true } });
});
```

`backend/src/routes/me.ts`：

```ts
import { Hono } from 'hono';
import { count, eq } from 'drizzle-orm';
import type { AppEnv } from '../app';
import { dbSchema as s } from '../db';

export const me = new Hono<AppEnv>();

me.delete('/data', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const [{ v: commitments }] = await db.select({ v: count() }).from(s.itemCommitments).where(eq(s.itemCommitments.userId, userId));
  const [{ v: signals }] = await db.select({ v: count() }).from(s.signalEvents).where(eq(s.signalEvents.userId, userId));
  await db.delete(s.users).where(eq(s.users.id, userId)); // 级联清空全部业务表
  return c.json({ deleted_commitments: commitments, deleted_signals: signals, message: '已删除全部数据' });
});
```

`backend/src/routes/llm.ts`：

```ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../app';
import { dbSchema as s } from '../db';
import { draft } from '../services/brain';

export const llm = new Hono<AppEnv>();

llm.post('/draft', async (c) => {
  const db = c.get('db');
  const body = await c.req.json<{ item_id?: string; window_text?: string }>();
  let title = '有一件事';
  let itemCategory = 'life';
  if (body.item_id) {
    const [item] = await db.select().from(s.itemCommitments).where(eq(s.itemCommitments.id, body.item_id)).limit(1);
    if (item) {
      title = item.title;
      itemCategory = item.category;
    }
  }
  const window = body.window_text
    ? { reasonCode: 'manual_window', reasonText: body.window_text, fitScore: 0.5, windowStart: new Date(), windowEnd: new Date() }
    : null;
  const out = draft({ title, category: itemCategory }, window);
  return c.json({ model: c.env.LLM_MODEL ?? 'template', title: out.title, body: out.body, degraded: out.degraded, options: out.options });
});
```

- [ ] **Step 4: 实现 app.ts 与 index.ts**

`backend/src/app.ts`：

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './config';
import { num } from './config';
import { requireAuth } from './lib/auth';
import { slidingWindow } from './lib/rate-limit';
import { createDb, type Db } from './db';
import { health } from './routes/health';
import { items } from './routes/items';
import { now } from './routes/now';
import { signals } from './routes/signals';
import { guardrails } from './routes/guardrails';
import { me } from './routes/me';
import { llm } from './routes/llm';

export type AppEnv = { Bindings: Env; Variables: { userId: string; db: Db } };

export function makeApp(env: Env): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', cors({ origin: (env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()) }));

  const dbCache = new Map<string, Db>();
  // 先鉴权（拿到 userId 再限流，按用户计）
  app.use('/v1/*', requireAuth);
  app.use('/v1/*', async (c, next) => {
    const db = dbCache.get(env.DATABASE_URL) ?? createDb(env.DATABASE_URL);
    dbCache.set(env.DATABASE_URL, db);
    c.set('db', db);
    const limit = num(env, 'RATE_LIMIT_PER_MINUTE');
    const allow = slidingWindow(`${c.get('userId')}:${c.req.path}`, limit, 60_000);
    if (!allow()) return c.json({ detail: 'rate limit exceeded' }, 429);
    await next();
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ detail: 'internal error' }, 500);
  });
  app.notFound((c) => c.json({ detail: 'not found' }, 404));

  app.route('/', health);
  app.route('/v1/items', items);
  app.route('/v1/now', now);
  app.route('/v1/signals', signals);
  app.route('/v1/guardrails', guardrails);
  app.route('/v1/me', me);
  app.route('/v1/llm', llm);
  return app;
}
```

`backend/src/index.ts`：

```ts
import { makeApp } from './app';

export default makeApp(process.env as unknown as Parameters<typeof makeApp>[0]);
```

- [ ] **Step 5: 运行确认通过 + typecheck**

Run: `cd backend && npm test test/app-shape.test.ts && npm run typecheck`
Expected: 3 passed；typecheck 无错误（若 import 报未用变量，按严格模式清理）

- [ ] **Step 6: 提交**

```bash
git add backend/src/routes backend/src/app.ts backend/src/index.ts backend/test/app-shape.test.ts
git commit -m "feat(backend): wire 11 endpoints (Hono) + auth/cors/rate-limit middleware"
```

---

### Task 11: 迁移应用脚本 + 端到端集成测试（连托管 dev 项目）

**Covers:** [S4, S6, S10, S11]

**Files:**
- Create: `backend/scripts/apply-migrations.ts`
- Create: `backend/test/integration.test.ts`
- Modify: `backend/.dev.vars.example`（补充说明，无需改值）

**Interfaces:**
- Consumes: `Env.DIRECT_DATABASE_URL`（本机）；`Env.SUPABASE_URL`、`Env.SUPABASE_ANON_KEY`、`Env.DATABASE_URL`（集成测试）
- Produces: 建表脚本（逐条执行 `supabase/migrations/*.sql`）；端到端测试（注册→闭环→护栏→deferred→删除）。

- [ ] **Step 1: 写迁移应用脚本**

`backend/scripts/apply-migrations.ts`：

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DIRECT_DATABASE_URL;
if (!url) {
  console.error('DIRECT_DATABASE_URL is required');
  process.exit(1);
}
const dir = join(process.cwd(), 'supabase', 'migrations');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
const sql = postgres(url, { prepare: false, ssl: 'require' });
for (const f of files) {
  const body = await readFile(join(dir, f), 'utf8');
  console.log(`applying ${f}...`);
  await sql.unsafe(body);
}
await sql.end();
console.log('migrations applied');
```

- [ ] **Step 2: 运行建表（用户提供 DIRECT_DATABASE_URL 后）**

Run: `cd backend && DIRECT_DATABASE_URL='postgresql://postgres:***@db.***.supabase.co:5432/postgres' npm run db:migrate`
Expected: `applying 20260827000000_init.sql...` + `migrations applied`；随后用户可在 Supabase Table Editor 看到 15+1 张表。
条件：**用户已提供凭据**；未提供 → 本任务 block，等凭据后再跑（不得用假库伪证）。

- [ ] **Step 3: 写集成测试（完整代码）**

`backend/test/integration.test.ts`：

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { makeApp } from '../src/app';

const hasEnv = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.DATABASE_URL);
const describeIf = hasEnv() ? describe : describe.skip;

describeIf('integration e2e', () => {
  let supabase: SupabaseClient;
  let app: ReturnType<typeof makeApp>;
  let token = '';
  let userId = '';

  beforeAll(async () => {
    const env = {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL!,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
      DATABASE_URL: process.env.DATABASE_URL!,
      QUIET_HOURS_START: '23:30',
      QUIET_HOURS_END: '08:30',
      MAX_NUDGE_BUDGET: '3',
    } as never;
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const email = `test-${Date.now()}@jnify.dev`;
    const password = 'password-123456';
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.session) throw new Error(`signup failed: ${error?.message ?? 'no session'}; 需在 Auth settings 关闭 Confirm email`);
    token = data.session.access_token;
    userId = data.user!.id;
    app = makeApp(env);
  });

  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });

  it('capture -> now shows window with reason', async () => {
    const cap = await call('/v1/items/capture', {
      method: 'POST',
      body: JSON.stringify({ raw_text: '月底还信用卡', category: 'return', due_at: new Date(Date.now() + 5 * 86400_000).toISOString() }),
    });
    expect(cap.status).toBe(200);
    const capBody = (await cap.json()) as { item: { id: string }; message: string };
    expect(capBody.message).toBe('记下了：不急，但我帮您盯着。');

    const r = await call('/v1/now');
    expect(r.status).toBe(200);
    const nowBody = (await r.json()) as { item: { id: string; reason_code: string; options: { code: string }[] } };
    expect(nowBody.item.id).toBe(capBody.item.id);
    expect(nowBody.item.reason_code).toBe('due_soon');
    // return 属于兜底类目：rescue 应出现
    expect(nowBody.item.options.map((o) => o.code)).toEqual(['now', 'later', 'drop', 'rescue']);
  });

  it('later does not immediately re-serve the same item at top', async () => {
    // 上一用例已建 due_soon(return) 事项；再录一条 social
    await call('/v1/items/capture', {
      method: 'POST',
      body: JSON.stringify({ raw_text: '回小明消息', category: 'social' }),
    });
    const r1 = await call('/v1/now');
    const first = ((await r1.json()) as { item: { id: string } }).item;
    await call(`/v1/items/${first.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'later' }) });
    const r2 = await call('/v1/now');
    const second = ((await r2.json()) as { item: { id: string } }).item;
    expect(second.id).not.toBe(first.id); // 刚晚点的事项不立刻回顶
    const list = await call('/v1/items?status=parked');
    const parked = (await list.json()) as { id: string }[];
    expect(parked.map((i) => i.id)).toContain(first.id); // 且已回 parked，可恢复
  });

  it('guardrails persist across client instances', async () => {
    await call('/v1/guardrails', { method: 'PUT', body: JSON.stringify({ max_nudge_budget: 5 }) });
    // 独立连接直接查库，验证持久化（不依赖 app 内的连接缓存）
    const fresh = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: 'require' });
    const rows = await fresh`select value from user_preferences where "key" = 'max_nudge_budget' and scene = 'guardrails'`;
    await fresh.end();
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('5');
    const g = await call('/v1/guardrails');
    expect(((await g.json()) as { max_nudge_budget: number }).max_nudge_budget).toBe(5);
  });

  it('signals accepted and me/data deletes everything', async () => {
    const s = await call('/v1/signals', { method: 'POST', body: JSON.stringify({ signal_type: 'usage', payload: { free_slot: true } }) });
    expect(s.status).toBe(200);
    const d = await call('/v1/me/data', { method: 'DELETE' });
    expect(d.status).toBe(200);
    const list = await call('/v1/items');
    expect((await list.json()) as unknown[]).toEqual([]);
  });
});
```

- [ ] **Step 4: 安装集成测试依赖并运行**

```bash
cd backend && npm install -D @supabase/supabase-js
# 准备 .dev.vars（用户提供值），然后用 vitest 的 env 加载方式跑：
DATABASE_URL='postgres://postgres.***@aws-***.pooler.supabase.com:6543/postgres' \
SUPABASE_URL='https://***.supabase.co' \
SUPABASE_ANON_KEY='sb_publishable_***' \
npx vitest run test/integration.test.ts
```

Expected: 4 passed（capture/now、deferred 队尾、guardrails 持久化、signals+删除）。
前置条件：① 用户已建 Supabase dev 项目并关闭 Confirm email；② 迁移已应用（本任务 Step 2）；③ 凭据注入环境。缺任一 → 记录 blocked 并交付报告说明，**不得跳过断言声称通过**。
补充：`@supabase/supabase-js` 仅 devDependency（测试用），Worker 运行时不含。

- [ ] **Step 5: 提交**

```bash
git add backend/scripts/apply-migrations.ts backend/test/integration.test.ts package.json package-lock.json
git commit -m "test(backend): apply-migrations script + supabase e2e integration suite"
```

---

### Task 12: 文档矛盾修正与栈描述更新

**Covers:** [S5, S12]

**Files:**
- Modify: `docs/SPEC.md:674`
- Modify: `docs/API.md:11`
- Modify: `README.md`（工程栈表 / 仓库结构 / 路线图 M0 措辞 / 验证边界）

**Interfaces:**
- Consumes: 无
- Produces: 文档与代码一致（decision 取值、技术栈、scripts/ 目录）。

- [ ] **Step 1: SPEC.md 决策值修正**

将 `docs/SPEC.md` 第 674 行 `POST /v1/items/{id}/decision` 说明从 `do/later/drop/rescue` 改为：

```text
POST	`/v1/items/{id}/decision`	now/later/drop/rescue
```

- [ ] **Step 2: API.md 决策值修正**

将 `docs/API.md` 第 11 行从 `` `do / later / drop / rescue` `` 改为：

```text
| POST | `/v1/items/{id}/decision` | `now / later / drop / rescue` |
```

- [ ] **Step 3: README 更新**

- 工程实现表：后端行改为 `Cloudflare Workers (Hono + Drizzle) + Supabase Postgres/Auth`；去掉「全 Docker 化…」两行；建模行保留 15 实体说明。
- 仓库结构块：删除 `scripts/  通用脚本` 一行；`backend/` 注释改为 `Cloudflare Worker 后端（TS + Hono + Drizzle）`；新增 `docs/compose/` 说明（specs/plans 目录）。
- 快速开始：改为 `cd backend && npm install && npx wrangler dev`（或等 CF Dashboard 部署）；前端保留 flutter 命令。
- 路线图 M0 措辞：`✅ 已落地` 保留但补充「部署形态：CF Workers serverless + Supabase」。
- 新增「验证边界」小节：本仓库开发机无 flutter/docker，前端 analyze/test 需在有工具链环境执行。

- [ ] **Step 4: 自检与提交**

```bash
rg -n 'do / later|do/later' docs/   # 应为 0 命中
git add docs/SPEC.md docs/API.md README.md
git commit -m "docs: align decision values and stack description with serverless backend"
```

---

### Task 13: 前端认证（supabase_flutter + 登录页 + AuthGate + JWT 注入）

**Covers:** [S6, S8]

**Files:**
- Create: `frontend/lib/auth/auth_gate.dart`
- Create: `frontend/lib/screens/login_screen.dart`
- Modify: `frontend/pubspec.yaml`
- Modify: `frontend/lib/core/config/env.dart`
- Modify: `frontend/lib/core/api/api_client.dart`
- Modify: `frontend/lib/main.dart`
- Modify: `frontend/test/widget_test.dart`

**Interfaces:**
- Consumes: 无
- Produces: `AuthGate`（监听 `Supabase.instance.client.auth.onAuthStateChange`，未登录 → LoginScreen，已登录 → HomeShell）；`LoginScreen`（邮箱+密码，注册/登录切换）；`ApiClient` 自动附加 `Authorization: Bearer <session.accessToken>`。
- 验证边界：本机无 flutter，改动以静态审查 + 完整 widget 测试代码交付；`flutter analyze/test` 由用户执行并回补（Global Constraint 10）。

- [ ] **Step 1: 修改 pubspec（加 supabase_flutter）**

`frontend/pubspec.yaml` 的 dependencies 增加（版本请在装有 flutter 的机器上 `flutter pub add supabase_flutter` 解析，避免手写猜版本）：

```yaml
dependencies:
  flutter:
    sdk: flutter
  # ... 保留既有依赖 ...
  supabase_flutter: # flutter pub add supabase_flutter 自动填版本
```

- [ ] **Step 2: env 扩展**

`frontend/lib/core/config/env.dart` 增加（完整文件替换）：

```dart
class Env {
  static const backendBaseUrl = String.fromEnvironment('BACKEND_BASE_URL', defaultValue: 'http://localhost:8000');
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: 'http://localhost:54321');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
}
```

- [ ] **Step 3: ApiClient 附加 Bearer**

`frontend/lib/core/api/api_client.dart` 的 `_headers` 逻辑改为（在 `send` 前注入）：

```dart
import 'package:supabase_flutter/supabase_flutter.dart';

Map<String, String> _headers([Map<String, String>? extra]) {
  final token = Supabase.instance.client.auth.currentSession?.accessToken;
  return {
    'Content-Type': 'application/json',
    if (token != null) 'Authorization': 'Bearer $token',
    ...?extra,
  };
}
```

- [ ] **Step 4: AuthGate + LoginScreen**

`frontend/lib/auth/auth_gate.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../screens/login_screen.dart';
import 'home_shell.dart'; // 若 HomeShell 现位于 main.dart，先提取到 lib/widgets/home_shell.dart

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session = Supabase.instance.client.auth.currentSession;
        if (session == null) return const LoginScreen();
        return const HomeShell();
      },
    );
  }
}
```

`frontend/lib/screens/login_screen.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _isSignUp = false;
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    _error = null;
    try {
      final client = Supabase.instance.client.auth;
      if (_isSignUp) {
        final r = await client.signUp(email: _email.text.trim(), password: _password.text);
        if (r.user != null && r.session == null) {
          setState(() => _error = '注册成功，请查收邮箱确认链接后登录');
        }
      } else {
        await client.signInWithPassword(email: _email.text.trim(), password: _password.text);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('J-nify · Jennifer', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 20),
              TextField(controller: _email, decoration: const InputDecoration(labelText: '邮箱')),
              const SizedBox(height: 12),
              TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: '密码')),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: Text(_isSignUp ? '注册' : '登录'),
              ),
              TextButton(
                onPressed: () => setState(() => _isSignUp = !_isSignUp),
                child: Text(_isSignUp ? '已有账号？去登录' : '没有账号？注册'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: main.dart 接线**

将现有 `main.dart` 改为（保留原有 HomeShell 三 Tab 结构，把 HomeShell 类移到 `lib/screens/home_shell.dart` 并 `export`）：

```dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth/auth_gate.dart';
import 'core/config/env.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: Env.supabaseUrl, anonKey: Env.supabaseAnonKey);
  runApp(const JnifyApp());
}

class JnifyApp extends StatelessWidget {
  const JnifyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'J-nify',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFFF5A4E)),
        scaffoldBackgroundColor: const Color(0xFFF7F7F4),
        useMaterial3: true,
      ),
      home: const AuthGate(),
    );
  }
}
```

- [ ] **Step 6: 更新 widget 测试（AuthGate 存在性冒烟）**

`frontend/test/widget_test.dart` 改为只验证 `JnifyApp` 能构建（登录态由用户环境验证）：

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:jnify/main.dart';

void main() {
  testWidgets('app shell builds', (tester) async {
    await tester.pumpWidget(const JnifyApp());
    expect(find.byType(JnifyApp), findsOneWidget);
  });
}
```

注：`Supabase.initialize` 需要真实 URL；`JnifyApp` 构建本身不触发网络。若测试环境需要 mock，说明 `flutter test` 要求在 `.env`/dart-define 提供 `SUPABASE_URL`/`SUPABASE_ANON_KEY`（本地 dev 值即可）。

- [ ] **Step 7: 静态审查 + 提交**

```bash
git add frontend/pubspec.yaml frontend/lib/core/config/env.dart frontend/lib/core/api/api_client.dart frontend/lib/auth frontend/lib/screens/login_screen.dart frontend/lib/screens/home_shell.dart frontend/lib/main.dart frontend/test/widget_test.dart
git commit -m "feat(frontend): supabase auth (login/register) + JWT injection into ApiClient"
```
验证：`git diff --stat` 审查改动面；typecheck 由用户 `flutter analyze` 回补（README 记录）。

---

### Task 14: 前端 M0 缺口（Toast / rescue / 分类期限录入 / 护栏真实读写）

**Covers:** [S8]

**Files:**
- Modify: `frontend/lib/widgets/capture_input.dart`
- Modify: `frontend/lib/widgets/focus_card.dart`
- Modify: `frontend/lib/screens/now_screen.dart`
- Modify: `frontend/lib/screens/me_screen.dart`
- Modify: `frontend/lib/services/api_service.dart`
- Modify: `frontend/lib/models/item_commitment.dart`（补 const 构造器 + `options` 字段）
- Test: `frontend/test/focus_card_test.dart`（新增，纯 widget，不触网）

**Interfaces:**
- Consumes: `FocusCard` 新参数 `options: List<Map<String, String>>`；`CaptureInput` 新回调 `onSubmit(text, category, dueAt)`；`ApiService.capture` 增 `category`/`dueAt` 可选参；`ApiService.decide` 返回 message。
- Produces: 决策后 Toast 文案（后端 message）；rescue 按钮条件出现；安静时段上送。

- [ ] **Step 1: capture_input 加分类与期限（完整代码）**

`frontend/lib/widgets/capture_input.dart` 整体替换为：

```dart
import 'package:flutter/material.dart';

typedef CaptureSubmit = void Function(String text, String category, DateTime? dueAt);

const _categories = [
  ('life', '生活'), ('chore', '杂事'), ('bill', '账单'),
  ('return', '退货'), ('study', '作业'), ('social', '社交'),
];

const _dueOptions = [(null, '无期限'), (1, '明天'), (7, '一周'), (14, '两周')];

/// 录入输入框（SPEC §4.3 Capture）：分类 chips + 可选期限 + 黑底「记下」按钮。
class CaptureInput extends StatefulWidget {
  const CaptureInput({super.key, required this.onSubmit});

  final CaptureSubmit onSubmit;

  @override
  State<CaptureInput> createState() => _CaptureInputState();
}

class _CaptureInputState extends State<CaptureInput> {
  final _controller = TextEditingController();
  String _category = 'life';
  int? _dueDays;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final dueAt = _dueDays == null
        ? null
        : DateTime.now().add(Duration(days: _dueDays!));
    widget.onSubmit(text, _category, dueAt);
    _controller.clear();
    setState(() => _dueDays = null);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 6,
          children: [
            for (final (code, label) in _categories)
              ChoiceChip(
                label: Text(label),
                selected: _category == code,
                onSelected: (_) => setState(() => _category = code),
                visualDensity: VisualDensity.compact,
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: '交给 Jennifer…',
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(20),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF17171A),
                minimumSize: const Size(72, 50),
              ),
              onPressed: _submit,
              child: const Text('记下'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          children: [
            for (final (days, label) in _dueOptions)
              ChoiceChip(
                label: Text(label),
                selected: _dueDays == days,
                onSelected: (_) => setState(() => _dueDays = days),
                visualDensity: VisualDensity.compact,
              ),
          ],
        ),
      ],
    );
  }
}
```

注意：`now_screen.dart` 中 `CaptureInput(onSubmit: _capture)` 的回调签名同步改为 `(String text, String category, DateTime? dueAt)`。

- [ ] **Step 2: focus_card 按后端 options 渲染**

`frontend/lib/widgets/focus_card.dart` 新增参数：

```dart
final List<Map<String, String>> options;
```

渲染逻辑：主按钮 = code=='now'（accent 实底）；`later` 用 OutlinedButton；`drop` 用 TextButton；**其余（如 rescue）各渲染一个 FilledButton.tonal**。点击均调 `onDecide(code)`。空 options 时回退默认三按钮。

- [ ] **Step 3: now_screen Toast 收口**

`now_screen.dart` 的 `_decide` 与 `_capture` 成功后：

```dart
Future<void> _decide(String decision) async {
  final item = _data['item'] as Map<String, dynamic>?;
  if (item == null) return;
  final res = await _api.decide(item['id'] as String, decision);
  if (!mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(res['message'] as String? ?? '已处理'),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(milliseconds: 2200),
      // 顶部居中 pill：margin 顶部垫高，贴近 SPEC §3.5
      margin: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 12, left: 48, right: 48),
    ),
  );
  _load();
}

Future<void> _capture(String text, String category, DateTime? dueAt) async {
  await _api.capture(text, category: category, dueAt: dueAt);
  if (!mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: const Text('记下了：不急，但我帮您盯着。'), behavior: SnackBarBehavior.floating, duration: const Duration(milliseconds: 2200)),
  );
  _load();
}
```

- [ ] **Step 4: api_service 扩展**

`frontend/lib/services/api_service.dart`：

```dart
Future<Map<String, dynamic>> capture(String rawText, {String category = 'life', DateTime? dueAt}) async {
  final data = await _client.post('/v1/items/capture', body: {
    'raw_text': rawText,
    'category': category,
    if (dueAt != null) 'due_at': dueAt.toUtc().toIso8601String(),
  }) as Map<String, dynamic>;
  return data;
}

Future<Map<String, dynamic>> decide(String id, String decision, {String reason = ''}) async { ... 不变，返回体现含 message ... }
```

- [ ] **Step 5: me_screen 安静时段真实读写**

`me_screen.dart` 的 `_load` 增加 `quiet_hours_start/end` 读取；开关状态 = `quiet_hours_start != '00:00'`（开启即默认 23:30—08:30）；`_save` 时当开关切换 PUT `quiet_hours_start: '23:30' / '00:00'` 与 `quiet_hours_end: '08:30' / '00:00'` 成对提交，并把 `_maxNudge`、`_coarseLocation` 一并上送（沿用现有 updateGuardrails）。

- [ ] **Step 6: 模型扩展 + 新增 focus_card 纯 widget 测试**

`frontend/lib/models/item_commitment.dart`：保留既有 `fromJson`，新增：

```dart
// 供纯 widget 测试与本地构造使用；线上数据仍走 fromJson。
const ItemCommitment({
  required this.id,
  required this.title,
  this.category = 'life',
  this.status = 'parked',
  this.rawText = '',
  this.dueAt,
  this.important = 1,
  this.urgent = 1,
  this.estMinutes = 5,
  this.options = const [],
});

final List<dynamic> options; // NowItem 的决策选项数组；fromJson 中解析 item['options'] ?? []
```

说明：构造器参数名与现有字段保持一致（以实际文件为准微调）。`options` 供 FocusCard 按后端渲染；`fromJson` 增加 `options: (json['options'] as List<dynamic>? ?? [])`。

`frontend/test/focus_card_test.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jnify/models/item_commitment.dart';
import 'package:jnify/widgets/focus_card.dart';

void main() {
  testWidgets('renders dynamic options incl rescue', (tester) async {
    const item = ItemCommitment(id: '1', title: '晒被子', category: 'chore', status: 'parked');
    final codes = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: FocusCard(
          item: item,
          reasonText: '天气合适',
          options: const [
            {'code': 'now', 'label': '现在做', 'action_type': 'do'},
            {'code': 'later', 'label': '晚点，换个窗口', 'action_type': 'defer'},
            {'code': 'drop', 'label': '这件事算了', 'action_type': 'drop'},
            {'code': 'rescue', 'label': '帮我兜底', 'action_type': 'rescue'},
          ],
          onDecide: codes.add,
        ),
      ),
    ));
    expect(find.text('帮我兜底'), findsOneWidget);
    await tester.tap(find.text('现在做'));
    expect(codes, ['now']);
  });
}
```

- [ ] **Step 7: 静态审查 + 提交**

```bash
git add frontend/lib frontend/test/focus_card_test.dart
git commit -m "feat(frontend): close M0 gaps (toast, rescue option, category/due capture, real guardrails)"
```
`flutter analyze/test` 由用户验证回补（README 验证边界）。

---

### Task 15: 收尾（README 验证边界 + 验收对照 + 状态汇报）

**Covers:** [S10, S12, S13]

**Files:**
- Modify: `README.md`（验证边界小节补「本机已执行/待用户执行」清单）
- Create: `docs/compose/reports/2026-08-27-backend-replatform-status.md`

**Interfaces:**
- Consumes: Task 11/13/14 验证结果
- Produces: 验收对照报告（S12 逐项 ✅/⏳/❌ + 证据命令输出）；用户可据此回补 flutter 验证。

- [ ] **Step 1: 汇总验证证据**

```bash
cd backend && npm run typecheck && npm test
```

- [ ] **Step 2: 写验收报告**

`docs/compose/reports/2026-08-27-backend-replatform-status.md` 按 spec [S12] 逐项记录：后端全部通过（附命令输出摘要）；集成测试通过/blocked（附原因）；前端项标注「待用户 flutter analyze/test 回补」。

- [ ] **Step 3: README 补充验证边界清单**

```markdown
## 验证边界
- 本仓库开发机：后端 `npm run typecheck` / `npm test`（vitest 单测）已通过；集成测试需 Supabase dev 项目凭据。
- 前端 `flutter analyze` / `flutter test` 需在有 Flutter 工具链的机器执行。
```

- [ ] **Step 4: 提交**

```bash
git add README.md docs/compose/reports/2026-08-27-backend-replatform-status.md
git commit -m "docs: verification boundary + replatform acceptance report"
```

---

## Execution Handoff

计划保存于 `docs/compose/plans/2026-08-27-backend-serverless-replatform.md`。按 compose:plan 规则确认执行方式后，用 compose:subagent（逐任务新子代理 + 两级评审）或 compose:execute（本会话批处理 + 检查点）执行。依赖顺序：Tasks 1-10 后端（本地可全验证）→ Task 11 需用户 Supabase 凭据（block 直至提供）→ Tasks 12-13 前端（静态交付，用户验证）→ Task 15 收尾。