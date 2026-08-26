import { describe, expect, it } from 'vitest';
import { decisionMessage, nextState } from '../src/services/decision-feedback';

describe('nextState', () => {
  it('now closes as done', () => {
    expect(nextState('now')).toEqual({ status: 'done', closedAt: true, touchUpdatedAt: false });
  });
  it('drop closes as abandoned', () => {
    expect(nextState('drop')).toEqual({ status: 'abandoned', closedAt: true, touchUpdatedAt: false });
  });
  it('later defers then returns to parked with touch', () => {
    expect(nextState('later')).toEqual({ status: 'deferred', closedAt: false, touchUpdatedAt: true });
  });
  it('rescue stays open', () => {
    const s = nextState('rescue');
    expect(s.status).toBe('rescued');
    expect(s.closedAt).toBe(false);
  });
  it('unknown decision keeps status', () => {
    expect(nextState('bogus').status).toBe('bogus');
  });
  it('unknown decision keeps current status when provided', () => {
    expect(nextState('bogus', 'parked').status).toBe('parked');
  });
});

describe('decisionMessage', () => {
  it('has warm copy for all four decisions', () => {
    for (const d of ['now', 'later', 'drop', 'rescue']) {
      expect(decisionMessage(d).length).toBeGreaterThan(4);
    }
  });
});
