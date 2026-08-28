import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider, useLang } from '../src/i18n';
import LanguageToggle from '../src/components/LanguageToggle';

function Probe() {
  const { lang } = useLang();
  return <span data-testid="lang">{lang}</span>;
}

describe('LanguageToggle', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to zh and toggles to en, persisting', () => {
    render(
      <BrowserRouter>
        <LangProvider>
          <Probe />
          <LanguageToggle />
        </LangProvider>
      </BrowserRouter>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('zh');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(localStorage.getItem('jnify-lang')).toBe('en');
  });

  it('reads persisted en', () => {
    localStorage.setItem('jnify-lang', 'en');
    render(
      <BrowserRouter>
        <LangProvider>
          <Probe />
        </LangProvider>
      </BrowserRouter>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('en');
  });
});
