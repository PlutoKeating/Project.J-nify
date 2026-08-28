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
        <li key={s} className="flex items-start gap-4 rounded-3xl border border-line bg-card p-5">
          <span className="text-2xl" aria-hidden="true">
            {ICONS[s]}
          </span>
          <div>
            <p className="font-bold text-ink">{t(`signals.${s}`, lang)}</p>
            <p className="mt-1 text-sm leading-relaxed text-sub">{t(`signals.${s}D`, lang)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
