// 入口：读环境变量、打开数据库、启动 HTTP，每天备份一次。
import { serve } from "@hono/node-server";
import { openDb } from "./db.ts";
import { createApp, VERSION } from "./app.ts";

const env = process.env;
const key = env.JNIFY_DATA_KEY ?? "";
if (key.length < 32) { console.error("JNIFY_DATA_KEY 至少 32 个字符（start.sh 会自动生成）"); process.exit(1); }
const dataDir = env.JNIFY_DATA_DIR ?? "/data";
const port = Number(env.JNIFY_DATA_PORT ?? 8080), host = env.JNIFY_DATA_HOST ?? "0.0.0.0";

const db = openDb(dataDir);
const backup = () => { try { console.log("[backup]", db.backup(`${dataDir}/backups`)); } catch (e) { console.error("[backup]", (e as Error).message); } };
backup();
setInterval(backup, 6 * 3600_000).unref(); // 每 6 小时看一次，当天还没有备份就做一份

const server = serve({ fetch: createApp(db, key).fetch, port, hostname: host }, (a) => console.log(`[main] jnify-data ${VERSION} 在 ${host}:${a.port}`));
const stop = () => { server.close(); db.close(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
