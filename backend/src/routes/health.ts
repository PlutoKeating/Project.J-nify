import { Hono } from 'hono';
import type { AppEnv } from '../app';
import postgres from 'postgres';
import { SUPABASE_POOLER_CA } from '../db/supabase-pooler-ca';

export const health = new Hono<AppEnv>();

health.get('/', (c) =>
  c.json({ name: 'jnify-backend', version: c.env.APP_VERSION ?? '0.1.0', env: c.env.APP_ENV ?? 'development' }),
);

health.get('/health', (c) => c.json({ status: 'ok' }));

// 临时诊断端点（无鉴权，仅 DEBUG=1）：原始 postgres.js 直连测试，暴露真实错误字段与目标 URL 形态。
health.post('/_debug/db', async (c) => {
  if (c.env.DEBUG !== '1') return c.json({ detail: 'not found' }, 404);
  const url = c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL;
  const out: Record<string, unknown> = { hyperdrive: Boolean(c.env.HYPERDRIVE), url: url.replace(/:[^:@/]+@/, ':****@') };
  const raw = postgres(url, { prepare: false, ssl: 'require', connect_timeout: 15 });
  try {
    const r = await raw`select ${1} as ok`;
    out.select = r[0];
  } catch (e) {
    const obj = e as Record<string, unknown> & { message?: string };
    out.err = { message: obj.message, fields: Object.fromEntries(Object.keys(obj).filter((k) => ['string', 'number', 'boolean'].includes(typeof obj[k])).map((k) => [k, obj[k]])) };
  }
  await raw.end();
  // 对照实验：完整链 ca + rejectUnauthorized:false 组合（若 ca 被 workerd 采纳应能连通）
  if (c.env.DATABASE_URL) {
    const chainPem = SUPABASE_POOLER_CA; // 根 CA；完整链见 db 模块注释
    const direct = postgres(c.env.DATABASE_URL, { prepare: false, ssl: { ca: chainPem, rejectUnauthorized: false }, connect_timeout: 15 });
    try {
      const r = await direct`select count(*)::int as n from "public"."users"`;
      out.direct = { ok: true, users: r[0].n };
    } catch (e) {
      const obj = e as Record<string, unknown> & { message?: string };
      out.direct = { err: obj.message, fields: Object.fromEntries(Object.keys(obj).filter((k) => ['string', 'number', 'boolean'].includes(typeof obj[k])).map((k) => [k, obj[k]])) };
    }
    await direct.end().catch(() => undefined);
  }
  // 对照 sanity：标准 HTTPS fetch（workerd 必然信任公开 CA）
  try {
    const fr = await fetch('https://ajeratjsxyxtdqtmtvxh.supabase.co/auth/v1/health', { signal: AbortSignal.timeout(10000) });
    out.httpsFetch = { status: fr.status };
  } catch (e) {
    out.httpsFetch = { err: (e as Error).message };
  }
  return c.json(out);
});
