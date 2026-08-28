import type { Db } from '../db';
import { restGet, restInsert, restRpc } from '../db';
import { computeWindow, type WindowResult, type RhythmLike } from './window-engine';
import { shouldNudge, type GuardrailsLike } from './escalation';
import { draft } from './brain';

export interface ItemRowLike {
  id: string;
  title: string;
  category: string;
  dueAt: Date | null;
}

interface WindowRow {
  id: string;
  window_start: string;
  window_end: string;
  fit_score: number | null;
  reason_code: string;
  reason_text: string;
  created_at: string;
}

// 若既有 window 未过期则复用（不重复 Nudge）；否则新建并落库。
export async function freshOrReuseWindow(
  db: Db,
  item: ItemRowLike,
  opts: { contextFeatures?: Record<string, unknown>; now?: Date; rhythm?: RhythmLike } = {},
): Promise<{ windowId: string; result: WindowResult }> {
  const now = opts.now ?? new Date();
  const existing = await restGet<WindowRow>(db, 'opportunity_windows', {
    select: 'id,window_start,window_end,fit_score,reason_code,reason_text,created_at',
    params: { item_id: item.id },
    order: 'created_at.desc',
    limit: 1,
  });
  if (existing[0] && new Date(existing[0].window_end).getTime() > now.getTime()) {
    return {
      windowId: existing[0].id,
      result: {
        reasonCode: existing[0].reason_code,
        reasonText: existing[0].reason_text,
        fitScore: Number(existing[0].fit_score ?? 0),
        windowStart: new Date(existing[0].window_start),
        windowEnd: new Date(existing[0].window_end),
      },
    };
  }
  const result = computeWindow(item, { contextFeatures: opts.contextFeatures, now, rhythm: opts.rhythm });
  const [row] = await restInsert<{ id: string }>(db, 'opportunity_windows', {
    item_id: item.id,
    window_start: result.windowStart.toISOString(),
    window_end: result.windowEnd.toISOString(),
    fit_score: result.fitScore,
    reason_code: result.reasonCode,
    reason_text: result.reasonText,
    status: 'served',
  });
  return { windowId: row.id, result };
}

// 窗口级去重 + 安静时段硬护栏；nudge 落库与 nudge_count+1 自增由 RPC 事务完成。
export async function buildNudge(
  db: Db,
  item: ItemRowLike,
  guardrails: GuardrailsLike,
  windowId: string,
  result: WindowResult,
  now: Date = new Date(),
  tz = 'UTC',
): Promise<string | null> {
  if (!shouldNudge(guardrails, now, tz).allowed) return null;
  if (!result.reasonText) return null; // 没有理由不通知
  const existing = await restGet<{ id: string }>(db, 'nudges', {
    select: 'id',
    params: { window_id: windowId },
    limit: 1,
  });
  if (existing[0]) return existing[0].id; // 同一窗口只 nudge 一次（B11）
  const { title, body, options } = draft(item, result);
  const out = await restRpc<{ nudgeId: string }>(db, 'fn_create_nudge', {
    p_item_id: item.id,
    p_window_id: windowId,
    p_intensity: shouldNudge(guardrails, now, tz).intensity,
    p_channel: 'push',
    p_title: title,
    p_body: body,
    p_options: options,
  });
  return out.nudgeId ?? null;
}
