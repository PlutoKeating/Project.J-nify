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

  /// 官网生产域名（landing page，Cloudflare Pages）。
  static const websiteUrl = 'https://j-nify.arr2018.dpdns.org';

  /// App Link 域名（与官网一致）：供邮件确认/重置回调与 Deep Link 使用。
  /// 该域名需在网站侧托管 `/.well-known/assetlinks.json`（Android）与
  /// `/.well-known/apple-app-site-association`（iOS）以通过 App Link 验证。
  static const appLinkHost = 'j-nify.arr2018.dpdns.org';

  /// App Link 校验回调路径（Supabase 确认/重置邮件跳转回 App 的入口）。
  static const appLinkVerify = 'https://$appLinkHost/auth/verify';

  /// App 版本，与 `pubspec.yaml` 的 `version` 保持一致（About us 展示失败时的回退值）。
  static const appVersion = '0.1.5+4';

  /// Supabase 端点编译期默认值（`--dart-define=SUPABASE_URL=...` 可注入；
  /// 运行时 `.env` 覆盖优先）。
  static const defaultSupabaseUrl = String.fromEnvironment('SUPABASE_URL',
      defaultValue: 'http://localhost:54321');

  /// Supabase publishable（anon）key 的编译期默认值。**绝不能放 service role key。**
  static const defaultSupabaseAnonKey =
      String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');

  /// OpenWeather API key（免费可商用，需署名 "Weather by OpenWeather"）。
  /// release 构建经 --dart-define=OPENWEATHER_API_KEY=... 注入；本地走 .env。
  static const defaultOpenWeatherApiKey =
      String.fromEnvironment('OPENWEATHER_API_KEY', defaultValue: '');

  /// 天地图 Web 服务 Key（逆地理编码；坐标先模糊化再调用）。
  static const defaultTiandituKey =
      String.fromEnvironment('TIANDITU_KEY', defaultValue: '');

  String backendBaseUrl = prodBackendBaseUrl;
  String appEnv = 'development';
  int apiTimeoutSeconds = 15;
  String supabaseUrl = defaultSupabaseUrl;
  String supabaseAnonKey = defaultSupabaseAnonKey;
  String openWeatherApiKey = defaultOpenWeatherApiKey;
  String tiandituKey = defaultTiandituKey;

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
    openWeatherApiKey = dotenv.env[Env.openWeatherApiKey] ?? openWeatherApiKey;
    tiandituKey = dotenv.env[Env.tiandituKey] ?? tiandituKey;
  }
}
