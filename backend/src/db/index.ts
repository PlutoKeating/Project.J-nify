import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { SUPABASE_POOLER_CA } from './supabase-pooler-ca';
import { DEFAULTS } from '../config';
import type { GuardrailsLike } from '../services/escalation';

export const dbSchema = schema;
export type Db = PostgresJsDatabase<typeof schema>;

const cache = new Map<string, Db>();

export async function createDb(databaseUrl: string): Promise<Db> {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const hit = cache.get(databaseUrl);
  if (hit) return hit;
  // pooler 事务模式不支持 prepared statements，必须 prepare:false
  // Supavisor 证书链根为 Supabase 私有 CA（不在 workerd 内置库），显式注入 ca 建立信任；
  // Hyperdrive 因账号未开通而不可达（CONNECT_TIMEOUT），故走直连 + ca（2026-08-27 实测）。
  const client = postgres(databaseUrl, { prepare: false, ssl: { ca: SUPABASE_POOLER_CA }, connect_timeout: 30_000 });
  await client`select 1`; // 探活：连接失败即时抛出（带字段），失败不缓存
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

const DEFAULT_SCOPE = { calendar: true, weather: true, coarse_location: true } as const;

export async function robustPrivacyScope(db: Db, userId: string): Promise<Record<string, boolean>> {
  const rows = await db
    .select()
    .from(schema.userPreferences)
    .where(and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.scene, 'guardrails')));
  const row = rows.find((r) => r.key === 'privacy_scope');
  if (!row) return { ...DEFAULT_SCOPE };
  try {
    // 解析失败回落默认 scope（不 500）
    const parsed = JSON.parse(row.value) as Record<string, boolean>;
    return { ...DEFAULT_SCOPE, ...parsed };
  } catch {
    return { ...DEFAULT_SCOPE };
  }
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
