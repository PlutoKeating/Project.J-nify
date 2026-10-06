import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'env.dart';

/// 应用配置：完全由 `.env` 驱动（可叠加 `--dart-define` 注入默认值）。
///
/// 后端地址（[backendBaseUrl]）等从 `.env` 读取，便于不同环境（本地 / 生产）之间切换。
/// 登录用 PlutoKeating 账号，地址与客户端固定在 [Account] 里。
class AppConfig {
  AppConfig._();

  static final AppConfig instance = AppConfig._();

  /// 生产上线环境唯一后端 Base URL（Cloudflare Worker；官网与接口同一个域名，2026-10-07 起）。
  /// 开发环境通过 `.env` 的 `BACKEND_BASE_URL` 覆盖（见 `.env.example`）。
  static const prodBackendBaseUrl = 'https://jnify.plutokeating.beer';

  /// 官网生产域名（与接口同一个 Worker 托管）。
  static const websiteUrl = 'https://jnify.plutokeating.beer';

  /// App 版本，与 `pubspec.yaml` 的 `version` 保持一致（About us 展示失败时的回退值）。
  static const appVersion = '0.3.0+6';

  /// OpenWeather API key（免费可商用，需署名 "Weather by OpenWeather"）。
  /// release 构建经 --dart-define=OPENWEATHER_API_KEY=... 注入；本地走 .env。
  static const defaultOpenWeatherApiKey =
      String.fromEnvironment('OPENWEATHER_API_KEY', defaultValue: '');

  String backendBaseUrl = prodBackendBaseUrl;
  String appEnv = 'development';
  int apiTimeoutSeconds = 15;
  String openWeatherApiKey = defaultOpenWeatherApiKey;

  Future<void> load() async {
    // isOptional：发布构建没有 .env 资产（pubspec 未声明、.env 被 gitignore），
    // 缺失时必须静默回退到编译期默认值，否则 load 抛异常导致启动黑屏。
    await dotenv.load(fileName: '.env', isOptional: true);
    backendBaseUrl = dotenv.env[Env.backendBaseUrl] ?? backendBaseUrl;
    appEnv = dotenv.env[Env.appEnv] ?? appEnv;
    apiTimeoutSeconds =
        int.tryParse(dotenv.env[Env.apiTimeout] ?? '') ?? apiTimeoutSeconds;
    openWeatherApiKey = dotenv.env[Env.openWeatherApiKey] ?? openWeatherApiKey;
  }
}
