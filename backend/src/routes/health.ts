import { Hono } from 'hono';
import type { AppEnv } from '../app';

export const health = new Hono<AppEnv>();

health.get('/', (c) =>
  c.json({ name: 'jnify-backend', version: c.env.APP_VERSION ?? '0.1.0', env: c.env.APP_ENV ?? 'development' }),
);

health.get('/health', (c) => c.json({ status: 'ok' }));
