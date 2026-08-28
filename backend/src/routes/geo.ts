import { Hono } from 'hono';
import type { AppEnv } from '../app';

export const geo = new Hono<AppEnv>();

/**
 * 天地图逆地理编码代理（B4/B5/Q10 定案）：
 * 客户端只上传已模糊化坐标（约 1km），服务端二次取整后调天地图（服务端 key，
 * 不暴露给客户端），仅返回城市/地址文本。原始定位不出设备。
 */
geo.post('/reverse', async (c) => {
  const key = c.env.TIANDITU_KEY;
  if (!key) return c.json({ detail: 'TIANDITU_KEY not configured' }, 503);
  const body = await c.req.json<{ lat?: number; lon?: number }>();
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return c.json({ detail: 'lat/lon required' }, 422);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return c.json({ detail: 'invalid coordinates' }, 422);
  const rlat = Math.round(lat * 100) / 100;
  const rlon = Math.round(lon * 100) / 100;
  const postStr = JSON.stringify({ lon: rlon, lat: rlat, ver: 1 });
  try {
    const res = await fetch(
      `https://api.tianditu.gov.cn/geocoder?postStr=${encodeURIComponent(postStr)}&type=geocode&tk=${key}`,
      {
        // 天地图 key 为「浏览器端」类型（2026-08-29 用户定案，见 DECISION_REGISTER §5.1）：
        // 实测该校验以浏览器形态（User-Agent）为主；Worker fetch 不会默认带 UA 且允许显式设置，
        // 故同时携带浏览器 UA 与白名单域名 Referer 以通过校验。
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
          Referer: 'https://j-nify.williamhvollita.dpdns.org/',
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return c.json({ detail: `tianditu HTTP ${res.status}` }, 502);
    const data = (await res.json()) as { result?: { address?: string } };
    const address = data.result?.address ?? '';
    return c.json({ address, city: address });
  } catch (e) {
    return c.json({ detail: (e as Error).message }, 502);
  }
});
