import { describe, expect, it } from 'vitest';
import { inQuietHours, shouldNudge } from '../src/services/escalation';

const G = { quietHoursStart: '23:30', quietHoursEnd: '08:30', maxNudgeBudget: 3 };
const P = { maxNudges: 3, nudgeCount: 0 };

describe('inQuietHours', () => {
  it('blocks inside quiet hours', () => {
    expect(inQuietHours('2026-08-27T02:00:00Z', '23:30', '08:30')).toBe(true);
    expect(inQuietHours('2026-08-27T23:45:00Z', '23:30', '08:30')).toBe(true);
  });
  it('allows outside quiet hours', () => {
    expect(inQuietHours('2026-08-27T10:00:00Z', '23:30', '08:30')).toBe(false);
  });
});

describe('shouldNudge', () => {
  it('allows within budget and outside quiet hours', () => {
    expect(shouldNudge(P, G, new Date('2026-08-27T10:00:00Z'))).toEqual({ allowed: true, intensity: 1 });
  });
  it('blocks when budget exhausted', () => {
    expect(shouldNudge({ maxNudges: 3, nudgeCount: 3 }, G, new Date('2026-08-27T10:00:00Z')).allowed).toBe(false);
  });
  it('blocks inside quiet hours', () => {
    expect(shouldNudge(P, G, new Date('2026-08-27T02:00:00Z')).allowed).toBe(false);
  });
  it('intensity grows with nudges, capped at 3', () => {
    expect(shouldNudge({ maxNudges: 3, nudgeCount: 2 }, G, new Date('2026-08-27T10:00:00Z')).intensity).toBe(3);
  });
});
