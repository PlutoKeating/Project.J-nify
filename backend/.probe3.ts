import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://ajeratjsxyxtdqtmtvxh.supabase.co', 'sb_publishable_tgGWNnh1QO6Q_h90D9p96Q_781Jkp61');
(async () => {
  const { data } = await sb.auth.signUp({ email: `probe3-${Date.now().toString(36)}@jnify.dev`, password: 'password-123456' });
  const r = await fetch('http://127.0.0.1:8787/v1/now', { headers: { Authorization: `Bearer ${data.session!.access_token}` } });
  console.log('local workerd /v1/now ->', r.status, (await r.text()).slice(0, 120));
})().catch(e => console.log('ERR', e.message));
