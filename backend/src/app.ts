import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './config';
import { num } from './config';
import { ensureUser, requireAuth } from './lib/auth';
import { slidingWindow } from './lib/rate-limit';
import { createDb, type Db } from './db';
import { health } from './routes/health';
import { items } from './routes/items';
import { now } from './routes/now';
import { signals } from './routes/signals';
import { guardrails } from './routes/guardrails';
import { me } from './routes/me';
import { llm } from './routes/llm';

export type AppEnv = { Bindings: Env; Variables: { userId: string; db: Db } };

export function makeApp(env: Env): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', cors({ origin: (env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()) }));

  // 先鉴权（拿到 userId 再限流，按用户计；未鉴权不建连）
  app.use('/v1/*', requireAuth);
  app.use('/v1/*', async (c, next) => {
    const db = createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL); // Hyperdrive 优先（CF 侧管 TLS）
    c.set('db', db);
    await ensureUser(db, c.get('userId')); // users 懒创建；先落库以免 FK 失败（幂等 onConflictDoNothing）
    const limit = num(env, 'RATE_LIMIT_PER_MINUTE');
    if (limit > 0) {
      const allow = slidingWindow(`${c.get('userId')}:${c.req.path}`, limit, 60_000);
      if (!allow()) return c.json({ detail: 'rate limit exceeded' }, 429);
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    // DEBUG=1（仅临时诊断 secret）时返回真实错误详情，便于定位；生产不设置该变量。
    if (env.DEBUG === '1') {
      const chain: string[] = [];
      let cur: unknown = err;
      for (let i = 0; i < 4 && cur; i++) {
        const c = cur as Error & { code?: string; severity?: string; detail?: string; position?: string };
        chain.push(`[${i}] ${c.message}${c.code ? ` code=${c.code}` : ''}${c.detail ? ` detail=${c.detail}` : ''}${c.severity ? ` sev=${c.severity}` : ''}`);
        cur = (c as { cause?: unknown }).cause;
      }
      return c.json({ detail: chain.join('\n') }, 500);
    }
    return c.json({ detail: err instanceof SyntaxError ? 'invalid request body' : 'internal error' }, err instanceof SyntaxError ? 400 : 500);
  });
  app.notFound((c) => c.json({ detail: 'not found' }, 404));

  app.route('/', health);
  app.route('/v1/items', items);
  app.route('/v1/now', now);
  app.route('/v1/signals', signals);
  app.route('/v1/guardrails', guardrails);
  app.route('/v1/me', me);
  app.route('/v1/llm', llm);
  return app;
}
