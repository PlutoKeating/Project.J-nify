import { desc, eq, sql } from 'drizzle-orm';
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

// policy 仅保留 maxNudges 用途；nudge_count 自增在 SQL 侧完成（不再依赖调用方陈旧计数）。
export async function buildNudge(
  db: Db,
  item: ItemRowLike,
  policy: { maxNudges: number },
  guardrails: GuardrailsLike,
  windowId: string,
  result: WindowResult,
  now: Date = new Date(),
): Promise<string | null> {
  const g = await shouldNudge({ maxNudges: policy.maxNudges, nudgeCount: null }, guardrails, now);
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
    .set({ nudgeCount: sql<number>`${s.escalationPolicies.nudgeCount} + 1` })
    .where(eq(s.escalationPolicies.itemId, item.id));
  return nudge.id;
}
