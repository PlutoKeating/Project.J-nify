import Section from '../components/Section';
import { t, useLang } from '../i18n';

export default function Privacy() {
  const { lang } = useLang();
  return (
    <Section title={t('privacy.title', lang)}>
      <div className="max-w-2xl space-y-4 text-[15px] leading-relaxed text-sub">
        <p>{t('privacy.body1', lang)}</p>
        <p>{t('privacy.body2', lang)}</p>
        <p translate="no">{t('privacy.body3', lang)}</p>
      </div>
    </Section>
  );
}
