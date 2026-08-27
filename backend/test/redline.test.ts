// SPEC §9.4 频控红线：单事项默认最多 3 次主动提醒。
// buildNudge 走 PostgREST/RPC（DB-bound），无库单测里用两层断言钉住接线：
// (a) 纯函数 shouldNudge 的预算门；(b) orchestrator/now 确实把真实 nudgeCount 传进门
// 且计数自增在 RPC（SQL 侧）完成——代码审阅的机器替身。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldNudge } from '../src/services/escalation';
import { buildNudge } from '../src/services/orchestrator';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const G = { quietHoursStart: '23:30', quietHoursEnd: '08:30', maxNudgeBudget: 3 };
const DAY = new Date('2026-08-27T10:00:00Z'); // 非静默时段

describe('nudge redline (SPEC §9.4 频控红线)', () => {
  it('escalation gate: nudgeCount >= maxNudges → allowed:false', () => {
    expect(shouldNudge({ maxNudges: 3, nudgeCount: 3 }, G, DAY).allowed).toBe(false);
    expect(shouldNudge({ maxNudges: 3, nudgeCount: 4 }, G, DAY).allowed).toBe(false);
    expect(shouldNudge({ maxNudges: 3, nudgeCount: 2 }, G, DAY).allowed).toBe(true);
  });

  it('buildNudge policy 形状携带 nudgeCount，不硬编码 null', () => {
    expect(buildNudge.length).toBe(6); // (db, item, policy, guardrails, windowId, result, now=…)
    const src = read('src/services/orchestrator.ts');
    expect(src).toContain('nudgeCount: number');
    expect(src).not.toContain('nudgeCount: null'); // 回归根因：null ?? 0 会让预算门永不触发
    expect(src).toMatch(/shouldNudge\(policy, guardrails, now\)/); // 完整 policy 直传 gate
  });

  it('nudge 落库 + nudge_count 自增在 RPC（SQL 侧事务）完成', () => {
    const src = read('src/services/orchestrator.ts');
    expect(src).toMatch(/fn_create_nudge/);
    const sql = read('supabase/migrations/20260827000002_rest_rpc.sql');
    expect(sql).toContain('nudge_count = nudge_count + 1');
  });

  it('now 路由把最新 policyRow.nudgeCount 传给 buildNudge（含全 defer 抑制）', () => {
    const src = read('src/routes/now.ts');
    expect(src).toContain('nudgeCount: policyRow.nudge_count');
    expect(src).toContain('if (!deferredIds.has(best.item.id))');
  });
});