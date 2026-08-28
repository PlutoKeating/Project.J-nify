/// 环境变量 key 常量。取值全部来自 `.env`（见 `.env.example`）；部分项
/// 可用 `--dart-define` 在编译期注入（见 [AppConfig] 的各 default 常量）。
/// 后端地址、运行环境、超时、Supabase 端点等均由此完全控制，便于运维与版本控制。
class Env {
  static const backendBaseUrl = 'BACKEND_BASE_URL';
  static const appEnv = 'APP_ENV';
  static const apiTimeout = 'API_TIMEOUT';
  static const supabaseUrl = 'SUPABASE_URL';
  static const supabaseAnonKey = 'SUPABASE_ANON_KEY';
  static const openWeatherApiKey = 'OPENWEATHER_API_KEY';
  static const tiandituKey = 'TIANDITU_KEY';
}
