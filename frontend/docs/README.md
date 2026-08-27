# J-nify Frontend

Flutter（Dart）客户端，**无 Docker**。认证用 supabase_flutter（Supabase Auth）；业务 REST 调 Cloudflare Worker 后端（生产 `https://jnify.williamhvollita.dpdns.org`，代码内置默认；`.env` 可覆盖）。

结构：

```
frontend/
├── lib/
│   ├── main.dart              # 入口：Supabase.initialize + AuthGate
│   ├── auth/                  # AuthGate（登录态路由）+ 登录/注册逻辑
│   ├── core/config/           # AppConfig（dotenv + 生产默认值）
│   ├── core/api/              # ApiClient（Bearer JWT 注入、401 静默登出）
│   ├── services/              # 业务 API 封装
│   ├── models/                # ItemCommitment（含 options）
│   ├── screens/               # 现在/全部/我的 + login
│   └── widgets/               # 焦点卡（后端 options 渲染）/录入（分类+期限）/任务行
├── android/ ios/ web/         # 平台目录（minSdk 31 / iOS target 15.0）
├── pubspec.yaml               # 唯一版本来源（version:）
└── .env.example               # BACKEND_BASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY（publishable）
```

相关文档：[ARCHITECTURE.md](ARCHITECTURE.md)、[QUICK_START.md](QUICK_START.md)；发布流程见 `docs/devops/release.md`。