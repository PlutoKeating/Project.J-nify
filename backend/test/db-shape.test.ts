import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeDb, restGet, restInsert, restUpdate, restDelete, restRpc, robustGuardrails, latestContext } from '../src/db';

describe('REST db layer shape', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('makeDb requires JNIFY_DATA_URL + JNIFY_DATA_KEY and normalizes trailing slash', () => {
    expect(() => makeDb('', 'k')).toThrow();
    expect(() => makeDb('https://data.example', '')).toThrow();
    const db = makeDb('https://data.example/', 'k');
    expect(db).toEqual({ url: 'https://data.example', key: 'k' });
  });

  it('sends the service key as a Bearer token to /rest/v1', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await restGet(makeDb('https://data.example', 'svc'), 'users', { select: 'id', params: { id: 'u' } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://data.example/rest/v1/users?select=id&id=eq.u');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer svc' });
  });

  it('helpers are fetch-based functions with expected arity', () => {
    expect(restGet.length).toBe(2);
    expect(restInsert.length).toBe(3);
    expect(restUpdate.length).toBe(4);
    expect(restDelete.length).toBe(3);
    expect(restRpc.length).toBe(3);
    expect(robustGuardrails.length).toBe(2);
    expect(latestContext.length).toBe(2);
  });

  it('restInsert sends PostgREST on_conflict as a query parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await restInsert(
      makeDb('https://data.example', 'k'),
      'user_preferences',
      { user_id: 'u', scene: 'guardrails', key: 'quiet_hours_start', value: '23:30' },
      { onConflict: 'user_id,scene,key' },
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('on_conflict=user_id%2Cscene%2Ckey');
    expect(init.headers).toMatchObject({ Prefer: 'resolution=merge-duplicates,return=representation' });
    expect(init.headers).not.toHaveProperty('on-conflict');
  });
});
