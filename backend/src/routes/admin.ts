import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { restGet, restDelete, makeDb } from '../db';
import { getConfig, putConfig, invalidateConfig } from '../lib/config-store';
import { constantTimeEq, createSessionToken, verifySessionToken, setAdminCookie, clearAdminCookie, requireAdmin } from '../lib/admin-auth';
import { listModelProviders } from '../lib/llm';
import { DEFAULT_ALERT_CONFIG, sendGitHubIssue, sendSmtpMail, type AlertConfig } from '../lib/alerts';
import { listAgentDocs, upsertAgentDoc, deleteAgentDoc, reorderAgentDocs, buildSystemPromptWithDocs } from '../services/agent-docs';
import { listMemories } from '../services/memory';
import { runAgent } from '../services/agent';

export const admin = new Hono<AppEnv>();

// ---- 鉴权中间件（/admin/api/*） ----
admin.use('/api/*', async (c, next) => {
  // 登录/登出放行（登录无 cookie 必然 401；登出仅需清 cookie）
  if (c.req.path.endsWith('/api/login') || c.req.path.endsWith('/api/logout')) return next();
  const okAdmin = await requireAdmin(c);
  if (!okAdmin) return c.json({ detail: 'unauthorized' }, 401);
  // /admin 不在 /v1/* 的 db 注入中间件内，此处自行注入（admin 路由不触网 DB 时无需）
  c.set('db', makeDb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY));
  await next();
});

// ---- 会话 ----
admin.post('/api/login', async (c) => {
  const env = c.env;
  const body = await c.req.json<{ username?: string; password?: string }>();
  const username = body.username ?? '';
  const password = body.password ?? '';
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return c.json({ detail: 'admin not configured (ADMIN_USERNAME/ADMIN_PASSWORD/SESSION_SECRET)' }, 503);
  }
  if (constantTimeEq(username, env.ADMIN_USERNAME) && constantTimeEq(password, env.ADMIN_PASSWORD)) {
    const token = await createSessionToken(env.SESSION_SECRET, username);
    setAdminCookie(c, token);
    return c.json({ ok: true });
  }
  return c.json({ detail: 'invalid credentials' }, 401);
});

admin.post('/api/logout', (c) => {
  clearAdminCookie(c);
  return c.json({ ok: true });
});

admin.get('/api/session', async (c) => {
  const secret = c.env.SESSION_SECRET;
  const cookie = (c.req.raw.headers.get('cookie') ?? '').match(/jnify_admin=([^;]+)/)?.[1];
  if (!secret || !cookie) return c.json({ authenticated: false });
  const username = await verifySessionToken(secret, cookie);
  return c.json({ authenticated: username !== null, username });
});

// ---- LLM 配置（热加载） ----
admin.get('/api/config/llm', async (c) => {
  const { value } = await getConfig(c.get('db'), 'llm', { providers: [], order: [], timeoutMs: 30000, maxToolIterations: 6 });
  return c.json(value);
});

admin.put('/api/config/llm', async (c) => {
  const db = c.get('db');
  const body = await c.req.json<Record<string, unknown>>();
  const providers = Array.isArray(body.providers) ? body.providers : [];
  const normalized = {
    providers,
    order: Array.isArray(body.order) ? body.order : providers.map((p) => (p as { id?: string }).id ?? ''),
    timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : 30000,
    maxToolIterations: typeof body.maxToolIterations === 'number' ? body.maxToolIterations : 6,
  };
  const { version } = await putConfig(db, 'llm', normalized);
  invalidateConfig('llm');
  return c.json({ ok: true, version });
});

// ---- models.dev 动态模型列表 ----
admin.get('/api/models/providers', async (c) => {
  try {
    return c.json(await listModelProviders());
  } catch (e) {
    return c.json({ detail: (e as Error).message }, 502);
  }
});

admin.get('/api/models/provider/:id', async (c) => {
  try {
    const providers = await listModelProviders();
    const p = providers.find((x) => x.id === c.req.param('id'));
    if (!p) return c.json({ detail: 'provider not found' }, 404);
    return c.json(p);
  } catch (e) {
    return c.json({ detail: (e as Error).message }, 502);
  }
});

// ---- 告警配置 ----
admin.get('/api/config/alerts', async (c) => {
  const { value } = await getConfig(c.get('db'), 'alerts', DEFAULT_ALERT_CONFIG);
  return c.json(value);
});

admin.put('/api/config/alerts', async (c) => {
  const db = c.get('db');
  const body = await c.req.json<Partial<AlertConfig>>();
  const { value } = await getConfig(db, 'alerts', DEFAULT_ALERT_CONFIG);
  const merged: AlertConfig = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : (value as AlertConfig).enabled,
    complaintRateThreshold: Number.isFinite(Number(body.complaintRateThreshold)) ? Number(body.complaintRateThreshold) : (value as AlertConfig).complaintRateThreshold,
    degradationRateThreshold: Number.isFinite(Number(body.degradationRateThreshold)) ? Number(body.degradationRateThreshold) : (value as AlertConfig).degradationRateThreshold,
    toEmail: typeof body.toEmail === 'string' && body.toEmail ? body.toEmail : (value as AlertConfig).toEmail,
  };
  const { version } = await putConfig(db, 'alerts', merged);
  invalidateConfig('alerts');
  return c.json({ ok: true, version });
});

admin.post('/api/alerts/test', async (c) => {
  const env = c.env;
  const body = await c.req.json<{ channel?: 'github' | 'email' | 'both' }>().catch((): { channel?: 'github' | 'email' | 'both' } => ({}));
  const channel = body.channel ?? 'both';
  const title = '[J-nify 告警测试] 配置验证';
  const content = '这是一条来自 admin 面板的测试告警。若您收到本条消息，说明告警通道配置正确。';
  const results: Record<string, boolean> = {};
  if (channel === 'github' || channel === 'both') results.github = await sendGitHubIssue(env, title, content);
  if (channel === 'email' || channel === 'both') {
    const { value } = await getConfig(c.get('db'), 'alerts', DEFAULT_ALERT_CONFIG);
    results.email = await sendSmtpMail(env, (value as AlertConfig).toEmail || 'j_nify@yeah.net', title, `<p>${content}</p>`);
  }
  return c.json({ ok: true, results });
});

// ---- 指标看板 ----
admin.get('/api/metrics/closure', async (c) => {
  const days = Number(c.req.query('days') ?? 14);
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const rows = await restGet(c.get('db'), 'v_closure_rate', {
    params: { day: `gte.${since}` },
    order: 'day.desc',
    limit: 90,
  });
  return c.json(rows);
});

// ---- Jennifer 官方文档集（保存即热重载） ----
admin.get('/api/docs', async (c) => {
  return c.json(await listAgentDocs(c.get('db')));
});

admin.post('/api/docs', async (c) => {
  const body = await c.req.json<{ name?: string; kind?: string; content?: string; enabled?: boolean; sort_order?: number }>();
  const name = body.name?.trim();
  const content = body.content?.trim();
  if (!name || !content) return c.json({ detail: 'name and content are required' }, 422);
  const doc = await upsertAgentDoc(c.get('db'), { name, kind: body.kind, content, enabled: body.enabled, sort_order: body.sort_order });
  return c.json(doc);
});

admin.put('/api/docs/reorder', async (c) => {
  const body = await c.req.json<{ ids?: string[] }>().catch(() => ({ ids: [] }));
  if (!Array.isArray(body.ids)) return c.json({ detail: 'ids required' }, 422);
  await reorderAgentDocs(c.get('db'), body.ids);
  return c.json({ ok: true });
});

admin.put('/api/docs/:id', async (c) => {
  const body = await c.req.json<{ name?: string; kind?: string; content?: string; enabled?: boolean; sort_order?: number }>();
  const id = c.req.param('id');
  const name = body.name?.trim();
  const content = body.content?.trim();
  if (!name || !content) return c.json({ detail: 'name and content are required' }, 422);
  try {
    const doc = await upsertAgentDoc(c.get('db'), { id, name, kind: body.kind, content, enabled: body.enabled, sort_order: body.sort_order });
    return c.json(doc);
  } catch {
    return c.json({ detail: 'doc not found' }, 404);
  }
});

admin.delete('/api/docs/:id', async (c) => {
  const okDoc = await deleteAgentDoc(c.get('db'), c.req.param('id'));
  if (!okDoc) return c.json({ detail: 'doc not found' }, 404);
  return c.json({ ok: true });
});

// ---- 用户记忆管理（查看/删除；不提供编辑） ----
admin.get('/api/memories', async (c) => {
  const userId = c.req.query('user_id');
  if (!userId) return c.json({ detail: 'user_id is required' }, 422);
  return c.json(await listMemories(c.get('db'), userId));
});

admin.delete('/api/memories/:id', async (c) => {
  const db = c.get('db');
  const rows = await restGet<{ id: string }>(db, 'agent_memories', { select: 'id', params: { id: c.req.param('id') }, limit: 1 });
  if (!rows[0]) return c.json({ detail: 'memory not found' }, 404);
  await restDelete(db, 'agent_memories', { id: c.req.param('id') });
  return c.json({ ok: true });
});

// ---- LLM playground（prompt 装配预览 + 工具链 + 耗时） ----
admin.post('/api/playground', async (c) => {
  const db = c.get('db');
  const body = await c.req.json<{ message?: string; context?: Record<string, unknown>; new_session?: boolean; history?: { role: string; content: unknown }[] }>();
  const message = body.message?.trim();
  if (!message) return c.json({ detail: 'message is required' }, 422);
  const tz = 'UTC';
  const systemPrompt = await buildSystemPromptWithDocs(db, '00000000-0000-0000-0000-000000000000', {
    newSession: body.new_session === true,
    timezone: tz,
  });
  const startedAt = Date.now();
  const out = await runAgent(db, '00000000-0000-0000-0000-000000000000', message, body.history ?? [], {
    context: body.context,
    newSession: body.new_session === true,
  });
  return c.json({
    systemPrompt,
    promptTokens: Math.ceil(systemPrompt.length / 4),
    latencyMs: Date.now() - startedAt,
    reply: out.reply,
    toolResults: out.toolResults,
    degraded: out.degraded,
  });
});

// ---- 成本/降级看板（agent_call_logs 聚合） ----
admin.get('/api/costs', async (c) => {
  const days = Number(c.req.query('days') ?? 7);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = await restGet<{
    created_at: string;
    provider: string | null;
    model: string | null;
    ok: boolean;
    degraded: boolean;
    latency_ms: number | null;
    total_tokens: number | null;
  }>(c.get('db'), 'agent_call_logs', {
    select: 'created_at,provider,model,ok,degraded,latency_ms,total_tokens',
    params: { created_at: `gt.${since}` },
    order: 'created_at.desc',
    limit: 5000,
  });
  const byKey = new Map<string, {
    day: string; provider: string; model: string; calls: number; ok: number; degraded: number;
    latencySum: number; tokensSum: number;
  }>();
  for (const r of rows) {
    const day = (r.created_at ?? '').slice(0, 10);
    const provider = r.provider ?? 'unknown';
    const model = r.model ?? 'unknown';
    const key = `${day}|${provider}|${model}`;
    const cur = byKey.get(key) ?? { day, provider, model, calls: 0, ok: 0, degraded: 0, latencySum: 0, tokensSum: 0 };
    cur.calls += 1;
    if (r.ok) cur.ok += 1;
    if (r.degraded) cur.degraded += 1;
    cur.latencySum += r.latency_ms ?? 0;
    cur.tokensSum += r.total_tokens ?? 0;
    byKey.set(key, cur);
  }
  return c.json([...byKey.values()]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .map((x) => ({
      day: x.day,
      provider: x.provider,
      model: x.model,
      calls: x.calls,
      ok_rate: x.calls ? Number((x.ok / x.calls).toFixed(3)) : 0,
      degraded_rate: x.calls ? Number((x.degraded / x.calls).toFixed(3)) : 0,
      avg_latency_ms: x.calls ? Math.round(x.latencySum / x.calls) : 0,
      total_tokens: x.tokensSum,
    })));
});

// ---- 管理页 SPA ----
const SPA = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>J-nify Admin</title><style>
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#F7F7F4;color:#17171A;margin:0;padding:24px;max-width:960px;margin:0 auto}
h1{font-size:22px}.card{background:#fff;border:1px solid #E8E8E3;border-radius:16px;padding:16px 20px;margin:16px 0}
h2{font-size:18px;margin:0}h3{font-size:15px;margin:18px 0 4px}
label{display:block;font-size:13px;color:#76767D;margin:10px 0 4px}input,select,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #E8E8E3;border-radius:8px;font-size:14px}
button{background:#FF5A4E;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer;margin:8px 8px 0 0}
button.ghost{background:#fff;color:#17171A;border:1px solid #E8E8E3}
button.mini{padding:6px 12px;margin:0}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}.muted{color:#76767D;font-size:12px}
.chips{margin:4px 0 8px;display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:6px;background:#F2F2ED;border:1px solid #E8E8E3;border-radius:999px;padding:4px 10px;font-size:13px;max-width:100%}
.chip .k{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.chip .x{background:none;border:0;color:#76767D;font-size:15px;line-height:1;cursor:pointer;padding:0 2px}
.chip .x:hover{color:#d33}
.addrow{display:flex;gap:8px;align-items:center;margin-top:4px}.addrow input{flex:2}.addrow select{flex:3}
.draglist{list-style:none;padding:0;margin:6px 0}
.dragitem{display:flex;align-items:center;gap:8px;border:1px solid #E8E8E3;border-radius:8px;padding:6px 10px;margin:6px 0;background:#fff}
.dragitem.dragging{opacity:.45;border-style:dashed}
.handle{color:#B8B8B0;cursor:grab;font-size:16px;user-select:none}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #E8E8E3;padding:8px;text-align:left}
pre{background:#17171A;color:#cfc;padding:12px;border-radius:8px;overflow:auto;font-size:12px}
</style></head><body>
<h1>J-nify Admin</h1>
<div id="login" class="card" style="display:none">
  <label>用户名</label><input id="u" autocomplete="username">
  <label>密码</label><input id="p" type="password" autocomplete="current-password">
  <button onclick="login()">登录</button><span id="err" class="muted" style="color:#d33"></span>
</div>
<div id="app" style="display:none">
  <div class="card"><h2>LLM 配置（多 provider · 热加载）</h2>
    <div id="providers"></div>
    <button class="ghost" onclick="addProvider()">+ 添加 provider</button><span id="mdStatus" class="muted"></span>
    <h3>模型尝试顺序（providerID/modelID · 按序故障切换 · 可拖拽排序）</h3>
    <ul id="orderList" class="draglist"></ul>
    <div class="addrow"><select id="orderAdd"><option value="">— 添加 providerID/modelID —</option></select><button class="ghost mini" onclick="addOrderItem()">＋ 添加</button></div>
    <div class="row" style="margin-top:12px">
      <div><label>超时（ms）</label><input id="timeoutMs" type="number"></div>
      <div><label>最大工具迭代数</label><input id="maxIters" type="number"></div>
    </div>
    <br><button onclick="saveLlm()">保存 LLM 配置（立即生效）</button><span id="llmMsg" class="muted"></span>
  </div>
  <div class="card"><h2>告警配置</h2>
    <label>启用 <input id="alertsEnabled" type="checkbox" style="width:auto"></label>
    <label>投诉率阈值（0-1）</label><input id="complaintRate" type="number" step="0.01">
    <label>降级率阈值（0-1）</label><input id="degradationRate" type="number" step="0.01">
    <label>收件邮箱</label><input id="toEmail">
    <br><button onclick="saveAlerts()">保存告警配置</button>
    <button class="ghost" onclick="testAlerts()">发送测试告警</button><span id="alertMsg" class="muted"></span>
  </div>
  <div class="card"><h2>指标看板 · 闭环率（72h 内）</h2>
    <label>最近天数</label><input id="days" type="number" value="14" style="width:120px">
    <button class="ghost" onclick="loadMetrics()">刷新</button>
    <div id="metrics"></div>
  </div>
  <div class="card"><h2>Jennifer 文档集（identity / workflow / tools · 保存即热重载）</h2>
    <div id="docs"></div>
    <h3>新建文档（可粘贴任何 skill / md 内容）</h3>
    <div class="row"><input id="docName" placeholder="文档名（如 my-skill）"><select id="docKind">
      <option value="custom">custom</option><option value="skill">skill</option><option value="identity">identity</option><option value="workflow">workflow</option><option value="tools">tools</option>
    </select></div>
    <textarea id="docContent" rows="6" placeholder="Markdown 内容"></textarea>
    <button class="ghost" onclick="addDoc()">新建文档（保存即生效）</button><span id="docMsg" class="muted"></span>
  </div>
  <div class="card"><h2>用户记忆（查看/删除）</h2>
    <div class="row"><input id="memUserId" placeholder="用户 id (uuid)"><button class="ghost" onclick="loadMemories()">加载</button></div>
    <div id="memories"></div>
  </div>
  <div class="card"><h2>LLM Playground（prompt 装配 + 工具链）</h2>
    <label>消息</label><input id="pgMsg" placeholder="对 Jennifer 说点什么">
    <label>context（可选 JSON，模拟设备本地数据原文）</label><textarea id="pgCtx" rows="3" placeholder='{"calendar_free_slots":[]}'></textarea>
    <label><input type="checkbox" id="pgNew"> 新会话（注入用户记忆文档）</label>
    <br><button class="ghost" onclick="runPlayground()">运行</button><span id="pgMsg2" class="muted"></span>
    <div id="pgOut"></div>
  </div>
  <div class="card"><h2>成本 / 降级看板</h2>
    <div class="row"><input id="costDays" type="number" value="7" style="width:120px"><button class="ghost" onclick="loadCosts()">刷新</button></div>
    <div id="costs"></div>
  </div>
</div>
<script>
const $=(id)=>document.getElementById(id);
async function j(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opt});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.detail||r.status)}return r.json()}
async function login(){try{await j('/admin/api/login',{method:'POST',body:JSON.stringify({username:$('u').value,password:$('p').value})});$('err').textContent='';init()}catch(e){$('err').textContent=e.message}}
async function logout(){await j('/admin/api/logout',{method:'POST'});location.reload()}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dedupe(a){return Array.isArray(a)?[...new Set(a.filter(x=>typeof x==='string'&&x.trim()))]:[]}
let providers=[];
let order=[];let mdList=[];let mdLoaded=false;let mdError='';let dragFrom=-1;
function mdProvidersSorted(){return [...mdList].sort((a,b)=>(a.name||'').localeCompare(b.name||'','zh',{sensitivity:'base'})||a.id.localeCompare(b.id))}
function mdModelsOf(pid){const p=mdList.find(x=>x.id===pid);return p?[...p.models].sort((a,b)=>a.id.localeCompare(b.id)):[]}
function fuzzyModels(pid,q){
  const models=mdModelsOf(pid);const ql=q.trim().toLowerCase();
  if(!ql)return models;
  const scored=[];
  for(const m of models){
    const idl=m.id.toLowerCase(),nml=m.name.toLowerCase();
    if(!idl.includes(ql)&&!nml.includes(ql))continue;
    let s;if(idl===ql)s=0;else if(idl.startsWith(ql))s=1;else if(nml.startsWith(ql))s=2;else s=3;
    scored.push({m,s});
  }
  scored.sort((a,b)=>a.s-b.s||a.m.id.localeCompare(b.m.id));
  return scored.map(x=>x.m);
}
function renderProviderCard(p,idx){
  const keyChips=(p.apiKeys||[]).map((k,ki)=>'<span class="chip"><span class="k" title="'+esc(k)+'">'+esc(k)+'</span><button class="x" onclick="removeKey('+idx+','+ki+')" title="删除">×</button></span>').join('');
  const modelChips=(p.models||[]).map((m,mi)=>'<span class="chip">'+esc(m)+'<button class="x" onclick="removeModel('+idx+','+mi+')" title="删除">×</button></span>').join('');
  const provOpts=mdProvidersSorted().map(x=>'<option value="'+esc(x.id)+'"'+(x.id===p.id?' selected':'')+'>'+esc(x.name+'（'+x.id+'）')+'</option>').join('');
  return '<div class="card">'
    +'<div class="row"><select id="md-'+idx+'" onchange="pickProvider('+idx+')"><option value="">— 选择 models.dev 供应商（点选录入） —</option>'+provOpts+'</select></div>'
    +'<div class="row"><input placeholder="provider id" value="'+esc(p.id)+'" oninput="providers['+idx+'].id=this.value;onProviderEdited('+idx+')">'
    +'<input placeholder="名称" value="'+esc(p.name)+'" oninput="providers['+idx+'].name=this.value">'
    +'<select onchange="providers['+idx+'].type=this.value"><option value="openai-compatible"'+(p.type==='openai-compatible'?' selected':'')+'>OpenAI 兼容</option><option value="anthropic"'+(p.type==='anthropic'?' selected':'')+'>Anthropic(预留)</option></select></div>'
    +'<label>Base URL（点选供应商后自动带出，可手改）</label>'
    +'<input placeholder="https://api.openai.com/v1" value="'+esc(p.baseUrl||'')+'" oninput="providers['+idx+'].baseUrl=this.value">'
    +'<label>API Keys（可添加多项，每项独立删除）</label>'
    +'<div class="chips" id="keys-'+idx+'">'+(keyChips||'<span class="muted">尚未添加 API Key</span>')+'</div>'
    +'<div class="addrow"><input id="keyIn-'+idx+'" placeholder="粘贴 API Key，回车或点 ＋ 添加" onkeydown="keyDown(event,'+idx+',\\'key\\')"><button class="ghost mini" onclick="addKey('+idx+')">＋</button></div>'
    +'<label>模型（可添加多项，每项独立删除；支持模糊搜索）</label>'
    +'<div class="chips" id="models-'+idx+'">'+(modelChips||'<span class="muted">尚未添加模型</span>')+'</div>'
    +'<div class="addrow"><input id="msearch-'+idx+'" placeholder="输入字母模糊搜索模型，或直接手填模型 id（回车添加）" oninput="onModelSearch('+idx+')" onkeydown="keyDown(event,'+idx+',\\'model\\')">'
    +'<select id="mdm-'+idx+'"></select><button class="ghost mini" onclick="addModel('+idx+')">＋</button></div>'
    +'<div class="row" style="margin-top:10px"><label style="display:inline;margin:0"><input type="checkbox"'+(p.enabled!==false?' checked':'')+' onchange="providers['+idx+'].enabled=this.checked"> 启用</label>'
    +'<button class="ghost mini" onclick="removeProvider('+idx+')">删除 provider</button></div>'
    +'</div>';
}
function renderProviders(){
  const el=$('providers');el.innerHTML='';
  providers.forEach((p,idx)=>{el.insertAdjacentHTML('beforeend',renderProviderCard(p,idx));renderModelOptions(idx);});
  renderOrderList();
  $('timeoutMs').value=window.llmCfg.timeoutMs||30000;
  $('maxIters').value=window.llmCfg.maxToolIterations||6;
  if(mdError)$('mdStatus').textContent=mdError;
}
function renderModelOptions(idx){
  const sel=$('mdm-'+idx);if(!sel)return;
  const q=$('msearch-'+idx)?$('msearch-'+idx).value:'';
  const list=fuzzyModels(providers[idx].id,q);
  sel.innerHTML='<option value="">— 点选添加模型 —</option>'+list.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name+'（'+m.id+'）')+'</option>').join('');
}
function onModelSearch(idx){renderModelOptions(idx)}
function addProvider(){providers.push({id:'p'+Date.now().toString(36),name:'',type:'openai-compatible',baseUrl:'https://api.openai.com/v1',apiKeys:[],models:[],enabled:true});renderProviders()}
function removeProvider(idx){providers.splice(idx,1);renderProviders()}
function pickProvider(idx){const v=$('md-'+idx).value;if(!v)return;const p=mdList.find(x=>x.id===v);if(!p)return;providers[idx].id=p.id;providers[idx].name=p.name||p.id;providers[idx].type='openai-compatible';providers[idx].baseUrl=p.baseUrl||(p.id==='openai'?'https://api.openai.com/v1':'');renderProviders()}
function onProviderEdited(idx){renderModelOptions(idx);renderOrderList()}
function addKey(idx){const inp=$('keyIn-'+idx);const v=(inp.value||'').trim();if(!v)return;const arr=providers[idx].apiKeys=providers[idx].apiKeys||[];if(!arr.includes(v))arr.push(v);inp.value='';renderProviders()}
function removeKey(idx,ki){providers[idx].apiKeys.splice(ki,1);renderProviders()}
function addModel(idx){
  const sel=$('mdm-'+idx);const q=($('msearch-'+idx).value||'').trim();
  let v=sel&&sel.value?sel.value:(q||'');
  if(!v)return;
  const arr=providers[idx].models=providers[idx].models||[];
  if(!arr.includes(v))arr.push(v);
  $('msearch-'+idx).value='';sel.value='';
  renderProviders();
}
function removeModel(idx,mi){providers[idx].models.splice(mi,1);renderProviders()}
function keyDown(e,idx,kind){if(e.key==='Enter'){e.preventDefault();if(kind==='key')addKey(idx);else addModel(idx)}}
function allModelEntries(){
  const out=[];
  providers.forEach(p=>{if(!p.id)return;(p.models||[]).forEach(m=>{if(m)out.push(p.id+'/'+m)})});
  return out.sort((a,b)=>a.localeCompare(b));
}
function renderOrderList(){
  const ul=$('orderList');if(!ul)return;
  const entries=allModelEntries();const orderSet=new Set(order);
  ul.innerHTML=order.map((entry,i)=>{
    const known=entries.includes(entry);
    const opts=entries.filter(e=>!orderSet.has(e)||e===entry);
    const body=known
      ? '<select onchange="setOrderItem('+i+',this.value)"><option value="">— 选择 providerID/modelID —</option>'+opts.map(e=>'<option value="'+esc(e)+'"'+(e===entry?' selected':'')+'>'+esc(e)+'</option>').join('')+'</select>'
      : '<span class="muted">'+esc(entry)+'（已不在已添加模型中，保存时自动移除）</span>';
    return '<li class="dragitem" draggable="true" ondragstart="dragStart('+i+')" ondragover="event.preventDefault()" ondrop="dragDrop('+i+')" ondragend="dragEnd()"><span class="handle">☰</span>'+body+'<button class="x" onclick="removeOrderItem('+i+')" title="移除该项">−</button></li>';
  }).join('');
  const addSel=$('orderAdd');
  if(addSel){const avail=entries.filter(e=>!orderSet.has(e));addSel.innerHTML='<option value="">— 添加 providerID/modelID —</option>'+avail.map(e=>'<option value="'+esc(e)+'">'+esc(e)+'</option>').join('')}
}
function addOrderItem(){const v=$('orderAdd').value;if(!v)return;if(!order.includes(v))order.push(v);renderOrderList()}
function removeOrderItem(i){order.splice(i,1);renderOrderList()}
function setOrderItem(i,v){if(!v)return;order[i]=v;renderOrderList()}
function dragStart(i){dragFrom=i;event.target.classList.add('dragging')}
function dragEnd(){dragFrom=-1;document.querySelectorAll('.dragitem').forEach(el=>el.classList.remove('dragging'))}
function dragDrop(i){event.preventDefault();if(dragFrom<0||dragFrom===i)return;const m=order.splice(dragFrom,1)[0];order.splice(i,0,m);renderOrderList()}
async function loadCatalog(){if(mdLoaded)return;try{mdList=await j('/admin/api/models/providers');mdLoaded=true}catch(e){mdError='models.dev 不可用（仍可手填）：'+e.message}}
function normalizeOrder(o,ps){
  const out=[];
  (o||[]).forEach(e=>{
    if(typeof e!=='string'||!e)return;
    if(e.includes('/')){out.push(e);return}
    const p=ps.find(x=>x.id===e);
    if(p&&(p.models||[]).length)out.push(p.id+'/'+p.models[0]);
    else if(p)out.push(e);
  });
  return out;
}
async function saveLlm(){
  try{
    const entries=new Set(allModelEntries());
    const cfg={providers,order:order.filter(e=>entries.has(e)),timeoutMs:+$('timeoutMs').value,maxToolIterations:+$('maxIters').value};
    await j('/admin/api/config/llm',{method:'PUT',body:JSON.stringify(cfg)});
    $('llmMsg').textContent='已保存（立即生效）';
  }catch(e){$('llmMsg').textContent=e.message}
}
async function loadAlerts(){try{const a=await j('/admin/api/config/alerts');$('alertsEnabled').checked=!!a.enabled;$('complaintRate').value=a.complaintRateThreshold;$('degradationRate').value=a.degradationRateThreshold;$('toEmail').value=a.toEmail||''}catch(e){}}
async function saveAlerts(){try{await j('/admin/api/config/alerts',{method:'PUT',body:JSON.stringify({enabled:$('alertsEnabled').checked,complaintRateThreshold:+$('complaintRate').value,degradationRateThreshold:+$('degradationRate').value,toEmail:$('toEmail').value})});$('alertMsg').textContent='已保存'}catch(e){$('alertMsg').textContent=e.message}}
async function testAlerts(){try{const r=await j('/admin/api/alerts/test',{method:'POST',body:JSON.stringify({channel:'both'})});$('alertMsg').textContent='github='+r.results.github+' email='+r.results.email}catch(e){$('alertMsg').textContent=e.message}}
async function loadMetrics(){try{const rows=await j('/admin/api/metrics/closure?days='+$('days').value);$('metrics').innerHTML='<table><tr><th>日期</th><th>72h内闭环</th><th>完成</th><th>延期</th><th>放弃</th><th>兜底</th><th>总数</th><th>闭环率</th></tr>'+rows.map(r=>\`<tr><td>\${r.day}</td><td>\${r.closed_within_72h}</td><td>\${r.done}</td><td>\${r.deferred}</td><td>\${r.abandoned}</td><td>\${r.rescued}</td><td>\${r.total}</td><td>\${r.total?((r.closed_within_72h/r.total)*100).toFixed(1)+'%':'-'}</td></tr>\`).join('')+'</table>'}catch(e){$('metrics').innerHTML='<span class="muted">'+e.message+'</span>'}}
let docs=[];let memories=[];
async function loadDocs(){try{docs=await j('/admin/api/docs');renderDocs()}catch(e){$('docMsg').textContent=e.message}}
function renderDocs(){
  $('docs').innerHTML=docs.map((d,i)=>'<div class="card" style="margin:8px 0"><div class="row"><strong>'+esc(d.name)+'</strong><span class="muted">'+esc(d.kind)+' · v'+d.version+' · '+(d.enabled?'启用':'停用')+'</span><button class="mini ghost" onclick="moveDoc('+i+',-1)">↑</button><button class="mini ghost" onclick="moveDoc('+i+',1)">↓</button><button class="mini" onclick="toggleDoc('+i+')">'+(d.enabled?'停用':'启用')+'</button><button class="mini ghost" onclick="delDoc('+i+')">删除</button></div><textarea id="docc-'+i+'" rows="5">'+esc(d.content)+'</textarea><button class="ghost mini" onclick="saveDoc('+i+')">保存（热重载）</button></div>').join('');
}
async function addDoc(){try{const v={name:$('docName').value.trim(),kind:$('docKind').value,content:$('docContent').value};if(!v.name||!v.content){$('docMsg').textContent='名称与内容必填';return}await j('/admin/api/docs',{method:'POST',body:JSON.stringify(v)});$('docName').value='';$('docContent').value='';$('docMsg').textContent='已新建并热重载';loadDocs()}catch(e){$('docMsg').textContent=e.message}}
async function saveDoc(i){try{const d=docs[i];await j('/admin/api/docs/'+d.id,{method:'PUT',body:JSON.stringify({name:d.name,kind:d.kind,content:$('docc-'+i).value,enabled:d.enabled})});$('docMsg').textContent='已保存并热重载';loadDocs()}catch(e){$('docMsg').textContent=e.message}}
async function toggleDoc(i){try{const d=docs[i];await j('/admin/api/docs/'+d.id,{method:'PUT',body:JSON.stringify({name:d.name,kind:d.kind,content:d.content,enabled:!d.enabled})});loadDocs()}catch(e){}}
async function delDoc(i){try{await j('/admin/api/docs/'+docs[i].id,{method:'DELETE'});loadDocs()}catch(e){}}
async function moveDoc(i,dir){try{const ids=docs.map(d=>d.id);const jj=i+dir;if(jj<0||jj>=ids.length)return;[ids[i],ids[jj]]=[ids[jj],ids[i]];await j('/admin/api/docs/reorder',{method:'PUT',body:JSON.stringify({ids})});loadDocs()}catch(e){}}
async function loadMemories(){try{memories=await j('/admin/api/memories?user_id='+encodeURIComponent($('memUserId').value.trim()));$('memories').innerHTML='<table><tr><th>类型</th><th>内容</th><th>scope</th><th>更新时间</th><th></th></tr>'+memories.map((m,i)=>'<tr><td>'+esc(m.memory_type)+'</td><td>'+esc(m.content)+'</td><td>'+esc(m.scope)+'</td><td>'+esc((m.updated_at||'').slice(0,16))+'</td><td><button class="mini ghost" onclick="delMemoryIdx('+i+')">删除</button></td></tr>').join('')+'</table>'}catch(e){$('memories').innerHTML='<span class="muted">'+e.message+'</span>'}}
async function delMemoryIdx(i){try{await j('/admin/api/memories/'+memories[i].id,{method:'DELETE'});loadMemories()}catch(e){}}
async function runPlayground(){try{let ctx;const c=$('pgCtx').value.trim();ctx=c?JSON.parse(c):undefined;const started=Date.now();const r=await j('/admin/api/playground',{method:'POST',body:JSON.stringify({message:$('pgMsg').value,context:ctx,new_session:$('pgNew').checked})});$('pgOut').innerHTML='<p class="muted">耗时 '+(Date.now()-started)+' ms · 降级='+r.degraded+' · prompt≈'+r.promptTokens+' tokens</p><p><b>回复：</b>'+esc(r.reply)+'</p><h3>装配后的 system prompt</h3><pre>'+esc(r.systemPrompt)+'</pre><h3>工具结果</h3><pre>'+esc(JSON.stringify(r.toolResults,null,2))+'</pre>'}catch(e){$('pgOut').innerHTML='<span class="muted">'+e.message+'</span>'}}
async function loadCosts(){try{const rows=await j('/admin/api/costs?days='+$('costDays').value);$('costs').innerHTML='<table><tr><th>日期</th><th>provider</th><th>model</th><th>调用</th><th>成功率</th><th>降级率</th><th>均耗时</th><th>tokens</th></tr>'+rows.map(r=>'<tr><td>'+r.day+'</td><td>'+esc(r.provider)+'</td><td>'+esc(r.model)+'</td><td>'+r.calls+'</td><td>'+(r.ok_rate*100).toFixed(1)+'%</td><td>'+(r.degraded_rate*100).toFixed(1)+'%</td><td>'+r.avg_latency_ms+'ms</td><td>'+r.total_tokens+'</td></tr>').join('')+'</table>'}catch(e){$('costs').innerHTML='<span class="muted">'+e.message+'</span>'}}
async function init(){try{const s=await j('/admin/api/session');if(!s.authenticated){$('login').style.display='block';return}$('login').style.display='none';$('app').style.display='block';
const cfg=await j('/admin/api/config/llm');providers=(cfg.providers||[]).map(p=>({id:p.id||'',name:p.name||'',type:p.type||'openai-compatible',baseUrl:p.baseUrl||'',apiKeys:dedupe(p.apiKeys),models:dedupe(p.models),enabled:p.enabled!==false}));order=normalizeOrder(cfg.order||[],providers);window.llmCfg=cfg;await loadCatalog();renderProviders();loadAlerts();loadMetrics();loadDocs();}catch(e){$('login').style.display='block'}}
init();
</script></body></html>`;

admin.get('/', (c) => c.html(SPA));
admin.get('/index.html', (c) => c.html(SPA));
admin.all('*', (c) => c.html(SPA));
