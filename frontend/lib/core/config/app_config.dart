import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'env.dart';

/// 应用配置：完全由 `.env` 驱动（可叠加 `--dart-define` 注入默认值）。
///
/// 后端地址（[backendBaseUrl]）、Supabase 端点（[supabaseUrl] /
/// [supabaseAnonKey]）等均从 `.env` 读取，便于不同环境（本地 / 生产）之间
/// 切换与版本控制。
class AppConfig {
  AppConfig._();

  static final AppConfig instance = AppConfig._();

  /// 生产上线环境唯一后端 Base URL（Cloudflare Worker，用户 2026-08-27 定案）。
  /// 开发环境通过 `.env` 的 `BACKEND_BASE_URL` 覆盖（见 `.env.example`）。
  static const prodBackendBaseUrl = 'https://jnify.williamhvollita.dpdns.org';

  /// Supabase 端点编译期默认值（`--dart-define=SUPABASE_URL=...` 可注入；
  /// 运行时 `.env` 覆盖优先）。
  static const defaultSupabaseUrl = String.fromEnvironment('SUPABASE_URL',
      defaultValue: 'http://localhost:54321');

  /// Supabase publishable（anon）key 的编译期默认值。**绝不能放 service role key。**
  static const defaultSupabaseAnonKey =
      String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');

  String backendBaseUrl = prodBackendBaseUrl;
  String appEnv = 'development';
  int apiTimeoutSeconds = 15;
  String supabaseUrl = defaultSupabaseUrl;
  String supabaseAnonKey = defaultSupabaseAnonKey;

  Future<void> load() async {
    // isOptional：发布构建没有 .env 资产（pubspec 未声明、.env 被 gitignore），
    // 缺失时必须静默回退到编译期默认值，否则 load 抛异常导致启动黑屏。
    await dotenv.load(fileName: '.env', isOptional: true);
    backendBaseUrl = dotenv.env[Env.backendBaseUrl] ?? backendBaseUrl;
    appEnv = dotenv.env[Env.appEnv] ?? appEnv;
    apiTimeoutSeconds =
        int.tryParse(dotenv.env[Env.apiTimeout] ?? '') ?? apiTimeoutSeconds;
    supabaseUrl = dotenv.env[Env.supabaseUrl] ?? supabaseUrl;
    supabaseAnonKey = dotenv.env[Env.supabaseAnonKey] ?? supabaseAnonKey;
  }
}
