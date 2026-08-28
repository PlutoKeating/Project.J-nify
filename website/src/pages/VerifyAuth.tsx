import { Link } from 'react-router-dom';
import Section from '../components/Section';
import { t, useLang } from '../i18n';

export default function VerifyAuth() {
  const { lang } = useLang();
  return (
    <Section title={t('verify.title', lang)}>
      <p className="max-w-xl text-[15px] leading-relaxed text-sub">{t('verify.body', lang)}</p>
      <Link to="/download" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-accent px-6 text-sm font-bold text-white">
        {t('cta.button', lang)}
      </Link>
    </Section>
  );
}
