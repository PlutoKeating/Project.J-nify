import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDb, type Db } from '../src/db';
import { buildSystemPromptWithDocs, buildFallbackPrompt } from '../src/services/agent-docs';
import { buildUserMemoryDoc, upsertMemory, listMemories } from '../src/services/memory';
import { runAgent } from '../src/services/agent';

const db: Db = makeDb('https://x.supabase.co', 'svc-key');

function jsonRes(body: unknown) {
  return { ok: true, json: async () => body };
}

function findCall(calls: unknown[], needle: string): string | undefined {
  return calls.map((c) => String(c)).find((u) => u.includes(needle));
}

describe('agent-docs 装配与热重载', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('按 identity → workflow → tools → custom 顺序拼接，并注入时间上下文', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/rest/v1/agent_docs')) {
        return jsonRes([
          { id: 'a', name: 'identity', kind: 'identity', content: 'ID_DOC', enabled: true, sort_order: 10, version: 1, updated_at: '' },
          { id: 'b', name: 'workflow', kind: 'workflow', content: 'WF_DOC', enabled: true, sort_order: 20, version: 1, updated_at: '' },
          { id: 'c', name: 'tools', kind: 'tools', content: 'TOOLS_DOC', enabled: true, sort_order: 30, version: 1, updated_at: '' },
          { id: 'd', name: 'my-skill', kind: 'skill', content: 'SKILL_DOC', enabled: true, sort_order: 40, version: 1, updated_at: '' },
        ]);
      }
      if (String(url).includes('/rest/v1/agent_memories')) return jsonRes([]);
      return jsonRes([]);
    });
    const prompt = await buildSystemPromptWithDocs(db, 'u1', { now: new Date('2026-08-29T10:00:00Z'), timezone: 'Asia/Shanghai' });
    expect(prompt.indexOf('ID_DOC')).toBeLessThan(prompt.indexOf('WF_DOC'));
    expect(prompt.indexOf('WF_DOC')).toBeLessThan(prompt.indexOf('TOOLS_DOC'));
    expect(prompt.indexOf('TOOLS_DOC')).toBeLessThan(prompt.indexOf('SKILL_DOC'));
    expect(prompt).toContain('今天是 2026-08-29');
    expect(prompt).toContain('用户时区：Asia/Shanghai');
    expect(prompt).not.toContain('对您的了解');
  });

  it('new_session=true 时注入用户记忆文档', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/rest/v1/agent_docs')) return jsonRes([]);
      if (String(url).includes('/rest/v1/agent_memories')) {
        return jsonRes([{ id: 'm1', user_id: 'u1', key: '称呼', memory_type: 'preference', content: '称呼我为小P', scope: 'global', salience: { level: 1 }, expires_at: null, created_at: '', updated_at: '' }]);
      }
      return jsonRes([]);
    });
    const prompt = await buildSystemPromptWithDocs(db, 'u1', { now: new Date('2026-08-29T10:00:00Z'), timezone: 'UTC', newSession: true });
    expect(prompt).toContain('对您的了解');
    expect(prompt).toContain('称呼我为小P');
  });

  it('无文档时回退兜底 prompt（v0.2.0 行为）', () => {
    const p = buildFallbackPrompt(new Date('2026-08-29T10:00:00Z'), 'Asia/Shanghai');
    expect(p).toContain('今天是 2026-08-29');
    expect(p).toContain('不得使用训练数据中的年份');
  });
});

describe('结构化记忆', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('upsert 带 key 时先查后更；编译文档按类型分区', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/rest/v1/agent_memories') && String(url).includes('key=eq.')) {
        return jsonRes([{ id: 'm1', user_id: 'u1', key: '称呼', memory_type: 'preference', content: '旧称呼', scope: 'global', salience: { level: 1 }, expires_at: null, created_at: '', updated_at: '' }]);
      }
      return jsonRes([]);
    });
    const updated = await upsertMemory(db, 'u1', { key: '称呼', memory_type: 'preference', content: '称呼我为小P' });
    expect(updated).toBeUndefined(); // 走 update 分支（mock 返回空）
    const upsertCalls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(upsertCalls.some((u) => u.includes('/rest/v1/agent_memories') && u.includes('key=eq.'))).toBe(true);

    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/rest/v1/agent_memories')) {
        return jsonRes([
          { id: '1', user_id: 'u1', key: 'a', memory_type: 'preference', content: '偏好A', scope: 'global', salience: {}, expires_at: null, created_at: '', updated_at: '' },
          { id: '2', user_id: 'u1', key: null, memory_type: 'event', content: '事件B', scope: 'global', salience: {}, expires_at: null, created_at: '', updated_at: '' },
          { id: '3', user_id: 'u1', key: null, memory_type: 'lesson', content: '经验C', scope: 'category:bill', salience: {}, expires_at: null, created_at: '', updated_at: '' },
        ]);
      }
      return jsonRes([]);
    });
    const rows = await listMemories(db, 'u1');
    expect(rows).toHaveLength(3);
    const doc = await buildUserMemoryDoc(db, 'u1');
    expect(doc).toContain('偏好A');
    expect(doc).toContain('事件B');
    expect(doc).toContain('经验C（category:bill）');
    expect(doc.indexOf('### 偏好')).toBeLessThan(doc.indexOf('### 事件'));
  });
});

describe('runAgent 历史白名单与全链路', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('过滤 system/tool 角色历史；走配置 provider 成功返回文本', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/rest/v1/system_config')) {
        return jsonRes([{
          value: {
            providers: [{ id: 'p', name: 'P', type: 'openai-compatible', baseUrl: 'https://p.test/v1', apiKeys: ['k'], models: ['m'], enabled: true }],
            order: ['p/m'],
            timeoutMs: 1000,
            maxToolIterations: 3,
          },
          version: 1,
        }]);
      }
      if (u.includes('/rest/v1/agent_docs')) return jsonRes([]);
      if (u.includes('/rest/v1/users')) return jsonRes([]);
      if (u.includes('/rest/v1/agent_memories')) return jsonRes([]);
      if (u.includes('/chat/completions')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const roles = (body.messages ?? []).map((m: { role: string }) => m.role);
        expect(roles).not.toContain('system-trick');
        return jsonRes({ choices: [{ message: { content: '记下了：不急，但我帮您盯着。', tool_calls: [] } }] });
      }
      return jsonRes([]);
    });
    const out = await runAgent(db, 'u1', '帮记一下回小明', [
      { role: 'system', content: 'system-trick' },
      { role: 'tool', content: 'tool-trick' },
      { role: 'user', content: '之前的话' },
    ], { sessionId: 's1' });
    expect(out.reply).toBe('记下了：不急，但我帮您盯着。');
    expect(out.degraded).toBe(false);
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(findCall(calls, '/rest/v1/agent_call_logs')).toBeTruthy();
  });
});
