import { Hono } from 'hono';
import type { AppEnv } from '../app';
import postgres from 'postgres';

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
  // 对照实验：边缘直连 DATABASE_URL（不经 Hyperdrive），验证 Supavisor 证书在 workerd 下是否可信
  if (c.env.DATABASE_URL && c.env.DATABASE_URL !== url) {
    const direct = postgres(c.env.DATABASE_URL, { prepare: false, ssl: 'require', connect_timeout: 15 });
    try {
      const r = await direct`select count(*)::int as n from "public"."users"`;
      out.direct = { ok: true, users: r[0].n };
    } catch (e) {
      const obj = e as Record<string, unknown> & { message?: string };
      out.direct = { err: obj.message, fields: Object.fromEntries(Object.keys(obj).filter((k) => ['string', 'number', 'boolean'].includes(typeof obj[k])).map((k) => [k, obj[k]])) };
    }
    await direct.end().catch(() => undefined);
  }
  return c.json(out);
});
