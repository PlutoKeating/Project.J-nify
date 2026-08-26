import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
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
  // drizzle 0.45 的 where() 返回不含 where 的 builder，条件过滤需合并进单次 and()
  const rows = await db
    .select()
    .from(s.itemCommitments)
    .where(and(eq(s.itemCommitments.userId, userId), ...(status ? [eq(s.itemCommitments.status, status)] : [])))
    .orderBy(desc(s.itemCommitments.createdAt));
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
