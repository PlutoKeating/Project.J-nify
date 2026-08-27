# Frontend 架构

纯客户端（Flutter），认证用 **supabase_flutter**（Supabase Auth），业务数据经 Cloudflare Worker 后端（REST）获取 —— 客户端**不直接访问数据表**（RLS 全拒，见根 `docs/ARCHITECTURE.md`）。

## 分层

- **认证层** `auth/`：`AuthGate`（`onAuthStateChange` → 未登录 LoginScreen / 已登录 HomeShell）；登录/注册页（邮箱+密码、确认邮件提示）；登出在「我的」页。
- **配置层** `core/config/`：`AppConfig`（`flutter_dotenv` 读 `.env`）：`backendBaseUrl`（**生产默认 `https://jnify.williamhvollita.dpdns.org`**）、`supabaseUrl`、`supabaseAnonKey`；`Env` 常量（`String.fromEnvironment` 支持 dart-define）。
- **网络层** `core/api/`：`ApiClient` 自动附 `Authorization: Bearer <Supabase JWT>`（401 → 静默登出回登录页；未初始化 guard）。
- **服务层** `services/`：`ApiService` 封装 `/v1/...`（capture/now/items/decision/guardrails/signals）。
- **模型层** `models/`：`ItemCommitment`（const 构造器 + `options` 字段）。
- **UI 层** `screens/ + widgets/`：现在/全部/我的；焦点卡按**后端 options** 渲染（now 主按钮/later/drop/条件 rescue）；录入分类 chips（life/chore/bill/return/study/social）+ 期限（无/明天/一周/两周）；Toast 顶部 pill（SPEC §3.5）收口（capture 用后端 message）。

## 与 SPEC 的对应

- 「现在」页：首屏只给一件最顺手的事（§2 / §4.3）：headline + 录入 + 焦点卡/空态。
- 焦点卡：四选项闭环 现在做/晚点/算了/帮我兜底（§4.2 / §4.4；rescue 后端按 category 提供）。
- 「全部」页：任务列表 + 状态徽章 + 勾选（§4.3）。
- 「我的」页：护栏（安静时段/预算/粗粒度位置）真实读写 + 退出登录（§9.4）。

## 配置

`.env`（不入库，模板见 `.env.example`）：

```
BACKEND_BASE_URL=https://jnify.williamhvollita.dpdns.org   # 生产默认（代码内置）；本地开发改为 http://localhost:8787
SUPABASE_URL=
SUPABASE_ANON_KEY=        # publishable key（仅 Auth；绝不填 service role key）
APP_ENV=development
API_TIMEOUT=15
```

> 发布构建：`SUPABASE_URL/SUPABASE_ANON_KEY` 由 CI 以 dart-define 注入（GitHub Secrets），release 包开箱即用。