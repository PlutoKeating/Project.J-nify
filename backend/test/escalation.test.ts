import { describe, expect, it } from 'vitest';
import { inQuietHours, localHourMinute, shouldNudge } from '../src/services/escalation';

const G = { quietHoursStart: '23:30', quietHoursEnd: '08:30', maxNudgeBudget: 3 };

describe('localHourMinute', () => {
  it('converts UTC instant to user timezone', () => {
    expect(localHourMinute(new Date('2026-08-27T02:00:00Z'), 'Asia/Shanghai')).toEqual({ h: 10, m: 0 });
  });
  it('falls back to UTC on invalid timezone', () => {
    expect(localHourMinute(new Date('2026-08-27T02:00:00Z'), 'Bad/Zone')).toEqual({ h: 2, m: 0 });
  });
});

describe('inQuietHours', () => {
  it('applies quiet hours in user local time (B9)', () => {
    // 上海 10:00（UTC 02:00）不在 23:30-08:30 静默内
    expect(inQuietHours('2026-08-27T02:00:00Z', '23:30', '08:30', 'Asia/Shanghai')).toBe(false);
    // 上海 01:00（UTC 前一日 17:00）在静默内
    expect(inQuietHours('2026-08-26T17:00:00Z', '23:30', '08:30', 'Asia/Shanghai')).toBe(true);
  });
  it('UTC default preserves legacy behavior', () => {
    expect(inQuietHours('2026-08-27T02:00:00Z', '23:30', '08:30')).toBe(true);
    expect(inQuietHours('2026-08-27T10:00:00Z', '23:30', '08:30')).toBe(false);
  });
});

describe('shouldNudge (Q1：删除硬上限，仅安静时段)', () => {
  it('allows outside quiet hours regardless of nudge count', () => {
    expect(shouldNudge(G, new Date('2026-08-27T10:00:00Z'), 'UTC')).toEqual({ allowed: true, intensity: 1 });
  });
  it('blocks inside quiet hours', () => {
    expect(shouldNudge(G, new Date('2026-08-27T02:00:00Z'), 'UTC').allowed).toBe(false);
  });
});
