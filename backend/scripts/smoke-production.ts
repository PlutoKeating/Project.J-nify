const backendBaseUrl = (process.env.BACKEND_BASE_URL ?? 'https://j-nify.williamhvollita.dpdns.org').replace(/\/$/, '');
const websiteBaseUrl = (process.env.WEBSITE_BASE_URL ?? 'https://j-nify.arr2018.dpdns.org').replace(/\/$/, '');
const requireAdmin = process.env.SMOKE_REQUIRE_ADMIN === '1';

async function expectOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

async function smokePublic(): Promise<void> {
  const health = await expectOk(`${backendBaseUrl}/health`);
  const body = (await health.json()) as { status?: string };
  if (body.status !== 'ok') throw new Error('backend health response is not ok');

  for (const path of ['/', '/features', '/download', '/privacy', '/auth/verify']) {
    const response = await expectOk(`${websiteBaseUrl}${path}`);
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
      throw new Error(`${websiteBaseUrl}${path} did not return HTML`);
    }
  }
  await expectOk(`${backendBaseUrl}/admin`);
  console.log('public production smoke passed');
}

async function smokeAdmin(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    if (requireAdmin) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required');
    console.log('admin smoke skipped: credentials are not available');
    return;
  }

  const login = await expectOk(`${backendBaseUrl}/admin/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('admin login did not return a session cookie');
  const headers = { cookie };

  const session = await expectOk(`${backendBaseUrl}/admin/api/session`, { headers });
  const sessionBody = (await session.json()) as { authenticated?: boolean };
  if (sessionBody.authenticated !== true) throw new Error('admin session is not authenticated');

  await expectOk(`${backendBaseUrl}/admin/api/docs`, { headers });
  await expectOk(`${backendBaseUrl}/admin/api/costs?days=1`, { headers });
  console.log('read-only admin production smoke passed');
}

await smokePublic();
await smokeAdmin();

export {};
