import type { Context } from 'hono';
import type { Env } from '../config';

const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function audit(c: Context<{ Bindings: Env }>, event: string, data?: Record<string, unknown>): void {
  const level = (c.env.LOG_LEVEL ?? 'info').toLowerCase();
  const threshold = LEVELS[level] ?? LEVELS.info;
  const msgLevel = event.startsWith('error') ? 'error' : 'info';
  if (LEVELS[msgLevel] < threshold) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}