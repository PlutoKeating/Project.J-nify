// 存储：node:sqlite（内置）。打开数据库、建表、补种 Jennifer 的出厂文档，并按列的声明类型在 JSON 与 SQLite 之间换算。
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const SEED_DOCS = JSON.parse(fs.readFileSync(new URL("./agent-docs.seed.json", import.meta.url), "utf8")) as
  { name: string; kind: string; content: string; enabled: boolean; sort_order: number; version: number }[];

export type ColType = "UUID" | "TEXT" | "INTEGER" | "BIGINT" | "REAL" | "BOOLEAN" | "JSONB" | "TIMESTAMPTZ" | "";
export interface Relation { name: string; view: boolean; columns: Map<string, ColType>; pk: string[] }
export type Db = ReturnType<typeof openDb>;

export class BadRequest extends Error { status = 400; }

/** 时间统一成 UTC 的 ISO 8601（毫秒、Z 结尾），存进去的字符串之间按字典序比较就是时间先后。
 *  没带时区的按 UTC 理解（与 Postgres 的 timestamptz 在 UTC 会话里一致）；只有日期的取当天 0 点。 */
export function normalizeTs(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") throw new BadRequest(`时间格式不对：${String(v)}`);
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(" ", "T") + "Z";
  const d = new Date(typeof v === "number" ? v : s);
  if (Number.isNaN(d.getTime())) throw new BadRequest(`时间格式不对：${s}`);
  return d.toISOString();
}

export function openDb(dataDir: string) {
  const file = dataDir === ":memory:" ? ":memory:" : (fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 }), path.join(dataDir, "jnify.db"));
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  // 出厂文档：名字不存在才补（管理员改过的内容不覆盖）
  const seed = db.prepare("INSERT OR IGNORE INTO agent_docs (id, name, kind, content, enabled, sort_order, version) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const d of SEED_DOCS) seed.run(crypto.randomUUID(), d.name, d.kind, d.content, d.enabled ? 1 : 0, d.sort_order, d.version);

  // 表与视图的列：从 SQLite 自己的元数据读，查询里出现的表名、列名都要在这里面
  const relations = new Map<string, Relation>();
  const rels = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'").all() as { name: string; type: string }[];
  for (const r of rels) {
    const cols = db.prepare(`PRAGMA table_info("${r.name}")`).all() as { name: string; type: string; pk: number }[];
    relations.set(r.name, {
      name: r.name, view: r.type === "view",
      columns: new Map(cols.map((c) => [c.name, c.type.toUpperCase() as ColType])),
      pk: cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name),
    });
  }

  /** 写入前：JSONB 存 JSON 文本，BOOLEAN 存 0 / 1，TIMESTAMPTZ 统一成 UTC ISO。 */
  const toDb = (t: ColType, v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    switch (t) {
      case "JSONB": return JSON.stringify(v);
      case "BOOLEAN": return v === true || v === "true" || v === 1 || v === "1" ? 1 : 0;
      case "TIMESTAMPTZ": return normalizeTs(v);
      case "INTEGER": case "BIGINT": case "REAL": {
        if (typeof v === "number") return v;
        const n = Number(v);
        if (typeof v === "string" && v.trim() !== "" && Number.isFinite(n)) return n;
        throw new BadRequest(`不是数字：${String(v)}`);
      }
      default: return typeof v === "object" ? JSON.stringify(v) : v;
    }
  };
  /** 读出后：JSONB 还原成对象，BOOLEAN 还原成 true / false。 */
  const fromDb = (rel: Relation, row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      const t = rel.columns.get(k);
      if (v === null) out[k] = null;
      else if (t === "JSONB") out[k] = typeof v === "string" ? JSON.parse(v) : v; // JSONB 的亲和性是 NUMERIC：纯数字会以数字存
      else if (t === "BOOLEAN") out[k] = v === 1 || v === 1n;
      else out[k] = typeof v === "bigint" ? Number(v) : v;
    }
    return out;
  };

  return {
    raw: db, relations, toDb, fromDb,
    tx<T>(f: () => T): T {
      db.exec("BEGIN IMMEDIATE");
      try { const r = f(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    /** 每天一份一致的备份（VACUUM INTO），保留最近 keep 份。 */
    backup(dir: string, keep = 7) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const name = `jnify-${new Date().toISOString().slice(0, 10)}.db`;
      const target = path.join(dir, name);
      if (!fs.existsSync(target)) db.prepare("VACUUM INTO ?").run(target);
      const old = fs.readdirSync(dir).filter((f) => /^jnify-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -keep);
      for (const f of old) fs.rmSync(path.join(dir, f));
      return name;
    },
    close: () => db.close(),
  };
}
