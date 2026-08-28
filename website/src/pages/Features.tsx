import { Link } from 'react-router-dom';
import Section from '../components/Section';
import ScenarioCard from '../components/ScenarioCard';
import { t, useLang } from '../i18n';

const PILLARS = ['capture', 'window', 'decision', 'guardrail', 'memory'] as const;
const STEPS = [1, 2, 3, 4, 5] as const;

const CASES = [
  { key: 'bill', t: 'scenario.bill.title', b: 'scenario.bill.body' },
  { key: 'quilt', t: 'scenario.quilt.title', b: 'scenario.quilt.body' },
  { key: 'xm', t: 'scenario.xm.title', b: 'scenario.xm.body' },
] as const;

const ROADMAP = [
  { m: 'features.m0', d: 'features.m0d', done: true },
  { m: 'features.m1', d: 'features.m1d', done: false },
  { m: 'features.m2', d: 'features.m2d', done: false },
  { m: 'features.m3', d: 'features.m3d', done: false },
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
            <ScenarioCard key={c.key} title={t(c.t, lang)} body={t(c.b, lang)} />
          ))}
        </div>
      </Section>

      {/* 路线图 */}
      <Section title={t('features.roadmap.title', lang)}>
        <ul className="space-y-3">
          {ROADMAP.map((r) => (
            <li key={r.m} className="rounded-2xl border border-line bg-card px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${r.done ? 'bg-accent' : 'bg-line'}`} aria-hidden="true" />
                  <span className="font-bold text-ink">{t(r.m, lang)}</span>
                </div>
                {r.done && <span className="text-xs font-semibold text-accent">{t('features.status.now', lang)}</span>}
              </div>
              <p className="mt-1 pl-5 text-sm text-sub">{t(r.d, lang)}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-sub" translate="no">
          {t('features.opensource.body', lang)}
        </p>
      </Section>

      <div className="pb-24 text-center">
        <Link to="/download" className="inline-flex min-h-12 items-center rounded-full bg-accent px-6 text-sm font-bold text-white transition-colors hover:bg-accent/90">
          {t('cta.button', lang)}
        </Link>
      </div>
    </>
  );
}
