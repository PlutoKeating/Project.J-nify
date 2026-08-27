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

// Hyperdrive 本地端点偶发 CONNECT_TIMEOUT/CONNECTION_CLOSED（业界已知瞬时行为）：
// 用全新客户端重试 2 次探活连接，成功后缓存；失败抛出最后一个带字段的真实错误。
const RETRYABLE_CONNECT_CODES = new Set(['CONNECT_TIMEOUT', 'CONNECTION_CLOSED', 'CONNECTION_DESTROYED', 'ECONNRESET']);

export async function createDb(databaseUrl: string): Promise<Db> {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const hit = cache.get(databaseUrl);
  if (hit) return hit;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    // pooler 事务模式不支持 prepared statements，必须 prepare:false
    // ssl：生产经 Hyperdrive（CF 侧管 TLS）；残留直连路径也能走 TLS。
    const client = postgres(databaseUrl, { prepare: false, ssl: 'require', connect_timeout: 30_000 });
    try {
      await client`select 1`;
      const db = drizzle(client, { schema });
      cache.set(databaseUrl, db);
      return db;
    } catch (e) {
      await client.end().catch(() => undefined);
      lastErr = e;
      const code = (e as { code?: string } | undefined)?.code;
      if (code && RETRYABLE_CONNECT_CODES.has(code)) continue; // 瞬时连接失败 → 新客户端重试
      throw e; // 非连接类错误直接抛出（保留字段供 DEBUG 定位）
    }
  }
  throw lastErr;
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
