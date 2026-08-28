# J-nify 官网落地页设计 Spec

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/website-landing.md)

## [S1] 背景与目标

为 **J-nify / Jennifer**（一款「把「不急但会忘」的事交给女秘书，等真正顺手的时机才出现」的低打扰行动秘书 App）构建完整官网落地页。

- **交付形态**：静态 SPA，三页（首页 / 功能详解 / 下载页），React Router + Tailwind CSS，移动优先。
- **目标用户**：中文「P 人」（MBTI 计划感弱、倾向拖延，但并非不想做好；「不紧急 → 放一边 → 彻底消失 → 死线 panic → 完蛋」），官网兼作产品宣发与下载入口。
- **关键约束**：下载页所有版本信息**禁止硬编码**，必须前端实时从 GitHub Release 获取；用户环境同时部署 Cloudflare Pages（主）+ GitHub Pages（备，不公开、域名不入文档）。

## [S2] 定位与核心策略

**一句话定位**：J-nify 不是待办清单，也不是闹钟；它是一位叫 **Jennifer** 的低打扰「行动秘书」。

三条源自同类产品调研 + 产品 SPEC 的核心策略：

1. **给「释放」，不给「鸡血」**：hero 情绪落在「有人替你记着 / 清空大脑 / 不内疚」，不卖「帮你多做」。
2. **把「四个决定」做成可感知核心**：现在做 / 晚点 / 算了 / 帮我兜底——竞品（只有「打勾」）没有的退路。
3. **CTA 用低承诺、退路式措辞**：「把一件小事交给 Jennifer」而非「开始试用」，反复强调「不设闹钟、不催你、随时可改」。

## [S3] 设计 Token（延续暖白克制）

```
主题    J-nify 官网 · 为 P 人的行动秘书（低打扰秘书感）
色彩    --bg  #F7F7F4   暖白纸感（主背景）
        --card #FFFFFF  卡片
        --ink  #17171A  主文本/关键按钮
        --sub  #76767D  次级文本
        --line #E8E8E3  分隔线
        --accent #FF5A4E  唯一强调色（Jennifer 状态点/当前窗口）
        --accent-soft #FFF0EF  热点/轻提示
        --green #35C759  完成态/可用窗口
排版    display: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif
         大标题 30-42px / 800-900 / letter-spacing -0.05em（中文不斜体，靠字重与色）
        body: 15-16px / 1.7 / var(--sub)；说明 11-13px / #A7A7AD
布局    单列、移动优先；移动≤420px 全屏，桌面居中设备叙事 + 两侧留白
签名    一张高度还原 App 内「Nudge 焦点卡」：事项 + 为什么是现在 + 【现在做/晚点/算了/帮我兜底】
风险    做「安静」的排版英雄：hero 不放产品截图，只用超大中文主张标题 + Jennifer 状态点
```

**主动避开**的默认套路：深色+荧光绿、圆角卡片堆满、渐变爆炸式 hero。只保留专注、克制、留白、秘书感。

## [S4] 页面架构

```
/           首页 Home（营销）
/features   功能详解
/download   下载（实时从 GitHub API 拉取最新版本）
```

`lang` 由 URL 参数 `?lang=en` 或用户切换控制，默认中文。

## [S5] 首页 /（Home）

1. **Hero**：eyebrow「J-nify · Jennifer」→ 主张「不急，但我帮您盯着。」→ 副文案（1-2 句）→ 低承诺 CTA「把一件小事交给 Jennifer」+ 次按钮「了解怎么用」。
2. **P 人死循环**：「不紧急 → 放一边 → 彻底消失 → 死线 panic → 完蛋」可视化路径。
3. **Jennifer 不是闹钟**：传统待办 vs Jennifer 对比表（设闹钟 vs 设窗口 / 必须做 vs 给退路 / 逾期报警 vs 帮你兜底）。
4. **她会在什么时候出现**：5 个信号网格（📅 日历空档 / ☀️ 天气 / 📍 顺路 / 📱 使用状态 / ⏳ 死线距离）。
5. **四个决定 — 核心**：Nudge 焦点卡（签名元素）+ 现在做 / 晚点 / 算了 / 帮我兜底。
6. **真实场景故事 ×3**：信用卡账单 / 回小明 / 晒被子——写足氛围，让人感同身受。
7. **为什么叫 J-nify**：J 型秩序感，翻译成 P 人舒服接受的「时机提醒」。
8. **最终 CTA + 免费下载入口**。

## [S6] 功能详解 /features

- 五大功能支柱（参照 SPEC）：一句话录入 / 机会窗口（信号引擎）/ 决策闭环 / 反打扰护栏 / 记忆校准与兜底。
- 「Jennifer 怎么用」完整叙事：录入 → 漂浮 → 等窗口 → 带理由出现 → 四选一。
- SPEC 五个完整用例拆成背景故事（账单 / 晒被子 / 回小明 / 小组作业 / 七天退货）。
- 里程碑 M0/M1/M2/M3 与当前状态（诚实呈现发布进度）。

## [S7] 下载页 /download

- 只放最新版 + 发布说明，**全部前端实时抓取**（无硬编码）。
- React 组件 `fetch('https://api.github.com/repos/PlutoKeating/Project.J-nify/releases/latest')`，渲染：版本号 / 发布日期 / 发布说明（Markdown）/ 资产直链按钮（`browser_download_url`，直接下载、不跳转 GitHub）。
- 区分 APK（Android 直装）/ AAB（Play 上架）/ iOS 未签名提示。
- 加载态 / 错误态均已设计；API 失败时优雅降级。需 CORS 可用（GitHub API 公开 CORS）。

## [S8] 中英双语

- 轻量自研 i18n：`t(key, lang)` + 嵌套字典（zh/en），`lang` 存 React Context + localStorage，默认中文。
- 全局语言切换开关（Header）。
- 所有正文、按钮、发布说明用 `translate="no"` 防自动翻译错乱。

## [S9] 技术 / 部署架构

```
网站源码   项目根新建 website/ 子目录（Vite + React + TS + React Router + Tailwind v4）
构建       npm ci && npm run build → dist/
生产域名   https://j-nify.arr2018.dpdns.org  ← Cloudflare Pages（主）
备份       GitHub Pages（备，域名不写入任何文档）
```

- **CF Pages（主）**：Root directory=`/website`、Build=`npm run build`、Output=`dist`。提供 `/website/_redirects`（`/* /index.html 200`）实现 SPA 路由回退。自定义域名 `j-nify.arr2018.dpdns.org` 需用户把 DNS CNAME 指向 pages.dev（逐步指引见部署文档）。
- **GitHub Pages（备）**：build 输出含 `.nojekyll` + `404.html`（SPA 回退），域名不写入文档、暂不公开。
- **发布说明**：CF Dashboard git 绑定为主（用户负责创建并连接 GitHub）。

## [S10] 域名写入文档（主域名唯一）

- `README.md`：加「官网」节，写入 `https://j-nify.arr2018.dpdns.org`。
- `/features` 页与首页 About 区块：写入生产域名作为唯一官网地址。
- 新建设计/实施文档：明确主域名。**GitHub Pages 域名绝不出现**。

## [S11] 品牌用词与文案基调

- 品牌：Jennifer（女秘书），App 名 J-nify；口号「不急，但我帮您盯着。」
- 文案基调：不命令、不羞辱、给理由、给退路、给最小下一步。
- 示例：好 →「你刚刷手机 23 分钟，社交阻力最低。草稿已备好，30 秒能收尾。」；不好 →「你已经三天没回小明了。」

## [S12] 无障碍与合规

- 遵循 Web Interface Guidelines：语义化 HTML、键盘可用、focus-visible、`prefers-reduced-motion`、触控目标 ≥44px、正文对比度 ≥4.5:1。
- 不使用 `user-scalable=no`、`transition: all`、`outline: none` 无替换。
- 图片 `width`/`height`、`alt`；图标按钮 `aria-label`。

## [S13] 里程碑与交付边界

- M0 骨架（官网）：三页 + 双语 + 下载页实时数据。
- M1 域名与部署：CF Pages 部署 + 域名 DNS + README 写入主域名。
- Out of scope：真实支付注册、泛聊天、多人协作、多语言超过 3 种、后端感知。

## [S14] 验收标准

1. `website/` 下 `npm ci && npm run build` 成功，产出 `dist/`（含 `_redirects`、`.nojekyll`、`404.html`）。
2. 三页路由在 CF Pages + GitHub Pages 均可用（SPA 回退生效）。
3. 下载页展示真实最新版本（来源于 GitHub Release，非硬编码）；点资产直接下载、不跳转 GitHub。
4. 双语切换正常，默认中文。
5. README 写入主域名 `https://j-nify.arr2018.dpdns.org`；GitHub Pages 域名不在任何文档出现。
6. 移动端 375px 无横向溢出、触控达标；桌面也良好适配。
