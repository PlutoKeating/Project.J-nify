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

const SCENARIO_KEY: Record<(typeof SCENARIOS)[number], { t: string; b: string }> = {
  bill: { t: 'scenario.bill.title', b: 'scenario.bill.body' },
  xm: { t: 'scenario.xm.title', b: 'scenario.xm.body' },
  quilt: { t: 'scenario.quilt.title', b: 'scenario.quilt.body' },
};

export default function Home() {
  const { lang } = useLang();

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
        <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-mute">{t('home.statusLine', lang)}</p>

        {/* 签名元素：Nudge 焦点卡 */}
        <div className="mt-14 text-left">
          <NudgeCard />
        </div>
      </section>

      {/* P 人死循环 */}
      <Section title={t('loop.label', lang)}>
        <ol className="flex flex-wrap items-center justify-center gap-2">
          {LOOP.map((s, i) => (
            <li key={s}>
              <span className="inline-flex items-center rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink">
                {t(`loop.${s}`, lang)}
              </span>
              {i < LOOP.length - 1 && (
                <span className="mx-1 text-accent" aria-hidden="true">
                  →
                </span>
              )}
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
      <Section title={t('signals.title', lang)}>
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
      <Section title={t('scenarios.title', lang)}>
        <p className="mb-8 max-w-xl text-sm leading-relaxed text-sub">{t('scenarios.sub', lang)}</p>
        <div className="grid gap-4">
          {SCENARIOS.map((s) => (
            <ScenarioCard key={s} title={t(SCENARIO_KEY[s].t, lang)} body={t(SCENARIO_KEY[s].b, lang)} />
          ))}
        </div>
      </Section>

      {/* 为什么叫 J-nify */}
      <Section title={t('why.title', lang)}>
        <p className="max-w-xl text-[15px] leading-[1.8] text-sub" translate="no">
          {t('why.body', lang)}
        </p>
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
