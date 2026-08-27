import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { AppEnv } from '../app';
import postgres from 'postgres';
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

// 临时诊断端点：仅 DEBUG=1 时可用；绕过 drizzle，用原始 postgres.js 复现连接/插入以暴露真实错误字段。
llm.post('/_debug/db', async (c) => {
  if (c.env.DEBUG !== '1') return c.json({ detail: 'not found' }, 404);
  const url = c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL;
  const raw = postgres(url, { prepare: false, ssl: 'require', connect_timeout: 15 });
  const out: Record<string, unknown> = { url: url.replace(/:[^:@/]+@/, ':****@') };
  try {
    const r = await raw`select current_user() as u, current_database() as db, ${1} as ok`;
    out.select = r[0];
  } catch (e) {
    const obj = e as Record<string, unknown> & { message?: string };
    out.err = { message: obj.message, fields: Object.fromEntries(Object.keys(obj).filter((k) => ['string', 'number', 'boolean'].includes(typeof obj[k])).map((k) => [k, obj[k]])) };
  }
  try {
    const r = await raw`insert into "public"."users" ("id") values (${crypto.randomUUID()}) on conflict do nothing`;
    out.insertRows = r.length;
  } catch (e) {
    const obj = e as Record<string, unknown> & { message?: string };
    out.insertErr = { message: obj.message, fields: Object.fromEntries(Object.keys(obj).filter((k) => ['string', 'number', 'boolean'].includes(typeof obj[k])).map((k) => [k, obj[k]])) };
  }
  await raw.end();
  return c.json(out);
});
