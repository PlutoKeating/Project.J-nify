import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../config';
import type { Db } from '../db';
import { restInsert } from '../db';

// 登录：PlutoKeating 账号（OIDC，Ory Hydra 签发 JWT 访问令牌）。Worker 用账号服务的公钥（JWKS）自己验签，不回头问。
//   - sub：账号编号（UUID），即 users.id；
//   - 权限按 scope：读接口要 jnify.items.read，改动要 jnify.items.write。J-nify App（client jnify-app）登录时两项都有；
//     Quetzal 运行基座（client quetzal-runtime）在用户在授权页点「允许」后拿到它申请的那几项。
export const DEFAULT_ISSUER = 'https://id.plutokeating.beer/';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function jwksFor(issuer: string) {
  let set = jwksCache.get(issuer);
  if (!set) {
    set = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer.endsWith('/') ? issuer : `${issuer}/`));
    jwksCache.set(issuer, set);
  }
  return set;
}

export type Need = 'read' | 'write';

export async function verifyJwt(token: string, issuer: string, need: Need = 'read'): Promise<string> {
  const { payload } = await jwtVerify(token, jwksFor(issuer), { issuer });
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('missing sub');
  const scp = Array.isArray(payload.scp) ? payload.scp : typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
  if (!scp.includes(`jnify.items.${need}`)) throw new Error(`missing scope jnify.items.${need}`);
  return payload.sub;
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: { userId: string } }> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ detail: 'unauthorized' }, 401);
  const need: Need = c.req.method === 'GET' || c.req.method === 'HEAD' ? 'read' : 'write';
  try {
    c.set('userId', await verifyJwt(header.slice(7), c.env?.ID_ISSUER || DEFAULT_ISSUER, need));
  } catch {
    return c.json({ detail: 'unauthorized' }, 401);
  }
  await next(); // 下游错误交给 app.onError/500，不得吞成 401
};

export async function ensureUser(db: Db, userId: string): Promise<void> {
  // upsert：users 首访懒创建（幂等）
  await restInsert(db, 'users', { id: userId }, { onConflict: 'id' });
}
