export interface Env {
  /** jnify-data 数据服务的地址（深圳服务器，经 Cloudflare Tunnel：https://data.jnify.plutokeating.beer） */
  JNIFY_DATA_URL: string;
  /** jnify-data 的服务密钥（Worker secret；与服务器上 data/.env 的 JNIFY_DATA_KEY 相同） */
  JNIFY_DATA_KEY: string;
  /** 账号服务（PlutoKeating 账号，OIDC issuer），缺省 https://id.plutokeating.beer/ */
  ID_ISSUER?: string;
  APP_ENV?: string;
  APP_VERSION?: string;
  CORS_ORIGINS?: string;
  LOG_LEVEL?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  QUIET_HOURS_START?: string;
  QUIET_HOURS_END?: string;
  MAX_NUDGE_BUDGET?: string;
  LLM_API_BASE?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  SESSION_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  GH_PAT?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_AUTH?: string;
  TIANDITU_KEY?: string;
  DEBUG?: string;
}

export const DEFAULTS = {
  APP_ENV: 'development',
  APP_VERSION: '0.1.0',
  CORS_ORIGINS: '*',
  LOG_LEVEL: 'info',
  RATE_LIMIT_PER_MINUTE: 60,
  QUIET_HOURS_START: '23:30',
  QUIET_HOURS_END: '08:30',
  MAX_NUDGE_BUDGET: 3,
} as const;

export function num(env: Partial<Env>, key: 'RATE_LIMIT_PER_MINUTE' | 'MAX_NUDGE_BUDGET'): number {
  const raw = env[key];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : DEFAULTS[key];
}
