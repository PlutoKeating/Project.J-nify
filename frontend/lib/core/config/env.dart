/// 环境变量 key 常量。取值全部来自 `.env`（见 `.env.example`）；部分项
/// 可用 `--dart-define` 在编译期注入（见 [AppConfig] 的各 default 常量）。
/// 后端地址、运行环境、超时等均由此控制。
class Env {
  static const backendBaseUrl = 'BACKEND_BASE_URL';
  static const appEnv = 'APP_ENV';
  static const apiTimeout = 'API_TIMEOUT';
  static const openWeatherApiKey = 'OPENWEATHER_API_KEY';
}
