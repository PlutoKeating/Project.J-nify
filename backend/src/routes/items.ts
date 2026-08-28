import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { restGet, restInsert, restRpc, restUpdate, restDelete } from '../db';
import { CAPTURE_MESSAGE, captureValues } from '../services/capture';
import { decisionMessage } from '../services/decision-feedback';

export const items = new Hono<AppEnv>();

interface ItemRow {
  id: string;
  user_id: string;
  title: string;
  raw_text: string;
  category: string;
  status: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  importance: number | null;
  urgency: number | null;
  abandon_cost: number | null;
  est_minutes: number | null;
}

items.post('/capture', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ raw_text?: string; source_type?: string; category?: string; due_at?: string }>();
  if (!body.raw_text?.trim()) return c.json({ detail: 'raw_text is required' }, 422);
  const values = captureValues({
    rawText: body.raw_text,
    sourceType: body.source_type,
    category: body.category,
    dueAt: body.due_at ? new Date(body.due_at) : null,
  });
  const [item] = await restInsert<ItemRow>(db, 'item_commitments', {
    user_id: userId,
    title: values.title,
    raw_text: values.rawText,
    source_type: values.sourceType,
    category: values.category,
    status: values.status,
    due_at: values.dueAt?.toISOString() ?? null,
    importance: values.importance,
    urgency: values.urgency,
    abandon_cost: values.abandonCost,
    est_minutes: values.estMinutes,
  });
  await restInsert(db, 'escalation_policies', { item_id: item.id, max_nudges: 3, nudge_count: 0 });
  return c.json({ item: itemRowToOut(item), status: item.status, message: CAPTURE_MESSAGE });
});

items.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const status = c.req.query('status');
  const rows = await restGet<ItemRow>(db, 'item_commitments', {
    params: status ? { user_id: userId, status } : { user_id: userId },
    order: 'created_at.desc',
  });
  // E2：列表每行附带最新窗口理由
  const withReason = await Promise.all(
    rows.map(async (r) => {
      const windows = await restGet<{ reason_text: string }>(db, 'opportunity_windows', {
        select: 'reason_text',
        params: { item_id: r.id },
        order: 'created_at.desc',
        limit: 1,
      });
      return { ...itemRowToOut(r), reason_text: windows[0]?.reason_text ?? null };
    }),
  );
  return c.json(withReason);
});

const ALLOWED_CATEGORIES = ['life', 'chore', 'bill', 'return', 'study', 'social'];

items.patch('/:itemId', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const body = await c.req.json<{ title?: string; category?: string; due_at?: string | null; est_minutes?: number; muted?: boolean }>();
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.category === 'string' && ALLOWED_CATEGORIES.includes(body.category)) patch.category = body.category;
  if (body.due_at !== undefined) patch.due_at = body.due_at === null ? null : new Date(body.due_at).toISOString();
  if (Number.isFinite(Number(body.est_minutes))) patch.est_minutes = Math.max(1, Number(body.est_minutes));
  if (typeof body.muted === 'boolean') patch.muted_at = body.muted ? new Date().toISOString() : null;
  if (!Object.keys(patch).length) return c.json({ detail: 'nothing to update' }, 422);
  const rows = await restUpdate<ItemRow>(db, 'item_commitments', { id: itemId, user_id: userId }, patch);
  if (!rows[0]) return c.json({ detail: 'item not found' }, 404);
  return c.json({ item: itemRowToOut(rows[0]) });
});

items.delete('/:itemId', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const rows = await restGet<{ id: string }>(db, 'item_commitments', { select: 'id', params: { id: itemId, user_id: userId }, limit: 1 });
  if (!rows[0]) return c.json({ detail: 'item not found' }, 404);
  await restDelete(db, 'item_commitments', { id: itemId, user_id: userId });
  return c.json({ deleted: true });
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
  // 归属校验：items 按 user 过滤；命中才继续（RPC 内不重复校验归属，路由层保证）
  const [item] = await restGet<ItemRow>(db, 'item_commitments', {
    select: 'id,user_id', params: { id: itemId, user_id: userId }, limit: 1,
  });
  if (!item) return c.json({ detail: 'item not found' }, 404);
  const out = await restRpc<{ status: string }>(db, 'fn_decide', {
    p_item_id: itemId,
    p_user_id: userId,
    p_decision: decision,
    p_reason: body.reason ?? '',
  });
  return c.json({ id: itemId, status: out.status, message: decisionMessage(decision) });
});

function itemRowToOut(r: ItemRow) {
  return {
    id: r.id,
    title: r.title,
    raw_text: r.raw_text,
    category: r.category,
    status: r.status,
    importance: r.importance ?? 1,
    urgency: r.urgency ?? 1,
    abandon_cost: r.abandon_cost ?? 1,
    est_minutes: r.est_minutes ?? 5,
    due_at: r.due_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    closed_at: r.closed_at,
  };
}
