import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useReleases } from '../src/hooks/useReleases';

const release = {
  tag_name: 'v0.1.2',
  name: 'J-nify v0.1.2',
  published_at: '2026-08-28T01:23:57Z',
  body: '## v0.1.2\n\n- fix: 网络权限',
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

describe('useReleases', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the GitHub latest endpoint and returns ready', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => release } as Response);

    const { result } = renderHook(() => useReleases());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(spy).toHaveBeenCalledWith(
      'https://api.github.com/repos/PlutoKeating/Project.J-nify/releases/latest',
    );
    expect(result.current.release?.tag_name).toBe('v0.1.2');
  });

  it('goes to error when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useReleases());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.release).toBeUndefined();
  });

  it('goes to error on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    const { result } = renderHook(() => useReleases());
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
