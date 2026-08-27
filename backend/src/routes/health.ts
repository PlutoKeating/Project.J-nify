import { Hono } from 'hono';
import type { AppEnv } from '../app';
import postgres from 'postgres';
import { SUPABASE_POOLER_CA } from '../db/supabase-pooler-ca';

export const health = new Hono<AppEnv>();

health.get('/', (c) =>
  c.json({ name: 'jnify-backend', version: c.env.APP_VERSION ?? '0.1.0', env: c.env.APP_ENV ?? 'development' }),
);

health.get('/health', (c) => c.json({ status: 'ok' }));

// 临时诊断端点（无鉴权，仅 DEBUG=1）。拆为独立调用，避免子请求预算互相污染。
health.post('/_debug/https', async (c) => {
  if (c.env.DEBUG !== '1') return c.json({ detail: 'not found' }, 404);
  try {
    const fr = await fetch(`${c.env.SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(10000) });
    return c.json({ status: fr.status });
  } catch (e) {
    return c.json({ err: (e as Error).message }, 500);
  }
});

health.post('/_debug/pg', async (c) => {
  if (c.env.DEBUG !== '1') return c.json({ detail: 'not found' }, 404);
  const direct = postgres(c.env.DATABASE_URL, { prepare: false, ssl: { ca: SUPABASE_POOLER_CA, rejectUnauthorized: false }, connect_timeout: 10 });
  try {
    const r = await direct`select count(*)::int as n from "public"."users"`;
    const out = { ok: true, users: r[0].n };
    await direct.end();
    return c.json(out);
  } catch (e) {
    const obj = e as Record<string, unknown> & { message?: string };
    await direct.end().catch(() => undefined);
    return c.json({ err: obj.message, code: obj.code ?? null }, 500);
  }
});
