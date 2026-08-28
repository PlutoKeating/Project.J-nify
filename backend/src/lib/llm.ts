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
        (p) => p && typeof p.id === 'string' && p.enabled !== false && typeof p.baseUrl === 'string',
      )
    : [];
  const order = Array.isArray(r.order)
    ? (r.order as string[]).filter((id) => providers.some((p) => p.id === id))
    : providers.map((p) => p.id);
  return {
    providers,
    order,
    timeoutMs: typeof r.timeoutMs === 'number' ? r.timeoutMs : DEFAULT_LLM_CONFIG.timeoutMs,
    maxToolIterations: typeof r.maxToolIterations === 'number' ? r.maxToolIterations : DEFAULT_LLM_CONFIG.maxToolIterations,
  };
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
  const errors: string[] = [];
  for (const providerId of cfg.order) {
    const p = cfg.providers.find((x) => x.id === providerId);
    if (!p) continue;
    const keys = p.apiKeys.length ? p.apiKeys : [''];
    const models = p.models.length ? p.models : [''];
    for (const apiKey of keys) {
      for (const model of models) {
        try {
          return await chatOpenAI(p.baseUrl, apiKey, model, messages, tools, cfg.timeoutMs);
        } catch (e) {
          errors.push(`${p.id}/${model}: ${(e as Error).message}`);
        }
      }
    }
  }
  throw new Error(`all LLM providers failed: ${errors.join(' | ') || 'no providers configured'}`);
}

// ---- models.dev 公开模型列表（动态加载，1h 缓存） ----
let modelsDevCache: { at: number; data: unknown } | null = null;

export async function listModelProviders(): Promise<{ id: string; name: string; models: { id: string; name: string }[] }[]> {
  if (modelsDevCache && Date.now() - modelsDevCache.at < 3600_000) return toProviders(modelsDevCache.data);
  const res = await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  modelsDevCache = { at: Date.now(), data };
  return toProviders(data);
}

function toProviders(data: unknown): { id: string; name: string; models: { id: string; name: string }[] }[] {
  const obj = (data ?? {}) as Record<string, { id?: string; name?: string; models?: Record<string, { id?: string; name?: string }> }>;
  return Object.values(obj)
    .map((p) => ({
      id: p.id ?? '',
      name: p.name ?? p.id ?? '',
      models: Object.values(p.models ?? {}).map((m) => ({ id: m.id ?? '', name: m.name ?? m.id ?? '' })),
    }))
    .filter((p) => p.id);
}
