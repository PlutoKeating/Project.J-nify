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
