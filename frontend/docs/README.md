# J-nify Frontend

Flutter（Dart）客户端，**无 Docker**。通过 REST 调用后端，后端地址完全由 `.env` 控制。

结构：

```
frontend/
├── lib/
│   ├── main.dart              # 入口 + App 外壳（现在/全部/我的）
│   ├── core/config/           # .env 配置（flutter_dotenv）
│   ├── core/api/              # HTTP 客户端
│   ├── services/              # 业务 API 封装
│   ├── models/                # 数据模型（ItemCommitment）
│   ├── screens/               # 三个视图
│   └── widgets/               # 复用组件
├── pubspec.yaml
└── .env.example               # BACKEND_BASE_URL 等
```

相关文档：[ARCHITECTURE.md](ARCHITECTURE.md)、[QUICK_START.md](QUICK_START.md)。
