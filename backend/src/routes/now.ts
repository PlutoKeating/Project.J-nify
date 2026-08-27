import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { latestContext, restGet, restInsert, restUpdate, robustGuardrails } from '../db';
import { buildNudge, freshOrReuseWindow } from '../services/orchestrator';
import { draft } from '../services/brain';
import type { ItemRowLike } from '../services/orchestrator';
import type { WindowResult } from '../services/window-engine';

export const now = new Hono<AppEnv>();

const ACTIVE = ['parked', 'window_candidate', 'nudged'];

interface CandidateRow {
  id: string;
  title: string;
  category: string;
  status: string;
  raw_text: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

now.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const candidates = await restGet<CandidateRow>(db, 'item_commitments', {
    select: 'id,title,category,status,raw_text,due_at,created_at,updated_at',
    params: { user_id: userId, status: `in.(${ACTIVE.join(',')})` },
    order: 'updated_at.asc',
  });
  if (candidates.length === 0) {
    return c.json({
      greeting: '周六上午 · 只被允许想一件事',
      headline: '现在，只递一件顺手的',
      item: null,
      empty_message: '没有必须此刻处理的事',
    });
  }
  const ctx = await latestContext(db, userId);
  const guardrails = await robustGuardrails(db, userId);

  const items: ItemRowLike[] = candidates.map((r) => ({ id: r.id, title: r.title, category: r.category, dueAt: r.due_at ? new Date(r.due_at) : null }));
  const scored: { item: ItemRowLike; row: CandidateRow; windowId: string; result: WindowResult }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const { windowId, result } = await freshOrReuseWindow(db, items[i], { contextFeatures: ctx ?? undefined });
    scored.push({ item: items[i], row: candidates[i], windowId, result });
  }
  scored.sort((a, b) => b.result.fitScore - a.result.fitScore);

  // 「晚点」冷却：最近 8h 内选过 later 的事项移到队列尾
  const sinceIso = new Date(Date.now() - 8 * 3600_000).toISOString();
  const candidateIds = candidates.map((x) => x.id);
  const recentDecisions = await restGet<{ item_id: string | null; decision: string; decided_at: string }>(db, 'decisions', {
    select: 'item_id,decision,decided_at',
    params: { user_id: userId, item_id: `in.(${candidateIds.join(',')})`, decided_at: `gt.${sinceIso}` },
    order: 'decided_at.desc',
  });
  const latestByItem = new Map<string, { decision: string; decidedAt: Date }>();
  for (const d of recentDecisions) {
    if (!d.item_id || latestByItem.has(d.item_id)) continue;
    latestByItem.set(d.item_id, { decision: d.decision, decidedAt: new Date(d.decided_at) });
  }
  const deferredIds = new Set<string>();
  for (const [itemId, d] of latestByItem) {
    if (d.decision === 'later') deferredIds.add(itemId);
  }
  const deferred = scored.filter((x) => deferredIds.has(x.item.id));
  const nonDeferred = scored.filter((x) => !deferredIds.has(x.item.id));
  const ranked = nonDeferred.length > 0
    ? [...nonDeferred, ...deferred]
    : deferred.length > 0
      ? [...deferred].sort((a, b) => latestByItem.get(a.item.id)!.decidedAt.getTime() - latestByItem.get(b.item.id)!.decidedAt.getTime())
      : scored;
  const best = ranked[0];

  let nudgeId: string | null = null;
  if (!deferredIds.has(best.item.id)) {
    // policy 行缺失则先建默认行，再取最新计数用于频控门
    const existing = await restGet<{ nudge_count: number }>(db, 'escalation_policies', {
      select: 'nudge_count', params: { item_id: best.item.id }, limit: 1,
    });
    if (!existing[0]) {
      await restInsert(db, 'escalation_policies', { item_id: best.item.id, max_nudges: guardrails.maxNudgeBudget, nudge_count: 0 });
    }
    const policyRow = existing[0] ?? { nudge_count: 0 };
    nudgeId = await buildNudge(
      db,
      best.item,
      { maxNudges: guardrails.maxNudgeBudget, nudgeCount: policyRow.nudge_count ?? 0 },
      guardrails,
      best.windowId,
      best.result,
    );
    if (nudgeId) {
      await restUpdate(db, 'item_commitments', { id: best.item.id }, { status: 'nudged' });
    }
  }

  const { options } = draft(best.item, best.result);
  return c.json({
    greeting: '周六上午 · 只被允许想一件事',
    headline: '现在，只递一件顺手的',
    item: {
      id: best.item.id,
      title: best.item.title,
      raw_text: best.row.raw_text,
      category: best.item.category,
      status: nudgeId ? 'nudged' : best.row.status,
      due_at: best.row.due_at,
      created_at: best.row.created_at,
      updated_at: best.row.updated_at,
      reason_code: best.result.reasonCode,
      reason_text: best.result.reasonText,
      fit_score: best.result.fitScore,
      options,
    },
    empty_message: null,
  });
});