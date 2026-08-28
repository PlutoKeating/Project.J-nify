import { Link } from 'react-router-dom';
import { t, useLang } from '../i18n';

const PROD_DOMAIN = 'https://j-nify.arr2018.dpdns.org';

export default function Footer() {
  const { lang } = useLang();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-sm font-semibold text-ink">{t('footer.slogan', lang)}</p>
        <p className="mt-1 text-xs text-sub">{t('footer.rights', lang)}</p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-sub">
          <Link to="/" className="hover:text-accent">
            {t('nav.home', lang)}
          </Link>
          <Link to="/features" className="hover:text-accent">
            {t('nav.features', lang)}
          </Link>
          <Link to="/download" className="hover:text-accent">
            {t('nav.download', lang)}
          </Link>
          <Link to="/privacy" className="hover:text-accent">
            {t('footer.privacy', lang)}
          </Link>
          <a href={PROD_DOMAIN} className="hover:text-accent" translate="no">
            {PROD_DOMAIN}
          </a>
        </div>
        <p className="mt-3 text-[11px] text-mute" translate="no">
          {t('footer.attribution', lang)}
        </p>
        <p className="mt-6 flex flex-wrap items-center gap-2 text-[11px] text-mute">
          <span>{t('footer.opensource', lang)}</span>
          <span aria-hidden="true">·</span>
          <span>&copy; {year} J-nify</span>
        </p>
      </div>
    </footer>
  );
}
