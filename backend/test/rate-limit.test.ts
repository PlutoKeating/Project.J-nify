import { describe, expect, it } from 'vitest';
import { slidingWindow } from '../src/lib/rate-limit';

describe('slidingWindow', () => {
  it('allows up to limit then blocks', () => {
    const limit = slidingWindow('u1:/v1/items', 2, 60_000);
    expect(limit()).toBe(true);
    expect(limit()).toBe(true);
    expect(limit()).toBe(false);
  });

  it('independent per key', () => {
    const a = slidingWindow('a', 1, 60_000);
    const b = slidingWindow('b', 1, 60_000);
    a();
    expect(a()).toBe(false);
    expect(b()).toBe(true);
  });
});