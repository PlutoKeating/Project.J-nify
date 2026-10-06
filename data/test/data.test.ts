// jnify-data 的测试：按 Workers 后端（backend/src/db/index.ts）的请求写法逐项核对。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db.ts";
import { createApp } from "../src/app.ts";

const KEY = "k".repeat(40);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jnify-data-"));
const db = openDb(dir);
const app = createApp(db, KEY);
const U = "b3028fde-35f9-4678-91cc-9501c089610e", V = "11111111-2222-4333-8444-555555555555";

/** 与 backend/src/db/index.ts 的 rest() 相同的请求方式（apikey + Bearer、JSON）。 */
async function rest(p: string, init: RequestInit & { json?: unknown } = {}, key = KEY) {
  const r = await app.request(`http://data/rest/v1${p}`, {
    ...init, body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}
/** 与 Workers 的 filters() 相同：没写操作符的值一律补上 eq.（select / order / limit / on_conflict 除外） */
const q = (o: Record<string, string>) => "?" + new URLSearchParams(Object.fromEntries(Object.entries(o).map(([k, v]) =>
  ["select", "order", "limit", "offset", "on_conflict"].includes(k) || /^(eq|neq|gt|gte|lt|lte|is|in|like|ilike|cs|cd|not)\.[(]?/.test(v) ? [k, v] : [k, `eq.${v}`]))).toString();

test("没有服务密钥一律 401；健康检查不要密钥", async () => {
  assert.equal((await rest("/users", {}, "wrong")).status, 401);
  assert.equal((await app.request("http://data/rest/v1/users")).status, 401);
  assert.equal((await app.request("http://data/health")).status, 200);
});

test("users 懒创建（upsert on_conflict=id）可重复，不改已有列", async () => {
  for (let i = 0; i < 2; i++) {
    const r = await rest(`/users${q({ on_conflict: "id" })}`, { method: "POST", json: [{ id: U }], headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
    assert.equal(r.status, 201);
    assert.equal(r.json[0].id, U);
    assert.deepEqual(r.json[0].privacy_scope, { calendar: true, weather: true, coarse_location: true }, "JSONB 默认值读出是对象");
  }
  await rest(`/users${q({ id: `eq.${U}` })}`, { method: "PATCH", json: { nickname: "Pluto", timezone: "Asia/Shanghai" } });
  await rest(`/users${q({ on_conflict: "id" })}`, { method: "POST", json: [{ id: U }] });
  const r = await rest(`/users${q({ select: "timezone,nickname", id: `eq.${U}`, limit: "1" })}`);
  assert.deepEqual(r.json, [{ timezone: "Asia/Shanghai", nickname: "Pluto" }]);
  await rest(`/users`, { method: "POST", json: { id: V } });
});

test("user_preferences 按 (user_id, scene, key) upsert：只留一行，值被更新", async () => {
  const put = (value: string) => rest(`/user_preferences${q({ on_conflict: "user_id,scene,key" })}`, { method: "POST", json: [{ user_id: U, scene: "guardrails", key: "quiet_hours_start", value }] });
  const a = await put("23:00"), b = await put("22:30");
  assert.equal(a.json[0].id, b.json[0].id, "主键不变");
  const rows = await rest(`/user_preferences${q({ select: "key,value", user_id: U, scene: "guardrails" })}`);
  assert.deepEqual(rows.json, [{ key: "quiet_hours_start", value: "22:30" }]);
});

test("事项：时间统一成 UTC、JSONB 往返、in / is.null / gt / 排序 / limit / 选列", async () => {
  const ins = await rest("/item_commitments", { method: "POST", json: [
    { user_id: U, title: "还信用卡", raw_text: "月底还信用卡", category: "bill", due_at: "2026-10-25T00:00:00", constraints: { hard: true, n: 2 } },
    { user_id: U, title: "退货", raw_text: "退货", category: "return", status: "deferred", due_at: "2026-10-09T08:00:00+08:00" },
    { user_id: U, title: "旧事", raw_text: "旧事", status: "done" },
    { user_id: V, title: "别人的", raw_text: "别人的" },
  ] });
  assert.equal(ins.status, 201);
  assert.equal(ins.json.length, 4);
  assert.match(ins.json[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(ins.json[0].due_at, "2026-10-25T00:00:00.000Z", "没带时区按 UTC");
  assert.equal(ins.json[1].due_at, "2026-10-09T00:00:00.000Z", "带时区的换算成 UTC");
  assert.deepEqual(ins.json[0].constraints, { hard: true, n: 2 });
  assert.equal(ins.json[0].est_minutes, 5);
  const active = await rest(`/item_commitments${q({ select: "title,status", user_id: `eq.${U}`, status: "in.(parked,deferred)", muted_at: "is.null", order: "due_at.asc" })}`);
  assert.deepEqual(active.json, [{ title: "退货", status: "deferred" }, { title: "还信用卡", status: "parked" }]);
  const since = new Date(Date.now() - 60_000).toISOString();
  assert.equal((await rest(`/item_commitments${q({ select: "id", user_id: U, created_at: `gt.${since}` })}`)).json.length, 3);
  assert.equal((await rest(`/item_commitments${q({ user_id: U, order: "created_at.desc", limit: "1" })}`)).json.length, 1);
  assert.deepEqual((await rest(`/item_commitments${q({ select: "id", user_id: U, status: "in.()" })}`)).json, []);
});

test("更新与删除：按过滤条件；不带条件拒绝；返回更新后的行", async () => {
  const [it] = (await rest(`/item_commitments${q({ user_id: U, title: "eq.退货" })}`)).json;
  const up = await rest(`/item_commitments${q({ id: `eq.${it.id}`, user_id: `eq.${U}` })}`, { method: "PATCH", json: { muted_at: new Date().toISOString(), est_minutes: 15 } });
  assert.equal(up.json.length, 1);
  assert.equal(up.json[0].est_minutes, 15);
  assert.equal((await rest(`/item_commitments`, { method: "PATCH", json: { title: "x" } })).status, 400);
  assert.equal((await rest(`/item_commitments`, { method: "DELETE" })).status, 400);
  assert.equal((await rest(`/item_commitments${q({ title: "eq.旧事" })}`, { method: "DELETE" })).status, 204);
  assert.equal((await rest(`/item_commitments${q({ select: "id", user_id: U })}`)).json.length, 2);
});

test("RPC：fn_decide（later 推到队尾，now 关闭并记 closed_at）、fn_create_nudge（计数加一）、fn_ingest_signal（204）", async () => {
  const [bill] = (await rest(`/item_commitments${q({ user_id: U, title: "eq.还信用卡" })}`)).json;
  await rest("/escalation_policies", { method: "POST", json: { item_id: bill.id } });
  const later = await rest("/rpc/fn_decide", { method: "POST", json: { p_item_id: bill.id, p_user_id: U, p_decision: "later", p_reason: "忙" } });
  assert.deepEqual(later.json, { status: "parked" });
  const [after] = (await rest(`/item_commitments${q({ id: bill.id })}`)).json;
  assert.ok(after.updated_at > bill.updated_at);
  assert.equal((await rest("/rpc/fn_decide", { method: "POST", json: { p_item_id: bill.id, p_user_id: U, p_decision: "maybe" } })).status, 400);
  assert.equal((await rest(`/memory_notes${q({ user_id: U, memory_type: "eq.decision_effect" })}`)).json[0].salience, 0.5);

  const win = await rest("/opportunity_windows", { method: "POST", json: { item_id: bill.id, window_start: new Date().toISOString(), window_end: new Date(Date.now() + 3600e3).toISOString(), reason_code: "free", reason_text: "空闲", fit_score: 0.7 } });
  assert.equal(win.json[0].fit_score, 0.7);
  const n = await rest("/rpc/fn_create_nudge", { method: "POST", json: { p_item_id: bill.id, p_window_id: win.json[0].id, p_intensity: 1, p_channel: "push", p_title: "该还了", p_body: "现在顺手", p_options: [{ code: "now", label: "现在", actionType: "decide" }, { code: "later", label: "晚点", actionType: "decide" }] } });
  assert.match(n.json.nudgeId, /^[0-9a-f-]{36}$/);
  assert.deepEqual((await rest(`/nudge_options${q({ select: "option_code,sort_order", nudge_id: n.json.nudgeId, order: "sort_order.asc" })}`)).json, [{ option_code: "now", sort_order: 0 }, { option_code: "later", sort_order: 1 }]);
  assert.equal((await rest(`/escalation_policies${q({ item_id: bill.id })}`)).json[0].nudge_count, 1);

  await rest("/decisions", { method: "POST", json: { user_id: U, item_id: bill.id, nudge_id: n.json.nudgeId, decision: "now" } });
  const now = await rest("/rpc/fn_decide", { method: "POST", json: { p_item_id: bill.id, p_user_id: U, p_decision: "now" } });
  assert.deepEqual(now.json, { status: "done" });
  assert.ok((await rest(`/item_commitments${q({ id: bill.id })}`)).json[0].closed_at);

  const sig = await rest("/rpc/fn_ingest_signal", { method: "POST", json: { p_user_id: U, p_signal_type: "calendar", p_payload: { free_slot: true }, p_occurred_at: new Date().toISOString() } });
  assert.equal(sig.status, 204);
  const ctx = await rest(`/context_snapshots${q({ select: "context_features,availability_score", user_id: U, order: "computed_at.desc", limit: "1" })}`);
  assert.deepEqual(ctx.json, [{ context_features: { free_slot: true }, availability_score: 0.6 }]);
});

test("闭环率视图：按日汇总，day=gte.<日期> 可过滤；视图只读", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const r = await rest(`/v_closure_rate${q({ day: `gte.${today}`, order: "day.desc", limit: "90" })}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.length, 1);
  assert.equal(r.json[0].done, 1);
  assert.equal((await rest("/v_closure_rate", { method: "POST", json: {} })).status, 400);
});

test("布尔、出厂文档、配置 upsert（版本号）", async () => {
  const docs = (await rest(`/agent_docs${q({ select: "name,enabled", order: "sort_order.asc" })}`)).json;
  assert.deepEqual(docs, [{ name: "identity", enabled: true }, { name: "workflow", enabled: true }, { name: "tools", enabled: true }]);
  await rest(`/system_config${q({ on_conflict: "key" })}`, { method: "POST", json: [{ key: "llm", value: { providers: [] }, version: 1 }] });
  await rest(`/system_config${q({ on_conflict: "key" })}`, { method: "POST", json: [{ key: "llm", value: { providers: [{ id: "x" }] }, version: 2 }] });
  assert.deepEqual((await rest(`/system_config${q({ select: "value,version", key: "eq.llm" })}`)).json, [{ value: { providers: [{ id: "x" }] }, version: 2 }]);
  const rp = await rest(`/rhythm_policies${q({ on_conflict: "user_id,category" })}`, { method: "POST", json: [{ user_id: U, category: "bill", due_offsets: [{ days_before: 3 }], agent_managed: false }] });
  assert.equal(rp.json[0].agent_managed, false);
});

test("表名、列名、写法不在白名单里一律拒绝（不会拼进 SQL）", async () => {
  assert.equal((await rest("/sqlite_master")).status, 404);
  assert.equal((await rest(`/users${q({ select: "id,(select 1)" })}`)).status, 400);
  assert.equal((await rest(`/users${q({ 'id" OR 1=1 --': "eq.x" })}`)).status, 400);
  assert.equal((await rest(`/users${q({ id: "like.%" })}`)).status, 400);
  assert.equal((await rest(`/users${q({ order: "id;drop table users" })}`)).status, 400);
  assert.equal((await rest(`/item_commitments${q({ due_at: "gt.not-a-date" })}`)).status, 400);
  assert.equal((await rest("/item_commitments", { method: "POST", json: { user_id: "nobody", title: "x", raw_text: "x" } })).status, 409, "外键冲突");
});

test("删除用户：所有数据随之级联删除，别人的不受影响；备份文件", async () => {
  assert.equal((await rest(`/users${q({ id: `eq.${U}` })}`, { method: "DELETE" })).status, 204);
  for (const t of ["item_commitments", "decisions", "memory_notes", "user_preferences", "rhythm_policies", "signal_events", "context_snapshots"]) {
    assert.deepEqual((await rest(`/${t}${q({ select: "user_id", user_id: U })}`)).json, [], t);
  }
  assert.equal((await rest(`/item_commitments${q({ user_id: V })}`)).json.length, 1);
  const name = db.backup(path.join(dir, "backups"));
  assert.ok(fs.existsSync(path.join(dir, "backups", name)));
});
