# 官网部署

2026-10-07 起，官网与接口由**同一个 Cloudflare Worker** 托管，只用一个域名：**https://jnify.plutokeating.beer**。不再用 Cloudflare Pages，也不再用原来的 `j-nify.arr2018.dpdns.org`（官网）与 `j-nify.williamhvollita.dpdns.org`（接口）。

## 怎么分流

`backend/wrangler.toml`：

- `[assets]` 指向 `website/dist`（Vite 构建产物），`not_found_handling = "single-page-application"`：`/features`、`/privacy` 这类子路由直接打开也返回 `index.html`，由前端路由接管。
- `run_worker_first = ["/v1/*", "/admin", "/admin/*", "/health"]`：这些路径先进 Worker（接口、管理面板、健康检查），其余都是静态页。
- 域名是 Worker 的自定义域名，在 Cloudflare 上绑定（不写进 `wrangler.toml`，免得部署令牌需要域名区域的权限）。

## 发布

push `main` 且改动在 `backend/**` 或 `website/**` → `.github/workflows/deploy-backend.yml`：先 `cd website && npm ci && npm run build`，再 `wrangler deploy`。CI 的 website 作业照旧跑 test / lint / build。

本地看合并后的效果：`cd website && npm run build`，然后 `cd ../backend && npx wrangler dev`，打开 http://localhost:8787 （官网）与 http://localhost:8787/health （接口）。

## 已移除

Pages 专用的 `website/functions/`、`public/_redirects`、`public/_headers`、`.nojekyll`、`scripts/postbuild.mjs`，以及给 App Link 用的 `.well-known/assetlinks.json` / `apple-app-site-association`（App 已不用 App Link）；工作流 `deploy-website.yml`、`sync-worker-domain.yml`。
