// 资料接口 GET/PUT /v1/me/profile：昵称（非唯一）经 service key 读写 users 表。
// 无库单测里用「路由存在性（无 token → 401）+ 源码断言钉住接线/校验」，与
// redline.test.ts 的机读替身手法一致（DB-bound 逻辑由集成测试覆盖）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeApp } from '../src/app';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const env = { SUPABASE_URL: 'https://x.supabase.co', DATABASE_URL: '' } as never;

describe('GET /v1/me/profile', () => {
  it('route exists under auth (no token → 401, not 404)', async () => {
    const res = await makeApp(env).request('/v1/me/profile');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'unauthorized' });
  });

  it('reads users.nickname via service-key restGet (not client direct)', () => {
    const src = read('src/routes/me.ts');
    expect(src).toMatch(/restGet<.*nickname/);
    expect(src).toContain("select: 'id,nickname'");
    expect(src).toContain("params: { id: userId }");
    expect(src).toContain("u?.nickname ?? null");
  });
});

describe('PUT /v1/me/profile', () => {
  it('route exists under auth (no token → 401, not 404)', async () => {
    const res = await makeApp(env).request('/v1/me/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'x' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'unauthorized' });
  });

  it('persists nickname via service-key restUpdate and validates blank/over-length', () => {
    const src = read('src/routes/me.ts');
    expect(src).toMatch(/restUpdate\(db, 'users', \{ id: userId \}, \{ nickname \}\)/);
    expect(src).toContain("typeof body.nickname !== 'string'");
    expect(src).toContain("'昵称不能为空'");
    expect(src).toContain("nickname.length > MAX_NICK");
    expect(src).toContain('MAX_NICK = 64');
  });
});
