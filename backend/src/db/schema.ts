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