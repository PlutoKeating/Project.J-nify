// 集成 e2e（真实 Supabase 环境；3 个 env 任一缺失时本文件整体跳过）。
// 运行前置：
//   ① 需 3 个环境变量：SUPABASE_URL / SUPABASE_ANON_KEY（publishable key）/ DATABASE_URL（pooler 串）；
//   ② Supabase Auth 需关闭 Confirm email（mailer_autoconfirm=true），否则 signUp 不返回 session；
//   ③ 迁移需已应用：cd backend && npm run db:migrate（需 DIRECT_DATABASE_URL）。
// 运行：cd backend && npx vitest run test/integration.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { makeApp } from '../src/app';

const hasEnv = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.DATABASE_URL);
const describeIf = hasEnv() ? describe : describe.skip;

describeIf('integration e2e', () => {
  let supabase: SupabaseClient;
  let app: ReturnType<typeof makeApp>;
  let token = '';
  let userId = '';
  let env: Parameters<typeof makeApp>[0];

  beforeAll(async () => {
    env = {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL!,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
      DATABASE_URL: process.env.DATABASE_URL!,
      QUIET_HOURS_START: '23:30',
      QUIET_HOURS_END: '08:30',
      MAX_NUDGE_BUDGET: '3',
    } as never;
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const email = `test-${Date.now().toString(36)}@jnify.dev`;
    const password = 'password-123456';
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.session) throw new Error(`signup failed: ${error?.message ?? 'no session'}; 需在 Auth settings 关闭 Confirm email`);
    token = data.session.access_token;
    userId = data.user!.id;
    app = makeApp(env);
  });

  const call = (path: string, init: RequestInit = {}) =>
    app.request(
      path,
      {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
      },
      env as never, // Hono app.request 第三参注入 Bindings 环境（否则 c.env 为 undefined → 401）
    );

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
    const fresh = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: 'require' });
    const rows = await fresh`select value from user_preferences where "key" = 'max_nudge_budget' and scene = 'guardrails' and user_id = ${userId}`;
    await fresh.end();
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('5');
    const g = await call('/v1/guardrails');
    expect(((await g.json()) as { max_nudge_budget: number }).max_nudge_budget).toBe(5);
  });

  it('signals accepted and me/data deletes everything', { timeout: 90_000 }, async () => {
    const s = await call('/v1/signals', { method: 'POST', body: JSON.stringify({ signal_type: 'usage', payload: { free_slot: true } }) });
    expect(s.status).toBe(200);
    const d = await call('/v1/me/data', { method: 'DELETE' });
    expect(d.status).toBe(200);
    const list = await call('/v1/items');
    expect((await list.json()) as unknown[]).toEqual([]);
  });

  it('single item fully deferred: same item served but nudge suppressed', { timeout: 90_000 }, async () => {
    // 静默时段 start===end ⇒ 永不静默：保证首轮 now 必然 nudge（否则在 23:30-08:30 UTC 跑会假失败）
    await call('/v1/guardrails', { method: 'PUT', body: JSON.stringify({ quiet_hours_start: '00:00', quiet_hours_end: '00:00', max_nudge_budget: 3 }) });
    const cap = await call('/v1/items/capture', {
      method: 'POST',
      body: JSON.stringify({ raw_text: '整理月报', category: 'work' }),
    });
    expect(cap.status).toBe(200);
    const itemId = ((await cap.json()) as { item: { id: string } }).item.id;

    const countNudges = async (id: string): Promise<number> => {
      const fresh = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: 'require' });
      try {
        const rows = await fresh`
          select count(*)::int as n
          from nudges n
          join item_commitments i on i.id = n.item_id
          where n.item_id = ${id} and i.user_id = ${userId}
        `;
        return Number(rows[0].n);
      } finally {
        await fresh.end();
      }
    };

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
});
