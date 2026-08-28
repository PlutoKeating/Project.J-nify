import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../src/i18n';
import Download from '../src/pages/Download';

const release = {
  tag_name: 'v0.1.2',
  name: 'J-nify v0.1.2',
  published_at: '2026-08-28T01:23:57Z',
  body: '## 变更\n\n- 修复网络权限',
  html_url: 'https://github.com/PlutoKeating/Project.J-nify/releases/tag/v0.1.2',
  assets: [
    {
      name: 'app-release.apk',
      size: 52921126,
      content_type: 'application/vnd.android.package-archive',
      browser_download_url: 'https://github.com/PlutoKeating/Project.J-nify/releases/download/v0.1.2/app-release.apk',
    },
  ],
};

function mockFetch(data: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => data } as Response);
}

function renderDownload() {
  return render(
    <BrowserRouter>
      <LangProvider>
        <Download />
      </LangProvider>
    </BrowserRouter>,
  );
}

describe('Download page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('download links use asset browser_download_url (no GitHub page jump)', async () => {
    mockFetch(release);
    renderDownload();
    await waitFor(() => expect(screen.getByText('v0.1.2')).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /app-release\.apk/ });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/PlutoKeating/Project.J-nify/releases/download/v0.1.2/app-release.apk',
    );
  });

  it('renders release notes markdown', async () => {
    mockFetch(release);
    renderDownload();
    await waitFor(() => expect(screen.getByText(/修复网络权限/)).toBeInTheDocument());
  });

  it('shows error state and recovers on retry', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as Response);
    renderDownload();
    await waitFor(() => expect(screen.getByText(/无法获取版本信息/)).toBeInTheDocument());
    spy.mockResolvedValue({ ok: true, json: async () => release } as Response);
    (await screen.findByText('重试')).click();
    await waitFor(() => expect(screen.getByText('v0.1.2')).toBeInTheDocument());
  });
});
