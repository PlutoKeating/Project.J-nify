// 需要整体成功或整体失败的写操作（原来是 Postgres 函数，见 backend/supabase/migrations/20260827000002 与 0003），在这里用一个事务实现，语义不变。
import crypto from "node:crypto";
import { BadRequest, normalizeTs, type Db } from "./db.ts";

type Args = Record<string, unknown>;
const str = (a: Args, k: string, required = true) => {
  const v = a[k];
  if (v === undefined || v === null) { if (required) throw new BadRequest(`缺参数 ${k}`); return null; }
  if (typeof v !== "string") throw new BadRequest(`参数 ${k} 要是字符串`);
  return v;
};
const STATUS: Record<string, string> = { now: "done", drop: "abandoned", later: "parked", rescue: "rescued" };

/** 决策闭环：写决定 + 事项状态迁移（later 先 deferred 再 parked，并把 updated_at 推到队尾）+ 一条记忆笔记。 */
function fnDecide(db: Db, a: Args) {
  const item = str(a, "p_item_id")!, user = str(a, "p_user_id")!, decision = str(a, "p_decision")!, reason = str(a, "p_reason", false) ?? "";
  let status = STATUS[decision];
  if (!status) throw new BadRequest(`invalid decision: ${decision}`);
  return db.tx(() => {
    const now = new Date();
    const iso = now.toISOString();
    db.raw.prepare("INSERT INTO decisions (id, user_id, item_id, decision, reason, effect_metrics, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), user, item, decision, reason, JSON.stringify({ decision, reason }), iso);
    if (decision === "later") {
      db.raw.prepare("UPDATE item_commitments SET status = 'parked', updated_at = ? WHERE id = ? AND user_id = ?")
        .run(new Date(now.getTime() + 1).toISOString(), item, user);
      status = "parked";
    } else {
      db.raw.prepare("UPDATE item_commitments SET status = ?, closed_at = ? WHERE id = ? AND user_id = ?")
        .run(status, decision === "now" || decision === "drop" ? iso : null, item, user);
    }
    db.raw.prepare("INSERT INTO memory_notes (id, user_id, item_id, memory_type, content, salience) VALUES (?, ?, ?, 'decision_effect', ?, ?)")
      .run(crypto.randomUUID(), user, item, `decision=${decision}; reason=${reason}`, JSON.stringify(decision === "rescue" ? 0.8 : 0.5));
    return { status };
  });
}

/** 建一条提醒：nudge + 选项 + 该事项的升级策略计数加一（频控红线）。 */
function fnCreateNudge(db: Db, a: Args) {
  const item = str(a, "p_item_id")!, windowId = str(a, "p_window_id", false);
  const options = a.p_options;
  if (!Array.isArray(options)) throw new BadRequest("p_options 要是数组");
  const intensity = Number(a.p_intensity ?? 1);
  return db.tx(() => {
    const id = crypto.randomUUID();
    db.raw.prepare("INSERT INTO nudges (id, item_id, window_id, intensity, channel, title, body, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')")
      .run(id, item, windowId, Number.isFinite(intensity) ? intensity : 1, str(a, "p_channel")!, str(a, "p_title")!, str(a, "p_body")!);
    const opt = db.raw.prepare("INSERT INTO nudge_options (id, nudge_id, option_code, label, action_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
    options.forEach((o: any, i) => opt.run(crypto.randomUUID(), id, String(o?.code ?? ""), String(o?.label ?? ""), String(o?.actionType ?? ""), i));
    db.raw.prepare("UPDATE escalation_policies SET nudge_count = nudge_count + 1 WHERE item_id = ?").run(item);
    return { nudgeId: id };
  });
}

/** 信号摄入：信号事件 + 上下文快照 + 两者的关联。 */
function fnIngestSignal(db: Db, a: Args) {
  const user = str(a, "p_user_id")!, type = str(a, "p_signal_type")!;
  const payload = a.p_payload;
  if (!payload || typeof payload !== "object") throw new BadRequest("p_payload 要是对象");
  const occurred = normalizeTs(a.p_occurred_at);
  db.tx(() => {
    const sig = crypto.randomUUID(), snap = crypto.randomUUID();
    const json = JSON.stringify(payload);
    db.raw.prepare("INSERT INTO signal_events (id, user_id, signal_type, payload, occurred_at) VALUES (?, ?, ?, ?, ?)").run(sig, user, type, json, occurred);
    db.raw.prepare("INSERT INTO context_snapshots (id, user_id, snapshot_key, context_features, availability_score, friction_score) VALUES (?, ?, ?, ?, ?, ?)")
      .run(snap, user, `${type}:${occurred}`, json, JSON.stringify("free_slot" in payload ? 0.6 : 0.3), JSON.stringify("low_friction" in payload ? 0.2 : 0.7));
    db.raw.prepare("INSERT INTO context_snapshot_signals (context_snapshot_id, signal_event_id) VALUES (?, ?)").run(snap, sig);
  });
  return undefined;
}

export const RPC: Record<string, (db: Db, a: Args) => unknown> = {
  fn_decide: fnDecide,
  fn_create_nudge: fnCreateNudge,
  fn_ingest_signal: fnIngestSignal,
};
