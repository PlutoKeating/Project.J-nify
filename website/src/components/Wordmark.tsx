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
