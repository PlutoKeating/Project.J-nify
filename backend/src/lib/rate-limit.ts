// 进程内滑动窗口。单 isolate 近似计数；多 isolate/生产应换 CF Rate Limiting。
const buckets = new Map<string, number[]>();

export function slidingWindow(key: string, limit: number, windowMs: number): () => boolean {
  return () => {
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      buckets.set(key, hits);
      return false;
    }
    hits.push(now);
    buckets.set(key, hits);
    return true;
  };
}