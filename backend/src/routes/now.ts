import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { latestContext, restGet, restUpdate, robustGuardrails, getTimezone } from '../db';
import { buildNudge, freshOrReuseWindow, type ItemRowLike } from '../services/orchestrator';
import { draft } from '../services/brain';
import { getRhythm, type RhythmPolicy } from '../services/rhythm';
import type { WindowResult } from '../services/window-engine';

export const now = new Hono<AppEnv>();

const ACTIVE = ['parked', 'window_candidate', 'nudged'];
const MAX_CANDIDATES = 20; // F1：候选上限，避免事项多时延迟线性增长

interface CandidateRow {
  id: string;
  title: string;
  category: string;
  status: string;
  raw_text: string;
  due_at: string | null;
  est_minutes: number | null;
  created_at: string;
  updated_at: string;
}

function dynamicGreeting(tz: string): string {
  const weekMap: Record<string, string> = { Sun: '周日', Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六' };
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date());
    const weekday = weekMap[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? '周六';
    const hour = (Number(parts.find((p) => p.type === 'hour')?.value ?? 10) || 0) % 24;
    const period = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
    return `${weekday}${period} · 只被允许想一件事`;
  } catch {
    return '周六上午 · 只被允许想一件事';
  }
}

/** 简单并发池：限制同时进行的窗口计算数（F1） */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

now.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const tz = await getTimezone(db, userId);
  const candidates = await restGet<CandidateRow>(db, 'item_commitments', {
    select: 'id,title,category,status,raw_text,due_at,est_minutes,created_at,updated_at',
    params: { user_id: userId, status: `in.(${ACTIVE.join(',')})`, muted_at: 'is.null' },
    order: 'updated_at.asc',
    limit: MAX_CANDIDATES,
  });
  if (candidates.length === 0) {
    return c.json({
      greeting: dynamicGreeting(tz),
      headline: '现在，只递一件顺手的',
      item: null,
      empty_message: '没有必须此刻处理的事',
    });
  }
  const ctx = await latestContext(db, userId);
  const guardrails = await robustGuardrails(db, userId);

  const rhythmCache = new Map<string, RhythmPolicy>();
  const rhythmFor = async (category: string): Promise<RhythmPolicy> => {
    const hit = rhythmCache.get(category);
    if (hit) return hit;
    const r = await getRhythm(db, userId, category);
    rhythmCache.set(category, r);
    return r;
  };

  const items: ItemRowLike[] = candidates.map((r) => ({ id: r.id, title: r.title, category: r.category, dueAt: r.due_at ? new Date(r.due_at) : null }));
  const scored = await mapWithConcurrency(candidates, 6, async (row, i) => {
    const rhythm = await rhythmFor(row.category);
    const { windowId, result } = await freshOrReuseWindow(db, items[i], { contextFeatures: ctx ?? undefined, rhythm });
    return { item: items[i], row, windowId, result, cooldownHours: rhythm.cooldownHours };
  });
  scored.sort((a, b) => b.result.fitScore - a.result.fitScore);

  // 「晚点」冷却：最近 cooldownHours（默认 72h，Q15）内选过 later 的事项移到队列尾
  const sinceIso = new Date(Date.now() - 30 * 86400_000).toISOString();
  const candidateIds = candidates.map((x) => x.id);
  const recentDecisions = await restGet<{ item_id: string | null; decision: string; decided_at: string }>(db, 'decisions', {
    select: 'item_id,decision,decided_at',
    params: { user_id: userId, item_id: `in.(${candidateIds.join(',')})`, decision: 'eq.later', decided_at: `gt.${sinceIso}` },
    order: 'decided_at.desc',
  });
  const latestByItem = new Map<string, { decidedAt: number }>();
  for (const d of recentDecisions) {
    if (!d.item_id || latestByItem.has(d.item_id)) continue;
    latestByItem.set(d.item_id, { decidedAt: new Date(d.decided_at).getTime() });
  }
  const deferredIds = new Set<string>();
  for (const s of scored) {
    const last = latestByItem.get(s.item.id);
    if (last && Date.now() - last.decidedAt < s.cooldownHours * 3600_000) deferredIds.add(s.item.id);
  }
  const deferred = scored.filter((x) => deferredIds.has(x.item.id));
  const nonDeferred = scored.filter((x) => !deferredIds.has(x.item.id));
  const ranked = nonDeferred.length > 0
    ? [...nonDeferred, ...deferred]
    : deferred.length > 0
      ? [...deferred].sort((a, b) => (latestByItem.get(a.item.id)?.decidedAt ?? 0) - (latestByItem.get(b.item.id)?.decidedAt ?? 0))
      : scored;
  const best = ranked[0];

  let nudgeId: string | null = null;
  if (!deferredIds.has(best.item.id)) {
    nudgeId = await buildNudge(db, best.item, guardrails, best.windowId, best.result, new Date(), tz);
    if (nudgeId) {
      await restUpdate(db, 'item_commitments', { id: best.item.id }, { status: 'nudged' });
    }
  }

  const { options } = draft(best.item, best.result);
  return c.json({
    greeting: dynamicGreeting(tz),
    headline: '现在，只递一件顺手的',
    item: {
      id: best.item.id,
      title: best.item.title,
      raw_text: best.row.raw_text,
      category: best.item.category,
      status: nudgeId ? 'nudged' : best.row.status,
      due_at: best.row.due_at,
      est_minutes: best.row.est_minutes ?? 5,
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
