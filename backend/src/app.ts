import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './config';
import { num } from './config';
import { ensureUser, requireAuth } from './lib/auth';
import { slidingWindow } from './lib/rate-limit';
import { makeDb, type Db } from './db';
import { health } from './routes/health';
import { items } from './routes/items';
import { now } from './routes/now';
import { signals } from './routes/signals';
import { guardrails } from './routes/guardrails';
import { me } from './routes/me';
import { llm } from './routes/llm';
import { admin } from './routes/admin';
import { jennifer } from './routes/jennifer';
import { metrics } from './routes/metrics';

export type AppEnv = { Bindings: Env; Variables: { userId: string; db: Db } };

export function makeApp(env: Env): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', cors({ origin: (env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()) }));

  // 先鉴权（拿到 userId 再限流，按用户计；未鉴权不建连）
  app.use('/v1/*', requireAuth);
  app.use('/v1/*', async (c, next) => {
    const db = makeDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY); // Supabase REST（PostgREST，标准 HTTPS）
    c.set('db', db);
    await ensureUser(db, c.get('userId')); // users 懒创建（upsert 幂等）
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
  app.route('/admin', admin);
  app.route('/v1/jennifer', jennifer);
  app.route('/v1/metrics', metrics);
  return app;
}
