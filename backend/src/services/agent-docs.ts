import type { Db } from '../db';
import { restGet, restInsert, restUpdate, restDelete } from '../db';
import { buildUserMemoryDoc } from './memory';

export interface AgentDoc {
  id: string;
  name: string;
  kind: string;
  content: string;
  enabled: boolean;
  sort_order: number;
  version: number;
  updated_at: string;
}

interface DocRow {
  id: string;
  name: string;
  kind: string;
  content: string;
  enabled: boolean;
  sort_order: number;
  version: number;
  updated_at: string;
}

const CACHE_TTL_MS = 15_000;
let cache: { at: number; docs: AgentDoc[] } | null = null;

/** admin 保存文档后显式失效，下一次请求立即重建 prompt（保存即热重载）。 */
export function invalidateAgentDocs(): void {
  cache = null;
}

export async function listAgentDocs(db: Db): Promise<AgentDoc[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.docs;
  const rows = await restGet<DocRow>(db, 'agent_docs', {
    select: 'id,name,kind,content,enabled,sort_order,version,updated_at',
    order: 'sort_order.asc',
  });
  const docs = rows.map(toDoc);
  cache = { at: Date.now(), docs };
  return docs;
}

export async function getEnabledDocs(db: Db): Promise<AgentDoc[]> {
  const all = await listAgentDocs(db);
  return all.filter((d) => d.enabled);
}

function toDoc(r: DocRow): AgentDoc {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    content: r.content,
    enabled: r.enabled,
    sort_order: r.sort_order,
    version: r.version,
    updated_at: r.updated_at,
  };
}

export async function upsertAgentDoc(
  db: Db,
  input: { id?: string; name: string; kind?: string; content: string; enabled?: boolean; sort_order?: number },
): Promise<AgentDoc> {
  const kind = input.kind ?? 'custom';
  const enabled = input.enabled ?? true;
  const sortOrder = input.sort_order ?? 0;
  if (input.id) {
    const current = await restGet<{ version: number }>(db, 'agent_docs', {
      select: 'version',
      params: { id: input.id },
      limit: 1,
    });
    if (!current[0]) throw new Error('doc not found');
    const rows = await restUpdate<DocRow>(
      db,
      'agent_docs',
      { id: input.id },
      {
        name: input.name,
        kind,
        content: input.content,
        enabled,
        sort_order: sortOrder,
        version: Number(current[0].version ?? 0) + 1,
      },
    );
    invalidateAgentDocs();
    if (!rows[0]) throw new Error('doc not found');
    return toDoc(rows[0]);
  }
  const [row] = await restInsert<DocRow>(db, 'agent_docs', {
    name: input.name,
    kind,
    content: input.content,
    enabled,
    sort_order: sortOrder,
    version: 1,
  });
  invalidateAgentDocs();
  return toDoc(row);
}

export async function deleteAgentDoc(db: Db, id: string): Promise<boolean> {
  const rows = await restGet<{ id: string }>(db, 'agent_docs', { select: 'id', params: { id }, limit: 1 });
  if (!rows[0]) return false;
  await restDelete(db, 'agent_docs', { id });
  invalidateAgentDocs();
  return true;
}

export async function reorderAgentDocs(db: Db, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    await restUpdate(db, 'agent_docs', { id: ids[i] }, { sort_order: i * 10 });
  }
  invalidateAgentDocs();
}

/**
 * 装配 system prompt：官方文档集（identity → workflow → tools → 自定义/skill 按 sort_order）
 * + 当前时间上下文 + （新会话时）用户记忆文档。
 */
export async function buildSystemPromptWithDocs(
  db: Db,
  userId: string,
  opts: { now?: Date; timezone?: string; newSession?: boolean } = {},
): Promise<string> {
  const docs = await getEnabledDocs(db);
  const parts = docs.map((d) => d.content.trim());
  if (!parts.length) {
    return buildFallbackPrompt(opts.now ?? new Date(), opts.timezone ?? 'UTC');
  }
  const now = opts.now ?? new Date();
  const tz = opts.timezone ?? 'UTC';
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  parts.push(
    `【当前时间上下文】今天是 ${date}（用户时区：${tz}）。涉及"今天/明天/这周/月底"等相对时间表达时，必须以上述当前日期为准计算具体日期，不得使用训练数据中的年份。`,
  );
  if (opts.newSession) {
    const memoryDoc = await buildUserMemoryDoc(db, userId);
    if (memoryDoc.trim()) {
      parts.push(`【当前用户的 Jennifer 偏好与持久记忆文档】\n${memoryDoc.trim()}`);
    }
  }
  return parts.join('\n\n');
}

/** 无文档配置时的兜底 prompt（与 v0.2.0 常量等价，保证行为不回退）。 */
export function buildFallbackPrompt(now: Date, timezone: string): string {
  const base = `你是 Jennifer，J-nify 的低打扰行动秘书，一位懂 P 人的 J 人助理。品牌口号：「不急，但我帮您盯着。」

行为准则：
1. 不命令、不羞辱：绝不使用"你必须""你又拖了"等表达；永远给理由、给退路。
2. 每次出现都要能回答"为什么是现在"；没有真实信号依据时，不得编造理由。
3. 让下一步足够小（30 秒—15 分钟），并永远提供体面出口：现在做 / 晚点，换个窗口 / 这件事算了 / 帮我兜底。
4. 涉及真实动作（付款、外发消息、下单等）时，必须二次确认后才能执行；你只能生成草稿与清单。
5. 提醒节奏、冷却时长、窗口理由、兜底方式由你自主决定并通过工具管理；系统不强制模板。

你可以使用工具对用户的事项进行完整的增删改查与统筹管理。请用简体中文回复，简洁、像秘书而非机器人。`;
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${base}

【当前时间上下文】今天是 ${date}（用户时区：${timezone}）。涉及"今天/明天/这周/月底"等相对时间表达时，必须以上述当前日期为准计算具体日期，不得使用训练数据中的年份。`;
}
