/**
 * SPA 回退（Cloudflare Pages Functions）。
 *
 * Pages Functions 优先于静态资源执行；本 catch-all 函数先让静态资源管线
 * 应答（env.ASSETS.fetch），只有资源不存在时才回退到 index.html（200）。
 *
 * 背景：Cloudflare Pages 会把 /index.html 规范化重定向为 /（308），
 * 导致 _redirects 里 "/* /index.html 200" 这类规则全部变成跳到首页的 308，
 * 子路由无法直接访问。因此 SPA 回退改由函数实现，_redirects 仅作兜底。
 */
export async function onRequest(context) {
  const asset = await context.env.ASSETS.fetch(context.request);
  if (asset.status !== 404) {
    return asset;
  }

  const url = new URL(context.request.url);
  const index = await context.env.ASSETS.fetch(new Request(url.origin + '/', context.request));
  return new Response(index.body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
