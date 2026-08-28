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
  'notAlarm.before': { zh: '传统待办 App', en: 'Classic to-do app' },
  'notAlarm.after': { zh: 'Jennifer', en: 'Jennifer' },

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
    zh: 'J-nify 是产品的名字，直白地说就是「P 人变 J」——把计划感偏弱、容易拖延的人，变成更有秩序感的人。而 Jennifer 是这款 App 里的智能体，也是品牌吉祥物，名字取自 J-nify 对应的「J-nifier」（把 P 人变成 J 的那个人）的谐音。她是一位真正懂 P 人的 J 人助理：不替你逼出纪律，而是把 J 人的秩序感，翻译成 P 人也能舒服接受的「时机提醒」。',
    en: 'J-nify is the product’s name — literally “make a P person into a J”: turn someone who plans weakly and tends to procrastinate into someone with more order. Jennifer is the in-app agent and the brand mascot; her name is a near-homophone of “J-nifier,” the one who turns a P person into a J. She’s a J-person assistant who truly understands P people: she doesn’t force discipline on you, but translates J-type order into the “timing nudges” a P person can comfortably accept.',
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

  'features.cases.title': { zh: '完整用例：三个背景故事', en: 'Full use cases: three stories' },

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
  'download.ios': { zh: 'iOS 未签名归档，需 Apple 证书后分发。', en: 'iOS archive is unsigned; needs an Apple cert before distribution.' },
  'download.releaseNotes': { zh: '版本发布说明', en: 'Release notes' },
  'download.loading': { zh: '正在同步最新版本…', en: 'Syncing the latest version…' },
  'download.error': { zh: '暂时无法获取版本信息，请稍后再试。', en: 'Couldn’t fetch version info. Please try again shortly.' },
  'download.retry': { zh: '重试', en: 'Retry' },
  'download.live': { zh: '实时来自 GitHub Release', en: 'Live from GitHub Release' },
  'download.recommended': { zh: '推荐', en: 'Recommended' },
  'download.size': { zh: '大小', en: 'Size' },
};
