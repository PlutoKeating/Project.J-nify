import { describe, expect, it } from 'vitest';
import { makeDb, restGet, restInsert, restUpdate, restDelete, restRpc, robustGuardrails, latestContext } from '../src/db';

describe('REST db layer shape', () => {
  it('makeDb requires SUPABASE_URL + SERVICE_KEY and normalizes trailing slash', () => {
    expect(() => makeDb('', 'k')).toThrow();
    expect(() => makeDb('https://x.supabase.co', '')).toThrow();
    const db = makeDb('https://x.supabase.co/', 'k');
    expect(db).toEqual({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'k' });
  });

  it('helpers are fetch-based functions with expected arity', () => {
    expect(restGet.length).toBe(2);
    expect(restInsert.length).toBe(3);
    expect(restUpdate.length).toBe(4);
    expect(restDelete.length).toBe(3);
    expect(restRpc.length).toBe(3);
    expect(robustGuardrails.length).toBe(2);
    expect(latestContext.length).toBe(2);
  });
});