import type { Db } from '../db';
import { restGet, restInsert } from '../db';

/**
 * system_config 热加载缓存：TTL + admin PUT 显式失效（保存后立即生效）。
 */
const cache = new Map<string, { value: unknown; version: number; fetchedAt: number }>();
const TTL_MS = 15_000;

export async function getConfig(db: Db, key: string, fallback: unknown = {}): Promise<{ value: unknown; version: number }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return { value: hit.value, version: hit.version };
  const rows = await restGet<{ value: unknown; version: number }>(db, 'system_config', {
    select: 'value,version',
    params: { key },
    limit: 1,
  });
  const row = rows[0];
  const value = row?.value ?? fallback;
  const version = row?.version ?? 0;
  cache.set(key, { value, version, fetchedAt: Date.now() });
  return { value, version };
}

export async function putConfig(db: Db, key: string, value: unknown): Promise<{ version: number }> {
  const current = await getConfig(db, key, {});
  const version = (current.version as number) + 1;
  await restInsert(db, 'system_config', { key, value, version }, { onConflict: 'key' });
  cache.set(key, { value, version, fetchedAt: Date.now() });
  return { version };
}

/** admin PUT 后立即让其它请求读到新配置（主动失效，不等 TTL） */
export function invalidateConfig(key: string): void {
  cache.delete(key);
}
