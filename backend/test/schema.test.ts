import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';

describe('drizzle schema aligns with SUPABASE_ER', () => {
  it('exposes all 16 tables', () => {
    const names = Object.keys(schema).sort();
    expect(names).toEqual(
      [
        'contextSnapshotSignals', 'contextSnapshots', 'decisions', 'escalationPolicies',
        'feedback', 'integrationSources', 'itemCommitments', 'itemSteps',
        'memoryNotes', 'messageTemplates', 'nudgeOptions', 'nudges',
        'opportunityWindows', 'signalEvents', 'userPreferences', 'users',
      ].sort(),
    );
  });

  it('users references auth.users via uuid pk', () => {
    const u = schema.users;
    expect(u.id.getSQLType()).toBe('uuid');
    expect(u.id.primary).toBe(true);
  });

  it('item_commitments carries SPEC fields', () => {
    const cols = Object.keys(schema.itemCommitments);
    for (const c of ['title', 'rawText', 'category', 'status', 'dueAt', 'importance', 'urgency', 'abandonCost', 'estMinutes', 'closedAt']) {
      expect(cols).toContain(c);
    }
  });
});