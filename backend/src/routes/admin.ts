import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { restGet, makeDb } from '../db';
import { getConfig, putConfig, invalidateConfig } from '../lib/config-store';
import { constantTimeEq, createSessionToken, verifySessionToken, setAdminCookie, clearAdminCookie, requireAdmin } from '../lib/admin-auth';
import { listModelProviders } from '../lib/llm';
import { DEFAULT_ALERT_CONFIG, sendGitHubIssue, sendSmtpMail, type AlertConfig } from '../lib/alerts';

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

// ---- 管理页 SPA ----
const SPA = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>J-nify Admin</title><style>
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#F7F7F4;color:#17171A;margin:0;padding:24px;max-width:960px;margin:0 auto}
h1{font-size:22px}.card{background:#fff;border:1px solid #E8E8E3;border-radius:16px;padding:16px 20px;margin:16px 0}
label{display:block;font-size:13px;color:#76767D;margin:10px 0 4px}input,select,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #E8E8E3;border-radius:8px;font-size:14px}
button{background:#FF5A4E;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer;margin:8px 8px 0 0}
button.ghost{background:#fff;color:#17171A;border:1px solid #E8E8E3}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}.muted{color:#76767D;font-size:12px}
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
    <button class="ghost" onclick="addProvider()">+ 添加 provider</button>
    <label>模型尝试顺序（逗号分隔 provider id，按序故障切换）</label><input id="order">
    <label>超时（ms）</label><input id="timeoutMs" type="number">
    <label>最大工具迭代数</label><input id="maxIters" type="number">
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
</div>
<script>
const $=(id)=>document.getElementById(id);
async function j(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opt});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.detail||r.status)}return r.json()}
async function login(){try{await j('/admin/api/login',{method:'POST',body:JSON.stringify({username:$('u').value,password:$('p').value})});$('err').textContent='';init()}catch(e){$('err').textContent=e.message}}
async function logout(){await j('/admin/api/logout',{method:'POST'});location.reload()}
let providers=[];
function renderProviders(){const el=$('providers');el.innerHTML='';providers.forEach((p,idx)=>{const d=document.createElement('div');d.className='card';d.innerHTML=\`
  <div class="row"><input placeholder="provider id" value="\${p.id}" oninput="providers[\${idx}].id=this.value">
  <input placeholder="名称" value="\${p.name}" oninput="providers[\${idx}].name=this.value">
  <select onchange="providers[\${idx}].type=this.value"><option value="openai-compatible" \${p.type==='openai-compatible'?'selected':''}>OpenAI 兼容</option><option value="anthropic" \${p.type==='anthropic'?'selected':''}>Anthropic(预留)</option></select></div>
  <label>Base URL</label><input placeholder="https://api.openai.com/v1" value="\${p.baseUrl||''}" oninput="providers[\${idx}].baseUrl=this.value">
  <label>API Keys（逗号分隔，多 key 轮换）</label><input type="password" value="\${(p.apiKeys||[]).join(',')}" oninput="providers[\${idx}].apiKeys=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
  <label>模型（可手填；也可从 models.dev 选择）</label>
  <div class="row"><input value="\${(p.models||[]).join(',')}" oninput="providers[\${idx}].models=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
  <select id="md-\${idx}" onchange="pickModel(\${idx})"><option value="">— 从 models.dev 选择 —</option></select></div>
  <label><input type="checkbox" \${p.enabled!==false?'checked':''} onchange="providers[\${idx}].enabled=this.checked"> 启用</label>
  <button class="ghost" onclick="providers.splice(\${idx},1);renderProviders()">删除</button>\`;
  el.appendChild(d);loadModelsInto(idx);});
  $('order').value=(window.llmCfg.order||[]).join(',');
  $('timeoutMs').value=window.llmCfg.timeoutMs||30000;
  $('maxIters').value=window.llmCfg.maxToolIterations||6;
}
function addProvider(){providers.push({id:'p'+Date.now().toString(36),name:'',type:'openai-compatible',baseUrl:'https://api.openai.com/v1',apiKeys:[],models:[],enabled:true});renderProviders()}
async function loadModelsInto(idx){const sel=$('md-'+idx);try{const list=await j('/admin/api/models/providers');window.mdList=list;sel.innerHTML='<option value="">— 从 models.dev 选择 —</option>'+list.map(p=>\`<optgroup label="\${p.name}">\${p.models.map(m=>\`<option value="\${p.id}/\${m.id}">\${m.id}</option>\`).join('')}</optgroup>\`).join('')}catch(e){sel.innerHTML='<option value="">models.dev 不可用：'+e.message+'</option>'}}
function pickModel(idx){const v=$('md-'+idx).value;if(!v)return;const [p,m]=v.split('/');const prov=window.mdList.find(x=>x.id===p);const mdl=prov&&prov.models.find(x=>x.id===m);providers[idx].models=providers[idx].models||[];if(mdl&&!providers[idx].models.includes(mdl.id)){providers[idx].models.push(mdl.id);renderProviders()}}
async function saveLlm(){try{const cfg={providers,order:$('order').value.split(',').map(s=>s.trim()).filter(Boolean),timeoutMs:+$('timeoutMs').value,maxToolIterations:+$('maxIters').value};await j('/admin/api/config/llm',{method:'PUT',body:JSON.stringify(cfg)});$('llmMsg').textContent='已保存（立即生效）'}catch(e){$('llmMsg').textContent=e.message}}
async function loadAlerts(){try{const a=await j('/admin/api/config/alerts');$('alertsEnabled').checked=!!a.enabled;$('complaintRate').value=a.complaintRateThreshold;$('degradationRate').value=a.degradationRateThreshold;$('toEmail').value=a.toEmail||''}catch(e){}}
async function saveAlerts(){try{await j('/admin/api/config/alerts',{method:'PUT',body:JSON.stringify({enabled:$('alertsEnabled').checked,complaintRateThreshold:+$('complaintRate').value,degradationRateThreshold:+$('degradationRate').value,toEmail:$('toEmail').value})});$('alertMsg').textContent='已保存'}catch(e){$('alertMsg').textContent=e.message}}
async function testAlerts(){try{const r=await j('/admin/api/alerts/test',{method:'POST',body:JSON.stringify({channel:'both'})});$('alertMsg').textContent='github='+r.results.github+' email='+r.results.email}catch(e){$('alertMsg').textContent=e.message}}
async function loadMetrics(){try{const rows=await j('/admin/api/metrics/closure?days='+$('days').value);$('metrics').innerHTML='<table><tr><th>日期</th><th>72h内闭环</th><th>完成</th><th>延期</th><th>放弃</th><th>兜底</th><th>总数</th><th>闭环率</th></tr>'+rows.map(r=>\`<tr><td>\${r.day}</td><td>\${r.closed_within_72h}</td><td>\${r.done}</td><td>\${r.deferred}</td><td>\${r.abandoned}</td><td>\${r.rescued}</td><td>\${r.total}</td><td>\${r.total?((r.closed_within_72h/r.total)*100).toFixed(1)+'%':'-'}</td></tr>\`).join('')+'</table>'}catch(e){$('metrics').innerHTML='<span class="muted">'+e.message+'</span>'}}
async function init(){try{const s=await j('/admin/api/session');if(!s.authenticated){$('login').style.display='block';return}$('login').style.display='none';$('app').style.display='block';
const cfg=await j('/admin/api/config/llm');providers=cfg.providers||[];window.llmCfg=cfg;renderProviders();loadAlerts();loadMetrics();}catch(e){$('login').style.display='block'}}
init();
</script></body></html>`;

admin.get('/', (c) => c.html(SPA));
admin.get('/index.html', (c) => c.html(SPA));
admin.all('*', (c) => c.html(SPA));
