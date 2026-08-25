import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'env.dart';

/// 应用配置：完全由 `.env` 驱动。
///
/// 后端地址（[backendBaseUrl]）等均从 `.env` 读取，便于不同环境（本地 /
/// 内网穿透生产 URL）之间切换与版本控制。
class AppConfig {
  AppConfig._();

  static final AppConfig instance = AppConfig._();

  String backendBaseUrl = 'http://localhost:8000';
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
