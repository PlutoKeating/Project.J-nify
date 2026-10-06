import { Hono } from 'hono';
import type { AppEnv } from '../app';

export const health = new Hono<AppEnv>();

// 根路径 / 是官网（静态资源，见 wrangler.toml 的 [assets]）；服务信息放在 /health
health.get('/health', (c) =>
  c.json({ status: 'ok', name: 'jnify-backend', version: c.env?.APP_VERSION ?? '0.1.0', env: c.env?.APP_ENV ?? 'development' }),
);