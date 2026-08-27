import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'env.dart';

/// 应用配置：完全由 `.env` 驱动。
///
/// 后端地址（[backendBaseUrl]）等均从 `.env` 读取，便于不同环境（本地 /
/// 内网穿透生产 URL）之间切换与版本控制。
class AppConfig {
  AppConfig._();

  static final AppConfig instance = AppConfig._();

  /// 生产上线环境唯一后端 Base URL（Cloudflare Worker，用户 2026-08-27 定案）。
  /// 开发环境通过 `.env` 的 `BACKEND_BASE_URL` 覆盖（见 `.env.example`）。
  static const prodBackendBaseUrl = 'https://jnify.williamhvollita.dpdns.org';

  String backendBaseUrl = prodBackendBaseUrl;
  String appEnv = 'development';
  int apiTimeoutSeconds = 15;

  Future<void> load() async {
    await dotenv.load(fileName: '.env');
    backendBaseUrl = dotenv.env[Env.backendBaseUrl] ?? backendBaseUrl;
    appEnv = dotenv.env[Env.appEnv] ?? appEnv;
    apiTimeoutSeconds =
        int.tryParse(dotenv.env[Env.apiTimeout] ?? '') ?? apiTimeoutSeconds;
  }
}
