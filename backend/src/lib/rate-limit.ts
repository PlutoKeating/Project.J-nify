// 进程内滑动窗口。单 isolate 近似计数；多 isolate/生产应换 CF Rate Limiting。
const buckets = new Map<string, number[]>();

export function slidingWindow(key: string, limit: number, windowMs: number): () => boolean {
  return () => {
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      // 桶淘汰：窗口内已无有效命中且被拒 → 直接删除 key，避免空桶无限累积
      if (hits.length === 0) buckets.delete(key);
      else buckets.set(key, hits);
      return false;
    }
    hits.push(now);
    buckets.set(key, hits);
    return true;
  };
}
