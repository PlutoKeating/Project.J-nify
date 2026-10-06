// 集成 e2e：真的 Worker 应用（makeApp）+ 真的 jnify-data（../data，进程内、临时目录里的 SQLite）+ 假的账号服务（本机 JWKS，签发 Hydra 形状的访问令牌）。
// 不需要任何外部服务。运行：cd backend && npm run test:integration（需要先在 ../data 里 npm ci）
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { makeApp } from '../src/app';
import { openDb } from '../../data/src/db.ts';
import { createApp } from '../../data/src/app.ts';

/** 把一个 fetch 处理函数挂到本机随机端口（Worker 经 fetch 访问它）。 */
async function listen(handler: (req: Request) => Response | Promise<Response>): Promise<{ url: string; server: Server }> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await handler(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

describe('integration e2e（Worker + jnify-data）', () => {
  const KEY = 'integration-'.padEnd(40, 'k');
  const userId = randomUUID();
  const db = openDb(fs.mkdtempSync(path.join(os.tmpdir(), 'jnify-int-')));
  let app: ReturnType<typeof makeApp>;
  let env: Parameters<typeof makeApp>[0];
  let token = '';
  const servers: Server[] = [];

  beforeAll(async () => {
    const data = await listen(createApp(db, KEY).fetch);
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwks = JSON.stringify({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] });
    const id = await listen(() => new Response(jwks, { headers: { 'Content-Type': 'application/json' } }));
    servers.push(data.server, id.server);
    const issuer = `${id.url}/`;
    token = await new SignJWT({ sub: userId, client_id: 'jnify-app', scp: ['openid', 'jnify.items.read', 'jnify.items.write'] })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(issuer).setIssuedAt().setExpirationTime('1h').sign(privateKey);
    env = { JNIFY_DATA_URL: data.url, JNIFY_DATA_KEY: KEY, ID_ISSUER: issuer, QUIET_HOURS_START: '23:30', QUIET_HOURS_END: '08:30', MAX_NUDGE_BUDGET: '3' } as never;
    app = makeApp(env);
  });
  afterAll(() => { for (const s of servers) s.close(); db.close(); });

  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } }, env as never);
  /** 直接查数据服务的库，验证持久化（不经 Worker） */
  const sql = <T = Record<string, unknown>>(q: string, ...args: unknown[]) => db.raw.prepare(q).all(...(args as never[])) as T[];

  it('capture -> now shows window with reason', { timeout: 90_000 }, async () => {
    const cap = await call('/v1/items/capture', {
      method: 'POST',
      body: JSON.stringify({ raw_text: '月底还信用卡', category: 'return', due_at: new Date(Date.now() + 5 * 86400_000).toISOString() }),
    });
    expect(cap.status).toBe(200);
    const capBody = (await cap.json()) as { item: { id: string }; message: string };
    expect(capBody.message).toBe('记下了：不急，但我帮您盯着。');

    const r = await call('/v1/now');
    expect(r.status).toBe(200);
    const nowBody = (await r.json()) as { item: { id: string; reason_code: string; options: { code: string }[] } };
    expect(nowBody.item.id).toBe(capBody.item.id);
    expect(nowBody.item.reason_code).toBe('due_soon');
    // return 属于兜底类目：rescue 应出现
    expect(nowBody.item.options.map((o) => o.code)).toEqual(['now', 'later', 'drop', 'rescue']);
  });

  it('later does not immediately re-serve the same item at top', { timeout: 90_000 }, async () => {
    // 上一用例已建 due_soon(return) 事项；再录一条 social
    await call('/v1/items/capture', {
      method: 'POST',
      body: JSON.stringify({ raw_text: '回小明消息', category: 'social' }),
    });
    const r1 = await call('/v1/now');
    const first = ((await r1.json()) as { item: { id: string } }).item;
    await call(`/v1/items/${first.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'later' }) });
    const r2 = await call('/v1/now');
    const second = ((await r2.json()) as { item: { id: string } }).item;
    expect(second.id).not.toBe(first.id); // 刚晚点的事项不立刻回顶
    const list = await call('/v1/items?status=parked');
    const parked = (await list.json()) as { id: string }[];
    expect(parked.map((i) => i.id)).toContain(first.id); // 且已回 parked，可恢复
  });

  it('guardrails persist across client instances', { timeout: 90_000 }, async () => {
    await call('/v1/guardrails', { method: 'PUT', body: JSON.stringify({ max_nudge_budget: 5 }) });
    // 独立连接直接查库，验证持久化（不依赖 app 内的连接缓存）；按 user_id 过滤，避免历次运行残留行
    const rows = sql<{ value: string }>(`select value from user_preferences where "key" = 'max_nudge_budget' and scene = 'guardrails' and user_id = ?`, userId);
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('5');
    const g = await call('/v1/guardrails');
    expect(((await g.json()) as { max_nudge_budget: number }).max_nudge_budget).toBe(5);
  });

  it('single item fully deferred: same item served but nudge suppressed', { timeout: 90_000 }, async () => {
    const existing = (await (await call('/v1/items')).json()) as { id: string }[];
    for (const item of existing) await call(`/v1/items/${item.id}`, { method: 'DELETE' });

    // 静默时段 start===end ⇒ 永不静默：保证首轮 now 必然 nudge（否则在 23:30-08:30 UTC 跑会假失败）
    await call('/v1/guardrails', { method: 'PUT', body: JSON.stringify({ quiet_hours_start: '00:00', quiet_hours_end: '00:00', max_nudge_budget: 3 }) });
    const cap = await call('/v1/items/capture', {
      method: 'POST',
      body: JSON.stringify({ raw_text: '整理月报', category: 'work' }),
    });
    expect(cap.status).toBe(200);
    const itemId = ((await cap.json()) as { item: { id: string } }).item.id;

    const countNudges = async (id: string): Promise<number> =>
      Number(sql<{ n: number }>('select count(*) as n from nudges n join item_commitments i on i.id = n.item_id where n.item_id = ? and i.user_id = ?', id, userId)[0].n);

    const r1 = await call('/v1/now');
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { item: { id: string } }).item.id).toBe(itemId);
    expect(await countNudges(itemId)).toBe(1); // 首轮 now 已 nudge

    await call(`/v1/items/${itemId}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'later' }) });

    const r2 = await call('/v1/now');
    expect(r2.status).toBe(200);
    const body2 = (await r2.json()) as { item: { id: string; status: string } };
    expect(body2.item.id).toBe(itemId); // 全 defer 回退：同一事项仍被动可见
    expect(body2.item.status).not.toBe('nudged'); // 该轮响应不置 nudged
    expect(await countNudges(itemId)).toBe(1); // 该轮抑制 nudge，nudge 数不变
  });

  it('signals accepted and me/data deletes all J-nify data', { timeout: 90_000 }, async () => {
    const s = await call('/v1/signals', { method: 'POST', body: JSON.stringify({ signal_type: 'usage', payload: { free_slot: true } }) });
    expect(s.status).toBe(200);
    const d = await call('/v1/me/data', { method: 'DELETE' });
    expect(d.status).toBe(200);

    expect(sql('select id from users where id = ?', userId)).toEqual([]);
    for (const t of ['item_commitments', 'decisions', 'signal_events', 'user_preferences', 'memory_notes']) {
      expect(sql(`select 1 from ${t} where user_id = ?`, userId), t).toEqual([]);
    }
  });
});
