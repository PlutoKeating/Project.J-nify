export interface Env {
  SUPABASE_URL: string;
  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
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
  DEBUG?: string;
  HYPERDRIVE?: { connectionString: string };
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