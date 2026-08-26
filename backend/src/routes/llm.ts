import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { AppEnv } from '../app';
import { dbSchema as s } from '../db';
import { draft } from '../services/brain';

export const llm = new Hono<AppEnv>();

llm.post('/draft', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ item_id?: string; window_text?: string }>();
  let title = '有一件事';
  let itemCategory = 'life';
  if (body.item_id) {
    const [item] = await db
      .select()
      .from(s.itemCommitments)
      .where(and(eq(s.itemCommitments.id, body.item_id), eq(s.itemCommitments.userId, userId)))
      .limit(1);
    if (!item) return c.json({ detail: 'item not found' }, 404);
    title = item.title;
    itemCategory = item.category;
  }
  const window = body.window_text
    ? { reasonCode: 'manual_window', reasonText: body.window_text, fitScore: 0.5, windowStart: new Date(), windowEnd: new Date() }
    : null;
  const out = draft({ title, category: itemCategory }, window);
  return c.json({ model: c.env.LLM_MODEL ?? 'template', title: out.title, body: out.body, degraded: out.degraded, options: out.options });
});
