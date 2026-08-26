import { describe, expect, it } from 'vitest';
import { DEFAULTS, num } from '../src/config';

describe('config defaults', () => {
  it('falls back to defaults when env keys are missing', () => {
    expect(num({}, 'MAX_NUDGE_BUDGET')).toBe(DEFAULTS.MAX_NUDGE_BUDGET);
    expect(num({}, 'RATE_LIMIT_PER_MINUTE')).toBe(DEFAULTS.RATE_LIMIT_PER_MINUTE);
  });

  it('parses numeric env strings', () => {
    expect(num({ MAX_NUDGE_BUDGET: '5' }, 'MAX_NUDGE_BUDGET')).toBe(5);
  });

  it('ignores invalid numbers', () => {
    expect(num({ MAX_NUDGE_BUDGET: 'abc' }, 'MAX_NUDGE_BUDGET')).toBe(DEFAULTS.MAX_NUDGE_BUDGET);
  });
});