export interface GuardrailsLike {
  quietHoursStart: string;
  quietHoursEnd: string;
  maxNudgeBudget: number;
}

/** 按用户时区取本地小时/分钟（非法时区回退 UTC）。 */
export function localHourMinute(time: string | Date, tz: string): { h: number; m: number } {
  const d = typeof time === 'string' ? new Date(time) : time;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return { h, m };
  } catch {
    return { h: d.getUTCHours(), m: d.getUTCMinutes() };
  }
}

export function inQuietHours(time: string | Date, start: string, end: string, tz = 'UTC'): boolean {
  const { h, m } = localHourMinute(time, tz);
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const minute = h * 60 + m;
  const s = toMin(start);
  const e = toMin(end);
  if (s <= e) return minute >= s && minute < e;
  return minute >= s || minute < e;
}

/**
 * Q1 定案：删除硬编码提醒次数上限。仅保留安静时段作为硬护栏；
 * 频率管理（冷却/节奏）交由 Jennifer agent（见 rhythm.ts）。
 */
export function shouldNudge(
  guardrails: GuardrailsLike,
  now: Date = new Date(),
  tz = 'UTC',
): { allowed: boolean; intensity: number } {
  if (inQuietHours(now, guardrails.quietHoursStart, guardrails.quietHoursEnd, tz)) {
    return { allowed: false, intensity: 0 };
  }
  return { allowed: true, intensity: 1 };
}
