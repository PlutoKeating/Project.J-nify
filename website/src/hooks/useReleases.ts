import { useCallback, useEffect, useState } from 'react';

const REPO = 'PlutoKeating/Project.J-nify';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface ReleaseAsset {
  name: string;
  size: number;
  content_type: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export type ReleasesStatus = 'loading' | 'error' | 'ready';

interface State {
  status: ReleasesStatus;
  release?: Release;
}

export function useReleases() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    fetch(API)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Release>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', release: data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
