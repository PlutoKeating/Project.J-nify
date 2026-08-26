export interface GuardrailsLike {
  quietHoursStart: string;
  quietHoursEnd: string;
  maxNudgeBudget: number;
}

export interface PolicyLike {
  maxNudges: number | null;
  nudgeCount: number | null;
}

export function inQuietHours(time: string | Date, start: string, end: string): boolean {
  const d = typeof time === 'string' ? new Date(time) : time;
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  const s = toMin(start);
  const e = toMin(end);
  if (s <= e) return minute >= s && minute < e;
  return minute >= s || minute < e;
}

export function shouldNudge(
  policy: PolicyLike,
  guardrails: GuardrailsLike,
  now: Date = new Date(),
): { allowed: boolean; intensity: number } {
  const budget = policy.maxNudges ?? guardrails.maxNudgeBudget;
  if ((policy.nudgeCount ?? 0) >= budget) return { allowed: false, intensity: 0 };
  if (inQuietHours(now, guardrails.quietHoursStart, guardrails.quietHoursEnd)) {
    return { allowed: false, intensity: 0 };
  }
  return { allowed: true, intensity: Math.min(3, (policy.nudgeCount ?? 0) + 1) };
}
