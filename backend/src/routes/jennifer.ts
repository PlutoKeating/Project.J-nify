import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { runAgent } from '../services/agent';

export const jennifer = new Hono<AppEnv>();

jennifer.post('/chat', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ message?: string; history?: { role: 'user' | 'assistant'; content: string }[] }>();
  const message = body.message?.trim();
  if (!message) return c.json({ detail: 'message is required' }, 422);
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const out = await runAgent(db, userId, message, history);
  return c.json(out);
});
