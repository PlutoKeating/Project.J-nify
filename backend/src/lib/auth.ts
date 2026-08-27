import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../config';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function jwksFor(supabaseUrl: string) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
  let set = jwksCache.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, set);
  }
  return set;
}

export async function verifyJwt(token: string, supabaseUrl: string): Promise<string> {
  const { payload } = await jwtVerify(token, jwksFor(supabaseUrl), {
    issuer: `${supabaseUrl.replace(/\/$/, '')}/auth/v1`,
  });
  if (typeof payload.sub !== 'string') throw new Error('missing sub');
  return payload.sub;
}

interface MinimalDb {
  execute(query: unknown): PromiseLike<unknown>;
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: { userId: string } }> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ detail: 'unauthorized' }, 401);

  const supabaseUrl = c.env?.SUPABASE_URL;
  if (!supabaseUrl) return c.json({ detail: 'unauthorized' }, 401);
  try {
    c.set('userId', await verifyJwt(header.slice(7), supabaseUrl));
  } catch {
    return c.json({ detail: 'unauthorized' }, 401);
  }
  await next(); // 下游错误交给 app.onError/500，不得吞成 401
};

export async function ensureUser(db: MinimalDb, userId: string): Promise<void> {
  // 用 db.execute 直连同一 pg 客户端做幂等插入：绕开 drizzle insert 的 default 展开路径，
  // 底层 postgres 错误可透出（code/detail），且 SQL 更简。
  await db.execute(sql`insert into "public"."users" ("id") values (${userId}) on conflict do nothing`);
}

import { sql } from 'drizzle-orm';