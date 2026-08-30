# J-nify Flutter 客户端

J-nify 的 Android / iOS / Web Flutter 客户端。当前发布版为 `v0.3.0`（`0.3.0+6`）；认证使用 Supabase Auth，业务数据只经 Cloudflare Worker API 访问。

```bash
cp .env.example .env   # 可选；本地联调时改 BACKEND_BASE_URL
flutter pub get
flutter run
```

验证：

```bash
flutter analyze
flutter test
flutter test integration_test/app_smoke_test.dart -d <android-device> \
  --dart-define=SUPABASE_URL=... \
  --dart-define=SUPABASE_ANON_KEY=...
```

- [模块说明](docs/README.md)
- [架构](docs/ARCHITECTURE.md)
- [快速开始](docs/QUICK_START.md)
- [发布与签名](../docs/devops/release.md)
- [邮件 App Link](../docs/devops/email-callback.md)

生产包由 `.github/workflows/release-frontend.yml` 通过 tag `vX.Y.Z` 构建；不要提交 `.env`、keystore 或任何真实凭据。
