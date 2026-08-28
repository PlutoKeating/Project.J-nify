import { describe, expect, it } from 'vitest';
import { computeWindow } from '../src/services/window-engine';

const NOW = new Date('2026-08-27T04:00:00Z');

function item(over: Partial<{ category: string; dueAt: Date | null }> = {}) {
  return { id: 'i1', category: 'life', dueAt: null, ...over };
}

describe('computeWindow', () => {
  it('due_soon when due within 10 days', () => {
    const w = computeWindow(item({ dueAt: new Date('2026-09-01T00:00:00Z') }), { now: NOW });
    expect(w.reasonCode).toBe('due_soon');
    expect(w.fitScore).toBe(0.85);
  });

  it('weather when chore and sunny context', () => {
    const w = computeWindow(item({ category: 'chore' }), { now: NOW, contextFeatures: { sunny: true } });
    expect(w.reasonCode).toBe('weather');
    expect(w.fitScore).toBe(0.8);
  });

  it('usage_state for social', () => {
    const w = computeWindow(item({ category: 'social' }), { now: NOW });
    expect(w.reasonCode).toBe('usage_state');
  });

  it('manual_window default', () => {
    const w = computeWindow(item(), { now: NOW });
    expect(w.reasonCode).toBe('manual_window');
    expect(w.fitScore).toBe(0.5);
  });

  it('overdue returns honest copy (B10)', () => {
    const w = computeWindow(item({ dueAt: new Date('2026-08-20T00:00:00Z') }), { now: NOW });
    expect(w.reasonCode).toBe('overdue');
    expect(w.reasonText).toContain('已到期');
  });

  it('due_soon respects rhythm offsets (B6)', () => {
    const rhythm = { dueOffsets: [{ days_before: 3, max_nudges: 1 }] };
    const w1 = computeWindow(item({ category: 'bill', dueAt: new Date('2026-08-30T00:00:00Z') }), { now: NOW, rhythm });
    expect(w1.reasonCode).toBe('due_soon'); // 距死线恰好 3 天
    const w2 = computeWindow(item({ category: 'bill', dueAt: new Date('2026-09-01T00:00:00Z') }), { now: NOW, rhythm });
    expect(w2.reasonCode).toBe('manual_window'); // 5 天不在节奏表
  });

  it('windows span 8h from now', () => {
    const w = computeWindow(item(), { now: NOW });
    expect(w.windowStart.toISOString()).toBe(NOW.toISOString());
    expect(w.windowEnd.getTime() - w.windowStart.getTime()).toBe(8 * 3600_000);
  });
});
