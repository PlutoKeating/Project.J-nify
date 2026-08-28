import type { Db } from '../db';
import { restGet, restInsert } from '../db';

export interface RhythmPolicy {
  category: string;
  dueOffsets: { days_before: number; max_nudges: number }[];
  cooldownHours: number;
  agentManaged: boolean;
}

/** Q15 定案的类目默认节奏（agent 可覆盖，覆盖写入 rhythm_policies 用户行） */
export const DEFAULT_RHYTHMS: Record<string, RhythmPolicy> = {
  bill: { category: 'bill', dueOffsets: [{ days_before: 10, max_nudges: 1 }, { days_before: 3, max_nudges: 1 }], cooldownHours: 72, agentManaged: true },
  return: { category: 'return', dueOffsets: [{ days_before: 3, max_nudges: 1 }, { days_before: 5, max_nudges: 1 }, { days_before: 1, max_nudges: 1 }], cooldownHours: 72, agentManaged: true },
  study: { category: 'study', dueOffsets: [{ days_before: 10, max_nudges: 1 }, { days_before: 5, max_nudges: 1 }, { days_before: 3, max_nudges: 1 }], cooldownHours: 72, agentManaged: true },
  social: { category: 'social', dueOffsets: [], cooldownHours: 72, agentManaged: true },
  chore: { category: 'chore', dueOffsets: [], cooldownHours: 72, agentManaged: true },
  life: { category: 'life', dueOffsets: [], cooldownHours: 72, agentManaged: true },
};

function normalize(row: { category: string; due_offsets: unknown; cooldown_hours: number | null; agent_managed: boolean | null }): RhythmPolicy {
  const base = DEFAULT_RHYTHMS[row.category] ?? DEFAULT_RHYTHMS.life;
  const offsets = Array.isArray(row.due_offsets)
    ? (row.due_offsets as { days_before?: number; max_nudges?: number }[])
        .map((o) => ({ days_before: Number(o.days_before ?? 0), max_nudges: Number(o.max_nudges ?? 1) }))
        .filter((o) => Number.isFinite(o.days_before))
    : base.dueOffsets;
  return {
    category: row.category,
    dueOffsets: offsets.length ? offsets : base.dueOffsets,
    cooldownHours: Number.isFinite(Number(row.cooldown_hours)) ? Number(row.cooldown_hours) : base.cooldownHours,
    agentManaged: row.agent_managed ?? true,
  };
}

export async function getRhythm(db: Db, userId: string, category: string): Promise<RhythmPolicy> {
  const rows = await restGet<{ category: string; due_offsets: unknown; cooldown_hours: number | null; agent_managed: boolean | null }>(
    db,
    'rhythm_policies',
    { params: { user_id: userId, category }, limit: 1 },
  );
  return rows[0] ? normalize(rows[0]) : (DEFAULT_RHYTHMS[category] ?? DEFAULT_RHYTHMS.life);
}

export async function setRhythm(
  db: Db,
  userId: string,
  category: string,
  input: { dueOffsets?: { days_before: number; max_nudges: number }[]; cooldownHours?: number },
): Promise<RhythmPolicy> {
  const current = await getRhythm(db, userId, category);
  const dueOffsets = input.dueOffsets ?? current.dueOffsets;
  const cooldownHours = input.cooldownHours ?? current.cooldownHours;
  await restInsert(
    db,
    'rhythm_policies',
    { user_id: userId, category, due_offsets: dueOffsets, cooldown_hours: cooldownHours, agent_managed: true },
    { onConflict: 'user_id,category' },
  );
  return { category, dueOffsets, cooldownHours, agentManaged: true };
}
