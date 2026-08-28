import { useReleases } from '../hooks/useReleases';
import Section from '../components/Section';
import ReleaseNote from '../components/ReleaseNote';
import { t, useLang } from '../i18n';
import type { Lang } from '../i18n';

function formatDate(iso: string, lang: Lang) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function Download() {
  const { lang } = useLang();
  const { status, release, refetch } = useReleases();

  if (status === 'loading') {
    return (
      <Section title={t('download.hero.title', lang)}>
        <p className="flex items-center gap-2 text-sm text-sub" role="status">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          {t('download.loading', lang)}
        </p>
      </Section>
    );
  }

  if (status === 'error' || !release) {
    return (
      <Section title={t('download.hero.title', lang)}>
        <div className="rounded-3xl border border-line bg-card p-6 text-center" role="alert">
          <p className="text-sm text-sub">{t('download.error', lang)}</p>
          <button
            type="button"
            onClick={refetch}
            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
          >
            {t('download.retry', lang)}
          </button>
        </div>
      </Section>
    );
  }

  const apk = release.assets.find((a) => a.name.endsWith('.apk'));
  const aab = release.assets.find((a) => a.name.endsWith('.aab'));

  return (
    <>
      <Section eyebrow={t('download.live', lang)} title={t('download.hero.title', lang)}>
        <p className="max-w-xl text-[15px] leading-relaxed text-sub">{t('download.hero.sub', lang)}</p>
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden="true" />
          {t('download.live', lang)}
        </p>

        <dl className="mt-8 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="text-sm font-semibold text-sub">{t('download.latest', lang)}</dt>
            <dd className="text-2xl font-extrabold text-ink" translate="no">
              {release.tag_name}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="text-sm font-semibold text-sub">{t('download.published', lang)}</dt>
            <dd className="text-sm text-sub">{formatDate(release.published_at, lang)}</dd>
          </div>
        </dl>
      </Section>

      <Section title={t('download.android', lang)}>
        {apk ? (
          <a
            href={apk.browser_download_url}
            download
            className="group flex items-center justify-between gap-4 rounded-3xl border border-line bg-card p-6 transition-colors hover:border-accent"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-xl" aria-hidden="true">
                📱
              </span>
              <div>
                <p className="font-bold text-ink">{apk.name}</p>
                <p className="text-xs text-mute">
                  {t('download.size', lang)} {formatSize(apk.size)}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-white">{t('download.recommended', lang)} ↓</span>
          </a>
        ) : (
          <p className="text-sm text-sub">{t('download.error', lang)}</p>
        )}

        {aab && (
          <a
            href={aab.browser_download_url}
            download
            className="group mt-3 flex items-center justify-between gap-4 rounded-3xl border border-line bg-card p-6 transition-colors hover:border-accent"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-xl" aria-hidden="true">
                🛒
              </span>
              <div>
                <p className="font-bold text-ink">{aab.name}</p>
                <p className="text-xs text-mute">
                  {t('download.play', lang)} · {t('download.size', lang)}{' '}
                  {formatSize(aab.size)}
                </p>
              </div>
            </div>
            <span className="text-mute">↓</span>
          </a>
        )}

        <p className="mt-4 text-xs text-mute">{t('download.ios', lang)}</p>
      </Section>

      <Section title={t('download.releaseNotes', lang)}>
        <ReleaseNote body={release.body} />
      </Section>

      <div className="h-12" aria-hidden="true" />
    </>
  );
}
