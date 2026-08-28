import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callLlmWithConfig, normalizeLlmConfig, type LlmConfig, type LlmProviderConfig } from '../src/lib/llm';

function provider(partial: Partial<LlmProviderConfig> & { id: string }): LlmProviderConfig {
  return { name: partial.id, type: 'openai-compatible', baseUrl: 'https://api.x.test/v1', apiKeys: [], models: [], enabled: true, ...partial };
}

const okRes = (model: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: `ok:${model}`, tool_calls: [] } }] }),
});
const errRes = () => ({ ok: false, status: 500, text: async () => 'boom' });

describe('normalizeLlmConfig', () => {
  it('keeps disabled providers in config (enabled flag preserved)', () => {
    const cfg = normalizeLlmConfig({ providers: [{ id: 'a', baseUrl: 'https://a', enabled: false }] });
    expect(cfg.providers).toHaveLength(1);
    expect(cfg.providers[0].enabled).toBe(false);
  });

  it('accepts composite provider/model order entries and drops invalid ones', () => {
    const cfg = normalizeLlmConfig({
      providers: [
        { id: 'a', baseUrl: 'https://a', models: ['m1'] },
        { id: 'b', baseUrl: 'https://b', models: ['m2', 'm3'] },
      ],
      order: ['a/m1', 'b/m3', 'b/nope', 'zzz/m1', 'plain'],
    });
    expect(cfg.order).toEqual(['a/m1', 'b/m3']);
  });

  it('keeps legacy plain provider id order entries', () => {
    const cfg = normalizeLlmConfig({ providers: [{ id: 'a', baseUrl: 'https://a', models: [] }], order: ['a'] });
    expect(cfg.order).toEqual(['a']);
  });
});

describe('callLlmWithConfig', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tries order entries in sequence and falls back to the next one', async () => {
    fetchMock
      .mockResolvedValueOnce(errRes() as never)
      .mockResolvedValueOnce(okRes('m2') as never);
    const cfg: LlmConfig = {
      providers: [
        provider({ id: 'p1', baseUrl: 'https://p1.test/v1', models: ['m1'], apiKeys: ['k1'] }),
        provider({ id: 'p2', baseUrl: 'https://p2.test/v1', models: ['m2'], apiKeys: ['k2'] }),
      ],
      order: ['p1/m1', 'p2/m2'],
      timeoutMs: 1000,
      maxToolIterations: 3,
    };
    const result = await callLlmWithConfig(cfg, [{ role: 'user', content: 'hi' }], []);
    expect(result.model).toBe('m2');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe('https://p1.test/v1/chat/completions');
    expect(urls[1]).toBe('https://p2.test/v1/chat/completions');
  });

  it('rotates api keys within an entry before failing over', async () => {
    fetchMock
      .mockResolvedValueOnce(errRes() as never)
      .mockResolvedValueOnce(okRes('m1') as never);
    const cfg: LlmConfig = {
      providers: [provider({ id: 'p1', baseUrl: 'https://p1.test/v1', models: ['m1'], apiKeys: ['k1', 'k2'] })],
      order: ['p1/m1'],
      timeoutMs: 1000,
      maxToolIterations: 3,
    };
    const result = await callLlmWithConfig(cfg, [], []);
    expect(result.model).toBe('m1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips disabled providers', async () => {
    fetchMock.mockResolvedValue(okRes('m1') as never);
    const cfg: LlmConfig = {
      providers: [provider({ id: 'p1', baseUrl: 'https://p1.test/v1', models: ['m1'], enabled: false })],
      order: ['p1/m1'],
      timeoutMs: 1000,
      maxToolIterations: 3,
    };
    await expect(callLlmWithConfig(cfg, [], [])).rejects.toThrow(/all LLM providers failed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws with entry detail when all entries fail', async () => {
    fetchMock.mockResolvedValue(errRes() as never);
    const cfg: LlmConfig = {
      providers: [provider({ id: 'p1', baseUrl: 'https://p1.test/v1', models: ['m1'], apiKeys: ['k1'] })],
      order: ['p1/m1'],
      timeoutMs: 1000,
      maxToolIterations: 3,
    };
    await expect(callLlmWithConfig(cfg, [], [])).rejects.toThrow(/p1\/m1/);
  });
});
