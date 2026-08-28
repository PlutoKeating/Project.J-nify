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
