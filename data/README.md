# jnify-data

J-nify 的数据服务：用户数据存在 SQLite 里，给 Workers 后端（`backend/`）提供数据接口。Node 24 + Hono + `node:sqlite`（内置），打成一个 Docker 容器。

部署在作者的服务器上（中国深圳），与 Quetzal 同步服务的容器并存、互不共用；容器只发布到本机 `127.0.0.1:8789`，经 Cloudflare Tunnel 以 `https://data.jnify.plutokeating.beer` 对外，调用方只有 Workers 后端。

## 接口

Supabase 数据接口（PostgREST）写法的一个子集，挂在 `/rest/v1` 下，只实现后端实际用到的，所以后端的数据访问代码（`backend/src/db/`）沿用原写法：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/rest/v1/<表>?select=&<过滤>&order=&limit=&offset=` | 读 |
| POST | `/rest/v1/<表>[?on_conflict=a,b]` | 写一行或多行；带 `on_conflict` 为 upsert；返回写入后的行 |
| PATCH | `/rest/v1/<表>?<过滤>` | 按过滤条件更新（必须带条件），返回更新后的行 |
| DELETE | `/rest/v1/<表>?<过滤>` | 按过滤条件删除（必须带条件） |
| POST | `/rest/v1/rpc/<函数>` | `fn_decide` / `fn_create_nudge` / `fn_ingest_signal`，各自在一个事务里完成 |
| GET | `/health` | 健康检查（不要密钥） |

- 过滤：`eq / neq / gt / gte / lt / lte`、`in.(a,b)`、`is.null|true|false`；排序 `order=col.asc|desc[.nullsfirst|nullslast]`。
- 表名、列名只认数据库里真实存在的，值一律参数绑定；视图（`v_closure_rate`）只读。
- 唯一 / 外键冲突返回 409；其他请求错误 400 / 404；请求体上限 1 MB。

## 鉴权

只认服务密钥：`Authorization: Bearer <JNIFY_DATA_KEY>`（或 `apikey` 头）。密钥只有 Workers 后端持有（Worker secret `JNIFY_DATA_KEY`，与服务器上 `data/.env` 里的相同）；App 不直接连这里。按用户区分数据由后端负责：后端核对 PlutoKeating 账号的访问令牌后，只读写该用户（`users.id` = 账号的 `sub`）的数据。

## 表结构

`src/schema.sql`：23 张表 + 闭环率视图 `v_closure_rate`，由原 Postgres 迁移等价转写（类型换算规则写在文件开头）。服务启动时 `CREATE TABLE IF NOT EXISTS`；改结构就改这个文件。Jennifer 的出厂文档种子在 `src/agent-docs.seed.json`，名字不存在才补，不覆盖管理员改过的内容。删除 `users` 的一行会级联删除该用户的全部数据（`DELETE /v1/me/data` 就是这样做的）。

## 本地开发

```bash
cd data
npm ci
npm run dev        # 127.0.0.1:8789，数据在 .dev/（不入库），开发密钥写在 package.json 的 dev 脚本里
```

`backend/.dev.vars.example` 默认就指向它（`JNIFY_DATA_URL=http://127.0.0.1:8789`，密钥与 dev 脚本相同）。

## 部署

在服务器上：

```bash
cd data
./start.sh         # 启动 / 更新（可重复运行）：第一次从 .env.example 生成 .env（权限 600）与服务密钥，然后构建并启动容器，等健康检查通过
./start.sh --key   # 打印服务密钥，配置 Worker secret JNIFY_DATA_KEY 时用（只在服务器终端显示）
```

- 配置见 `.env.example`：`JNIFY_DATA_KEY`（自动生成，至少 32 个字符）、`JNIFY_DATA_LOCAL_PORT`（缺省 8789）、可选 `NPM_REGISTRY`（npm 镜像源）。`.env` 不入库。
- Cloudflare Tunnel 的公共主机名 `data.jnify.plutokeating.beer` → `http://localhost:8789`。Worker 的 `JNIFY_DATA_URL` 设为 `https://data.jnify.plutokeating.beer`。
- 容器：非 root 用户、只读根文件系统、去掉全部 capabilities、内存 192 MB；数据在 `./data`（`jnify.db`，WAL 模式）。
- 换密钥：改 `.env` 里的 `JNIFY_DATA_KEY` 后再跑 `./start.sh`，同时更新 Worker 的 secret。

## 备份

服务启动时和之后每 6 小时检查一次，当天还没有备份就用 `VACUUM INTO` 做一份到 `data/backups/jnify-YYYY-MM-DD.db`（宿主机上是 `data/data/backups/`），保留最近 7 份。备份只在这台服务器上；需要异地副本时另行拷走。

## 测试

```bash
npm test           # node --test：鉴权、过滤 / 排序 / upsert、三个 RPC、视图、白名单、级联删除、备份
npm run typecheck
```

后端的集成测试（`cd backend && npm run test:integration`）会在进程内起一个 jnify-data，跑之前先在这里 `npm ci`。CI 的 data 作业跑本目录的测试与类型检查。
