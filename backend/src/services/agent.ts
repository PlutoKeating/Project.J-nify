import type { Db } from '../db';
import { restGet, restInsert, restUpdate, restDelete, robustGuardrails, robustPrivacyScope, getTimezone } from '../db';
import { callLlm, loadLlmConfig, type ChatMessage, type ToolCall, type ToolDef, type LlmResult } from '../lib/llm';
import { getRhythm, setRhythm } from './rhythm';
import { buildFallbackPrompt, buildSystemPromptWithDocs } from './agent-docs';
import { listMemories, upsertMemory, deleteMemory, MEMORY_TYPES } from './memory';

export interface ToolResult {
  ok: boolean;
  result: unknown;
  /** 客户端渲染改动卡片时使用的工具名（服务端回填）。 */
  tool?: string;
}

export interface ToolContext {
  sessionId?: string;
}

export type ToolHandler = (db: Db, userId: string, args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

export interface AgentEvent {
  type: 'start' | 'tool' | 'delta' | 'done' | 'error';
  data: Record<string, unknown>;
}

function ok(result: unknown): ToolResult {
  return { ok: true, result };
}

function fail(message: string): ToolResult {
  return { ok: false, result: { error: message } };
}

const ALLOWED_CATEGORIES = ['life', 'chore', 'bill', 'return', 'study', 'social'];

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'items_list',
      description: '列出当前用户的全部事项，可按状态过滤（parked/window_candidate/nudged/done/abandoned/rescued）。',
      parameters: { type: 'object', properties: { status: { type: 'string' } }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'items_get',
      description: '按 id 获取单个事项详情。',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'items_create',
      description: '为用户创建一条事项（自然语言托付）。category 取值：life/chore/bill/return/study/social。创建后系统会向用户展示改动卡片，可一键撤销。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: ALLOWED_CATEGORIES },
          due_at: { type: 'string', description: 'ISO8601，可空；不确定时不要填' },
          est_minutes: { type: 'integer' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'items_update',
      description: '修改事项（标题/类目/期限/预计耗时/静默）。muted=true 表示"别再提"，一次生效。修改后系统会向用户展示改动卡片，可一键撤销。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          category: { type: 'string', enum: ALLOWED_CATEGORIES },
          due_at: { type: ['string', 'null'] },
          est_minutes: { type: 'integer' },
          muted: { type: 'boolean' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'items_delete',
      description: '彻底删除一条事项（硬删，不可恢复）。必须先获得用户明确确认，再以 confirm: true 调用；未确认时返回需要确认的提示。删除后系统会向用户展示可一键撤销的改动卡片。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, confirm: { type: 'boolean' } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rhythm_get',
      description: '读取某类目的提醒节奏策略（due_offsets/cooldown_hours/agent_managed）。',
      parameters: { type: 'object', properties: { category: { type: 'string' } }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rhythm_set',
      description: '调整某类目的提醒节奏（如账单 10 天前、3 天前各一次；无死线冷却小时数）。这是你自主管理提醒节奏的工具；调整后系统会向用户展示改动卡片，可一键撤销。',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ALLOWED_CATEGORIES },
          due_offsets: { type: 'array', items: { type: 'object' }, description: '[{"days_before":10,"max_nudges":1}]' },
          cooldown_hours: { type: 'integer' },
        },
        required: ['category'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'guardrails_get',
      description: '读取用户的护栏（安静时段/隐私授权）。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'guardrails_set',
      description: '写入用户护栏：安静时段（HH:MM）与隐私授权（privacy_scope）。安静时段是系统硬护栏，只可调整不可绕过。调整后系统会向用户展示改动卡片，可一键撤销。',
      parameters: {
        type: 'object',
        properties: {
          quiet_hours_start: { type: 'string' },
          quiet_hours_end: { type: 'string' },
          privacy_scope: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'feedback_read',
      description: '读取用户近 30 天决策与投诉聚合（现在做/晚点/算了/兜底次数），用于校准提醒节奏与话术。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'steps_get',
      description: '读取某事项的拆解小步骤（item_steps）。',
      parameters: { type: 'object', properties: { item_id: { type: 'string' } }, required: ['item_id'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'steps_set',
      description: '为事项写入拆解小步骤（把大事项拆成 30 秒级可执行下一步）。写入后系统会向用户展示改动卡片，可一键撤销。',
      parameters: {
        type: 'object',
        properties: {
          item_id: { type: 'string' },
          steps: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, est_minutes: { type: 'integer' } } } },
        },
        required: ['item_id', 'steps'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_read',
      description: '读取当前用户的持久记忆（可按 memory_type/key/scope 过滤）。',
      parameters: {
        type: 'object',
        properties: {
          memory_type: { type: 'string', enum: MEMORY_TYPES },
          key: { type: 'string' },
          scope: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_write',
      description: '写入或更新一条用户记忆（偏好/事实/事件/经验）。带 key 时按 (用户, key) upsert。工作流程规范要求：会话中值得长期记住的内容必须主动调用本工具沉淀。写入后系统会向用户展示改动卡片，可一键撤销。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '可选稳定键，如 "称呼"、"常用时间"；带 key 时同键更新' },
          memory_type: { type: 'string', enum: MEMORY_TYPES, description: 'preference 偏好 / fact 事实 / event 事件 / lesson 经验' },
          content: { type: 'string', description: '结构化内容，简洁完整的一句话或条目' },
          scope: { type: 'string', description: '默认 global；可按类别限定如 category:bill' },
          expires_at: { type: ['string', 'null'], description: 'ISO8601 过期时间，可空' },
        },
        required: ['memory_type', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_delete',
      description: '删除一条用户记忆（按 id 或 key）。删除后系统会向用户展示改动卡片，可一键撤销。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, key: { type: 'string' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_generate',
      description: '生成 Jennifer 话术草稿：window_reason（窗口理由）/ rescue_extension（延期申请）/ rescue_pickup（寄件清单）/ rescue_reply（替代表达回复）/ greeting（问候语）/ breakdown（拆解建议）。',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['window_reason', 'rescue_extension', 'rescue_pickup', 'rescue_reply', 'greeting', 'breakdown'] },
          item_id: { type: 'string' },
          context: { type: 'string' },
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
  },
];

/** 实际数据改动写 agent_action_logs（撤销卡片 + 审计）。 */
async function recordAction(
  db: Db,
  userId: string,
  sessionId: string | undefined,
  tool: string,
  args: Record<string, unknown>,
  before: unknown,
  after: unknown,
): Promise<string> {
  const [row] = await restInsert<{ id: string }>(db, 'agent_action_logs', {
    user_id: userId,
    session_id: sessionId ?? null,
    tool,
    args,
    before: before ?? null,
    after: after ?? null,
    status: 'applied',
  });
  return row.id;
}

async function itemExists(db: Db, userId: string, itemId: string): Promise<boolean> {
  const rows = await restGet<{ id: string }>(db, 'item_commitments', {
    select: 'id',
    params: { id: itemId, user_id: userId },
    limit: 1,
  });
  return rows.length > 0;
}

async function upsertPreference(db: Db, userId: string, key: string, value: string): Promise<void> {
  await restInsert(db, 'user_preferences', { user_id: userId, scene: 'guardrails', key, value }, { onConflict: 'user_id,scene,key' });
}

const DRAFT_TEMPLATES: Record<string, (title: string, context: string) => string> = {
  window_reason: (title: string, context: string) => `「${title}」正好适合现在处理。${context ? `（参考：${context}）` : ''}`,
  rescue_extension: (title: string) => `延期申请草稿（事项：${title}）：\n尊敬的负责人：\n由于近期安排较紧，我希望能将「${title}」的期限适当延后，预计可在新期限内完成。恳请批准。\n（请补充具体原因与期望期限）`,
  rescue_pickup: (title: string) => `寄件要素清单（事项：${title}）：\n1. 商品/单据整理放门口；\n2. 快递单号与取件码已备好；\n3. 选择上门取件时间窗。`,
  rescue_reply: (title: string, context: string) => `回复草稿（事项：${title}）：\n最近忙疯了，刚看到消息，我们${context || '下周二晚上'}有空吗？请你吃饭赔罪。`,
  greeting: () => `现在，只递一件顺手的。`,
  breakdown: (title: string) => `拆解建议（事项：${title}）：\n1. 先做最顺手的一步（5 分钟）；\n2. 记下卡住的点，改天再续。`,
};

export const TOOL_REGISTRY: Record<string, ToolHandler> = {
  items_list: async (db, userId, args) => {
    const status = typeof args.status === 'string' && args.status ? args.status : undefined;
    const rows = await restGet(db, 'item_commitments', {
      params: status ? { user_id: userId, status } : { user_id: userId },
      order: 'created_at.desc',
    });
    return ok(rows.map((r) => ({ id: r.id, title: r.title, category: r.category, status: r.status, due_at: r.due_at ?? null, est_minutes: r.est_minutes ?? 5, muted: r.muted_at != null })));
  },

  items_get: async (db, userId, args) => {
    const id = String(args.id ?? '');
    const rows = await restGet(db, 'item_commitments', { params: { id, user_id: userId }, limit: 1 });
    if (!rows[0]) return fail('item not found');
    return ok({ id: rows[0].id, title: rows[0].title, category: rows[0].category, status: rows[0].status, due_at: rows[0].due_at ?? null, est_minutes: rows[0].est_minutes ?? 5 });
  },

  items_create: async (db, userId, args, ctx) => {
    const title = String(args.title ?? '').trim();
    if (!title) return fail('title is required');
    const category = ALLOWED_CATEGORIES.includes(String(args.category)) ? String(args.category) : 'life';
    const dueAt = typeof args.due_at === 'string' && args.due_at ? new Date(args.due_at) : null;
    const estMinutes = Number.isFinite(Number(args.est_minutes)) ? Math.max(1, Number(args.est_minutes)) : 5;
    const [item] = await restInsert(db, 'item_commitments', {
      user_id: userId,
      title,
      raw_text: title,
      source_type: 'agent',
      category,
      status: 'parked',
      due_at: dueAt ? dueAt.toISOString() : null,
      importance: 1,
      urgency: 1,
      abandon_cost: 1,
      est_minutes: estMinutes,
    });
    const after = { id: item.id, title, category, status: 'parked', due_at: item.due_at ?? null, est_minutes: estMinutes };
    const actionId = await recordAction(db, userId, ctx.sessionId, 'items_create', args, null, after);
    return ok({ action_id: actionId, ...after });
  },

  items_update: async (db, userId, args, ctx) => {
    const id = String(args.id ?? '');
    const beforeRows = await restGet<Record<string, unknown>>(db, 'item_commitments', { params: { id, user_id: userId }, limit: 1 });
    if (!beforeRows[0]) return fail('item not found');
    const before = beforeRows[0];
    const patch: Record<string, unknown> = {};
    if (typeof args.title === 'string' && args.title.trim()) patch.title = args.title.trim();
    if (ALLOWED_CATEGORIES.includes(String(args.category))) patch.category = String(args.category);
    if (args.due_at === null || typeof args.due_at === 'string') patch.due_at = args.due_at === null ? null : new Date(args.due_at).toISOString();
    if (Number.isFinite(Number(args.est_minutes))) patch.est_minutes = Math.max(1, Number(args.est_minutes));
    if (typeof args.muted === 'boolean') patch.muted_at = args.muted ? new Date().toISOString() : null;
    if (!Object.keys(patch).length) return fail('nothing to update');
    const rows = await restUpdate(db, 'item_commitments', { id, user_id: userId }, patch);
    const after = rows[0] ?? { ...before, ...patch };
    const actionId = await recordAction(db, userId, ctx.sessionId, 'items_update', args, before, after);
    return ok({ action_id: actionId, id, updated: rows.length > 0 });
  },

  items_delete: async (db, userId, args, ctx) => {
    const id = String(args.id ?? '');
    const rows = await restGet<Record<string, unknown>>(db, 'item_commitments', { params: { id, user_id: userId }, limit: 1 });
    if (!rows[0]) return fail('item not found');
    const title = String(rows[0].title ?? '这件事');
    if (args.confirm !== true) {
      return ok({ need_confirm: true, message: `删除后无法恢复，请先向用户确认：要彻底删除「${title}」吗？` });
    }
    await restDelete(db, 'item_commitments', { id, user_id: userId });
    const before = rows[0];
    const after = { deleted: true, id, title };
    const actionId = await recordAction(db, userId, ctx.sessionId, 'items_delete', args, before, after);
    return ok({ action_id: actionId, ...after });
  },

  rhythm_get: async (db, userId, args) => {
    const category = String(args.category ?? '');
    if (category) return ok(await getRhythm(db, userId, category));
    const all: Record<string, unknown> = {};
    for (const c of ALLOWED_CATEGORIES) all[c] = await getRhythm(db, userId, c);
    return ok(all);
  },

  rhythm_set: async (db, userId, args, ctx) => {
    const category = String(args.category ?? '');
    if (!ALLOWED_CATEGORIES.includes(category)) return fail('invalid category');
    const before = await getRhythm(db, userId, category);
    const dueOffsets = Array.isArray(args.due_offsets)
      ? (args.due_offsets as { days_before?: number; max_nudges?: number }[])
          .map((o) => ({ days_before: Number(o.days_before ?? 0), max_nudges: Number(o.max_nudges ?? 1) }))
          .filter((o) => Number.isFinite(o.days_before) && o.days_before > 0)
      : undefined;
    const cooldownHours = Number.isFinite(Number(args.cooldown_hours)) ? Math.max(1, Number(args.cooldown_hours)) : undefined;
    const after = await setRhythm(db, userId, category, { dueOffsets, cooldownHours });
    const actionId = await recordAction(db, userId, ctx.sessionId, 'rhythm_set', args, before, after);
    return ok({ action_id: actionId, ...after });
  },

  guardrails_get: async (db, userId) => {
    const g = await robustGuardrails(db, userId);
    const p = await robustPrivacyScope(db, userId);
    return ok({ quiet_hours_start: g.quietHoursStart, quiet_hours_end: g.quietHoursEnd, privacy_scope: p });
  },

  guardrails_set: async (db, userId, args, ctx) => {
    const beforeG = await robustGuardrails(db, userId);
    const beforeP = await robustPrivacyScope(db, userId);
    if (typeof args.quiet_hours_start === 'string' && args.quiet_hours_start) {
      await upsertPreference(db, userId, 'quiet_hours_start', args.quiet_hours_start);
    }
    if (typeof args.quiet_hours_end === 'string' && args.quiet_hours_end) {
      await upsertPreference(db, userId, 'quiet_hours_end', args.quiet_hours_end);
    }
    if (args.privacy_scope && typeof args.privacy_scope === 'object') {
      await upsertPreference(db, userId, 'privacy_scope', JSON.stringify(args.privacy_scope));
    }
    const afterG = await robustGuardrails(db, userId);
    const afterP = await robustPrivacyScope(db, userId);
    const before = { quiet_hours_start: beforeG.quietHoursStart, quiet_hours_end: beforeG.quietHoursEnd, privacy_scope: beforeP };
    const after = { quiet_hours_start: afterG.quietHoursStart, quiet_hours_end: afterG.quietHoursEnd, privacy_scope: afterP };
    const actionId = await recordAction(db, userId, ctx.sessionId, 'guardrails_set', args, before, after);
    return ok({ action_id: actionId, ...after });
  },

  feedback_read: async (db, userId) => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const decisions = await restGet<{ decision: string; item_id: string | null; decided_at: string }>(db, 'decisions', {
      select: 'decision,item_id,decided_at',
      params: { user_id: userId, decided_at: `gt.${since}` },
      order: 'decided_at.desc',
      limit: 50,
    });
    const counts: Record<string, number> = { now: 0, later: 0, drop: 0, rescue: 0 };
    for (const d of decisions) counts[d.decision] = (counts[d.decision] ?? 0) + 1;
    const complaints = await restGet<{ id: string }>(db, 'metrics_events', {
      select: 'id',
      params: { user_id: userId, event_type: 'eq.complaint', occurred_at: `gt.${since}` },
      limit: 1,
    });
    return ok({
      window_days: 30,
      decisions: counts,
      complaints: complaints.length,
      recent: decisions.slice(0, 20).map((d) => ({ item_id: d.item_id, decision: d.decision, decided_at: d.decided_at })),
    });
  },

  steps_get: async (db, userId, args) => {
    const itemId = String(args.item_id ?? '');
    if (!(await itemExists(db, userId, itemId))) return fail('item not found');
    const rows = await restGet<{ id: string; title: string; est_minutes: number | null; status: string; done_at: string | null }>(db, 'item_steps', {
      select: 'id,title,est_minutes,status,done_at',
      params: { item_id: itemId },
      order: 'step_order.asc',
    });
    return ok(rows.map((r) => ({ id: r.id, title: r.title, est_minutes: r.est_minutes ?? 5, status: r.status, done_at: r.done_at ?? null })));
  },

  steps_set: async (db, userId, args, ctx) => {
    const itemId = String(args.item_id ?? '');
    if (!(await itemExists(db, userId, itemId))) return fail('item not found');
    const steps = Array.isArray(args.steps)
      ? (args.steps as { title?: unknown; est_minutes?: unknown }[])
          .map((s, i) => ({ title: String(s.title ?? '').trim(), est_minutes: Number.isFinite(Number(s.est_minutes)) ? Math.max(1, Number(s.est_minutes)) : 5, step_order: i }))
          .filter((s) => s.title)
      : [];
    const before = await restGet<{ id: string; title: string; est_minutes: number | null; status: string }>(db, 'item_steps', {
      select: 'id,title,est_minutes,status',
      params: { item_id: itemId },
      order: 'step_order.asc',
    });
    await restDelete(db, 'item_steps', { item_id: itemId });
    const after: { id: string; title: string; est_minutes: number; status: string }[] = [];
    for (const s of steps) {
      const [r] = await restInsert<{ id: string; title: string; est_minutes: number; status: string }>(db, 'item_steps', {
        item_id: itemId,
        step_order: s.step_order,
        title: s.title,
        est_minutes: s.est_minutes,
        status: 'pending',
      });
      after.push({ id: r.id, title: r.title, est_minutes: r.est_minutes, status: r.status });
    }
    const actionId = await recordAction(db, userId, ctx.sessionId, 'steps_set', args, before, after);
    return ok({ action_id: actionId, item_id: itemId, steps: after });
  },

  memory_read: async (db, userId, args) => {
    const rows = await listMemories(db, userId, {
      type: typeof args.memory_type === 'string' ? args.memory_type : undefined,
      key: typeof args.key === 'string' ? args.key : undefined,
      scope: typeof args.scope === 'string' ? args.scope : undefined,
    });
    return ok(rows.map((m) => ({
      id: m.id,
      key: m.key,
      memory_type: m.memory_type,
      content: m.content,
      scope: m.scope,
      expires_at: m.expires_at,
      updated_at: m.updated_at,
    })));
  },

  memory_write: async (db, userId, args, ctx) => {
    const key = typeof args.key === 'string' && args.key ? args.key : undefined;
    const existing = key ? await listMemories(db, userId, { key }) : [];
    const before = existing[0] ?? null;
    const after = await upsertMemory(db, userId, {
      key: key ?? null,
      memory_type: typeof args.memory_type === 'string' ? args.memory_type : 'fact',
      content: String(args.content ?? ''),
      scope: typeof args.scope === 'string' ? args.scope : undefined,
      salience: args.salience && typeof args.salience === 'object' ? (args.salience as { level?: number }) : undefined,
      expires_at: typeof args.expires_at === 'string' ? args.expires_at : args.expires_at === null ? null : undefined,
    });
    const actionId = await recordAction(db, userId, ctx.sessionId, 'memory_write', args, before, after);
    return ok({ action_id: actionId, id: after.id, key: after.key, memory_type: after.memory_type, content: after.content });
  },

  memory_delete: async (db, userId, args, ctx) => {
    const target = { id: typeof args.id === 'string' ? args.id : undefined, key: typeof args.key === 'string' ? args.key : undefined };
    if (!target.id && !target.key) return fail('id or key is required');
    const before = await deleteMemory(db, userId, target);
    if (!before) return fail('memory not found');
    const actionId = await recordAction(db, userId, ctx.sessionId, 'memory_delete', args, before, { deleted: true, id: before.id });
    return ok({ action_id: actionId, deleted: true, id: before.id });
  },

  draft_generate: async (db, userId, args) => {
    const kind = String(args.kind ?? '');
    const itemId = typeof args.item_id === 'string' ? args.item_id : undefined;
    const context = typeof args.context === 'string' ? args.context : '';
    let title = '这件事';
    let category = 'life';
    if (itemId) {
      const rows = await restGet<{ title: string; category: string }>(db, 'item_commitments', {
        select: 'title,category',
        params: { id: itemId, user_id: userId },
        limit: 1,
      });
      if (rows[0]) {
        title = rows[0].title;
        category = rows[0].category;
      }
    }
    try {
      const res = await callLlm(db, [
        { role: 'system', content: '你是 Jennifer，J-nify 的低打扰行动秘书。生成简洁、体面、给退路的中文话术草稿，只输出草稿正文，不要解释，不要 Markdown 标题。' },
        { role: 'user', content: `请生成话术草稿。种类：${kind}。事项：「${title}」（类目：${category}）。参考上下文：${context || '无'}。` },
      ], []);
      if (res.text.trim()) {
        return ok({ kind, text: res.text.trim(), item_id: itemId ?? null, degraded: false });
      }
    } catch {
      // LLM 不可用 → 模板降级（Q14：降级时标记 degraded）
    }
    const template = DRAFT_TEMPLATES[kind];
    return ok({ kind, text: template ? template(title, context) : '', item_id: itemId ?? null, degraded: true });
  },
};

/** v0.2.0 兼容导出：无文档配置时的兜底 prompt（agent.test.ts 依赖）。 */
export function buildSystemPrompt(now: Date, timezone: string): string {
  return buildFallbackPrompt(now, timezone);
}

function formatContext(ctx: Record<string, unknown> | undefined): string | null {
  if (!ctx || !Object.keys(ctx).length) return null;
  try {
    const json = JSON.stringify(ctx);
    if (json.length > 4096) return `${json.slice(0, 4096)}\n…（上下文过长，已截断）`;
    return json;
  } catch {
    return null;
  }
}

async function recordAgentCall(
  db: Db,
  userId: string,
  sessionId: string | undefined,
  llm: LlmResult | null,
  okFlag: boolean,
  degraded: boolean,
  latencyMs: number,
  error: string | null,
): Promise<void> {
  try {
    await restInsert(db, 'agent_call_logs', {
      user_id: userId,
      session_id: sessionId ?? null,
      provider: llm?.provider ?? null,
      model: llm?.model ?? null,
      ok: okFlag,
      degraded,
      latency_ms: latencyMs,
      prompt_tokens: llm?.usage?.prompt_tokens ?? null,
      completion_tokens: llm?.usage?.completion_tokens ?? null,
      total_tokens: llm?.usage?.total_tokens ?? null,
      error,
    });
  } catch {
    // 调用日志失败不影响对话主流程
  }
}

export interface RunAgentOpts {
  context?: Record<string, unknown>;
  sessionId?: string;
  newSession?: boolean;
  stream?: boolean;
  emit?: (event: AgentEvent) => void;
}

export async function runAgent(
  db: Db,
  userId: string,
  userMessage: string,
  history: { role: string; content: unknown }[] = [],
  opts: RunAgentOpts = {},
): Promise<{ reply: string; toolResults: ToolResult[]; degraded: boolean }> {
  const cfg = await loadLlmConfig(db);
  let timezone = 'UTC';
  try {
    timezone = await getTimezone(db, userId);
  } catch {
    // 时区读取失败不阻塞对话
  }
  const emit = opts.emit;
  emit?.({ type: 'start', data: { ts: new Date().toISOString(), session_id: opts.sessionId ?? null } });

  // 会话历史白名单：仅 user/assistant 文本，阻断 system/tool 注入；长度钳制。
  const sanitized: { role: 'user' | 'assistant'; content: string }[] = (Array.isArray(history) ? history : [])
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    .slice(-12)
    .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content as string }));

  const systemPrompt = await buildSystemPromptWithDocs(db, userId, {
    now: new Date(),
    timezone,
    newSession: opts.newSession === true,
  });
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const h of sanitized) messages.push({ role: h.role, content: h.content });
  const contextText = formatContext(opts.context);
  if (contextText) {
    messages.push({ role: 'user', content: `【本次上下文（来自您的设备，仅本次使用，不保存）】\n${contextText}\n\n请结合以上上下文处理用户消息。` });
  }
  messages.push({ role: 'user', content: userMessage });

  const toolResults: ToolResult[] = [];
  const iterations = Math.max(1, cfg.maxToolIterations || 6);
  for (let i = 0; i < iterations; i++) {
    const startedAt = Date.now();
    let llm: LlmResult;
    try {
      llm = await callLlm(db, messages, TOOL_DEFS, {
        stream: opts.stream === true,
        onDelta: opts.stream && emit ? (text) => emit({ type: 'delta', data: { text } }) : undefined,
      });
      await recordAgentCall(db, userId, opts.sessionId, llm, true, llm.degraded, Date.now() - startedAt, null);
    } catch (e) {
      const errMsg = (e as Error).message;
      await recordAgentCall(db, userId, opts.sessionId, null, false, false, Date.now() - startedAt, errMsg);
      const reply = `Jennifer 暂时无法连接智能服务（${errMsg}）。请管理员在后台完成 LLM 配置后重试；您的数据没有丢失。`;
      emit?.({ type: 'error', data: { detail: reply } });
      return { reply, toolResults, degraded: true };
    }
    if (!llm.toolCalls.length) {
      const reply = llm.text || '好的，已记下。';
      const out = { reply, toolResults, degraded: llm.degraded };
      emit?.({ type: 'done', data: { reply, toolResults, degraded: llm.degraded } });
      return out;
    }
    messages.push({ role: 'assistant', content: llm.text });
    for (const tc of llm.toolCalls as ToolCall[]) {
      const handler = TOOL_REGISTRY[tc.name];
      let result: ToolResult;
      emit?.({ type: 'tool', data: { name: tc.name, status: 'started' } });
      if (!handler) {
        result = fail(`unknown tool: ${tc.name}`);
      } else {
        try {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.arguments || '{}');
          } catch {
            args = {};
          }
          result = await handler(db, userId, args, { sessionId: opts.sessionId });
        } catch (e) {
          result = fail((e as Error).message);
        }
      }
      toolResults.push({ tool: tc.name, ...result });
      const actionId = (result.result as { action_id?: string } | undefined)?.action_id;
      emit?.({ type: 'tool', data: { name: tc.name, status: 'done', ok: result.ok, action_id: actionId ?? null } });
      messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: tc.id });
    }
  }
  const reply = '我已经尽力处理，但步骤较多，请再说一次您希望我做的事。';
  const out = { reply, toolResults, degraded: true };
  emit?.({ type: 'done', data: out });
  return out;
}

export async function saveAgentConfig(db: Db, value: unknown): Promise<{ version: number }> {
  const { putConfig } = await import('../lib/config-store');
  return putConfig(db, 'llm', value);
}

const UNDO_WINDOW_MS = 24 * 3600_000;

/** 撤销一次 agent 实际数据改动（活跃会话内卡片入口；服务端 24h 保留期）。 */
export async function revertAction(
  db: Db,
  userId: string,
  actionId: string,
): Promise<{ ok: boolean; tool?: string; message?: string }> {
  const rows = await restGet<{ id: string; tool: string; before: unknown; after: unknown; status: string; created_at: string; args: Record<string, unknown> | null }>(
    db,
    'agent_action_logs',
    { select: 'id,tool,before,after,status,created_at,args', params: { id: actionId, user_id: userId }, limit: 1 },
  );
  const row = rows[0];
  if (!row) return { ok: false, message: 'action not found' };
  if (row.status !== 'applied') return { ok: false, message: `action already ${row.status}` };
  if (Date.now() - new Date(row.created_at).getTime() > UNDO_WINDOW_MS) {
    await restUpdate(db, 'agent_action_logs', { id: actionId }, { status: 'expired' });
    return { ok: false, message: 'undo window expired' };
  }
  const before = (row.before ?? null) as Record<string, unknown> | null;
  const after = (row.after ?? null) as Record<string, unknown> | null;

  switch (row.tool) {
    case 'items_create': {
      if (after?.id) await restDelete(db, 'item_commitments', { id: after.id, user_id: userId });
      break;
    }
    case 'items_update': {
      if (!before?.id) return { ok: false, message: 'invalid snapshot' };
      const patch: Record<string, unknown> = {};
      for (const k of ['title', 'category', 'status', 'due_at', 'est_minutes', 'muted_at', 'raw_text', 'importance', 'urgency', 'abandon_cost']) {
        if (k in before) patch[k] = before[k];
      }
      await restUpdate(db, 'item_commitments', { id: before.id, user_id: userId }, patch);
      break;
    }
    case 'items_delete': {
      if (before?.id) await restInsert(db, 'item_commitments', before);
      break;
    }
    case 'rhythm_set': {
      if (before && typeof before.category === 'string') {
        await restInsert(
          db,
          'rhythm_policies',
          {
            user_id: userId,
            category: before.category,
            due_offsets: before.dueOffsets ?? [],
            cooldown_hours: before.cooldownHours ?? 72,
            agent_managed: before.agentManaged ?? true,
          },
          { onConflict: 'user_id,category' },
        );
      }
      break;
    }
    case 'guardrails_set': {
      const g = before as { quiet_hours_start?: string; quiet_hours_end?: string; privacy_scope?: Record<string, boolean> } | null;
      if (g?.quiet_hours_start) await upsertPreference(db, userId, 'quiet_hours_start', g.quiet_hours_start);
      if (g?.quiet_hours_end) await upsertPreference(db, userId, 'quiet_hours_end', g.quiet_hours_end);
      if (g?.privacy_scope) await upsertPreference(db, userId, 'privacy_scope', JSON.stringify(g.privacy_scope));
      break;
    }
    case 'memory_write': {
      if (before && before.id) {
        // 更新回滚：还原 before 行
        await restUpdate(
          db,
          'agent_memories',
          { id: before.id, user_id: userId },
          {
            key: before.key ?? null,
            memory_type: before.memory_type ?? 'fact',
            content: before.content,
            scope: before.scope ?? 'global',
            salience: before.salience ?? { level: 1 },
            expires_at: before.expires_at ?? null,
          },
        );
      } else if (after?.id) {
        await restDelete(db, 'agent_memories', { id: after.id, user_id: userId });
      }
      break;
    }
    case 'memory_delete': {
      if (before?.id) await restInsert(db, 'agent_memories', before);
      break;
    }
    case 'steps_set': {
      const itemId = row.args?.item_id;
      if (itemId) {
        await restDelete(db, 'item_steps', { item_id: itemId });
        const steps = Array.isArray(before) ? (before as { title: string; est_minutes?: number; step_order?: number }[]) : [];
        for (let i = 0; i < steps.length; i++) {
          await restInsert(db, 'item_steps', {
            item_id: itemId,
            step_order: steps[i].step_order ?? i,
            title: steps[i].title,
            est_minutes: steps[i].est_minutes ?? 5,
            status: 'pending',
          });
        }
      }
      break;
    }
    default:
      return { ok: false, message: `unsupported undo tool: ${row.tool}` };
  }

  await restUpdate(db, 'agent_action_logs', { id: actionId }, { status: 'reverted', reverted_at: new Date().toISOString() });
  return { ok: true, tool: row.tool };
}
