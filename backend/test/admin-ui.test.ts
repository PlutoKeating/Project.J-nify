import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { makeApp } from '../src/app';

const env = { SUPABASE_URL: 'https://x.supabase.co' } as never;

const CATALOG = {
  providers: [
    {
      id: 'openai',
      name: 'OpenAI',
      baseUrl: null,
      models: [
        { id: 'gpt-5', name: 'GPT-5' },
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'o3', name: 'O3' },
      ],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      models: [
        { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
      ],
    },
  ],
};

interface SelectLike {
  value: string;
  options: { value: string; textContent: string }[];
}
interface InputLike {
  value: string;
  dispatchEvent(e: unknown): boolean;
}
interface ButtonLike {
  click(): void;
}

async function bootAdmin() {
  const res = await makeApp(env).request('/admin');
  const html = await res.text();
  const saved: { llm?: Record<string, unknown> } = {};

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://j-nify.williamhvollita.dpdns.org/admin',
    beforeParse(window) {
      window.fetch = (async (url: unknown, opt: RequestInit = {}) => {
        const u = String(url);
        const j = async (body: unknown) => ({ ok: true, json: async () => body });
        if (u.includes('/api/session')) return j({ authenticated: true, username: 'admin' });
        if (u.includes('/api/config/llm')) {
          if (opt.method === 'PUT') {
            saved.llm = JSON.parse(String(opt.body)) as Record<string, unknown>;
            return j({ ok: true, version: 2 });
          }
          return j({
            providers: [
              {
                id: 'openai',
                name: 'OpenAI',
                type: 'openai-compatible',
                baseUrl: 'https://api.openai.com/v1',
                apiKeys: ['sk-a', 'sk-b'],
                models: ['gpt-5'],
                enabled: true,
              },
            ],
            order: ['openai/gpt-5'],
            timeoutMs: 30000,
            maxToolIterations: 6,
          });
        }
        if (u.includes('/api/models/providers')) return j(CATALOG.providers);
        if (u.includes('/api/config/alerts')) return j({ enabled: true });
        if (u.includes('/api/metrics/closure')) return j([]);
        return j({});
      }) as typeof window.fetch;
    },
  });

  const { window } = dom;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await sleep(250);
  return { window, document: window.document, saved, sleep };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fireInput = (window: any, el: InputLike, value: string) => {
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};

describe('admin SPA LLM config UI', () => {
  it('sorts provider dropdown by name and renders key/model chips', async () => {
    const { document } = await bootAdmin();
    const sel = document.querySelector('#md-0') as unknown as SelectLike;
    expect(sel).not.toBeNull();
    const labels = [...(sel?.options ?? [])].slice(1).map((o) => o.textContent);
    expect(labels[0]).toContain('DeepSeek');
    expect(labels[1]).toContain('OpenAI');
    expect(document.querySelectorAll('#keys-0 .chip')).toHaveLength(2);
    expect(document.querySelectorAll('#models-0 .chip')).toHaveLength(1);
  });

  it('fuzzy model search filters and sorts live', async () => {
    const { document, window, sleep } = await bootAdmin();
    const search = document.querySelector('#msearch-0') as unknown as InputLike | null;
    expect(search).not.toBeNull();
    fireInput(window, search as unknown as InputLike, 'gpt');
    await sleep(50);
    const opts = [...((document.querySelector('#mdm-0') as unknown as SelectLike)?.options ?? [])]
      .slice(1)
      .map((o) => o.value);
    expect(opts).toEqual(['gpt-4o', 'gpt-5']);
  });

  it('adds/removes keys and models as chips, including manual entry', async () => {
    const { document, window, sleep } = await bootAdmin();
    const search = document.querySelector('#msearch-0') as unknown as InputLike | null;
    fireInput(window, search as unknown as InputLike, '');
    const select = document.querySelector('#mdm-0') as unknown as SelectLike;
    select!.value = 'o3';
    (window as unknown as { addModel: (i: number) => void }).addModel(0);
    await sleep(50);
    expect(document.querySelectorAll('#models-0 .chip')).toHaveLength(2);

    const search2 = document.querySelector('#msearch-0') as unknown as InputLike;
    search2!.value = 'custom-model-x';
    search2!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(50);
    expect(document.querySelectorAll('#models-0 .chip')).toHaveLength(3);

    (document.querySelector('#models-0 .chip .x') as unknown as ButtonLike).click();
    await sleep(50);
    expect(document.querySelectorAll('#models-0 .chip')).toHaveLength(2);

    const keyIn = document.querySelector('#keyIn-0') as unknown as InputLike;
    keyIn!.value = 'sk-c';
    (window as unknown as { addKey: (i: number) => void }).addKey(0);
    await sleep(50);
    expect(document.querySelectorAll('#keys-0 .chip')).toHaveLength(3);
  });

  it('order list: universe from configured models, per-item select excludes others, drag reorder, stale pruning on save', async () => {
    const { document, window, saved, sleep } = await bootAdmin();
    const app = window as unknown as {
      addOrderItem: () => void;
      addModel: (i: number) => void;
      addKey: (i: number) => void;
      dragStart: (i: number) => void;
      dragDrop: (i: number) => void;
      saveLlm: () => void;
    };

    // 配置模型：gpt-5(初始) → 追加 o3、custom-model-x → 删除 gpt-5
    const search = document.querySelector('#msearch-0') as unknown as InputLike | null;
    fireInput(window, search as unknown as InputLike, '');
    const select = document.querySelector('#mdm-0') as unknown as SelectLike;
    select!.value = 'o3';
    app.addModel(0);
    await sleep(50);
    const search2 = document.querySelector('#msearch-0') as unknown as InputLike;
    search2!.value = 'custom-model-x';
    search2!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(50);
    (document.querySelector('#models-0 .chip .x') as unknown as ButtonLike).click();
    await sleep(50);

    const addSel = document.querySelector('#orderAdd') as unknown as SelectLike;
    const universe = [...(addSel?.options ?? [])].slice(1).map((o) => o.value);
    expect(universe).toEqual(['openai/custom-model-x', 'openai/o3']);

    addSel!.value = 'openai/custom-model-x';
    app.addOrderItem();
    addSel!.value = 'openai/o3';
    app.addOrderItem();
    await sleep(50);
    const items = [...document.querySelectorAll('#orderList .dragitem')];
    expect(items).toHaveLength(3); // 1 个失效条目（gpt-5 已删）+ 2 个新条目
    expect(items[0].textContent).toContain('已不在已添加模型中');

    const firstSelect = document.querySelector('#orderList .dragitem select') as unknown as SelectLike;
    const firstOpts = [...(firstSelect?.options ?? [])].map((o) => o.value);
    expect(firstOpts).toContain('openai/custom-model-x');
    expect(firstOpts).not.toContain('openai/o3');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).event = { target: items[1] };
    app.dragStart(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).event = { target: items[2], preventDefault: () => {} };
    app.dragDrop(2);
    await sleep(50);
    const orderTexts = [...document.querySelectorAll('#orderList .dragitem select')].map((s) => (s as unknown as SelectLike).value);
    expect(orderTexts).toEqual(['openai/o3', 'openai/custom-model-x']);

    const afterDrag = [...document.querySelectorAll('#orderList .dragitem')];
    (afterDrag[2].querySelector('.x') as unknown as ButtonLike).click();
    await sleep(50);
    expect(document.querySelectorAll('#orderList .dragitem')).toHaveLength(2);

    const keyIn = document.querySelector('#keyIn-0') as unknown as InputLike;
    keyIn!.value = 'sk-c';
    app.addKey(0);
    await sleep(50);

    app.saveLlm();
    await sleep(150);
    const order = saved.llm?.order as string[];
    expect(order).toEqual(['openai/o3']);
    const prov = (saved.llm?.providers as { apiKeys: string[]; models: string[] }[])[0];
    expect(prov.apiKeys).toContain('sk-c');
    expect(prov.models).toContain('custom-model-x');
  });
});
