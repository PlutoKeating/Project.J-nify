import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { restInsert } from '../db';

export const metrics = new Hono<AppEnv>();

const ALLOWED_EVENTS = new Set(['capture', 'nudge_sent', 'nudge_opened', 'decision', 'rescue_action', 'complaint']);

metrics.post('/events', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{
    event_type?: string;
    item_id?: string;
    category?: string;
    status?: string;
    decision?: string;
    duration_minutes?: number;
    occurred_at?: string;
  }>();
  const eventType = body.event_type ?? '';
  if (!ALLOWED_EVENTS.has(eventType)) return c.json({ detail: `invalid event_type: ${eventType}` }, 422);
  await restInsert(db, 'metrics_events', {
    user_id: userId,
    event_type: eventType,
    item_id: body.item_id ?? null,
    category: body.category ?? null,
    status: body.status ?? null,
    decision: body.decision ?? null,
    duration_minutes: Number.isFinite(Number(body.duration_minutes)) ? Number(body.duration_minutes) : null,
    occurred_at: body.occurred_at ? new Date(body.occurred_at).toISOString() : new Date().toISOString(),
  });
  return c.json({ ok: true });
});
