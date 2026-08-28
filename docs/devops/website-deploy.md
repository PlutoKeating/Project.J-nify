# 官网部署（Cloudflare Pages）

> 生产域名（唯一）：**https://j-nify.arr2018.dpdns.org**（Cloudflare Pages，主）
> 备份：GitHub Pages（备用，暂不公开；**域名不写入任何文档**）

## 一、创建 Cloudflare Pages 项目并连接 GitHub

1. 打开 Cloudflare Dashboard → `Workers & Pages` → `Create application` → 选 **Pages** → `Connect to Git`。
2. 授权 Cloudflare 访问你的 GitHub 账号，选择仓库 **`PlutoKeating/Project.J-nify`**。
3. 配置项目：
   - **Production branch**：`main`
   - **Root directory**：`/website`
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
   - ⚙️ 如需显式安装依赖，可把 Build command 改为 `npm ci && npm run build`（Cloudflare 通常会自动安装）。
4. 点击 `Save and Deploy`，触发首次构建 → 生成 `*.pages.dev` 临时域名。

> 说明：`npm run build` 会在 `/website` 下执行，`postbuild` 会自动生成 `dist/404.html`（GitHub Pages SPA 回退）；CF Pages 的 SPA 回退由 `public/_redirects`（`/* /index.html 200`）提供。

## 二、绑定自定义域名

1. 进入 Pages 项目 → **Custom domains** → `Set up a custom domain` → 输入 **`j-nify.arr2018.dpdns.org`**。
2. 记下 Cloudflare 显示的目标值（形如 `你的项目名.pages.dev`）。

## 三、DNS 配置（在 `arr2018.dpdns.org` 所在的 DNS 服务商处）

> `arr2018.dpdns.org` 由动态域名（DPDNS）服务提供，需确认你的服务商支持子域名指向外部 CNAME。

在 DNS 服务商新增一条 CNAME 记录：

| 字段 | 值 |
| --- | --- |
| 类型 | `CNAME` |
| 主机/名称 | `j-nify` |
| 目标 | `<你的项目名>.pages.dev`（Cloudflare 给出的值） |
| TTL | 自动 |

> 若 `arr2018.dpdns.org` 本身托管在 Cloudflare DNS，直接在该域名 DNS 面板加上述 CNAME 即可；若在第三方 DNS，做相同 CNAME 指向即可。证书由 Cloudflare 自动签发（Let's Encrypt / Universal SSL）。

## 四、验证

- 浏览器访问 **`https://j-nify.arr2018.dpdns.org`** 应显示官网首页。
- `/features`、`/download` 直接刷新或直达可用（`_redirects` 提供 SPA 回退）。
- 下载页应显示**真实最新版本**（来自 GitHub Release，非硬编码），点资产为直链下载、不跳转 GitHub。
- **App Link 校验资产**（邮件确认/重置回调用）：`public/.well-known/assetlinks.json`（Android）与 `public/.well-known/apple-app-site-association`（iOS）随 `public/` 一起被 Vite 复制进 `dist/` 并由 CF Pages 直出（`_redirects` 只兜底未命中路径，不影响 `.well-known` 真实文件）。`/_headers` 为 AASA 强制 `Content-Type: application/json`。验证：
  - `https://j-nify.arr2018.dpdns.org/.well-known/assetlinks.json` 返回**真实** release 证书 SHA-256（见 `docs/devops/email-callback.md`；Android 校验失败则 App Link 不会静默唤起 App，回落浏览器）。
  - `https://j-nify.arr2018.dpdns.org/.well-known/apple-app-site-association` 返回 `Content-Type: application/json`。

## 五、发布节奏

- push 到 `main`（改动 `website/**`）→ CF Pages 自动重新构建发布。
- 如需强制重部署：CF Dashboard → Pages → 项目 → **Deployments** → `Retry deployment`。
- 回滚：切换到先前成功的 Deployment 并 `Rollback`。

## 六、本机预览（可选）

```bash
cd website
npm ci
npm run dev      # 本地开发
npm run build    # 产出 dist/（含 404.html / _redirects / .nojekyll）
```
