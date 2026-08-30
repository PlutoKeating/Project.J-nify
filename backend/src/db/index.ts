// DB 访问层：Supabase REST (PostgREST) over 标准 HTTPS。
// 背景（2026-08-27 实测）：Workers 直连 TCP(postgres.js)→Supavisor 的私有根 CA 不被 workerd 信任
// （ca 注入无效、Hyperdrive 账号未开通），而标准 HTTPS fetch 完全可用 →
// 数据访问全部走 PostgREST；需要原子性的写操作经 RPC（supabase/migrations/20260827000002_rest_rpc.sql）。
import { DEFAULTS } from '../config';
import type { GuardrailsLike } from '../services/escalation';

export type Db = { supabaseUrl: string; serviceKey: string };

export function makeDb(supabaseUrl: string, serviceKey: string): Db {
  if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are required');
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), serviceKey };
}

type Json = Record<string, unknown>;

function rest(db: Db, path: string, init: RequestInit = {}): Promise<Response> {
  const { supabaseUrl, serviceKey } = db;
  return fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

function qs(params: Record<string, string>): string {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
}

/** 过滤规约：{ column: value } → PostgREST `?column=eq.value`；`order`/`limit` 直通。 */
function filters(params: Json): Record<string, string> {
  // PostgREST：操作符在值侧（key=eq.v / key=in.(a,b) / key=gt.v）。
  // 实测该列隐式 eq 对 uuid 会 400（PGRST100），故无操作符前缀的值一律显式 eq.。
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const val = String(v);
    q[k] = /^(eq|neq|gt|gte|lt|lte|is|in|like|ilike|cs|cd|not)\.[(]?/.test(val) ? val : `eq.${val}`;
  }
  return q;
}

export async function restGet<T = Json>(
  db: Db,
  table: string,
  opts: { select?: string; params?: Json; order?: string; limit?: number } = {},
): Promise<T[]> {
  const query: Record<string, string> = {};
  if (opts.select) query.select = opts.select;
  if (opts.order) query.order = opts.order;
  if (opts.limit !== undefined) query.limit = String(opts.limit);
  const q = filters(opts.params ?? {});
  const r = await rest(db, `/${table}${qs({ select: opts.select ?? '*', ...q } as Record<string, string>)}`);
  if (!r.ok) throw new Error(`GET ${table} ${r.status}: ${await r.text()}`);
  return (await r.json()) as T[];
}

export async function restInsert<T = Json>(
  db: Db,
  table: string,
  rows: Json | Json[],
  opts: { onConflict?: string } = {},
): Promise<T[]> {
  const arr = Array.isArray(rows) ? rows : [rows];
  const headers: Record<string, string> = { Prefer: 'return=representation' };
  const query: Record<string, string> = {};
  if (opts.onConflict) {
    headers.Prefer = `resolution=merge-duplicates,return=representation`;
    query.on_conflict = opts.onConflict;
  }
  const r = await rest(db, `/${table}${qs(query)}`, { method: 'POST', headers, body: JSON.stringify(arr) });
  if (!r.ok) throw new Error(`INSERT ${table} ${r.status}: ${await r.text()}`);
  return (await r.json()) as T[];
}

export async function restUpdate<T = Json>(db: Db, table: string, params: Json, patch: Json): Promise<T[]> {
  const r = await rest(db, `/${table}${qs(filters(params))}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
  if (!r.ok) throw new Error(`UPDATE ${table} ${r.status}: ${await r.text()}`);
  return (await r.json()) as T[];
}

export async function restDelete(db: Db, table: string, params: Json): Promise<void> {
  const r = await rest(db, `/${table}${qs(filters(params))}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`DELETE ${table} ${r.status}: ${await r.text()}`);
}

export async function restRpc<T = Json>(db: Db, fn: string, args: Json): Promise<T> {
  const r = await rest(db, `/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`RPC ${fn} ${r.status}: ${await r.text()}`);
  if (r.status === 204) return {} as T;
  return (await r.json()) as T;
}

// ---- 既有业务 helper（保持签名，路由/服务无需感知底层迁移） ----

export async function robustGuardrails(db: Db, userId: string): Promise<GuardrailsLike> {
  const rows = await restGet<{ key: string; value: string }>(db, 'user_preferences', {
    select: 'key,value', params: { user_id: userId, scene: 'guardrails' },
  });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    quietHoursStart: m.get('quiet_hours_start') ?? DEFAULTS.QUIET_HOURS_START,
    quietHoursEnd: m.get('quiet_hours_end') ?? DEFAULTS.QUIET_HOURS_END,
    maxNudgeBudget: Number(m.get('max_nudge_budget') ?? DEFAULTS.MAX_NUDGE_BUDGET),
  };
}

export async function robustPrivacyScope(db: Db, userId: string): Promise<Record<string, boolean>> {
  const rows = await restGet<{ key: string; value: string }>(db, 'user_preferences', {
    select: 'key,value', params: { user_id: userId, scene: 'guardrails' },
  });
  const row = rows.find((r) => r.key === 'privacy_scope');
  const fallback = { calendar: true, weather: true, coarse_location: true };
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

export async function latestContext(db: Db, userId: string): Promise<Record<string, unknown> | null> {
  const rows = await restGet<{ context_features: Record<string, unknown> }>(db, 'context_snapshots', {
    select: 'context_features', params: { user_id: userId }, order: 'computed_at.desc', limit: 1,
  });
  return rows[0]?.context_features ?? null;
}

export async function getTimezone(db: Db, userId: string): Promise<string> {
  const rows = await restGet<{ timezone: string | null }>(db, 'users', {
    select: 'timezone',
    params: { id: userId },
    limit: 1,
  });
  return rows[0]?.timezone || 'UTC';
}

/** 彻底注销：调用 Supabase Auth admin API 删除 auth 账户（service key）。 */
export async function adminDeleteAuthUser(db: Db, userId: string): Promise<boolean> {
  const r = await fetch(`${db.supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: db.serviceKey, Authorization: `Bearer ${db.serviceKey}` },
  });
  return r.ok || r.status === 404;
}
