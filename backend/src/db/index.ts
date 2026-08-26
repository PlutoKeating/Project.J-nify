import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { DEFAULTS } from '../config';
import type { GuardrailsLike } from '../services/escalation';

export const dbSchema = schema;
export type Db = PostgresJsDatabase<typeof schema>;

const cache = new Map<string, Db>();

export function createDb(databaseUrl: string): Db {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const hit = cache.get(databaseUrl);
  if (hit) return hit;
  // pooler 事务模式不支持 prepared statements，必须 prepare:false
  const client = postgres(databaseUrl, { prepare: false, ssl: 'require' });
  const db = drizzle(client, { schema });
  cache.set(databaseUrl, db);
  return db;
}

export async function robustGuardrails(db: Db, userId: string): Promise<GuardrailsLike> {
  const rows = await db
    .select()
    .from(schema.userPreferences)
    .where(and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.scene, 'guardrails')));
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    quietHoursStart: m.get('quiet_hours_start') ?? DEFAULTS.QUIET_HOURS_START,
    quietHoursEnd: m.get('quiet_hours_end') ?? DEFAULTS.QUIET_HOURS_END,
    maxNudgeBudget: Number(m.get('max_nudge_budget') ?? DEFAULTS.MAX_NUDGE_BUDGET),
  };
}

export async function robustPrivacyScope(db: Db, userId: string): Promise<Record<string, boolean>> {
  const rows = await db
    .select()
    .from(schema.userPreferences)
    .where(and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.scene, 'guardrails')));
  const row = rows.find((r) => r.key === 'privacy_scope');
  if (!row) return { calendar: true, weather: true, coarse_location: true };
  const parsed = JSON.parse(row.value) as Record<string, boolean>;
  return { calendar: true, weather: true, coarse_location: true, ...parsed };
}

export async function latestContext(db: Db, userId: string): Promise<Record<string, unknown> | null> {
  const row = await db
    .select()
    .from(schema.contextSnapshots)
    .where(eq(schema.contextSnapshots.userId, userId))
    .orderBy(desc(schema.contextSnapshots.computedAt))
    .limit(1);
  return row[0]?.contextFeatures ?? null;
}
