/// 环境变量 key 常量。取值全部来自 `.env`（见 `.env.example`）。
/// 后端地址、运行环境、超时等均由 `.env` 完全控制，便于运维与版本控制。
class Env {
  static const backendBaseUrl = 'BACKEND_BASE_URL';
  static const appEnv = 'APP_ENV';
  static const apiTimeout = 'API_TIMEOUT';
}
