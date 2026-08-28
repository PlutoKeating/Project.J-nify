import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { restDelete, restGet, restUpdate } from '../db';

export const me = new Hono<AppEnv>();

const MAX_NICK = 64;

me.delete('/data', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const commitments = await restGet<{ id: string }>(db, 'item_commitments', { select: 'id', params: { user_id: userId }, limit: 1 });
  const signals = await restGet<{ id: string }>(db, 'signal_events', { select: 'id', params: { user_id: userId }, limit: 1 });
  // 删除 users 行 → FK ON DELETE CASCADE 清空全部业务表
  await restDelete(db, 'users', { id: userId });
  return c.json({ deleted_commitments: commitments.length ? 1 : 0, deleted_signals: signals.length ? 1 : 0, message: '已删除全部数据' });
});

// 资料：昵称（用户名，非唯一）。邮箱来自 Supabase Auth（auth.users），
// 客户端在 RLS 下对 users 表零访问，故读写全走后端 service key。
me.get('/profile', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const rows = await restGet<{ id: string; nickname: string | null }>(db, 'users', {
    select: 'id,nickname', params: { id: userId }, limit: 1,
  });
  const u = rows[0];
  return c.json({ id: u?.id ?? userId, nickname: u?.nickname ?? null });
});

me.put('/profile', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ nickname?: unknown }>();
  if (typeof body.nickname !== 'string') return c.json({ detail: '昵称不能为空' }, 400);
  const nickname = body.nickname.trim();
  if (!nickname) return c.json({ detail: '昵称不能为空' }, 400);
  if (nickname.length > MAX_NICK) return c.json({ detail: `昵称最长 ${MAX_NICK} 个字符` }, 400);
  await restUpdate(db, 'users', { id: userId }, { nickname });
  return c.json({ id: userId, nickname });
});