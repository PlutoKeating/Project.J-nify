import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { runAgent, revertAction, type AgentEvent } from '../services/agent';

export const jennifer = new Hono<AppEnv>();

interface ChatBody {
  message?: string;
  history?: { role: string; content: unknown }[];
  context?: Record<string, unknown>;
  session_id?: string;
  new_session?: boolean;
  stream?: boolean;
}

/** 把 agent 事件转成 SSE 帧并写入 ReadableStream。 */
function sseResponse(handler: (emit: (event: AgentEvent) => void) => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const queue: string[] = [];
  let settled = false;
  let failure: Error | null = null;

  const emit = (event: AgentEvent) => {
    queue.push(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      handler(emit)
        .then(() => {
          settled = true;
        })
        .catch((e: Error) => {
          failure = e;
          settled = true;
        });
      while (!settled || queue.length > 0) {
        if (queue.length > 0) {
          controller.enqueue(encoder.encode(queue.shift()));
          continue;
        }
        if (settled) break;
        await new Promise((r) => setTimeout(r, 8));
      }
      if (failure) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ detail: failure.message })}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

jennifer.post('/chat', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<ChatBody>().catch(() => ({} as ChatBody));
  const message = body.message?.trim();
  if (!message) return c.json({ detail: 'message is required' }, 422);

  const opts = {
    context: body.context && typeof body.context === 'object' ? body.context : undefined,
    sessionId: typeof body.session_id === 'string' && body.session_id ? body.session_id : undefined,
    newSession: body.new_session === true,
    history: body.history,
  };

  if (body.stream === true) {
    return sseResponse((emit) => {
      return runAgent(db, userId, message, opts.history, { ...opts, stream: true, emit });
    });
  }
  const out = await runAgent(db, userId, message, opts.history, opts);
  return c.json(out);
});

/** 一键撤销 agent 数据改动（活跃会话内卡片入口；24h 保留期）。 */
jennifer.post('/undo', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json<{ action_id?: string }>().catch(() => ({} as { action_id?: string }));
  const actionId = body.action_id?.trim();
  if (!actionId) return c.json({ detail: 'action_id is required' }, 422);
  const out = await revertAction(db, userId, actionId);
  if (!out.ok) return c.json({ detail: out.message ?? 'undo failed' }, 400);
  return c.json({ ok: true, tool: out.tool });
});
