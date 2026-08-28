import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { t, useLang } from '../i18n';

const tabs = [
  { to: '/', key: 'nav.home' },
  { to: '/features', key: 'nav.features' },
  { to: '/download', key: 'nav.download' },
] as const;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function Layout() {
  const { lang } = useLang();
  return (
    <div className="min-h-screen bg-paper text-ink">
      <ScrollToTop />
      <Header />
      <main className="min-h-[70vh]">
        <Outlet />
      </main>
      <Footer />

      {/* 移动端底部 Tab */}
      <nav
        aria-label="primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-3">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-accent' : 'text-sub'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-transparent'}`}
                    aria-hidden="true"
                  />
                  {t(tab.key, lang)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* 底部安全区留白，避免内容被 Tab 遮挡 */}
      <div className="h-20 sm:hidden" aria-hidden="true" />
    </div>
  );
}
