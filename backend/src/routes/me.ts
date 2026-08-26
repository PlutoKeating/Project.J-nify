import { Hono } from 'hono';
import { count, eq } from 'drizzle-orm';
import type { AppEnv } from '../app';
import { dbSchema as s } from '../db';

export const me = new Hono<AppEnv>();

me.delete('/data', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const [{ v: commitments }] = await db.select({ v: count() }).from(s.itemCommitments).where(eq(s.itemCommitments.userId, userId));
  const [{ v: signals }] = await db.select({ v: count() }).from(s.signalEvents).where(eq(s.signalEvents.userId, userId));
  await db.delete(s.users).where(eq(s.users.id, userId)); // 级联清空全部业务表
  return c.json({ deleted_commitments: commitments, deleted_signals: signals, message: '已删除全部数据' });
});
