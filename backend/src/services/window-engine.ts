export interface WindowResult {
  reasonCode: string;
  reasonText: string;
  fitScore: number;
  windowStart: Date;
  windowEnd: Date;
}

export interface ItemLike {
  id: string;
  category: string;
  dueAt: Date | null;
}

const WINDOW_HOURS = 8;
const DAYS_MS = 24 * 3600_000;

export function computeWindow(
  item: ItemLike,
  opts: { contextFeatures?: Record<string, unknown>; now?: Date } = {},
): WindowResult {
  const now = opts.now ?? new Date();
  const ctx = opts.contextFeatures ?? {};
  const start = now;
  const end = new Date(now.getTime() + WINDOW_HOURS * 3600_000);

  if (item.dueAt && item.dueAt.getTime() <= now.getTime() + 10 * DAYS_MS) {
    const days = Math.max(1, Math.ceil((item.dueAt.getTime() - now.getTime()) / DAYS_MS));
    return { reasonCode: 'due_soon', reasonText: `还有 ${days} 天到期，现在是顺手处理的好时机。`, fitScore: 0.85, windowStart: start, windowEnd: end };
  }
  if (item.category === 'chore' && ctx.sunny === true) {
    return { reasonCode: 'weather', reasonText: '这两天天气合适，正是顺手处理的好时候。', fitScore: 0.8, windowStart: start, windowEnd: end };
  }
  if (item.category === 'social') {
    return { reasonCode: 'usage_state', reasonText: '这会儿您比较放松，适合花一分钟收个尾。', fitScore: 0.75, windowStart: start, windowEnd: end };
  }
  return { reasonCode: 'manual_window', reasonText: '我把这件事放在了「最顺手」的位置，您随时可以处理。', fitScore: 0.5, windowStart: start, windowEnd: end };
}