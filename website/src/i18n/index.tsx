import type { ReactNode } from 'react';
import type { Lang } from './messages';

export type { Lang };

export function LangProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useLang() {
  return { lang: 'zh', setLang: () => {}, toggle: () => {} } as { lang: Lang; setLang: (l: Lang) => void; toggle: () => void };
}

export function t(id: string): string {
  return id;
}
