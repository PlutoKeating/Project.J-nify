import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '../src/i18n';
import App from '../src/App';

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider>
        <App />
      </LangProvider>
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  it('renders header wordmark on all routes', () => {
    renderApp('/');
    expect(screen.getByLabelText('J-nify')).toBeInTheDocument();
  });

  it('renders home hero on /', () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/不急，但我帮您盯着/);
  });

  it('resolves the features route', () => {
    renderApp('/features');
    expect(screen.getByText(/Jennifer 会做什么/)).toBeInTheDocument();
  });

  it('resolves the download route', () => {
    renderApp('/download');
    expect(screen.getByText(/TODO download/)).toBeInTheDocument();
  });
});
