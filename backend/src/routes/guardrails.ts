import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { restGet, restInsert, robustGuardrails, type Db } from '../db';

export const guardrails = new Hono<AppEnv>();

async function upsert(db: Db, userId: string, key: string, value: string) {
  // PostgREST upsert：on_conflict(user_id, scene, key) + resolution=merge-duplicates
  await restInsert(
    db,
    'user_preferences',
    { user_id: userId, scene: 'guardrails', key, value },
    { onConflict: 'user_id,scene,key' },
  );
}

guardrails.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const g = await robustGuardrails(db, userId);
  const privacy = await robustPrivacyScopeGuardrails(db, userId);
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

async function robustPrivacyScopeGuardrails(db: Db, userId: string): Promise<Record<string, boolean>> {
  const rows = await restGet<{ key: string; value: string }>(db, 'user_preferences', {
    select: 'key,value', params: { user_id: userId, scene: 'guardrails' },
  });
  const row = rows.find((r) => r.key === 'privacy_scope');
  const fallback = { calendar: true, weather: true, coarse_location: true };
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}