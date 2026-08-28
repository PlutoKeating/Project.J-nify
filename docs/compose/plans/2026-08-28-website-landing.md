# J-nify 官网落地页 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/website-landing.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `website/` 构建一个移动优先、中英双语、三页的 J-nify 官网（React Router + Tailwind v4），下载页实时从 GitHub Release 拉取最新版本，适配 Cloudflare Pages（主，域名 `https://j-nify.arr2018.dpdns.org`）与 GitHub Pages（备，不公开、域名不入文档）。

**Architecture:** Vite + React 19 + TypeScript + React Router 7（BrowserRouter）+ Tailwind CSS 4（`@tailwindcss/vite`，CSS-first `@theme`）。轻量自研 i18n（`t(id, lang)` + flat messages，localStorage 持久化）。下载页用原生 `fetch` 调 GitHub Releases `/latest`（公开 CORS），直链下载不跳 GitHub。构建产物含 `_redirects`（CF SPA 回退）与 `404.html`/`.nojekyll`（GH Pages SPA 回退）。

**Tech Stack:** Vite 8, React 19, React Router 7, TypeScript 5, Tailwind CSS 4, react-markdown + remark-gfm, vitest + @testing-library/react + jsdom.

## Global Constraints

- **唯一生产域名** `https://j-nify.arr2018.dpdns.org`（Cloudflare Pages 主）；GitHub Pages 域名**绝不写入任何文档**。
- 语言默认中文；`lang` 存 React Context + localStorage；所有用户可见文案走 `t(id, lang)`，禁止硬编码文案字符串。
- 品牌人格 `Jennifer`（女秘书）；口号「不急，但我帮您盯着。」；文案基调：不命令、不羞辱、给理由、给退路、给最小下一步。中文不用斜体，靠字重/颜色/acc色。
- 设计 token 以 spec §S3 为唯一事实源：`--paper #F7F7F4`、`--card #FFFFFF`、`--ink #17171A`、`--sub #76767D`、`--line #E8E8E3`、`--accent #FF5A4E`、`--accent-soft #FFF0EF`、`--green #35C759`、`--mute #A7A7AD`。
- Tailwind 唯一强调色是 `accent`，只用它做「当前窗口 / Jennifer 状态点 / 主 CTA」；绿色只表完成/可用窗口；红不做逾期惩罚。
- 移动优先：≤420px 全屏布局；触控目标 ≥44px；正文对比度 ≥4.5:1；大标题 ≥3:1。
- 无障碍（Web Interface Guidelines）：语义化 HTML、`focus-visible`、`prefers-reduced-motion`、图标按钮 `aria-label`、图片 `width/height`+`alt`、不用 `transition: all`、不用 `outline:none`（无替换）、不用 `user-scalable=no`。
- 下载页：**版本信息禁止硬编码**，实时 `fetch https://api.github.com/repos/PlutoKeating/Project.J-nify/releases/latest`；点资产用 `browser_download_url` 直接下载，不跳转 `html_url`。
- 发布说明 body 为 Markdown，用 react-markdown + remark-gfm 渲染；`translate="no"` 包裹正文防自动翻译错乱。
- every task: `npm run lint` + `npm run test` + `npm run build`（在 `website/`）通过后再提交。

---

## File Structure

```
website/
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  index.html
  eslint.config.js
  tailwind 说明：无独立 config，用 src/index.css 的 @theme（见 Task 2）
  scripts/postbuild.mjs        # dist/index.html→404.html（GH Pages SPA 回退）+ 写 .nojekyll
  public/
    _redirects                 # CF Pages SPA:  /* /index.html  200
    .nojekyll                  # GH Pages 禁 Jekyll（可为空）
    favicon.svg                # 品牌 favicon（暖白 + accent 点）
  src/
    main.tsx                   # 挂载 + LangProvider + Router
    App.tsx                    # Routes + Router 布局 + ScrollToTop
    i18n/
      messages.ts              # 双语文案字典（flat id → { zh, en }），唯一事实源
      index.tsx                # LangProvider / useLang / t() / 语言切换 + localStorage
    index.css                  # @theme token + 基础样式 + 动效 reduced-motion 守卫
    hooks/
      useReleases.ts           # 拉取 GitHub latest release（loading/error/ready）
      useLanguage.ts           # 读/写 localStorage + URL ?lang（并入 i18n index.tsx）
    components/
      Wordmark.tsx             # J-nify · Jennifer 字标（含状态点）
      LanguageToggle.tsx       # 中/EN 切换
      Header.tsx               # 顶栏：Wordmark + Nav + LanguageToggle（移动端底部/折叠）
      Footer.tsx               # 页脚：导航 + 域名 + 开源协议 + ©
      Layout.tsx               # <main> 包裹 + 移动安全区 + 空态/错误态外壳
      Section.tsx              # 标题区（eyebrow + 标题 + 副文案）复用
      NudgeCard.tsx            # 签名元素：App 内焦点卡（事项+理由+chips+四动作）
      SignalGrid.tsx           # 5 信号网格
      CompareTable.tsx         # 传统待办 vs Jennifer
      ScenarioCard.tsx         # 真实场景故事卡
      ReleaseNote.tsx          # 发布说明 Markdown 渲染
    pages/
      Home.tsx                 # 首页 8 节
      Features.tsx             # 功能详解
      Download.tsx             # 下载页
  __tests__/
    i18n.test.ts
    useReleases.test.ts
    lang-toggle.test.tsx
    download.test.tsx
    app.test.tsx               # 路由渲染 / 导航
```

---

### Task 1: Scaffold website/ 工程

**Covers:** [S9][S14]

**Files:**
- Create: `website/package.json`, `website/tsconfig.json`, `website/tsconfig.node.json`, `website/vite.config.ts`, `website/index.html`, `website/eslint.config.js`, `website/scripts/postbuild.mjs`, `website/public/_redirects`, `website/public/.nojekyll`, `website/public/favicon.svg`, `website/src/main.tsx`, `website/src/App.tsx`（骨架）, `website/src/index.css`（骨架）、`website/src/vite-env.d.ts`

**Interfaces:**
- Produces: `npm run dev|build|test|lint` scripts；`dist/` 含 SPA 回退产物；`vite-env.d.ts` 提供 `/// <reference types="vite/client" />` 与 `.module.css`/`?raw` 等类型。

- [ ] **Step 1: 写 `website/package.json`（固定脚本与 deps）**

```json
{
  "name": "jnify-website",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:web": "vite build",
    "postbuild": "node scripts/postbuild.mjs",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "eslint": "^9.0.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.0.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^8.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: 安装依赖（在 `website/`）**

Run: `cd website && npm install`
Expected: `node_modules/` 生成，`package-lock.json` 创建。

- [ ] **Step 3: 写配置 `website/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 相对路径，兼容 GitHub Pages 子路径托管（备用托管 `/repo/` 前缀）
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: true,
  },
});
```

> 注：`base: './'` 使资源相对路径化，同时兼容 CF Pages 根域与 GH Pages 子路径。SPA 路由用 BrowserRouter，CF 用 `_redirects` 回退，GH 用 `404.html` 回退。

- [ ] **Step 4: 写 `website/tsconfig.json` 与 `website/tsconfig.node.json`**

`website/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "src/vite-env.d.ts"]
}
```

`website/tsconfig.node.json`（供 vite.config.ts 用）:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "eslint.config.js"]
}
```

- [ ] **Step 5: 写 `website/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#F7F7F4" />
    <meta
      name="description"
      content="J-nify · Jennifer：你的低打扰行动秘书。把「不急但会忘」的小事交给 Jennifer，她会在真正顺手的那一刻带着理由出现。"
    />
    <title>J-nify · Jennifer — 不急，但我帮您盯着。</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: 写 `website/scripts/postbuild.mjs`（GH Pages SPA 回退 + .nojekyll）**

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const index = join(dist, 'index.html');
if (!existsSync(index)) {
  console.warn('[postbuild] dist/index.html not found; skip 404 fallback');
  process.exit(0);
}
// GH Pages 无服务端路由回退：404.html 用 index 克隆，客户端路由读取路径
writeFileSync(join(dist, '404.html'), readFileSync(index, 'utf8'));
console.log('[postbuild] wrote dist/404.html (SPA fallback)');
```

- [ ] **Step 7: 写 `website/public/_redirects` 与 `.nojekyll` 与 `favicon.svg`**

`public/_redirects` (内容):
```
/* /index.html  200
```

`public/.nojekyll`: 空文件。

`public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="16" fill="#F7F7F4"/>
  <circle cx="32" cy="26" r="10" fill="#FF5A4E"/>
  <path d="M20 46c0-6 5-10 12-10s12 4 12 10" stroke="#17171A" stroke-width="4" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 8: 写 `website/src/vite-env.d.ts` 与 `website/src/test-setup.ts`**

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`src/test-setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 9: 写 `website/eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
);
```

> jest-dom types 已在 tsconfig `types` 引入，不需额外 hook 依赖。

- [ ] **Step 10: 骨架 `website/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from './i18n';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
        <App />
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 11: 骨架 `website/src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 12: 骨架 `website/src/index.css`（占位，Task 2 完善）**

```css
@import "tailwindcss";
```

- [ ] **Step 13: 跑 typecheck 确认无类型错**

Run: `cd website && npm run typecheck`
Expected: `0 errors`（Home/Layout/i18n 未定义会报错——先临时让 Home/Layout/i18n 返回空壳以通过，见下）。可在 `src/pages/Home.tsx`、`src/components/Layout.tsx` 放最小占位：
```tsx
// src/pages/Home.tsx
export default function Home() { return <p>TODO</p>; }
// src/components/Layout.tsx
import { Outlet } from 'react-router-dom';
export default function Layout() { return <main><Outlet /></main>; }
// src/i18n/index.tsx 最小占位，Task 3 再完善
export function LangProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
```
Expected: typecheck 通过。

- [ ] **Step 14: Commit**

```bash
cd website && git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html eslint.config.js scripts/postbuild.mjs public/.nojekyll public/_redirects public/favicon.svg src/vite-env.d.ts src/test-setup.ts src/main.tsx src/App.tsx src/pages/Home.tsx src/components/Layout.tsx src/i18n/index.tsx src/index.css
git commit -m "chore(website): 脚手架 Vite+React+TS+Tailwind v4+React Router，含 CF/GH Pages SPA 回退产物"
```

---

### Task 2: 设计 Token 系统（index.css）

**Covers:** [S3][S12]

**Files:**
- Modify: `website/src/index.css`
- Create: `website/src/components/Wordmark.tsx`

**Interfaces:**
- Produces tailwind 工具类：`bg-paper/text-ink/text-sub/border-line/bg-accent/bg-accent-soft/text-mute/bg-card/bg-green/...`；`font-sans`。

- [ ] **Step 1: 写完整 `website/src/index.css`**

```css
@import "tailwindcss";

@theme {
  --font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;

  --color-paper: #F7F7F4;
  --color-card: #FFFFFF;
  --color-ink: #17171A;
  --color-sub: #76767D;
  --color-line: #E8E8E3;
  --color-accent: #FF5A4E;
  --color-accent-soft: #FFF0EF;
  --color-green: #35C759;
  --color-mute: #A7A7AD;

  --radius-card: 20px;
  --radius-focus: 30px;

  --shadow-focus: 0 16px 46px rgba(23, 23, 28, 0.08);
  --shadow-device: 0 26px 80px rgba(0, 0, 0, 0.18);
}

@layer base {
  html {
    -webkit-text-size-adjust: 100%;
    scroll-behavior: smooth;
  }
  body {
    margin: 0;
    background: var(--color-paper);
    color: var(--color-ink);
    font-family: var(--font-sans);
    line-height: 1.7;
    -webkit-tap-highlight-color: transparent;
  }
  h1, h2, h3 {
    letter-spacing: -0.05em;
    line-height: 1.15;
    text-wrap: balance;
  }
  a { color: inherit; text-decoration: none; }
  button { font-family: inherit; }

  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

@layer utilities {
  .display {
    font-weight: 800;
    letter-spacing: -0.05em;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: 冒烟——加 `display:flex` body 背景检查**

Run: `cd website && npm run dev`（后台）或 `npm run build`
Expected: build 成功，`dist/` 生成，页面背景为暖白 `#F7F7F4`。

- [ ] **Step 3: Commit**

```bash
cd website && git add src/index.css
git commit -m "feat(website): 设计 token 系统（暖白克制 palette + 排版 + reduced-motion 守卫）"
```

---

### Task 3: i18n 文案与语言提供器

**Covers:** [S8][S11]

**Files:**
- Create: `website/src/i18n/messages.ts`, `website/src/i18n/index.tsx`
- Test: `website/__tests__/i18n.test.ts`

**Interfaces:**
- `Lang = 'zh' | 'en'`
- `messages: Record<string, { zh: string; en: string }>`（flat id）
- `t(id: string, lang: Lang): string`
- `useLang(): { lang: Lang; setLang(l: Lang): void; toggle(): void }`
- `LangProvider({ children })`：默认读 `localStorage['jnify-lang']`，否则 `'zh'`；初始化写回。

- [ ] **Step 1: 写 `website/src/i18n/messages.ts`（双语文案，唯一事实源）**

```ts
export type Lang = 'zh' | 'en';

export type Messages = Record<string, { zh: string; en: string }>;

export const messages: Messages = {
  // 全局
  'brand.name': { zh: 'J-nify', en: 'J-nify' },
  'brand.jennifer': { zh: 'Jennifer', en: 'Jennifer' },
  'brand.tag': { zh: '你的低打扰行动秘书', en: 'Your low-key action secretary' },
  'brand.slogan': { zh: '不急，但我帮您盯着。', en: 'Not urgent — but I’ll keep an eye on it.' },

  // 导航
  'nav.home': { zh: '首页', en: 'Home' },
  'nav.features': { zh: '功能详解', en: 'Features' },
  'nav.download': { zh: '下载', en: 'Download' },
  'nav.lang': { zh: 'EN', en: '中' },

  // Hero
  'hero.eyebrow': { zh: 'J-nify · Jennifer', en: 'J-nify · Jennifer' },
  'hero.title': { zh: '不急，但我帮您盯着。', en: 'Not urgent — but I’ll keep an eye on it.' },
  'hero.sub': {
    zh: '把「不急、但会忘」的小事交给 Jennifer。她不会催你，只会在真正顺手的那一刻，带着理由轻轻递到你面前。',
    en: 'Hand the “not urgent, but easy to forget” things to Jennifer. She won’t nag — she only shows up at the moment that truly fits, with a reason.',
  },
  'hero.ctaPrimary': { zh: '把一件小事交给 Jennifer', en: 'Hand one small thing to Jennifer' },
  'hero.ctaSecondary': { zh: '了解怎么用', en: 'See how it works' },
  'hero.trust': { zh: '不设闹钟 · 不催你 · 随时可改', en: 'No alarm · No nagging · Change anytime' },

  // P 人死循环
  'loop.label': { zh: '你有没有过这样的死循环？', en: 'Ever fallen into this loop?' },
  'loop.step1': { zh: '不紧急', en: 'Not urgent' },
  'loop.step2': { zh: '放一边', en: 'Put aside' },
  'loop.step3': { zh: '彻底消失', en: 'Gone for good' },
  'loop.step4': { zh: '死线 panic', en: 'Deadline panic' },
  'loop.step5': { zh: '完蛋', en: 'Too late' },
  'loop.text': {
    zh: 'P 人不是不想做好，是很多事一旦放下就真的会蒸发。拖到最后一晚再通宵，或者干脆忘到天荒地老。',
    en: 'P people aren’t unwilling — it’s that once something is set down, it genuinely evaporates. Until the last all-nighter, or forgotten forever.',
  },

  // Jennifer 不是闹钟
  'notAlarm.title': { zh: 'Jennifer 不是闹钟，是一个会「盯」的秘书', en: 'Jennifer isn’t an alarm. She’s a secretary who “keeps watch.”' },
  'notAlarm.lead': {
    zh: '传统待办 App 的解法是「到点响铃 + 逾期红字羞辱」。但这只会让你更焦虑、更想关掉通知。',
    en: 'The classic to-do fix is “ring at a time + shame you in red.” That only makes you more anxious — and more likely to mute it.',
  },
  'notAlarm.r1a': { zh: '设一个时间点，到点响铃', en: 'Set a time, ring at that time' },
  'notAlarm.r1b': { zh: '设一个「状态窗口」，到点带理由出现', en: 'Set a “state window,” appear with a reason' },
  'notAlarm.r2a': { zh: '到点必须做，不做就红字逾期', en: 'Must do it, or face red overdue' },
  'notAlarm.r2b': { zh: '到点给你四个选项，不做不算失败', en: 'Four choices at the moment; not choosing isn’t failure' },
  'notAlarm.r3a': { zh: '逾期后疯狂报警', en: 'Alarms go off after it’s late' },
  'notAlarm.r3b': { zh: '逾期后帮你兜底：延期申请 / 替代方案', en: 'If it slips, she has your back: extension / alternative' },
  'notAlarm.r4a': { zh: '任务录入后消失，直到死线', en: 'Task vanishes after entry until the deadline' },
  'notAlarm.r4b': { zh: '任务以低存在感持续「漂浮」在背景里', en: 'Task keeps “drifting” in the background at low presence' },

  // 信号
  'signals.title': { zh: '她会在什么时候出现？', en: 'When does she show up?' },
  'signals.sub': {
    zh: '她不会给你设一个「下午 3 点必须做」的闹钟。她把每件事放在后台低电量漂浮，等一个真正顺手的窗口。',
    en: 'She won’t set “3 PM, do it now.” She lets each thing drift on low battery in the background, waiting for a window that truly fits.',
  },
  'signals.calendar': { zh: '日历空档', en: 'Calendar gap' },
  'signals.calendarD': { zh: '你正好有空的那 15 分钟', en: 'The 15 minutes you happen to be free' },
  'signals.weather': { zh: '天气', en: 'Weather' },
  'signals.weatherD': { zh: '连续晴天微风，适合晒被子', en: 'Clear skies and a breeze — good for airing quilts' },
  'signals.location': { zh: '顺路', en: 'En route' },
  'signals.locationD': { zh: '你正要出门，楼下就是快递柜', en: 'You’re heading out; the locker is downstairs' },
  'signals.usage': { zh: '使用状态', en: 'Usage state' },
  'signals.usageD': { zh: '你刷手机刚满 20 分钟，顺手回条消息', en: 'You’ve been scrolling 20 min — reply in passing' },
  'signals.deadline': { zh: '死线距离', en: 'Deadline distance' },
  'signals.deadlineD': { zh: '还剩 10 天，来得及，不是来不及', en: '10 days left — enough, not “too late”' },
  'signals.reason': {
    zh: '每次出现，她都会告诉你「为什么是现在」——没有理由，她就不出现。',
    en: 'Every time she appears, she tells you *why now* — no reason, no nudge.',
  },

  // 四个决定（核心）
  'decisions.title': { zh: '每次出现，都给你一条体面的退路', en: 'Every nudge comes with a dignified way out' },
  'decisions.sub': { zh: '她永远把选择权留给你，从不替你做决定。', en: 'She always leaves the choice to you — never decides for you.' },
  'decisions.now': { zh: '现在做', en: 'Do it now' },
  'decisions.nowD': { zh: '顺势把这个小坑填了', en: 'Fill the little hole while you’re at it' },
  'decisions.later': { zh: '晚点，换个窗口', en: 'Later, another window' },
  'decisions.laterD': { zh: '她真的不再烦你', en: 'She really won’t bother you again' },
  'decisions.drop': { zh: '这件事算了', en: 'Let it go' },
  'decisions.dropD': { zh: '体面收口，不羞辱', en: 'Close it with dignity, no shame' },
  'decisions.rescue': { zh: '帮我兜底', en: 'Cover for me' },
  'decisions.rescueD': { zh: '写延期申请 / 上门取件 / 替代表达', en: 'Draft extension / pickup / speak for you' },

  // Nudge 焦点卡（签名元素）
  'nudge.eyebrow': { zh: '此刻最顺手', en: 'Best window right now' },
  'nudge.title': { zh: '回一下小明', en: 'Reply to Xiaoming' },
  'nudge.reason': {
    zh: '你刚刷手机 23 分钟，社交阻力最低。草稿已备好，30 秒能收尾。',
    en: 'You’ve been scrolling 23 min — social friction is lowest now. Draft is ready; 30 seconds to wrap it up.',
  },
  'nudge.chipReason': { zh: '为什么是现在', en: 'Why now' },
  'nudge.chipCost': { zh: '约 30 秒', en: '~30 s' },
  'nudge.chipLater': { zh: '可晚点', en: 'Can wait' },
  'nudge.guard': { zh: '不逾期羞辱 · 不连续轰炸 · 每次给理由', en: 'No overdue shame · No spam · Always a reason' },

  // 真实场景
  'scenarios.title': { zh: '这些时候，Jennifer 都在', en: 'These are the moments Jennifer shows up' },
  'scenarios.sub': { zh: '用一个足够真实的场景，感受她出现时的分量。', en: 'A real enough moment to feel the weight of her timing.' },
  'scenario.bill.title': { zh: '信用卡账单 · 月底才到期', en: 'Credit-card bill · due end of month' },
  'scenario.bill.body': {
    zh: '现在才月初，月底还早。账单进来当天，她只说一句：「我帮您记下了，不会打扰您。」9 月 20 日，她轻轻弹出：「老板，那笔账单还有 10 天。现在手头宽裕吗？顺手的话 2 分钟就能搞定；在等工资的话，我 25 号再提醒您。」她没说「你该还钱了」，而是把决策权和舒服的时机一起递过来。',
    en: 'It’s early in the month; the end is far off. On arrival she says only: “Noted — I won’t bother you.” On the 20th she slips in: “Boss, that bill is 10 days out. Cash handy? 2 min and it’s done. Waiting for payday? I’ll nudge you on the 25th.” She never says “pay up” — she hands you the choice *and* a comfortable moment.',
  },
  'scenario.xm.title': { zh: '回小明 · 过两天再回', en: 'Reply to Xiaoming · “in a couple days”' },
  'scenario.xm.body': {
    zh: '「过两天」常常是两周后突然想起，对方已经觉得被冷落了。Jennifer 说：「我不设闹钟，会在您觉得比较闲的时候再提——比如下次刷手机超过 20 分钟，或者周末上午。」周六上午 10 点，你正躺着刷手机，她弹出：「要不要花 30 秒回一下小明？我帮您拟好了：『最近忙疯了，下周二晚上有空吗？请你吃饭赔罪。』」',
    en: '“A couple days” often becomes “two weeks later,” and they already feel ignored. Jennifer says: “No alarm — I’ll bring it up when you’re relaxed, like after 20 min of scrolling, or Sunday morning.” Sat 10 AM, you’re scrolling in bed; she appears: “30 seconds to reply to Xiaoming? Draft ready: ‘Crazy busy lately — free Tuesday evening? Dinner’s on me.’”',
  },
  'scenario.quilt.title': { zh: '晒被子 · 没有死线', en: 'Airing the quilt · no deadline' },
  'scenario.quilt.body': {
    zh: '妈妈上周说「有空把冬天的被子晒一下」——没有 deadline，属于无限期拖延。Jennifer 记下了，但她说：「我看了天气预报，本周三、周四连续晴天微风，您要不要考虑那两天？我提前一晚提醒您，您只需回答『晒』或『再等等』。」她不每周追问，只等下一个完美天气窗口。',
    en: 'Mom said last week: “air the winter quilt when you can” — no deadline, pure indefinite procrastination. Jennifer notes it, then: “Forecast says Wednesday and Thursday: clear and breezy. Want those days? I’ll remind you the night before — just answer ‘air it’ or ‘later.’” She won’t ask weekly; she waits for the next perfect weather window.',
  },

  // 为什么叫 J-nify
  'why.title': { zh: '为什么叫 J-nify？', en: 'Why “J-nify”?' },
  'why.body': {
    zh: '这是一款为 J 型秩序感而生的工具——用来照顾那些计划感偏弱、但内心并不想乱的人（P 人）。Jennifer 把 J 人的纪律，翻译成 P 人也能舒服接受的「时机提醒」。',
    en: 'It’s built for J-type order — to care for those with weaker planning instinct but who don’t want chaos (P people). Jennifer translates J-type discipline into “timing nudges” a P person can accept comfortably.',
  },

  // 最终 CTA
  'cta.title': { zh: '把第一件小事，交给 Jennifer', en: 'Hand your first small thing to Jennifer' },
  'cta.sub': { zh: '现在就下载，让她开始替您盯着。', en: 'Download now and let her start keeping watch.' },
  'cta.button': { zh: '下载最新版', en: 'Download latest' },
  'cta.secondary': { zh: '先看看怎么用', en: 'See how it works first' },

  // 页脚 / About
  'footer.about': { zh: '关于 J-nify', en: 'About J-nify' },
  'footer.domain': { zh: '官网', en: 'Website' },
  'footer.opensource': { zh: '开源 · AGPL-3.0', en: 'Open source · AGPL-3.0' },
  'footer.slogan': { zh: '不急，但我帮您盯着。', en: 'Not urgent — but I’ll keep an eye on it.' },
  'footer.rights': { zh: 'J-nify · Jennifer 低打扰行动秘书', en: 'J-nify · Jennifer low-key action secretary' },

  // 功能详解页
  'features.hero.eyebrow': { zh: '功能详解', en: 'Features' },
  'features.hero.title': { zh: 'Jennifer 会做什么', en: 'What Jennifer does' },
  'features.hero.sub': {
    zh: '它不解决「自律」，它解决「时机」和「阻力」。让下一步小到 30 秒就能做完，并永远给你留一条体面的退路。',
    en: 'It doesn’t solve “self-discipline.” It solves timing and friction — makes the next step small enough to do in 30 seconds, and always leaves a dignified exit.',
  },
  'features.pillars.title': { zh: '五大功能支柱', en: 'Five pillars' },
  'features.pillar.capture': { zh: '一句话录入', en: 'One-line capture' },
  'features.pillar.captureD': { zh: '像跟秘书说一声一样，把事丢给她。你不需要急着为它排计划。', en: 'Like telling a secretary — drop it and go. No need to plan it instantly.' },
  'features.pillar.window': { zh: '机会窗口（信号引擎）', en: 'Opportunity windows (signal engine)' },
  'features.pillar.windowD': { zh: '结合日历、天气、位置、使用状态与死线距离，算出真正「顺手」的时机。', en: 'Combines calendar, weather, location, usage and deadline distance to find the moment that truly fits.' },
  'features.pillar.decision': { zh: '决策闭环', en: 'Decision loop' },
  'features.pillar.decisionD': { zh: '现在做 / 晚点 / 算了 / 帮我兜底，每一次选择都构成闭环。', en: 'Do now / later / drop / cover — every choice closes the loop.' },
  'features.pillar.guardrail': { zh: '反打扰护栏', en: 'Anti-nag guardrails' },
  'features.pillar.guardrailD': { zh: '安静时段、单事项提醒上限、「别再提」一次生效、没有理由不通知。', en: 'Quiet hours, per-item nudge cap, one-shot “never again,” and no nudge without a reason.' },
  'features.pillar.memory': { zh: '记忆校准与兜底', en: 'Memory calibration & rescue' },
  'features.pillar.memoryD': { zh: '记住哪些窗口有效、哪些话术被嫌弃，以及放弃后的真实后果，用来校准 Jennifer。', en: 'Learns which windows work, which phrasing flops, and what abandonment really costs.' },

  'features.how.title': { zh: 'Jennifer 怎么用：一次完整的托付', en: 'How Jennifer works: one complete handoff' },
  'features.how.step1': { zh: '一句话交给 Jennifer', en: 'Give Jennifer one line' },
  'features.how.step1d': { zh: '「月底还信用卡」「有空把被子晒了」。', en: '“Pay the card by month-end.” “Air the quilt when you can.”' },
  'features.how.step2': { zh: '她记下，然后消失', en: 'She notes it, then vanishes' },
  'features.how.step2d': { zh: '事项进入低电量漂浮，不打扰你。', en: 'It drifts on low battery, never bothering you.' },
  'features.how.step3': { zh: '等一个真正顺手的窗口', en: 'Wait for a window that truly fits' },
  'features.how.step3d': { zh: '天气 / 日历空档 / 顺路 / 使用状态 / 死线距离。', en: 'Weather / calendar gap / en route / usage / deadline distance.' },
  'features.how.step4': { zh: '带理由，轻轻出现', en: 'Show up gently, with a reason' },
  'features.how.step4d': { zh: '「为什么是现在」——没有理由，她就不出现。', en: '“Why now” — no reason, no nudge.' },
  'features.how.step5': { zh: '你四选一，闭环', en: 'You choose from four — loop closes' },
  'features.how.step5d': { zh: '现在做 / 晚点 / 算了 / 帮我兜底。', en: 'Do now / later / drop / cover.' },

  'features.cases.title': { zh: '完整用例：五个背景故事', en: 'Full use cases: five stories' },
  'features.case.v1': { zh: '账单', en: 'Bill' },
  'features.case.v2': { zh: '晒被子', en: 'Quilt' },
  'features.case.v3': { zh: '回小明', en: 'Reply Xiaoming' },
  'features.case.v4': { zh: '小组作业', en: 'Group project' },
  'features.case.v5': { zh: '七天退货', en: '7-day return' },

  'features.roadmap.title': { zh: '路线图', en: 'Roadmap' },
  'features.m0': { zh: 'M0 骨架', en: 'M0 Skeleton' },
  'features.m0d': { zh: '录入 → 漂浮 → 窗口 → 三选项闭环（已发布）', en: 'Capture → drift → window → three-choice loop (shipped)' },
  'features.m1': { zh: 'M1 信号', en: 'M1 Signals' },
  'features.m1d': { zh: '日历 / 天气 / 位置 / 使用状态 + 频控红线（进行中）', en: 'Calendar / weather / location / usage + limits (in progress)' },
  'features.m2': { zh: 'M2 Jennifer 大脑', en: 'M2 Jennifer brain' },
  'features.m2d': { zh: '多供应商热重载模型管理，时序判断仍用确定性规则', en: 'Hot-reload multi-provider models; timing stays deterministic' },
  'features.m3': { zh: 'M3 灰度', en: 'M3 Gradual rollout' },
  'features.m3d': { zh: '100–300 种子用户 + 指标看板', en: '100–300 seed users + metrics' },
  'features.status.now': { zh: '当前', en: 'Now' },
  'features.opensource.body': {
    zh: 'J-nify 开源，遵循 AGPL-3.0。官网与 App 的每一次「时机提醒」都由确定性规则驱动，智能只用于解析、拆解、话术与兜底草稿。',
    en: 'J-nify is open source under AGPL-3.0. Every timing nudge is driven by deterministic rules; intelligence is used only for parsing, splitting, phrasing and rescue drafts.',
  },

  // 下载页
  'download.hero.title': { zh: '下载 J-nify', en: 'Download J-nify' },
  'download.hero.sub': { zh: '最新版本与发布说明，实时同步 GitHub Release，无需跳转。', en: 'Latest version & release notes, synced live from GitHub Release — no jumping away.' },
  'download.latest': { zh: '最新版本', en: 'Latest version' },
  'download.published': { zh: '发布于', en: 'Published' },
  'download.android': { zh: 'Android（APK 直接安装）', en: 'Android (APK direct install)' },
  'download.play': { zh: 'Google Play（AAB 上架）', en: 'Google Play (AAB listing)' },
  'download.ios': { zh: 'iOS（未签名，需 Apple 证书）', en: 'iOS (unsigned; needs Apple cert)' },
  'download.releaseNotes': { zh: '版本发布说明', en: 'Release notes' },
  'download.loading': { zh: '正在同步最新版本…', en: 'Syncing the latest version…' },
  'download.error': { zh: '暂时无法获取版本信息，请稍后再试。', en: 'Couldn’t fetch version info. Please try again shortly.' },
  'download.retry': { zh: '重试', en: 'Retry' },
  'download.live': { zh: '实时来自 GitHub Release', en: 'Live from GitHub Release' },
  'download.recommended': { zh: '推荐', en: 'Recommended' },
  'download.size': { zh: '大小', en: 'Size' },
};
```

> `messages.ts` 中每条 id 的值即 `{ zh, en }`，`LANG` 与 `Messages` 类型就在同文件内联声明——无需单独 `types.ts` / `en.ts`，天然单源、不缺键。

- [ ] **Step 3: 写 `website/src/i18n/index.tsx`**

```tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { messages } from './messages';
import type { Lang } from './messages';

export type { Lang };

type LangContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
};

const STORAGE_KEY = 'jnify-lang';

const LangContext = createContext<LangContextValue | null>(null);

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    /* SSR / storage unavailable */
  }
  return 'zh';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  };

  const toggle = () => setLang(lang === 'zh' ? 'en' : 'zh');

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, toggle }), [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within <LangProvider>');
  return ctx;
}

export function t(id: string, lang: Lang): string {
  const m = messages[id];
  if (!m) return id;
  return m[lang];
}
```

- [ ] **Step 4: 写测试 `website/__tests__/i18n.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { messages } from '../src/i18n/messages';
import { t } from '../src/i18n';

describe('i18n messages', () => {
  it('slogan is the brand promise in both languages', () => {
    expect(t('brand.slogan', 'zh')).toBe('不急，但我帮您盯着。');
    expect(t('brand.slogan', 'en')).toContain('keep an eye');
  });

  it('every message has both zh and en', () => {
    for (const [id, m] of Object.entries(messages)) {
      expect(typeof m.zh, `id=${id}`).toBe('string');
      expect(typeof m.en, `id=${id}`).toBe('string');
      expect(m.zh.length).toBeGreaterThan(0);
      expect(m.en.length).toBeGreaterThan(0);
    }
  });

  it('returns the id when unknown', () => {
    expect(t('nope.none', 'zh')).toBe('nope.none');
  });

  it('has no empty zh value for Chinese-first audience', () => {
    const zhEmpty = Object.entries(messages).filter(([, m]) => !m.zh.trim());
    expect(zhEmpty).toEqual([]);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd website && npm run test`
Expected: 用例全绿。首次缺 `messages.ts` 时先建。

- [ ] **Step 6: Commit**

```bash
cd website && git add src/i18n/messages.ts src/i18n/index.tsx __tests__/i18n.test.ts
git commit -m "feat(website): i18n 双语文案字典 + 语言提供器（localStorage 持久化）"
```

---

### Task 4: App Shell（路由 + 布局 + 页头页脚 + 语言开关）

**Covers:** [S4][S10]

**Files:**
- Modify: `website/src/App.tsx`, `website/src/main.tsx`
- Create: `website/src/components/Wordmark.tsx`, `LanguageToggle.tsx`, `Header.tsx`, `Footer.tsx`, `Layout.tsx`, `Section.tsx`
- Test: `website/__tests__/app.test.tsx`, `website/__tests__/lang-toggle.test.tsx`

**Interfaces:**
- Produces: `Layout`（`<Outlet/>` + Header + Footer + 移动安全区 + 顶部回滚）、`Section({ eyebrow, title, sub, children })`、`LanguageToggle`。

- [ ] **Step 1: 写 `website/src/components/Wordmark.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { t, useLang } from '../i18n';

export default function Wordmark({ to = '/' }: { to?: string }) {
  const { lang } = useLang();
  return (
    <Link to={to} className="inline-flex items-center gap-2" aria-label="J-nify">
      <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
      <span className="text-base font-extrabold tracking-tight text-ink">
        J-nify
        <span className="ml-1.5 text-[11px] font-semibold text-sub">{t('brand.jennifer', lang)}</span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: 写 `website/src/components/LanguageToggle.tsx`**

```tsx
import { useLang } from '../i18n';
import { t } from '../i18n';

export default function LanguageToggle() {
  const { lang, toggle } = useLang();
  return (
    <button
      type="button"
      onClick={toggle}
      className="h-9 rounded-full border border-line px-3 text-xs font-semibold text-sub transition-colors hover:border-accent hover:text-accent"
    >
      {t('nav.lang', lang)}
    </button>
  );
}
```

- [ ] **Step 3: 写 `website/src/components/Header.tsx`（顶栏 + 移动端底部导航）**

```tsx
import { NavLink } from 'react-router-dom';
import Wordmark from './Wordmark';
import LanguageToggle from './LanguageToggle';
import { useLang, t } from '../i18n';

const items = [
  { to: '/', key: 'nav.home' },
  { to: '/features', key: 'nav.features' },
  { to: '/download', key: 'nav.download' },
] as const;

export default function Header() {
  const { lang } = useLang();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
        <Wordmark />
        <div className="hidden items-center gap-1 sm:flex">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-soft text-accent' : 'text-sub hover:text-ink'
                }`
              }
            >
              {t(it.key, lang)}
            </NavLink>
          ))}
          <span className="mx-2 h-4 w-px bg-line" aria-hidden="true" />
        </div>
        <LanguageToggle />
      </nav>
    </header>
  );
}
```

> 移动端顶部仅显示 Wordmark + 语言开关；主导航以底部 Tab 呈现（见 Layout 的 NavTab）。

- [ ] **Step 4: 写 `website/src/components/Section.tsx`**

```tsx
import type { ReactNode } from 'react';

export default function Section({
  eyebrow,
  title,
  sub,
  children,
  id,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mx-auto max-w-3xl scroll-mt-24 px-5 py-16 sm:py-20">
      {eyebrow && (
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      )}
      <h2 className="text-[26px] font-extrabold leading-tight text-ink sm:text-3xl">{title}</h2>
      {sub && <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-sub">{sub}</p>}
      {children && <div className="mt-10">{children}</div>}
    </section>
  );
}
```

- [ ] **Step 5: 写 `website/src/components/Footer.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { t, useLang } from '../i18n';

const PROD_DOMAIN = 'https://j-nify.arr2018.dpdns.org';

export default function Footer() {
  const { lang } = useLang();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-sm font-semibold text-ink">{t('footer.slogan', lang)}</p>
        <p className="mt-1 text-xs text-sub">{t('footer.rights', lang)}</p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-sub">
          <Link to="/" className="hover:text-accent">{t('nav.home', lang)}</Link>
          <Link to="/features" className="hover:text-accent">{t('nav.features', lang)}</Link>
          <Link to="/download" className="hover:text-accent">{t('nav.download', lang)}</Link>
          <a href={PROD_DOMAIN} className="hover:text-accent" translate="no">{PROD_DOMAIN}</a>
        </div>
        <p className="mt-6 flex flex-wrap items-center gap-2 text-[11px] text-mute">
          <span>{t('footer.opensource', lang)}</span>
          <span aria-hidden="true">·</span>
          <span>&copy; {year} J-nify</span>
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: 写 `website/src/components/Layout.tsx`（含移动底部 Tab + 顶部回滚）**

```tsx
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { t, useLang } from '../i18n';

const tabs = [
  { to: '/', key: 'nav.home' },
  { to: '/features', key: 'nav.features' },
  { to: '/download', key: 'nav.download' },
] as const;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function Layout() {
  const { lang } = useLang();
  return (
    <div className="min-h-screen bg-paper text-ink">
      <ScrollToTop />
      <Header />
      <main className="min-h-[70vh]">
        <Outlet />
      </main>
      <Footer />

      {/* 移动端底部 Tab */}
      <nav
        aria-label="primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-3">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-accent' : 'text-sub'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-transparent'}`}
                    aria-hidden="true"
                  />
                  {t(tab.key, lang)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* 底部安全区留白，避免内容被 Tab 遮挡 */}
      <div className="h-20 sm:hidden" aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 7: 更新 `website/src/App.tsx` 加入三条路由**

```tsx
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Features from './pages/Features';
import Download from './pages/Download';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="features" element={<Features />} />
        <Route path="download" element={<Download />} />
      </Route>
    </Routes>
  );
}
```

> 需要 `src/pages/Features.tsx`、`src/pages/Download.tsx` 最小占位（Task 6/7 完善）：
```tsx
// src/pages/Features.tsx
export default function Features() { return <p className="px-5 py-10">TODO features</p>; }
// src/pages/Download.tsx
export default function Download() { return <p className="px-5 py-10">TODO download</p>; }
```

- [ ] **Step 8: 写测试 `website/__tests__/lang-toggle.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider, useLang } from '../src/i18n';
import LanguageToggle from '../src/components/LanguageToggle';
import { t } from '../src/i18n';

function Probe() {
  const { lang } = useLang();
  return <span data-testid="lang">{lang}</span>;
}

describe('LanguageToggle', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to zh and toggles to en, persisting', () => {
    render(
      <BrowserRouter>
        <LangProvider>
          <Probe />
          <LanguageToggle />
        </LangProvider>
      </BrowserRouter>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('zh');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(localStorage.getItem('jnify-lang')).toBe('en');
  });

  it('reads persisted en', () => {
    localStorage.setItem('jnify-lang', 'en');
    render(
      <BrowserRouter>
        <LangProvider>
          <Probe />
        </LangProvider>
      </BrowserRouter>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('en');
  });
});
```

- [ ] **Step 9: 写测试 `website/__tests__/app.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../src/i18n';
import App from '../src/App';

function renderApp(path = '/') {
  window.history.pushState({}, '', path);
  return render(
    <BrowserRouter>
      <LangProvider>
        <App />
      </LangProvider>
    </BrowserRouter>,
  );
}

describe('App routing', () => {
  it('renders home hero on /', () => {
    renderApp('/');
    expect(screen.getByText(/不急，但我帮您盯着/)).toBeInTheDocument();
  });
});
```

> Home 页会渲染 hero（Task 5/6），此测试在 Task 6 完成后才通过；先保留在 Task 6 验证。此处仅登记用例，Task 6 运行。

- [ ] **Step 10: Run typecheck**

Run: `cd website && npm run typecheck`
Expected: `0 errors`（含占位页）。

- [ ] **Step 11: Commit**

```bash
cd website && git add src/App.tsx src/main.tsx src/components/Wordmark.tsx src/components/LanguageToggle.tsx src/components/Header.tsx src/components/Footer.tsx src/components/Layout.tsx src/components/Section.tsx src/pages/Features.tsx src/pages/Download.tsx __tests__/lang-toggle.test.tsx __tests__/app.test.tsx
git commit -m "feat(website): App shell（路由/布局/页头页脚/语言开关/移动底部Tab/回滚）"
```

---

### Task 5: 共享组件（NudgeCard / SignalGrid / CompareTable / ScenarioCard / ReleaseNote）

**Covers:** [S2][S3][S5][S7]

**Files:**
- Create: `website/src/components/NudgeCard.tsx`, `DecisionGrid.tsx`, `SignalGrid.tsx`, `CompareTable.tsx`, `ScenarioCard.tsx`, `ReleaseNote.tsx`
- Test: `website/__tests__/components.test.tsx`

**Interfaces:**
- `NudgeCard({ eyebrow, title, reason, chips, actions })`：签名焦点卡，四动作可视化，`aria-label="Nudge 焦点卡"`。
- `SignalGrid()`：5 信号网格，key 数组 `['calendar','weather','location','usage','deadline']`。
- `CompareTable()`：传统 vs Jennifer 4 行对比。
- `ScenarioCard({ title, body })`。
- `ReleaseNote({ body })`：`<ReactMarkdown remarkPlugins={[remarkGfm]}>`，`translate="no"`。

- [ ] **Step 1: 写 `website/src/components/NudgeCard.tsx`**

```tsx
import { t, useLang } from '../i18n';

export type NudgeAction = 'now' | 'later' | 'drop' | 'rescue';

export const NUDGE_ACTIONS: NudgeAction[] = ['now', 'later', 'drop', 'rescue'];

export default function NudgeCard() {
  const { lang } = useLang();
  const tone: Record<NudgeAction, string> = {
    now: 'bg-accent text-white',
    later: 'bg-card border border-line text-ink',
    drop: 'text-sub',
    rescue: 'bg-accent-soft text-ink border border-accent-soft',
  };
  return (
    <div
      className="rounded-[30px] border border-line bg-card p-6 shadow-focus"
      role="group"
      aria-label={t('nudge.eyebrow', lang)}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
        {t('nudge.eyebrow', lang)}
      </p>
      <h3 className="mt-3 text-2xl font-extrabold text-ink">{t('nudge.title', lang)}</h3>
      <p className="mt-3 text-[15px] leading-relaxed text-sub">{t('nudge.reason', lang)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['chipReason', 'chipCost', 'chipLater'] as const).map((c) => (
          <span key={c} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-ink">
            {t(c, lang)}
          </span>
        ))}
      </div>
      <div className="mt-6 grid gap-2">
        {NUDGE_ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            disabled
            className={`flex min-h-12 items-center justify-between rounded-2xl px-4 text-left text-sm font-semibold ${tone[a]}`}
          >
            <span>{t(`decisions.${a}`, lang)}</span>
            <span className="text-xs font-normal opacity-80">{t(`decisions.${a}D`, lang)}</span>
          </button>
        ))}
      </div>
      <p className="mt-5 text-center text-[11px] text-mute">{t('nudge.guard', lang)}</p>
    </div>
  );
}
```

- [ ] **Step 1b: 写 `website/src/components/DecisionGrid.tsx`（四个决定的独立展示，避免与 hero 焦点卡重复）**

```tsx
import { t, useLang } from '../i18n';

const DECISIONS = ['now', 'later', 'drop', 'rescue'] as const;

export default function DecisionGrid() {
  const { lang } = useLang();
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {DECISIONS.map((d) => (
        <li key={d} className="rounded-3xl border border-line bg-card p-5">
          <p className="font-extrabold text-ink">{t(`decisions.${d}`, lang)}</p>
          <p className="mt-1 text-sm leading-relaxed text-sub">{t(`decisions.${d}D`, lang)}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: 写 `website/src/components/SignalGrid.tsx`**

```tsx
import { t, useLang } from '../i18n';

const SIGNALS = ['calendar', 'weather', 'location', 'usage', 'deadline'] as const;
const ICONS: Record<(typeof SIGNALS)[number], string> = {
  calendar: '📅',
  weather: '☀️',
  location: '📍',
  usage: '📱',
  deadline: '⏳',
};

export default function SignalGrid() {
  const { lang } = useLang();
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SIGNALS.map((s) => (
        <li
          key={s}
          className="flex items-start gap-4 rounded-3xl border border-line bg-card p-5"
        >
          <span className="text-2xl" aria-hidden="true">{ICONS[s]}</span>
          <div>
            <p className="font-bold text-ink">{t(`signals.${s}`, lang)}</p>
            <p className="mt-1 text-sm leading-relaxed text-sub">{t(`signals.${s}D`, lang)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: 写 `website/src/components/CompareTable.tsx`**

```tsx
import { t, useLang } from '../i18n';

const ROWS = [
  ['r1a', 'r1b'],
  ['r2a', 'r2b'],
  ['r3a', 'r3b'],
  ['r4a', 'r4b'],
] as const;

export default function CompareTable() {
  const { lang } = useLang();
  return (
    <div className="overflow-hidden rounded-3xl border border-line">
      <div className="grid grid-cols-2 bg-paper text-xs font-bold uppercase tracking-wide">
        <div className="px-5 py-3 text-sub">传统待办</div>
        <div className="px-5 py-3 text-accent">Jennifer</div>
      </div>
      {ROWS.map(([a, b]) => (
        <div key={a} className="grid grid-cols-2 border-t border-line bg-card">
          <div className="px-5 py-4 text-sm text-sub">{t(`notAlarm.${a}`, lang)}</div>
          <div className="px-5 py-4 text-sm font-medium text-ink">{t(`notAlarm.${b}`, lang)}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 写 `website/src/components/ScenarioCard.tsx`**

```tsx
export default function ScenarioCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        <h3 className="text-lg font-extrabold text-ink">{title}</h3>
      </div>
      <p className="mt-3 text-[15px] leading-[1.8] text-sub" translate="no">{body}</p>
    </article>
  );
}
```

- [ ] **Step 5: 写 `website/src/components/ReleaseNote.tsx`**

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ReleaseNote({ body }: { body: string }) {
  return (
    <div
      className="prose-sm max-w-none space-y-3 text-sm leading-relaxed text-sub [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:pl-5"
      translate="no"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
```

> 若未安装 `@tailwindcss/typography`，`prose-sm` 会失效——上例已用任意类选择器自写样式，无需 typography 插件。保持无该插件。

- [ ] **Step 6: 写测试 `website/__tests__/components.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LangProvider } from '../src/i18n';
import NudgeCard from '../src/components/NudgeCard';
import DecisionGrid from '../src/components/DecisionGrid';
import SignalGrid from '../src/components/SignalGrid';
import CompareTable from '../src/components/CompareTable';
import ScenarioCard from '../src/components/ScenarioCard';

const wrap = (ui: React.ReactNode) => render(<LangProvider>{ui}</LangProvider>);

describe('shared components', () => {
  it('NudgeCard shows four decisions', () => {
    wrap(<NudgeCard />);
    expect(screen.getByText(/现在做/)).toBeInTheDocument();
    expect(screen.getByText(/晚点/)).toBeInTheDocument();
    expect(screen.getByText(/算了/)).toBeInTheDocument();
    expect(screen.getByText(/帮我兜底/)).toBeInTheDocument();
  });
  it('DecisionGrid shows four decisions', () => {
    wrap(<DecisionGrid />);
    expect(screen.getByText(/现在做/)).toBeInTheDocument();
    expect(screen.getByText(/帮我兜底/)).toBeInTheDocument();
  });
  it('SignalGrid renders five signals', () => {
    wrap(<SignalGrid />);
    expect(screen.getByText(/日历空档/)).toBeInTheDocument();
    expect(screen.getByText(/天气/)).toBeInTheDocument();
    expect(screen.getByText(/顺路/)).toBeInTheDocument();
    expect(screen.getByText(/使用状态/)).toBeInTheDocument();
    expect(screen.getByText(/死线距离/)).toBeInTheDocument();
  });
  it('CompareTable renders four rows', () => {
    wrap(<CompareTable />);
    expect(screen.getByText(/到点响铃/)).toBeInTheDocument();
    expect(screen.getByText(/状态窗口/)).toBeInTheDocument();
  });
  it('ScenarioCard renders title and body', () => {
    wrap(<ScenarioCard title="标题" body="正文内容" />);
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('正文内容')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run tests**

Run: `cd website && npm run test`
Expected: 全绿。

- [ ] **Step 8: Commit**

```bash
cd website && git add src/components/NudgeCard.tsx src/components/DecisionGrid.tsx src/components/SignalGrid.tsx src/components/CompareTable.tsx src/components/ScenarioCard.tsx src/components/ReleaseNote.tsx __tests__/components.test.tsx
git commit -m "feat(website): 共享组件（Nudge焦点卡/DecisionGrid/信号网格/对比表/场景卡/发布说明渲染）"
```

---

### Task 6: 首页 Home

**Covers:** [S2][S5]

**Files:**
- Modify: `website/src/pages/Home.tsx`
- Test: `website/__tests__/app.test.tsx`（复用）

**Interfaces:**
- Consumes: `Section`, `NudgeCard`, `DecisionGrid`, `SignalGrid`, `CompareTable`, `ScenarioCard`, `t/useLang`, `Link`。

- [ ] **Step 1: 写 `website/src/pages/Home.tsx`**

```tsx
import { Link } from 'react-router-dom';
import Section from '../components/Section';
import NudgeCard from '../components/NudgeCard';
import DecisionGrid from '../components/DecisionGrid';
import SignalGrid from '../components/SignalGrid';
import CompareTable from '../components/CompareTable';
import ScenarioCard from '../components/ScenarioCard';
import { t, useLang } from '../i18n';

const LOOP = ['step1', 'step2', 'step3', 'step4', 'step5'] as const;
const SCENARIOS = ['bill', 'xm', 'quilt'] as const;

export default function Home() {
  const { lang } = useLang();
  const scenarioTitles: Record<(typeof SCENARIOS)[number], string> = {
    bill: t('scenario.bill.title', lang),
    xm: t('scenario.xm.title', lang),
    quilt: t('scenario.quilt.title', lang),
  };
  const scenarioBodies: Record<(typeof SCENARIOS)[number], string> = {
    bill: t('scenario.bill.body', lang),
    xm: t('scenario.xm.body', lang),
    quilt: t('scenario.quilt.body', lang),
  };

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-5 pt-16 text-center sm:pt-24">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">{t('hero.eyebrow', lang)}</p>
        <h1 className="display mt-5 text-[38px] leading-tight text-ink sm:text-5xl">{t('hero.title', lang)}</h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-sub">{t('hero.sub', lang)}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/download"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-bold text-white transition-colors hover:bg-accent/90"
          >
            {t('hero.ctaPrimary', lang)}
          </Link>
          <Link
            to="/features"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-card px-6 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
          >
            {t('hero.ctaSecondary', lang)}
          </Link>
        </div>
        <p className="mt-5 text-xs text-mute">{t('hero.trust', lang)}</p>

        {/* 签名元素：Nudge 焦点卡（放 hero 下方随滚动浮现） */}
        <div className="mt-14">
          <NudgeCard />
        </div>
      </section>

      {/* P 人死循环 */}
      <Section eyebrow="" title={t('loop.label', lang)}>
        <ol className="flex flex-wrap items-center justify-center gap-2">
          {LOOP.map((s, i) => (
            <li key={s}>
              <span className="inline-flex items-center gap-2 rounded-full bg-card border border-line px-4 py-2 text-sm font-semibold text-ink">
                {t(`loop.${s}`, lang)}
              </span>
              {i < LOOP.length - 1 && <span className="mx-1 text-accent" aria-hidden="true">→</span>}
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-6 max-w-lg text-center text-sm leading-relaxed text-sub">{t('loop.text', lang)}</p>
      </Section>

      {/* Jennifer 不是闹钟 */}
      <Section title={t('notAlarm.title', lang)}>
        <p className="mb-8 max-w-xl text-sm leading-relaxed text-sub">{t('notAlarm.lead', lang)}</p>
        <CompareTable />
      </Section>

      {/* 信号 */}
      <Section eyebrow="" title={t('signals.title', lang)}>
        <p className="mb-8 max-w-xl text-sm leading-relaxed text-sub">{t('signals.sub', lang)}</p>
        <SignalGrid />
        <p className="mt-6 text-sm font-medium text-ink">{t('signals.reason', lang)}</p>
      </Section>

      {/* 四个决定 */}
      <Section title={t('decisions.title', lang)}>
        <p className="mb-8 max-w-xl text-sm leading-relaxed text-sub">{t('decisions.sub', lang)}</p>
        <DecisionGrid />
      </Section>

      {/* 真实场景 */}
      <Section eyebrow="" title={t('scenarios.title', lang)}>
        <p className="mb-8 max-w-xl text-sm leading-relaxed text-sub">{t('scenarios.sub', lang)}</p>
        <div className="grid gap-4">
          {SCENARIOS.map((s) => (
            <ScenarioCard key={s} title={scenarioTitles[s]} body={scenarioBodies[s]} />
          ))}
        </div>
      </Section>

      {/* 为什么叫 J-nify */}
      <Section title={t('why.title', lang)}>
        <p className="max-w-xl text-[15px] leading-[1.8] text-sub">{t('why.body', lang)}</p>
      </Section>

      {/* 最终 CTA */}
      <section className="mx-auto max-w-3xl px-5 pb-24 pt-8 text-center">
        <h2 className="text-3xl font-extrabold text-ink">{t('cta.title', lang)}</h2>
        <p className="mt-3 text-sm text-sub">{t('cta.sub', lang)}</p>
        <Link
          to="/download"
          className="mt-7 inline-flex min-h-13 items-center gap-2 rounded-full bg-accent px-7 text-sm font-bold text-white transition-colors hover:bg-accent/90"
        >
          {t('cta.button', lang)}
        </Link>
        <Link to="/features" className="mt-4 block text-sm font-semibold text-sub hover:text-accent">
          {t('cta.secondary', lang)}
        </Link>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Run tests（含 app.test.tsx 的 hero 断言）**

Run: `cd website && npm run test`
Expected: `App routing › renders home hero on /` 通过 + 组件/i18n 全绿。

- [ ] **Step 3: Run typecheck + build**

Run: `cd website && npm run typecheck && npm run build`
Expected: 0 errors；`dist/` 生成且含 `404.html`（postbuild）。

- [ ] **Step 4: Commit**

```bash
cd website && git add src/pages/Home.tsx __tests__/app.test.tsx
git commit -m "feat(website): 首页（hero/死循环/对比/信号/四决定/场景/why/最终CTA）"
```

---

### Task 7: 功能详解页 Features

**Covers:** [S6]

**Files:**
- Modify: `website/src/pages/Features.tsx`

**Consumes:** `Section`, `ScenarioCard`, `t/useLang`。

- [ ] **Step 1: 写 `website/src/pages/Features.tsx`**

```tsx
import { Link } from 'react-router-dom';
import Section from '../components/Section';
import ScenarioCard from '../components/ScenarioCard';
import { t, useLang } from '../i18n';

const PILLARS = ['capture', 'window', 'decision', 'guardrail', 'memory'] as const;
const STEPS = [1, 2, 3, 4, 5] as const;
const CASES: { key: string; id: 'bill' | 'xm' | 'quilt'; v: string }[] = [
  { key: 'bill.v1', id: 'bill', v: 'features.case.v1' },
  { key: 'quilt.v2', id: 'quilt', v: 'features.case.v2' },
  { key: 'xm.v3', id: 'xm', v: 'features.case.v3' },
];
const ROADMAP = [
  { m: 'features.m0', d: 'features.m0d', status: 'now' },
  { m: 'features.m1', d: 'features.m1d', status: '' },
  { m: 'features.m2', d: 'features.m2d', status: '' },
  { m: 'features.m3', d: 'features.m3d', status: '' },
] as const;

export default function Features() {
  const { lang } = useLang();
  return (
    <>
      <Section eyebrow={t('features.hero.eyebrow', lang)} title={t('features.hero.title', lang)}>
        <p className="max-w-xl text-[15px] leading-relaxed text-sub">{t('features.hero.sub', lang)}</p>
      </Section>

      {/* 五大支柱 */}
      <Section title={t('features.pillars.title', lang)}>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <li key={p} className="rounded-3xl border border-line bg-card p-6">
              <h3 className="text-lg font-extrabold text-ink">{t(`features.pillar.${p}`, lang)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sub">{t(`features.pillar.${p}D`, lang)}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 怎么用 */}
      <Section title={t('features.how.title', lang)}>
        <ol className="space-y-5">
          {STEPS.map((s) => (
            <li key={s} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">
                {s}
              </span>
              <div>
                <p className="font-bold text-ink">{t(`features.how.step${s}`, lang)}</p>
                <p className="mt-1 text-sm text-sub">{t(`features.how.step${s}d`, lang)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* 完整用例 */}
      <Section title={t('features.cases.title', lang)}>
        <div className="grid gap-4">
          {CASES.map((c) => (
            <ScenarioCard
              key={c.key}
              title={t(c.id === 'bill' ? 'scenario.bill.title' : c.id === 'xm' ? 'scenario.xm.title' : 'scenario.quilt.title', lang)}
              body={t(c.id === 'bill' ? 'scenario.bill.body' : c.id === 'xm' ? 'scenario.xm.body' : 'scenario.quilt.body', lang)}
            />
          ))}
        </div>
      </Section>

      {/* 路线图 */}
      <Section title={t('features.roadmap.title', lang)}>
        <ul className="space-y-3">
          {ROADMAP.map((r) => (
            <li key={r.m} className="flex items-start gap-3 rounded-2xl border border-line bg-card px-5 py-4">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${r.status === 'now' ? 'bg-accent' : 'bg-line'}`} aria-hidden="true" />
              <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold text-ink">{t(r.m, lang)}</span>
                <span className="text-xs text-mute">{r.status && t('features.status.now', lang)}</span>
              </div>
              <p className="w-full text-sm text-sub">{t(r.d, lang)}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-sub" translate="no">{t('features.opensource.body', lang)}</p>
      </Section>

      <div className="pb-24 text-center">
        <Link to="/download" className="inline-flex min-h-12 items-center rounded-full bg-accent px-6 text-sm font-bold text-white hover:bg-accent/90">
          {t('cta.button', lang)}
        </Link>
      </div>
    </>
  );
}
```

> 场景故事仅复现 3 则（与首页一致），足矣；不重复展开全体，保持页面精炼。

- [ ] **Step 2: Run typecheck + build**

Run: `cd website && npm run typecheck && npm run build`
Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
cd website && git add src/pages/Features.tsx
git commit -m "feat(website): 功能详解页（五大支柱/怎么用/用例/路线图/开源说明）"
```

---

### Task 8: 下载页（GitHub Release 实时数据）

**Covers:** [S7][S14]

**Files:**
- Create: `website/src/hooks/useReleases.ts`
- Modify: `website/src/pages/Download.tsx`
- Test: `website/__tests__/useReleases.test.ts`, `website/__tests__/download.test.tsx`

**Interfaces:**
- Repo: `PlutoKeating/Project.J-nify`
- `useReleases(): { status: 'loading'|'error'|'ready'; release?: Release; refetch(): void }`
- `Release = { tag_name: string; name: string; published_at: string; body: string; html_url: string; assets: { name: string; size: number; content_type: string; browser_download_url: string }[] }`

- [ ] **Step 1: 写 `website/src/hooks/useReleases.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';

const REPO = 'PlutoKeating/Project.J-nify';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface ReleaseAsset {
  name: string;
  size: number;
  content_type: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export type ReleasesStatus = 'loading' | 'error' | 'ready';

interface State {
  status: ReleasesStatus;
  release?: Release;
}

export function useReleases() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    fetch(API)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Release>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', release: data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
```

- [ ] **Step 2: 写测试 `website/__tests__/useReleases.test.ts`（mock fetch）**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useReleases } from '../src/hooks/useReleases';

const release = {
  tag_name: 'v0.1.2',
  name: 'J-nify v0.1.2',
  published_at: '2026-08-28T01:23:57Z',
  body: '## v0.1.2\n\n- fix: 网络权限',
  html_url: 'https://github.com/PlutoKeating/Project.J-nify/releases/tag/v0.1.2',
  assets: [
    { name: 'app-release.apk', size: 52921126, content_type: 'application/vnd.android.package-archive', browser_download_url: 'https://.../download/v0.1.2/app-release.apk' },
  ],
};

describe('useReleases', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the GitHub latest endpoint and returns ready', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => release,
    } as Response);

    const { result } = renderHook(() => useReleases());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(spy).toHaveBeenCalledWith('https://api.github.com/repos/PlutoKeating/Project.J-nify/releases/latest');
    expect(result.current.release?.tag_name).toBe('v0.1.2');
  });

  it('goes to error when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useReleases());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.release).toBeUndefined();
  });

  it('goes to error on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    const { result } = renderHook(() => useReleases());
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
```

- [ ] **Step 3: 写 `website/src/pages/Download.tsx`**

```tsx
import { useReleases } from '../hooks/useReleases';
import Section from '../components/Section';
import ReleaseNote from '../components/ReleaseNote';
import { t, useLang } from '../i18n';

function formatDate(iso: string, lang: 'zh' | 'en') {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function Download() {
  const { lang } = useLang();
  const { status, release, refetch } = useReleases();

  if (status === 'loading') {
    return (
      <Section title={t('download.hero.title', lang)}>
        <p className="flex items-center gap-2 text-sm text-sub" role="status">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          {t('download.loading', lang)}
        </p>
      </Section>
    );
  }

  if (status === 'error' || !release) {
    return (
      <Section title={t('download.hero.title', lang)}>
        <div className="rounded-3xl border border-line bg-card p-6 text-center" role="alert">
          <p className="text-sm text-sub">{t('download.error', lang)}</p>
          <button
            type="button"
            onClick={refetch}
            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink hover:border-accent hover:text-accent"
          >
            {t('download.retry', lang)}
          </button>
        </div>
      </Section>
    );
  }

  const apk = release.assets.find((a) => a.name.endsWith('.apk'));
  const aab = release.assets.find((a) => a.name.endsWith('.aab'));

  return (
    <>
      <Section eyebrow={t('download.live', lang)} title={t('download.hero.title', lang)}>
        <p className="max-w-xl text-[15px] leading-relaxed text-sub">{t('download.hero.sub', lang)}</p>
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden="true" />
          {t('download.live', lang)}
        </p>

        <dl className="mt-8 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="text-sm font-semibold text-sub">{t('download.latest', lang)}</dt>
            <dd className="text-2xl font-extrabold text-ink" translate="no">{release.tag_name}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="text-sm font-semibold text-sub">{t('download.published', lang)}</dt>
            <dd className="text-sm text-sub">{formatDate(release.published_at, lang)}</dd>
          </div>
        </dl>
      </Section>

      <Section title={t('download.android', lang)}>
        {apk ? (
          <a
            href={apk.browser_download_url}
            download
            className="group flex items-center justify-between gap-4 rounded-3xl border border-line bg-card p-6 transition-colors hover:border-accent"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-xl" aria-hidden="true">📱</span>
              <div>
                <p className="font-bold text-ink">app-release.apk</p>
                <p className="text-xs text-mute">{formatSize(apk.size)}</p>
              </div>
            </div>
            <span className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-white">{t('download.recommended', lang)} ↓</span>
          </a>
        ) : (
          <p className="text-sm text-sub">{t('download.error', lang)}</p>
        )}

        {aab && (
          <a
            href={aab.browser_download_url}
            download
            className="group mt-3 flex items-center justify-between gap-4 rounded-3xl border border-line bg-card p-6 transition-colors hover:border-accent"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-xl" aria-hidden="true">🛒</span>
              <div>
                <p className="font-bold text-ink">app-release.aab</p>
                <p className="text-xs text-mute">{formatSize(aab.size)} · {t('download.play', lang)}</p>
              </div>
            </div>
            <span className="text-mute">↓</span>
          </a>
        )}

        <p className="mt-4 text-xs text-mute">{t('download.ios', lang)}</p>
      </Section>

      <Section title={t('download.releaseNotes', lang)}>
        <ReleaseNote body={release.body} />
      </Section>

      <div className="h-12" aria-hidden="true" />
    </>
  );
}
```

- [ ] **Step 4: 写测试 `website/__tests__/download.test.tsx`（无跳转 GitHub + 直链）**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../src/i18n';
import Download from '../src/pages/Download';

const release = {
  tag_name: 'v0.1.2',
  name: 'J-nify v0.1.2',
  published_at: '2026-08-28T01:23:57Z',
  body: '## 变更\n\n- 修复网络权限',
  html_url: 'https://github.com/PlutoKeating/Project.J-nify/releases/tag/v0.1.2',
  assets: [
    { name: 'app-release.apk', size: 52921126, content_type: 'application/vnd.android.package-archive', browser_download_url: 'https://github.com/PlutoKeating/Project.J-nify/releases/download/v0.1.2/app-release.apk' },
  ],
};

function mockFetch(data: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => data } as Response);
}

describe('Download page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('download links use asset browser_download_url (no GitHub page jump)', async () => {
    mockFetch(release);
    render(
      <BrowserRouter>
        <LangProvider>
          <Download />
        </LangProvider>
      </BrowserRouter>,
    );
    await waitFor(() => expect(screen.getByText('v0.1.2')).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /app-release\.apk/ });
    expect(link).toHaveAttribute('href', 'https://github.com/PlutoKeating/Project.J-nify/releases/download/v0.1.2/app-release.apk');
    // 不出现跳转到 release 页面 html_url
    expect(document.body.textContent).not.toContain('+ In this section');
  });

  it('renders release notes markdown', async () => {
    mockFetch(release);
    render(
      <BrowserRouter>
        <LangProvider>
          <Download />
        </LangProvider>
      </BrowserRouter>,
    );
    await waitFor(() => expect(screen.getByText(/修复网络权限/)).toBeInTheDocument());
  });

  it('shows error state and refetch on retry', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
    render(
      <BrowserRouter>
        <LangProvider>
          <Download />
        </LangProvider>
      </BrowserRouter>,
    );
    await waitFor(() => expect(screen.getByText(/无法获取版本信息/)).toBeInTheDocument());
    spy.mockResolvedValue({ ok: true, json: async () => release } as Response);
    (await screen.findByText('重试')).click();
    await waitFor(() => expect(screen.getByText('v0.1.2')).toBeInTheDocument());
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd website && npm run test`
Expected: 全绿。

- [ ] **Step 6: Run typecheck + build**

Run: `cd website && npm run typecheck && npm run build`
Expected: 0 errors；`dist/` 含 `404.html` + `_redirects` + `.nojekyll`。

- [ ] **Step 7: Commit**

```bash
cd website && git add src/hooks/useReleases.ts src/pages/Download.tsx __tests__/useReleases.test.ts __tests__/download.test.tsx
git commit -m "feat(website): 下载页从 GitHub Release 实时取版本/直链/发布说明（无跳转），含加载/错误态"
```

---

### Task 9: README 写入主域名 + 部署文档

**Covers:** [S10]

**Files:**
- Modify: `README.md`（加「官网」节）
- Create: `docs/devops/website-deploy.md`（CF Pages 部署指引 + 域名 DNS 步骤）
- Modify: `docs/QUICK_START.md`（加官网小节，可选）

**Constraints:**
- 写入主域名 `https://j-nify.arr2018.dpdns.org`。
- **绝不**写入 GitHub Pages 域名。
- 部署指引覆盖：CF Pages 创建项目 → 连接 GitHub → 构建配置 → 自定义域名 → DNS CNAME 指向 pages.dev。

- [ ] **Step 1: 在 `README.md` 追加「官网」节**

在 README 的「文档」列表后新增：
```markdown
## 官网

产品落地官网：[https://j-nify.arr2018.dpdns.org](https://j-nify.arr2018.dpdns.org)

- 源码：`website/`（Vite + React + TS + React Router + Tailwind CSS 4）
- 部署：Cloudflare Pages（git 集成，push main 自动发布）；下载页实时读取 GitHub Release。
- 详细部署与自定义域名配置：`docs/devops/website-deploy.md`
```

- [ ] **Step 2: 写 `docs/devops/website-deploy.md`**

```markdown
# 官网部署（Cloudflare Pages）

> 生产域名（唯一）：https://j-nify.arr2018.dpdns.org（Cloudflare Pages，主）
> 备份：GitHub Pages（备用，暂不公开、域名不入文档）

## 一、创建 Cloudflare Pages 项目并连接 GitHub

1. 打开 Cloudflare Dashboard → `Workers & Pages` → `Create application` → 选 `Pages` → `Connect to Git`。
2. 授权 Cloudflare 访问你的 GitHub 账号，选择仓库 `PlutoKeating/Project.J-nify`。
3. 配置：
   - Production branch：`main`
   - Root directory：`/website`
   - Build command：`npm run build`
   - Build output directory：`dist`
4. 点击 `Save and Deploy`，触发首次构建 → 生成 `*.pages.dev` 临时域名。

> 说明：构建命令会在 `/website` 下执行 `npm ci`（自动）+ `npm run build`（含 postbuild 拷贝 404.html）。

## 二、绑定自定义域名

1. 在 Pages 项目 `Custom domains` → `Set up a custom domain` → 输入 `j-nify.arr2018.dpdns.org`。
2. 记下 Cloudflare 给出的 `*.<项目>.pages.dev` 目标地址。

## 三、DNS 配置（在 arr2018.dpdns.org 所在的 DNS 服务商处）

若 `arr2018.dpdns.org` 本身不在 Cloudflare DNS 托管，则在你的 DNS 服务商新增一条记录：
- 类型：`CNAME`
- 主机/名称：`j-nify`
- 目标：`<你的项目>.pages.dev`（Cloudflare 给出的值）
- TTL：自动

> 因 `arr2018.dpdns.org` 是动态域名（DPDNS），请确保服务商支持 CNAME 泛解析/子域名指向 pages.dev。

## 四、验证

- 浏览器访问 `https://j-nify.arr2018.dpdns.org` 应显示官网首页。
- `/features`、`/download` 直接刷新可用（`_redirects` 提供 SPA 回退）。
- 下载页显示真实最新版本（来自 GitHub Release）。

## 五、发布节奏

- push 到 `main`（改动 `website/**`）→ CF Pages 自动重新构建发布。
- 如需强制重部署：可在 CF Dashboard Points → Deployments → *Retry deployment*。
```

> 实际 DNS 目标值以 Cloudflare 创建时给出的为准；若 `arr2018.dpdns.org` 由 Cloudflare 托管，直接在 DNS 面板加 CNAME 即可。

- [ ] **Step 3: 在 `docs/QUICK_START.md` 加官网小节**

追加：
```markdown
## 官网（React 落地页）

- 源码：`website/`
- 本地预览：`cd website && npm ci && npm run dev`
- 生产域名：https://j-nify.arr2018.dpdns.org（Cloudflare Pages，自动发布）
- 构建：`cd website && npm run build`（产物 `website/dist/`）
```

- [ ] **Step 4: Verify links exist**

Run: 检查 `README.md` 与 `docs/devops/website-deploy.md` 中域名一致为 `https://j-nify.arr2018.dpdns.org`，且无其他域名泄漏。

- [ ] **Step 5: Commit**

```bash
cd /home/pluto/Project.J-nify && git add README.md docs/devops/website-deploy.md docs/QUICK_START.md
git commit -m "docs(website): 官网部署指引 + 生产域名 j-nify.arr2018.dpdns.org 写入 README/QUICK_START"
```

---

### Task 10: 全量验证与发布

**Covers:** [S14]

**Files:** 无新增。

- [ ] **Step 1: 全量校验**

Run: `cd website && npm run lint && npm run typecheck && npm run test && npm run build`
Expected: lint 0 error；typecheck 0 error；test 全绿；build 成功且 `dist/` 含 `_redirects`、`404.html`、`.nojekyll`。

- [ ] **Step 2: 浏览器可视验证（可选）**

Run: `cd website && npm run preview` 后浏览器打开，或 playwright 截图 `/`、`/features`、`/download`，核对：
- 移动 375px 无横向溢出、触控 ≥44px。
- 桌面居中、留白舒适。
- 下载页显示真实版本、直链不跳 GitHub。

- [ ] **Step 3: 确认无未跟踪文件**

Run: `cd /home/pluto/Project.J-nify && git status --short`
Expected: 无 untracked/非预期文件；`website/node_modules`、`website/dist` 被 ignore（确保加入 `website/.gitignore`）。

> 需在 Task 1 补一个 `website/.gitignore`：
```
node_modules
dist
*.local
.env
```

- [ ] **Step 4: Commit 收尾**

```bash
cd /home/pluto/Project.J-nify && git add website/.gitignore && git commit -m "chore(website): 忽略 node_modules/dist 构建产物"
```

- [ ] **Step 5: 汇总交付说明**

向用户说明：官网文件清单、如何本地跑、CF Pages 部署步骤（指向 `docs/devops/website-deploy.md`）、DNS 域名绑定注意点、以及「下载页实时数据链路」。
