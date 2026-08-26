import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { robustPrivacyScope } from '../db';
import { checkSignal } from '../lib/privacy';
import { ingestSignal } from '../services/context';

export const signals = new Hono<AppEnv>();

signals.post('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ signal_type?: string; payload?: Record<string, unknown>; occurred_at?: string }>();
  const scope = await robustPrivacyScope(db, userId);
  const gate = checkSignal(body.signal_type ?? '', scope);
  if (!gate.allowed) return c.json({ detail: gate.reason }, 403);
  await ingestSignal(db, userId, {
    signalType: body.signal_type!,
    payload: body.payload ?? {},
    occurredAt: body.occurred_at ? new Date(body.occurred_at) : new Date(),
  });
  return c.json({ ok: true });
});
