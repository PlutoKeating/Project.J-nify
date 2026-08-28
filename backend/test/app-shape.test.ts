import { describe, expect, it } from 'vitest';
import { makeApp } from '../src/app';

const env = { SUPABASE_URL: 'https://x.supabase.co', DATABASE_URL: '' } as never;

describe('app assembly', () => {
  it('GET /v1/now without token returns 401', async () => {
    const res = await makeApp(env).request('/v1/now');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'unauthorized' });
  });

  it('unknown route returns 404 with detail', async () => {
    const res = await makeApp(env).request('/nope');
    expect(res.status).toBe(404);
    expect((await res.json()) as Record<string, unknown>).toHaveProperty('detail');
  });

  it('GET /health returns ok', async () => {
    const res = await makeApp(env).request('/health');
    expect(res.status).toBe(200);
  });

  it('admin SPA contains models.dev pick / fuzzy model search / chip list / draggable order', async () => {
    const res = await makeApp(env).request('/admin');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('选择 models.dev 供应商');
    expect(html).toContain('pickProvider');
    expect(html).toContain('fuzzyModels');
    expect(html).toContain('removeKey');
    expect(html).toContain('removeModel');
    expect(html).toContain('orderList');
    expect(html).toContain('dragDrop');
  });
});
