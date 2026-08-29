import type { Db } from '../db';
import { restGet, restInsert, restUpdate, restDelete, robustGuardrails, getTimezone } from '../db';
import { callLlm, loadLlmConfig, type ChatMessage, type ToolCall, type ToolDef } from '../lib/llm';
import { putConfig } from '../lib/config-store';
import { getRhythm, setRhythm } from './rhythm';

export interface ToolResult {
  ok: boolean;
  result: unknown;
}

export type ToolHandler = (db: Db, userId: string, args: Record<string, unknown>) => Promise<ToolResult>;

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
      description: '为用户创建一条事项（自然语言托付）。category 取值：life/chore/bill/return/study/social。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: ALLOWED_CATEGORIES },
          due_at: { type: 'string', description: 'ISO8601，可空' },
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
      description: '修改事项（标题/类目/期限/预计耗时/静默）。muted=true 表示"别再提"，一次生效。',
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
      description: '彻底删除一条事项（硬删，不可恢复）。',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
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
      description: '调整某类目的提醒节奏（如账单 10 天前、3 天前各一次；无死线冷却小时数）。这是你自主管理提醒节奏的工具。',
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
      description: '读取用户的护栏（安静时段/提醒预算字段/隐私授权）。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_generate',
      description: '生成 Jennifer 话术草稿：window_reason（窗口理由）/ rescue_extension（延期申请）/ rescue_pickup（寄件清单）/ rescue_reply（替代表达回复）/ greeting（问候语）。',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['window_reason', 'rescue_extension', 'rescue_pickup', 'rescue_reply', 'greeting'] },
          item_id: { type: 'string' },
          context: { type: 'string' },
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
  },
];

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
    return ok({ id: rows[0].id, title: rows[0].title, category: rows[0].category, status: rows[0].status, due_at: rows[0].due_at ?? null });
  },

  items_create: async (db, userId, args) => {
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
    await restInsert(db, 'escalation_policies', { item_id: item.id, max_nudges: 3, nudge_count: 0 });
    return ok({ id: item.id, title, category, status: 'parked' });
  },

  items_update: async (db, userId, args) => {
    const id = String(args.id ?? '');
    const patch: Record<string, unknown> = {};
    if (typeof args.title === 'string' && args.title.trim()) patch.title = args.title.trim();
    if (ALLOWED_CATEGORIES.includes(String(args.category))) patch.category = String(args.category);
    if (args.due_at === null || typeof args.due_at === 'string') patch.due_at = args.due_at === null ? null : new Date(args.due_at).toISOString();
    if (Number.isFinite(Number(args.est_minutes))) patch.est_minutes = Math.max(1, Number(args.est_minutes));
    if (typeof args.muted === 'boolean') patch.muted_at = args.muted ? new Date().toISOString() : null;
    if (!Object.keys(patch).length) return fail('nothing to update');
    const rows = await restUpdate(db, 'item_commitments', { id, user_id: userId }, patch);
    return ok({ id, updated: rows.length > 0 });
  },

  items_delete: async (db, userId, args) => {
    const id = String(args.id ?? '');
    const rows = await restGet(db, 'item_commitments', { select: 'id', params: { id, user_id: userId }, limit: 1 });
    if (!rows[0]) return fail('item not found');
    await restDelete(db, 'item_commitments', { id, user_id: userId });
    return ok({ deleted: true });
  },

  rhythm_get: async (db, userId, args) => {
    const category = String(args.category ?? '');
    if (category) return ok(await getRhythm(db, userId, category));
    const all: Record<string, unknown> = {};
    for (const c of ALLOWED_CATEGORIES) all[c] = await getRhythm(db, userId, c);
    return ok(all);
  },

  rhythm_set: async (db, userId, args) => {
    const category = String(args.category ?? '');
    if (!ALLOWED_CATEGORIES.includes(category)) return fail('invalid category');
    const dueOffsets = Array.isArray(args.due_offsets)
      ? (args.due_offsets as { days_before?: number; max_nudges?: number }[])
          .map((o) => ({ days_before: Number(o.days_before ?? 0), max_nudges: Number(o.max_nudges ?? 1) }))
          .filter((o) => Number.isFinite(o.days_before) && o.days_before > 0)
      : undefined;
    const cooldownHours = Number.isFinite(Number(args.cooldown_hours)) ? Math.max(1, Number(args.cooldown_hours)) : undefined;
    return ok(await setRhythm(db, userId, category, { dueOffsets, cooldownHours }));
  },

  guardrails_get: async (db, userId) => {
    const g = await robustGuardrails(db, userId);
    return ok(g);
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
    const templates: Record<string, string> = {
      window_reason: `「${title}」正好适合现在处理。${context ? `（参考：${context}）` : ''}`,
      rescue_extension: `延期申请草稿（事项：${title}）：\n尊敬的负责人：\n由于近期安排较紧，我希望能将「${title}」的期限适当延后，预计可在新期限内完成。恳请批准。\n（请补充具体原因与期望期限）`,
      rescue_pickup: `寄件要素清单（事项：${title}）：\n1. 商品/单据整理放门口；\n2. 快递单号与取件码已备好；\n3. 选择上门取件时间窗。`,
      rescue_reply: `回复草稿（事项：${title}）：\n最近忙疯了，刚看到消息，我们${context || '下周二晚上'}有空吗？请你吃饭赔罪。`,
      greeting: `现在，只递一件顺手的。`,
    };
    return ok({ kind, text: templates[kind] ?? '', degraded: true });
  },
};

const SYSTEM_PROMPT = `你是 Jennifer，J-nify 的低打扰行动秘书，一位懂 P 人的 J 人助理。品牌口号：「不急，但我帮您盯着。」

行为准则：
1. 不命令、不羞辱：绝不使用"你必须""你又拖了"等表达；永远给理由、给退路。
2. 每次出现都要能回答"为什么是现在"；没有真实信号依据时，不得编造理由（如"您比较放松"这类表述只能在有 usage 信号时使用）。
3. 让下一步足够小（30 秒—15 分钟），并永远提供体面出口：现在做 / 晚点，换个窗口 / 这件事算了 / 帮我兜底。
4. 涉及真实动作（付款、外发消息、下单等）时，必须二次确认后才能执行；你没有权限执行真实外部动作，只能生成草稿与清单。
5. 提醒节奏、冷却时长、窗口理由、兜底方式由你自主决定并通过工具（rhythm_set 等）管理；系统不强制模板。

话术参考（仅作参考建议，不是强制模板，你可自行编排）：
- 录入后："记下了：不急，但我帮您盯着。"
- 窗口出现："「{事项}」正好适合现在处理，因为……"（必须给出真实理由）
- 晚点："好，晚点。它不会消失，等下一个顺手窗口。"
- 算了："已体面放弃，这件事收口了。"
- 兜底："已接手兜底，需要真实动作时会先跟您确认。"

你可以使用工具对用户的事项进行完整的增删改查与统筹管理。请用简体中文回复，简洁、像秘书而非机器人。`;

/**
 * 组装完整 system prompt：基础人设 + 当前时间上下文。
 * 注入真实日期与时区，避免模型把"今天/明天/月底"等相对时间按训练数据幻觉成错误年份。
 */
export function buildSystemPrompt(now: Date, timezone: string): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${SYSTEM_PROMPT}

【当前时间上下文】今天是 ${date}（用户时区：${timezone}）。涉及"今天/明天/这周/月底"等相对时间表达时，必须以上述当前日期为准计算具体日期，不得使用训练数据中的年份。`;
}

export async function runAgent(
  db: Db,
  userId: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<{ reply: string; toolResults: ToolResult[]; degraded: boolean }> {
  const cfg = await loadLlmConfig(db);
  let timezone = 'UTC';
  try {
    timezone = await getTimezone(db, userId);
  } catch {
    // 时区读取失败不阻塞对话，回退 UTC（仅影响相对时间换算精度，不影响人设）。
  }
  const messages: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt(new Date(), timezone) }];
  for (const h of history) messages.push({ role: h.role, content: h.content });
  messages.push({ role: 'user', content: userMessage });

  const toolResults: ToolResult[] = [];
  const iterations = Math.max(1, cfg.maxToolIterations || 6);
  for (let i = 0; i < iterations; i++) {
    let llm;
    try {
      llm = await callLlm(db, messages, TOOL_DEFS);
    } catch (e) {
      return {
        reply: `Jennifer 暂时无法连接智能服务（${(e as Error).message}）。请管理员在后台完成 LLM 配置后重试；您的数据没有丢失。`,
        toolResults,
        degraded: true,
      };
    }
    if (!llm.toolCalls.length) {
      return { reply: llm.text || '好的，已记下。', toolResults, degraded: llm.degraded };
    }
    messages.push({ role: 'assistant', content: llm.text });
    for (const tc of llm.toolCalls as ToolCall[]) {
      const handler = TOOL_REGISTRY[tc.name];
      let result: ToolResult;
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
          result = await handler(db, userId, args);
        } catch (e) {
          result = fail((e as Error).message);
        }
      }
      toolResults.push(result);
      messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: tc.id });
    }
  }
  return { reply: '我已经尽力处理，但步骤较多，请再说一次您希望我做的事。', toolResults, degraded: true };
}

export async function saveAgentConfig(db: Db, value: unknown): Promise<{ version: number }> {
  return putConfig(db, 'llm', value);
}
