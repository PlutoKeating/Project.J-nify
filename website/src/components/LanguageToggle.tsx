import { t, useLang } from '../i18n';

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
