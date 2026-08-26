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
