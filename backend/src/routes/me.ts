import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { restDelete, restGet } from '../db';

export const me = new Hono<AppEnv>();

me.delete('/data', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const commitments = await restGet<{ id: string }>(db, 'item_commitments', { select: 'id', params: { user_id: userId }, limit: 1 });
  const signals = await restGet<{ id: string }>(db, 'signal_events', { select: 'id', params: { user_id: userId }, limit: 1 });
  // 删除 users 行 → FK ON DELETE CASCADE 清空全部业务表
  await restDelete(db, 'users', { id: userId });
  return c.json({ deleted_commitments: commitments.length ? 1 : 0, deleted_signals: signals.length ? 1 : 0, message: '已删除全部数据' });
});