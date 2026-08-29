import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { getRhythm } from '../services/rhythm';

export const rhythm = new Hono<AppEnv>();

const CATEGORIES = ['life', 'chore', 'bill', 'return', 'study', 'social'];

/** 本地执行层拉取当前用户节奏策略（agent 写入后本地引擎据此提醒）。 */
rhythm.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const out: Record<string, unknown> = {};
  for (const category of CATEGORIES) {
    out[category] = await getRhythm(db, userId, category);
  }
  return c.json(out);
});
