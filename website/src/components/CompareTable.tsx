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
        <div className="px-5 py-3 text-sub">{t('notAlarm.before', lang)}</div>
        <div className="px-5 py-3 text-accent">{t('notAlarm.after', lang)}</div>
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
