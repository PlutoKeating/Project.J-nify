import { describe, expect, it } from 'vitest';
import { draft } from '../src/services/brain';

const window = { reasonCode: 'manual_window', reasonText: '我把这件事放在了最顺手的位置。', fitScore: 0.5, windowStart: new Date(), windowEnd: new Date() };

describe('draft', () => {
  it('always degrades to template', () => {
    const d = draft({ title: '晒被子', category: 'chore' }, window);
    expect(d.degraded).toBe(true);
    expect(d.body).toBe(window.reasonText);
  });

  it('base options are now/later/drop', () => {
    const d = draft({ title: '回小明', category: 'social' }, null);
    expect(d.options.map((o) => o.code)).toEqual(['now', 'later', 'drop']);
  });

  it('adds rescue for chore and return', () => {
    for (const category of ['chore', 'return']) {
      const d = draft({ title: 'x', category }, window);
      expect(d.options.map((o) => o.code)).toContain('rescue');
    }
  });

  it('falls back title when missing', () => {
    const d = draft({ title: '', category: 'life' }, null);
    expect(d.title).toBe('有一件事');
  });
});
