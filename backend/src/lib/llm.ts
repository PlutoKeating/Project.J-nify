import type { Db } from '../db';
import { getConfig } from './config-store';

export interface LlmProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  apiKeys: string[];
  models: string[];
  enabled: boolean;
}

export interface LlmConfig {
  providers: LlmProviderConfig[];
  order: string[];
  timeoutMs: number;
  maxToolIterations: number;
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  providers: [],
  order: [],
  timeoutMs: 30_000,
  maxToolIterations: 6,
};

export function normalizeLlmConfig(raw: unknown): LlmConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const providers = Array.isArray(r.providers)
    ? (r.providers as LlmProviderConfig[]).filter(
        (p) => p && typeof p.id === 'string' && typeof p.baseUrl === 'string',
      )
    : [];
  const order = Array.isArray(r.order)
    ? (r.order as string[]).filter((entry) => isValidOrderEntry(entry, providers))
    : providers.map((p) => p.id);
  return {
    providers,
    order,
    timeoutMs: typeof r.timeoutMs === 'number' ? r.timeoutMs : DEFAULT_LLM_CONFIG.timeoutMs,
    maxToolIterations: typeof r.maxToolIterations === 'number' ? r.maxToolIterations : DEFAULT_LLM_CONFIG.maxToolIterations,
  };
}

/**
 * order 条目合法性：既支持旧的纯 provider id，也支持新的 "providerId/modelId" 复合条目
 * （模型必须存在于该 provider 的 models 列表中）。
 */
function isValidOrderEntry(entry: unknown, providers: LlmProviderConfig[]): boolean {
  if (typeof entry !== 'string' || !entry) return false;
  const slash = entry.indexOf('/');
  if (slash === -1) return providers.some((p) => p.id === entry);
  const pid = entry.slice(0, slash);
  const mid = entry.slice(slash + 1);
  const p = providers.find((x) => x.id === pid);
  return !!p && p.models.includes(mid);
}

export async function loadLlmConfig(db: Db): Promise<LlmConfig> {
  const { value } = await getConfig(db, 'llm', DEFAULT_LLM_CONFIG);
  return normalizeLlmConfig(value);
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmResult {
  text: string;
  toolCalls: ToolCall[];
  model: string;
  provider: string;
  degraded: boolean;
}

async function chatOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  timeoutMs: number,
): Promise<LlmResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.6,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[];
  };
  const msg = data.choices?.[0]?.message;
  const text = msg?.content ?? '';
  const toolCalls: ToolCall[] = ((msg?.tool_calls ?? []) as {
    id?: string;
    function?: { name?: string; arguments?: string };
  }[]).map((tc) => ({
    id: tc.id ?? `tc_${Math.random().toString(36).slice(2)}`,
    name: tc.function?.name ?? '',
    arguments: tc.function?.arguments ?? '{}',
  }));
  return { text, toolCalls, model, provider: baseUrl, degraded: false };
}

/** 按 admin 配置的 provider/key/model 优先级依次尝试，失败切换下一个。 */
export async function callLlm(db: Db, messages: ChatMessage[], tools: ToolDef[]): Promise<LlmResult> {
  const cfg = await loadLlmConfig(db);
  return callLlmWithConfig(cfg, messages, tools);
}

/** 供单元测试直接注入配置调用。 */
export async function callLlmWithConfig(cfg: LlmConfig, messages: ChatMessage[], tools: ToolDef[]): Promise<LlmResult> {
  const errors: string[] = [];
  for (const entry of cfg.order) {
    const slash = entry.indexOf('/');
    if (slash === -1) {
      // 兼容旧格式：整 provider 的 keys×models 依次尝试
      const p = cfg.providers.find((x) => x.id === entry);
      if (!p || !p.enabled) continue;
      const keys = p.apiKeys.length ? p.apiKeys : [''];
      const models = p.models.length ? p.models : [''];
      for (const apiKey of keys) {
        for (const model of models) {
          try {
            const result = await chatOpenAI(p.baseUrl, apiKey, model, messages, tools, cfg.timeoutMs);
            assertNonEmpty(result);
            return result;
          } catch (e) {
            errors.push(`${p.id}/${model}: ${(e as Error).message}`);
          }
        }
      }
      continue;
    }
    // 新格式："providerId/modelId" 模型级条目
    const pid = entry.slice(0, slash);
    const mid = entry.slice(slash + 1);
    const p = cfg.providers.find((x) => x.id === pid);
    if (!p || !p.enabled || !p.models.includes(mid)) continue;
    const keys = p.apiKeys.length ? p.apiKeys : [''];
    for (const apiKey of keys) {
      try {
        const result = await chatOpenAI(p.baseUrl, apiKey, mid, messages, tools, cfg.timeoutMs);
        assertNonEmpty(result);
        return result;
      } catch (e) {
        errors.push(`${entry}: ${(e as Error).message}`);
      }
    }
  }
  throw new Error(`all LLM providers failed: ${errors.join(' | ') || 'no providers configured'}`);
}

/**
 * 空完成（无文本且无工具调用）对 agent 毫无价值，视为该条目失败，
 * 让上层按顺序切换到下一个 provider/model，避免"好的，已记下"式假确认。
 */
function assertNonEmpty(result: LlmResult): void {
  if (!result.text.trim() && result.toolCalls.length === 0) {
    throw new Error('empty completion (no text, no tool calls)');
  }
}

// ---- models.dev 公开模型列表（动态加载，1h 缓存） ----
let modelsDevCache: { at: number; data: unknown } | null = null;

/** 仅测试用：清空 models.dev 内存缓存。 */
export function resetModelsDevCacheForTests(): void {
  modelsDevCache = null;
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  /** 由 models.dev 的 api 字段推导的 OpenAI 兼容 Base URL；无法推导时为 null */
  baseUrl: string | null;
  models: { id: string; name: string }[];
}

/** models.dev 的 api 字段对多数 OpenAI 兼容供应商就是 Base URL；占位符/缺失/非 http(s) 视为不可推导。 */
function deriveBaseUrl(api: unknown): string | null {
  if (typeof api !== 'string') return null;
  const trimmed = api.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed) || trimmed.includes('${')) return null;
  return trimmed.replace(/\/+$/, '');
}

export async function listModelProviders(): Promise<ModelsDevProvider[]> {
  if (modelsDevCache && Date.now() - modelsDevCache.at < 3600_000) return toProviders(modelsDevCache.data);
  const res = await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  modelsDevCache = { at: Date.now(), data };
  return toProviders(data);
}

function toProviders(data: unknown): ModelsDevProvider[] {
  const obj = (data ?? {}) as Record<string, { id?: string; name?: string; api?: unknown; models?: Record<string, { id?: string; name?: string }> }>;
  return Object.values(obj)
    .map((p) => ({
      id: p.id ?? '',
      name: p.name ?? p.id ?? '',
      baseUrl: deriveBaseUrl(p.api),
      models: Object.values(p.models ?? {}).map((m) => ({ id: m.id ?? '', name: m.name ?? m.id ?? '' })),
    }))
    .filter((p) => p.id);
}
