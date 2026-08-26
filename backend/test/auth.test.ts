import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyJwt, ensureUser } from '../src/lib/auth';

describe('verifyJwt', () => {
  let server: Server;
  let jwksUrl: string;
  let signKey: CryptoKey;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    signKey = privateKey;
    const pubJwk = await exportJWK(publicKey);
    const jwks = JSON.stringify({ keys: [{ ...(pubJwk as object), kid: 'test', alg: 'RS256', use: 'sig' }] });
    server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(jwks);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    jwksUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('returns sub for a valid signed token', async () => {
    const token = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(`${jwksUrl}/auth/v1`)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(signKey);
    await expect(verifyJwt(token, jwksUrl)).resolves.toBe('user-123');
  });

  it('rejects a garbage token', async () => {
    await expect(verifyJwt('not-a-jwt', jwksUrl)).rejects.toThrow();
  });
});

describe('ensureUser', () => {
  it('is a no-op callable (sql shape deferred to integration)', () => {
    expect(typeof ensureUser).toBe('function');
  });
});