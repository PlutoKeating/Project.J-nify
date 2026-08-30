import 'package:flutter_test/flutter_test.dart';

import 'package:jnify_app/core/config/app_config.dart';

/// 回归测试：发布构建（APK 内没有 `.env` 资产，pubspec 未声明 assets、
/// `.env` 被 gitignore）下 `AppConfig.load()` 必须静默回退到编译期默认值。
/// 修复前 `dotenv.load('.env')` 默认 `isOptional: false`，资产缺失时抛
/// `FileNotFoundError` → `main()` 在 `runApp` 前崩溃 → 启动黑屏。
void main() {
  testWidgets('load() 在 .env 资产缺失时不抛异常并回退默认值', (tester) async {
    await AppConfig.instance.load();

    // 未抛异常即通过到此处；并确认默认值生效（生产 URL / dart-define 注入值）。
    expect(AppConfig.instance.backendBaseUrl, AppConfig.prodBackendBaseUrl);
    expect(AppConfig.instance.supabaseUrl, AppConfig.defaultSupabaseUrl);
    expect(AppConfig.instance.supabaseAnonKey, AppConfig.defaultSupabaseAnonKey);
  });
}
