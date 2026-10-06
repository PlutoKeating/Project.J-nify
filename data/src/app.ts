// HTTP 接口：Supabase 数据接口（PostgREST）写法的一个子集，挂在 /rest/v1 下，J-nify 的 Workers 后端只换地址与密钥就能用。
//   GET    /rest/v1/:table?select=&<过滤>&order=&limit=     读
//   POST   /rest/v1/:table[?on_conflict=a,b]                写（一行或多行；带 on_conflict 为 upsert），返回写入后的行
//   PATCH  /rest/v1/:table?<过滤>                           按过滤条件更新，返回更新后的行
//   DELETE /rest/v1/:table?<过滤>                           按过滤条件删除
//   POST   /rest/v1/rpc/:fn                                  fn_decide / fn_create_nudge / fn_ingest_signal
//   GET    /health                                           健康检查（不要密钥）
// 只认服务密钥（Authorization: Bearer <JNIFY_DATA_KEY>，或 apikey 头）：只有 Workers 后端持有它，App 不直接连这里。
import crypto from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "./db.ts";
import { insert, remove, select, update } from "./query.ts";
import { RPC } from "./rpc.ts";

export const VERSION = "0.1.0";

export function createApp(db: Db, key: string) {
  const app = new Hono();
  const want = crypto.createHash("sha256").update(key).digest();
  const authorized = (c: Context) => {
    const h = c.req.header("authorization") ?? "";
    const got = h.startsWith("Bearer ") ? h.slice(7).trim() : c.req.header("apikey") ?? "";
    return crypto.timingSafeEqual(crypto.createHash("sha256").update(got).digest(), want);
  };

  app.get("/health", (c) => c.json({ ok: true, service: "jnify-data", version: VERSION }));
  app.use("/rest/v1/*", async (c, next) => {
    if (!authorized(c)) return c.json({ message: "unauthorized" }, 401);
    await next();
  });
  app.use("/rest/v1/*", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ message: "body too large" }, 413) }));

  const params = (c: Context) => new URL(c.req.url).searchParams;
  const body = async (c: Context) => { try { return await c.req.json(); } catch { throw Object.assign(new Error("请求体不是 JSON"), { status: 400 }); } };

  app.post("/rest/v1/rpc/:fn", async (c) => {
    const fn = RPC[c.req.param("fn")];
    if (!fn) return c.json({ message: "没有这个函数" }, 404);
    const r = fn(db, (await body(c)) ?? {});
    return r === undefined ? c.body(null, 204) : c.json(r);
  });
  app.get("/rest/v1/:table", (c) => c.json(select(db, c.req.param("table"), params(c))));
  app.post("/rest/v1/:table", async (c) => c.json(insert(db, c.req.param("table"), await body(c), params(c)), 201));
  app.patch("/rest/v1/:table", async (c) => c.json(update(db, c.req.param("table"), await body(c), params(c))));
  app.delete("/rest/v1/:table", (c) => { remove(db, c.req.param("table"), params(c)); return c.body(null, 204); });

  app.onError((e, c) => {
    const err = e as Error & { status?: number; code?: string; errcode?: number };
    // SQLite 约束：唯一 / 外键冲突 → 409；其他已知的请求错误按各自状态；其余 500（不把内部细节回给调用方）
    if (/constraint failed/i.test(err.message)) return c.json({ message: err.message.replace(/^.*?: /, ""), code: "conflict" }, 409);
    if (err.status && err.status < 500) return c.json({ message: err.message }, err.status as 400);
    console.error("[data]", err.message);
    return c.json({ message: "internal error" }, 500);
  });
  return app;
}
