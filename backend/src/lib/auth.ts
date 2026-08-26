import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../config';
import { users as usersTable } from '../db/schema';

export function jwksFor(supabaseUrl: string) {
  return createRemoteJWKSet(
    new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`),
  );
}

export async function verifyJwt(token: string, supabaseUrl: string): Promise<string> {
  const { payload } = await jwtVerify(token, jwksFor(supabaseUrl), {
    issuer: `${supabaseUrl.replace(/\/$/, '')}/auth/v1`,
  });
  if (typeof payload.sub !== 'string') throw new Error('missing sub');
  return payload.sub;
}

interface MinimalDb {
  insert(table: unknown): MinimalDb;
  values(values: unknown): MinimalDb;
  onConflictDoNothing(): Promise<unknown>;
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: { userId: string } }> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ detail: 'unauthorized' }, 401);
  try {
    c.set('userId', await verifyJwt(header.slice(7), c.env.SUPABASE_URL));
    await next();
  } catch {
    return c.json({ detail: 'unauthorized' }, 401);
  }
};

export async function ensureUser(db: MinimalDb, userId: string): Promise<void> {
  await db.insert(usersTable as never).values({ id: userId }).onConflictDoNothing();
}