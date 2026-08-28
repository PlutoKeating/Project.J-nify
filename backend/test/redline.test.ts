// Q1 定案后的打扰红线：无硬编码次数上限；仅安静时段（按用户时区）+ 窗口级去重。
// 频率管理（冷却/节奏）交由 Jennifer agent（rhythm_policies / DEFAULT_RHYTHMS）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldNudge } from '../src/services/escalation';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const G = { quietHoursStart: '23:30', quietHoursEnd: '08:30', maxNudgeBudget: 3 };

describe('nudge redline (Q1 定案)', () => {
  it('shouldNudge 不再受预算门控，仅安静时段门（now/tz 为可选参数）', () => {
    expect(shouldNudge(G, new Date('2026-08-27T10:00:00Z'), 'UTC').allowed).toBe(true);
    expect(shouldNudge.length).toBe(1); // 仅 guardrails 为必选参数
  });

  it('orchestrator 不再接收 policy 预算', () => {
    const src = read('src/services/orchestrator.ts');
    expect(src).not.toContain('policy.nudgeCount');
    expect(src).not.toContain('shouldNudge(policy');
  });

  it('窗口级去重（B11）：同 window 已有 nudge 则复用不新建', () => {
    const src = read('src/services/orchestrator.ts');
    expect(src).toMatch(/window_id: windowId/);
    expect(src).toMatch(/existing\[0\]/);
  });

  it('安静时段按用户时区计算（B9）', () => {
    const src = read('src/services/escalation.ts');
    expect(src).toContain('Intl.DateTimeFormat');
  });

  it('nudge 落库与计数自增仍在 RPC 事务中（记录用，不再作为硬门）', () => {
    const sql = read('supabase/migrations/20260827000002_rest_rpc.sql');
    expect(sql).toContain('nudge_count = nudge_count + 1');
  });
});
