import type { Db } from '../db';
import { restGet, restInsert, restUpdate, restDelete } from '../db';

export const MEMORY_TYPES = ['preference', 'fact', 'event', 'lesson'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface AgentMemory {
  id: string;
  user_id: string;
  key: string | null;
  memory_type: MemoryType | string;
  content: string;
  scope: string;
  salience: { level?: number } | Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MemoryRow {
  id: string;
  user_id: string;
  key: string | null;
  memory_type: string;
  content: string;
  scope: string;
  salience: { level?: number } | Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listMemories(
  db: Db,
  userId: string,
  filter: { type?: string; key?: string; scope?: string } = {},
): Promise<AgentMemory[]> {
  const params: Record<string, unknown> = { user_id: userId };
  if (filter.type) params.memory_type = filter.type;
  if (filter.key) params.key = filter.key;
  if (filter.scope) params.scope = filter.scope;
  const rows = await restGet<MemoryRow>(db, 'agent_memories', {
    select: 'id,user_id,key,memory_type,content,scope,salience,expires_at,created_at,updated_at',
    params,
    order: 'updated_at.desc',
    limit: 200,
  });
  return rows;
}

export async function upsertMemory(
  db: Db,
  userId: string,
  input: {
    key?: string | null;
    memory_type?: string;
    content: string;
    scope?: string;
    salience?: { level?: number } | null;
    expires_at?: string | null;
  },
): Promise<AgentMemory> {
  const type = MEMORY_TYPES.includes(input.memory_type as MemoryType) ? input.memory_type! : 'fact';
  const content = String(input.content ?? '').trim();
  if (!content) throw new Error('content is required');
  const key = input.key ? String(input.key).trim() : null;
  const scope = input.scope ? String(input.scope) : 'global';
  const salience = input.salience ?? { level: 1 };
  const expiresAt = input.expires_at ?? null;

  if (key) {
    // PostgREST upsert 无法表达 "unique index where key is not null"；
    // 先查再插/更，保持稳定键语义。
    const existing = await listMemories(db, userId, { key });
    if (existing[0]) {
      const [row] = await restUpdate<MemoryRow>(
        db,
        'agent_memories',
        { id: existing[0].id, user_id: userId },
        { memory_type: type, content, scope, salience, expires_at: expiresAt },
      );
      return row;
    }
  }
  const [row] = await restInsert<MemoryRow>(db, 'agent_memories', {
    user_id: userId,
    key,
    memory_type: type,
    content,
    scope,
    salience,
    expires_at: expiresAt,
  });
  return row;
}

export async function deleteMemory(
  db: Db,
  userId: string,
  target: { id?: string; key?: string },
): Promise<AgentMemory | null> {
  const existing = target.id
    ? await restGet<MemoryRow>(db, 'agent_memories', {
        select: 'id,user_id,key,memory_type,content,scope,salience,expires_at,created_at,updated_at',
        params: { id: target.id, user_id: userId },
        limit: 1,
      })
    : await listMemories(db, userId, { key: target.key });
  const row = existing[0];
  if (!row) return null;
  await restDelete(db, 'agent_memories', { id: row.id, user_id: userId });
  return row;
}

/** 把用户的结构化记忆编译为「用户记忆文档」（新会话注入 system prompt）。 */
export async function buildUserMemoryDoc(db: Db, userId: string): Promise<string> {
  const rows = await listMemories(db, userId);
  if (!rows.length) return '';
  const byType: Record<string, AgentMemory[]> = { preference: [], fact: [], event: [], lesson: [] };
  for (const r of rows) {
    if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) continue;
    const t = MEMORY_TYPES.includes(r.memory_type as MemoryType) ? r.memory_type : 'fact';
    (byType[t] ?? (byType[t] = [])).push(r);
  }
  const typeLabel: Record<string, string> = {
    preference: '偏好',
    fact: '事实',
    event: '事件',
    lesson: '经验',
  };
  const out: string[] = ['## Jennifer 对您的了解'];
  for (const t of ['preference', 'fact', 'event', 'lesson'] as const) {
    const list = byType[t];
    if (!list.length) continue;
    out.push(`### ${typeLabel[t]}`);
    for (const m of list.slice(0, 50)) {
      const prefix = m.scope && m.scope !== 'global' ? `（${m.scope}）` : '';
      out.push(`- ${m.content}${prefix}`);
    }
  }
  return out.join('\n');
}
