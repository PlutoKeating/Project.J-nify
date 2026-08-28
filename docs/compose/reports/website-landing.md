---
feature: website-landing
status: delivered
specs:
  - docs/compose/specs/2026-08-28-website-landing-design.md
plans:
  - docs/compose/plans/2026-08-28-website-landing.md
branch: main
commits: f960a70..469e566
---

# J-nify 官网落地页 — Final Report

## What Was Built

J-nify 官网（`website/`）是一个移动优先、中英双语的三页产品落地站，为「J-nify / Jennifer——低打扰行动秘书」App 做宣发与下载入口。它把产品最核心的差异点——「不是闹钟，而是一个会在真正顺手的那一刻、带着理由和退路出现的秘书」——用克制的文案与视觉讲清楚，并在下载页**实时从 GitHub Release 拉取最新版本与发布说明**（版本信息零硬编码，点安装包即直链下载、不跳转 GitHub）。

首页 / 功能详解 / 下载三个页面由 React Router 组织，默认中文、可切换英文（localStorage 持久化）。视觉延续产品 SPEC 的「暖白纸感 + 唯一点缀色 #FF5A4E」设计系统，通篇覆盖移动端（375px 无横向溢出、触控 ≥44px、底部安全区）与桌面（居中 ≤max-w-3xl 的克制留白）。

## Architecture

```
website/                          # Vite + React 19 + TS + React Router 7 + Tailwind v4
  src/
    i18n/messages.ts              # 双语文案唯一事实源（flat id → { zh, en }）
    i18n/index.tsx                # LangProvider / useLang() / t(id, lang)，localStorage 持久化
    components/
      Header.tsx / Footer.tsx / Layout.tsx   # 布局壳：sticky 顶栏 + 移动端底部 Tab + 回滚 + 安全区
      Wordmark.tsx / LanguageToggle.tsx       # 品牌字标 / 中英切换
      Section.tsx                             # 标题区（eyebrow + 标题 + 副文案）
      NudgeCard.tsx                           # 签名元素：还原 App 内「Nudge 焦点卡」（事项+理由+四动作）
      DecisionGrid.tsx / SignalGrid.tsx / CompareTable.tsx / ScenarioCard.tsx / ReleaseNote.tsx
    hooks/useReleases.ts          # fetch GitHub release/latest（loading/error/ready + refetch）
    pages/Home.tsx / Features.tsx / Download.tsx
  public/_redirects               # CF Pages SPA 回退：/* /index.html 200
  public/.nojekyll                # GH Pages 禁 Jekyll
  scripts/postbuild.mjs           # dist/index.html → dist/404.html（GH Pages SPA 回退）
```

**路由**：`/`（Home，营销）、`/features`（功能详解）、`/download`（下载）。`main.tsx` 以 `BrowserRouter` + `LangProvider` 包裹 `App`。

**数据流**：`useReleases()` 在挂载时 `fetch('https://api.github.com/repos/PlutoKeating/Project.J-nify/releases/latest')`，返回 `{ status, release, refetch }`；`Download` 页据此渲染版本号、国际化日期（`Intl.DateTimeFormat`）、发布说明（react-markdown + remark-gfm）与资产直链（`browser_download_url`）。错误态含「重试」回退。

**双语**：`t(id, lang)` 查 flat 字典；`LangProvider` 默认 `zh`（读 `localStorage['jnify-lang']`），`toggle()` 切换并同步 `<html lang>`。

## Design Decisions

- **文案给「释放」不给「鸡血」**：调查 Todoist/TickTick/Things/Motion/Reclaim/Any.do 后确认，同类产品 hero 都落在「清空大脑/不内疚」。因此 hero 用「不急，但我帮您盯着。」而非「帮你多做」，把价值从「多做事」换成「替你想起来」。
- **四个决定做核心**：竞品只有「打勾」，我们把「现在做 / 晚点 / 算了 / 帮我兜底」做成可见核心（`NudgeCard` 签名元素 + `DecisionGrid`），呼应产品「给退路而非压力」。
- **低承诺 CTA**：「把一件小事交给 Jennifer」替代「开始试用」，并反复强调「不设闹钟 · 不催你 · 随时可改」。
- **`--sub` 调深**：源自 SPEC 的 `#76767D` 在暖白底仅 4.20:1（< WCAG AA 4.5:1）。调深至 `#6E6E75`（纸面 4.71:1、卡面 5.06:1），视觉仍是暖灰，仅满足对比度要求。
- **下载页零硬编码**：版本/日期/说明/资产全部前端实时取自 GitHub Release API（公开 CORS），点资产走 `browser_download_url` 直链、不跳转 GitHub 页面。
- **Tailwind v4 CSS-first**：用 `@theme` 声明品牌 token，无 `tailwind.config.js`，`@tailwindcss/vite` 构建；`base ./` 相对路径兼容 CF Pages 根域与 GH Pages 子路径。

## Usage

```bash
cd website
npm ci                # 安装
npm run dev           # 本地开发
npm run build         # 产物 dist/（含 404.html / _redirects / .nojekyll）
npm run test          # vitest（i18n/组件/路由/download/useReleases 共 21 用例）
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
```

**部署（CF Pages，主）**：Root directory=`/website`、Build=`npm run build`、Output=`dist`；自定义域名 `https://j-nify.arr2018.dpdns.org`（`_redirects` 提供 SPA 回退）。详尽的 git 连接 + DNS CNAME 步骤见 `docs/devops/website-deploy.md`。域名只写入 README / QUICK_START / 页脚 / About 文案；GitHub Pages 备份域名不公开、不入任何文档。

## Verification

全绿：`eslint`（0 错误）、`tsc --noEmit`（0 错误）、`vitest`（6 文件 / 21 用例通过）、`npm run build`（成功，`dist/` 含 `_redirects`、`.nojekyll`、`404.html`、`index.html`）。关键断言：下载页 `v0.1.2` 来自 `useReleases` 对 GitHub API 的实时调用、资产链接为 `browser_download_url` 直链（不跳 GitHub）、双语切换并持久化、`/features` `/download` 路由直达可用。`curl` 实测 `releases/latest` 返回 `v0.1.2`（`app-release.aab` + `app-release.apk`）。无浏览器截图工具，视觉按构建产物 + token 对比度校验。

## Journey Log

- [lesson] Vite 8 是极新版本，`vitest ^2` / `@vitejs/plugin-react ^4` / `jsdom ^25` 与其 peer 不兼容——需用 `vitest ^4` / `@vitejs/plugin-react ^6` / `jsdom ^30` 才无冲突。
- [pivot] i18n 原设计分 `zh.ts`/`en.ts`/`types.ts` 三文件，发现「en 与 zh 缺键不可感知」→ 合并为单一 `messages.ts`（每 id 一条 `{ zh, en }`），天然单源不缺键。
- [lesson] `TDD` 对纯营销 SPA 不自然，故把测试集中在逻辑层：i18n 字典完整性、`useReleases` 的 fetch 三态、语言切换持久化、下载页直链与错误恢复。
- [pivot] Hero 首屏两种方案里选「文字型安静英雄」不放产品截图，避免移动首屏拥挤，也更贴合「低打扰」人格。
- [pivot] 本项目惯例在 `main` 直接开发（无 worktree），本轮同样直接在 `main` 提交，符合项目既有约定。

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-28-website-landing-design.md` | 设计 Spec（S1–S14） | 定位/token/三页结构/双语/无障碍/验收 |
| `docs/compose/plans/2026-08-28-website-landing.md` | 实施计划（10 任务） | 含完整代码与提交命令 |
| `docs/devops/website-deploy.md` | CF Pages 部署/DNS 指引 | 主域名唯一 |
| `README.md` / `docs/QUICK_START.md` | 生产域名写入 | `https://j-nify.arr2018.dpdns.org` |
