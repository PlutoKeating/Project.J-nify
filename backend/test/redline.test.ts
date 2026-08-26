// SPEC §9.4 频控红线：单事项默认最多 3 次主动提醒。
// buildNudge 是 DB-bound 的，无法在无库的单测里直接调用其 gate 路径，
// 因此这里用两层断言钉住接线：(a) 纯函数 shouldNudge 的预算门；
// (b) orchestrator/now 路由确实把真实 nudgeCount 传进门（代码审阅的机器替身）。
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

  it('buildNudge policy 形状携带 nudgeCount 且不再硬编码 null', () => {
    expect(buildNudge.length).toBe(6); // (db, item, policy, guardrails, windowId, result, now=…)
    const src = read('src/services/orchestrator.ts');
    expect(src).toContain('nudgeCount: number');
    expect(src).not.toContain('nudgeCount: null'); // 回归根因：null ?? 0 会让预算门永不触发
    expect(src).toMatch(/shouldNudge\(policy, guardrails, now\)/); // 完整 policy 直传 gate
  });

  it('buildNudge 保留 SQL 侧 nudge_count 自增（sql 来自 drizzle-orm）', () => {
    const src = read('src/services/orchestrator.ts');
    expect(src).toMatch(/from 'drizzle-orm'/);
    expect(src).toMatch(/sql<number>/);
    expect(src).toContain('nudgeCount} + 1');
  });

  it('now 路由把事务内最新 policyRow.nudgeCount 传给 buildNudge', () => {
    const src = read('src/routes/now.ts');
    expect(src).toContain('const [policyRow] = await tx');
    expect(src).toContain('nudgeCount: policyRow.nudgeCount');
  });
});