import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyJwt, ensureUser } from '../src/lib/auth';

// 假的账号服务：/.well-known/jwks.json 返回公钥；令牌的形状照 Ory Hydra 的 JWT 访问令牌（iss / sub / client_id / scp）
describe('verifyJwt（PlutoKeating 账号的访问令牌）', () => {
  let server: Server;
  let issuer: string;
  let signKey: CryptoKey;
  const sign = (claims: Record<string, unknown>, iss = issuer) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(iss).setIssuedAt().setExpirationTime('1h').sign(signKey);

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    signKey = privateKey;
    const jwks = JSON.stringify({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' }] });
    server = createServer((req, res) => {
      if (req.url !== '/.well-known/jwks.json') { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(jwks);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('App 的令牌（读写两项 scope）：读、写都通过，返回 sub', async () => {
    const token = await sign({ sub: 'user-123', client_id: 'jnify-app', scp: ['openid', 'jnify.items.read', 'jnify.items.write'] });
    await expect(verifyJwt(token, issuer, 'read')).resolves.toBe('user-123');
    await expect(verifyJwt(token, issuer, 'write')).resolves.toBe('user-123');
  });

  it('只授权了读的客户端（如 Quetzal 运行基座）不能改', async () => {
    const token = await sign({ sub: 'user-123', client_id: 'quetzal-runtime', scp: ['openid', 'jnify.items.read'] });
    await expect(verifyJwt(token, issuer, 'read')).resolves.toBe('user-123');
    await expect(verifyJwt(token, issuer, 'write')).rejects.toThrow(/jnify.items.write/);
  });

  it('没有 J-nify 权限的令牌（例如别的产品的、或 ID 令牌）拒绝', async () => {
    await expect(verifyJwt(await sign({ sub: 'u', client_id: 'quetzal-sync', scp: ['openid', 'email'] }), issuer)).rejects.toThrow();
    await expect(verifyJwt(await sign({ sub: 'u', aud: 'jnify-app' }), issuer)).rejects.toThrow();
  });

  it('签发者不对、乱写的令牌拒绝', async () => {
    await expect(verifyJwt('not-a-jwt', issuer)).rejects.toThrow();
    const evil = await sign({ sub: 'u', scp: ['jnify.items.read'] }, 'https://evil.example/');
    await expect(verifyJwt(evil, issuer)).rejects.toThrow();
  });
});

describe('ensureUser', () => {
  it('is a no-op callable (shape covered by integration)', () => {
    expect(typeof ensureUser).toBe('function');
  });
});
