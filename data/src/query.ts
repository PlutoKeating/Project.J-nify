// PostgREST 写法的一个小子集 → 参数化的 SQLite 语句。只实现 J-nify 后端实际用到的：
//   选列 select=a,b（或 *）；过滤 col=eq|neq|gt|gte|lt|lte.值、col=in.(a,b)、col=is.null|true|false；
//   排序 order=col.asc|desc[,…]；limit / offset；插入（可带 on_conflict 做 upsert，冲突时更新给出的列）；按过滤条件更新、删除。
// 表名、列名只认数据库里真实存在的（db.relations），值一律走参数绑定。
import crypto from "node:crypto";
import { BadRequest, type Db, type Relation } from "./db.ts";

type Row = Record<string, unknown>;
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
const OPS: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

function relation(db: Db, name: string, write = false): Relation {
  const rel = db.relations.get(name);
  if (!rel) throw Object.assign(new BadRequest(`没有这张表：${name}`), { status: 404 });
  if (write && rel.view) throw new BadRequest(`${name} 是只读视图`);
  return rel;
}
function column(rel: Relation, name: string) {
  if (!rel.columns.has(name)) throw new BadRequest(`${rel.name} 没有列 ${name}`);
  return `"${name}"`;
}

/** in.(a,"b,c",d) → ["a", "b,c", "d"]（PostgREST 的引号写法） */
function inList(s: string): string[] {
  const m = /^\((.*)\)$/s.exec(s);
  if (!m) throw new BadRequest(`in 的写法不对：${s}`);
  const out: string[] = [];
  const re = /\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))\s*(?:,|$)/gy;
  let x: RegExpExecArray | null;
  while (re.lastIndex < m[1].length && (x = re.exec(m[1]))) out.push(x[1] !== undefined ? x[1].replace(/\\(.)/g, "$1") : x[2]);
  if (m[1] === "") return [];
  return out;
}

function where(db: Db, rel: Relation, params: URLSearchParams) {
  const parts: string[] = [], args: unknown[] = [];
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    const col = column(rel, key), t = rel.columns.get(key)!;
    const dot = raw.indexOf(".");
    const op = dot > 0 ? raw.slice(0, dot) : "", val = dot > 0 ? raw.slice(dot + 1) : "";
    if (op in OPS) { parts.push(`${col} ${OPS[op]} ?`); args.push(db.toDb(t, t === "JSONB" ? JSON.parse(val) : val)); }
    else if (op === "in") {
      const list = inList(val);
      if (!list.length) { parts.push("0"); continue; }
      parts.push(`${col} IN (${list.map(() => "?").join(", ")})`); args.push(...list.map((v) => db.toDb(t, v)));
    } else if (op === "is") {
      if (val === "null") parts.push(`${col} IS NULL`);
      else if (val === "true" || val === "false") { parts.push(`${col} = ?`); args.push(val === "true" ? 1 : 0); }
      else throw new BadRequest(`is 只支持 null / true / false：${raw}`);
    } else throw new BadRequest(`不支持的过滤写法：${key}=${raw}`);
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", args, count: parts.length };
}

function selectList(rel: Relation, select: string | null) {
  if (!select || select === "*") return "*";
  return select.split(",").map((c) => column(rel, c.trim())).join(", ");
}

function orderBy(rel: Relation, order: string | null) {
  if (!order) return "";
  const parts = order.split(",").map((o) => {
    const [c, dir = "asc", nulls] = o.trim().split(".");
    if (!/^(asc|desc)$/.test(dir) || (nulls && !/^nulls(first|last)$/.test(nulls))) throw new BadRequest(`排序的写法不对：${o}`);
    return `${column(rel, c)} ${dir.toUpperCase()}${nulls ? ` NULLS ${nulls.slice(5).toUpperCase()}` : ""}`;
  });
  return ` ORDER BY ${parts.join(", ")}`;
}

function intParam(params: URLSearchParams, name: string) {
  const v = params.get(name);
  if (v === null) return undefined;
  if (!/^\d{1,6}$/.test(v)) throw new BadRequest(`${name} 要是非负整数`);
  return Number(v);
}

export function select(db: Db, table: string, params: URLSearchParams): Row[] {
  const rel = relation(db, table);
  const w = where(db, rel, params);
  const limit = intParam(params, "limit"), offset = intParam(params, "offset");
  const sql = `SELECT ${selectList(rel, params.get("select"))} FROM "${rel.name}"${w.sql}${orderBy(rel, params.get("order"))}`
    + (limit !== undefined ? ` LIMIT ${limit}` : offset !== undefined ? " LIMIT -1" : "") + (offset !== undefined ? ` OFFSET ${offset}` : "");
  return (db.raw.prepare(sql).all(...(w.args as any[])) as Row[]).map((r) => db.fromDb(rel, r));
}

export function insert(db: Db, table: string, body: unknown, params: URLSearchParams): Row[] {
  const rel = relation(db, table, true);
  const rows = (Array.isArray(body) ? body : [body]) as Row[];
  if (!rows.length) return [];
  if (rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) throw new BadRequest("插入的每一行都要是对象");
  const conflict = params.get("on_conflict")?.split(",").map((c) => c.trim()).filter(Boolean);
  conflict?.forEach((c) => column(rel, c));
  const autoId = rel.pk.length === 1 && rel.columns.get(rel.pk[0]) === "UUID" ? rel.pk[0] : undefined;
  const out: Row[] = [];
  db.tx(() => {
    for (const r of rows) {
      const row = autoId && (r[autoId] === undefined || r[autoId] === null) ? { [autoId]: crypto.randomUUID(), ...r } : r;
      const cols = Object.keys(row);
      cols.forEach((c) => column(rel, c));
      const args = cols.map((c) => db.toDb(rel.columns.get(c)!, row[c]));
      let sql = `INSERT INTO "${rel.name}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      if (conflict?.length) {
        // 冲突时只更新这次给出的列（不动冲突列与主键），与 PostgREST 的 resolution=merge-duplicates 一致
        const upd = Object.keys(r).filter((c) => !conflict.includes(c) && !rel.pk.includes(c));
        const set = upd.length ? upd.map((c) => `"${c}" = excluded."${c}"`).join(", ") : `"${conflict[0]}" = excluded."${conflict[0]}"`;
        sql += ` ON CONFLICT (${conflict.map((c) => `"${c}"`).join(", ")}) DO UPDATE SET ${set}`;
      }
      out.push(db.fromDb(rel, db.raw.prepare(`${sql} RETURNING *`).get(...(args as any[])) as Row));
    }
  });
  return out;
}

export function update(db: Db, table: string, patch: unknown, params: URLSearchParams): Row[] {
  const rel = relation(db, table, true);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new BadRequest("更新的内容要是对象");
  const cols = Object.keys(patch as Row);
  if (!cols.length) throw new BadRequest("没有要更新的列");
  const w = where(db, rel, params);
  if (!w.count) throw new BadRequest("更新必须带过滤条件");
  const set = cols.map((c) => `${column(rel, c)} = ?`).join(", ");
  const args = [...cols.map((c) => db.toDb(rel.columns.get(c)!, (patch as Row)[c])), ...w.args];
  return (db.raw.prepare(`UPDATE "${rel.name}" SET ${set}${w.sql} RETURNING *`).all(...(args as any[])) as Row[]).map((r) => db.fromDb(rel, r));
}

export function remove(db: Db, table: string, params: URLSearchParams): number {
  const rel = relation(db, table, true);
  const w = where(db, rel, params);
  if (!w.count) throw new BadRequest("删除必须带过滤条件");
  return Number(db.raw.prepare(`DELETE FROM "${rel.name}"${w.sql}`).run(...(w.args as any[])).changes);
}
