import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listModelProviders, resetModelsDevCacheForTests } from '../src/lib/llm';

const SAMPLE = {
  providerA: {
    id: 'providerA',
    name: 'Provider A',
    api: 'https://api.a.example.com/v1/',
    models: { 'a/m1': { id: 'a/m1', name: 'M1' } },
  },
  providerB: { id: 'providerB', name: 'Provider B', api: null, models: {} },
  providerC: {
    id: 'providerC',
    name: 'Provider C',
    api: 'https://api.c.example.com/accounts/${ACCOUNT_ID}/v1',
    models: {},
  },
  noId: { name: 'No ID', api: 'https://nope.example.com', models: {} },
};

const fetchMock = vi.fn();

describe('models.dev provider catalog', () => {
  beforeEach(() => {
    resetModelsDevCacheForTests();
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => SAMPLE } as never);
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('derives baseUrl from api field and strips trailing slash', async () => {
    const list = await listModelProviders();
    expect(list.find((x) => x.id === 'providerA')?.baseUrl).toBe('https://api.a.example.com/v1');
  });

  it('returns null baseUrl when api is missing or has placeholder', async () => {
    const list = await listModelProviders();
    expect(list.find((x) => x.id === 'providerB')?.baseUrl).toBeNull();
    expect(list.find((x) => x.id === 'providerC')?.baseUrl).toBeNull();
  });

  it('flattens model map into id/name list', async () => {
    const list = await listModelProviders();
    expect(list.find((x) => x.id === 'providerA')?.models).toEqual([{ id: 'a/m1', name: 'M1' }]);
  });

  it('drops providers without id', async () => {
    const list = await listModelProviders();
    expect(list.some((x) => x.id === 'noId')).toBe(false);
  });

  it('reuses the in-memory cache for one hour', async () => {
    await listModelProviders();
    await listModelProviders();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
