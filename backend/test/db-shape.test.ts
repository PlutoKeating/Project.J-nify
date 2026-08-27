import { describe, expect, it } from 'vitest';
import { createDb, robustGuardrails, latestContext } from '../src/db';
import { ingestSignal } from '../src/services/context';
import { buildNudge } from '../src/services/orchestrator';

describe('db module shape', () => {
  it('createDb requires DATABASE_URL', async () => {
    await expect(createDb('')).rejects.toThrow('DATABASE_URL is required');
  });
  it('exports services with expected arity', () => {
    expect(robustGuardrails.length).toBe(2);
    expect(latestContext.length).toBe(2);
    expect(ingestSignal.length).toBe(3);
    expect(buildNudge.length).toBe(6);
  });
});
