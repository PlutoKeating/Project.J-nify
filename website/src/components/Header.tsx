import { NavLink } from 'react-router-dom';
import Wordmark from './Wordmark';
import LanguageToggle from './LanguageToggle';
import { t, useLang } from '../i18n';

const items = [
  { to: '/', key: 'nav.home' },
  { to: '/features', key: 'nav.features' },
  { to: '/download', key: 'nav.download' },
] as const;

export default function Header() {
  const { lang } = useLang();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
        <Wordmark />
        <div className="hidden items-center gap-1 sm:flex">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-soft text-accent' : 'text-sub hover:text-ink'
                }`
              }
            >
              {t(it.key, lang)}
            </NavLink>
          ))}
          <span className="mx-2 h-4 w-px bg-line" aria-hidden="true" />
        </div>
        <LanguageToggle />
      </nav>
    </header>
  );
}
