import { Hono } from 'hono';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppEnv } from '../app';
import { dbSchema as s } from '../db';
import { latestContext, robustGuardrails } from '../db';
import { buildNudge, freshOrReuseWindow } from '../services/orchestrator';
import { draft } from '../services/brain';
import { ensureUser } from '../lib/auth';
import type { WindowResult } from '../services/window-engine';

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
  const guardrails = await robustGuardrails(db, userId);
  const { best, nudgeId } = await db.transaction(async (tx) => {
    const scored: { item: (typeof candidates)[number]; windowId: string; result: WindowResult }[] = [];
    for (const item of candidates) {
      const { windowId, result } = await freshOrReuseWindow(tx, item, { contextFeatures: ctx ?? undefined });
      scored.push({ item, windowId, result });
    }
    scored.sort((a, b) => b.result.fitScore - a.result.fitScore); // fit_score 最高；稳定排序保留 updated_at 序
    const best = scored[0];
    // policy 行缺失则先 INSERT 默认行（maxNudges 用护栏预算，nudgeCount 0）
    const existing = await tx
      .select()
      .from(s.escalationPolicies)
      .where(eq(s.escalationPolicies.itemId, best.item.id))
      .limit(1);
    if (!existing[0]) {
      await tx
        .insert(s.escalationPolicies)
        .values({ itemId: best.item.id, maxNudges: guardrails.maxNudgeBudget, nudgeCount: 0 });
    }
    const nudgeId = await buildNudge(
      tx,
      best.item,
      { maxNudges: guardrails.maxNudgeBudget },
      guardrails,
      best.windowId,
      best.result,
    );
    if (nudgeId) {
      await tx.update(s.itemCommitments).set({ status: 'nudged' }).where(eq(s.itemCommitments.id, best.item.id));
    }
    return { best, nudgeId };
  });
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
