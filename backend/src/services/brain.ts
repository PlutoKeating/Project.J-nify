import type { WindowResult } from './window-engine';

export interface DraftOption {
  code: string;
  label: string;
  actionType: string;
}

export function draft(
  item: { title: string; category: string },
  window: WindowResult | null,
): { title: string; body: string; options: DraftOption[]; degraded: boolean } {
  const title = item.title.trim() || '有一件事';
  const body = window?.reasonText ?? '不急，但我帮您盯着。';
  const options: DraftOption[] = [
    { code: 'now', label: '现在做', actionType: 'do' },
    { code: 'later', label: '晚点，换个窗口', actionType: 'defer' },
    { code: 'drop', label: '这件事算了', actionType: 'drop' },
  ];
  if (item.category === 'chore' || item.category === 'return') {
    options.push({ code: 'rescue', label: '帮我兜底', actionType: 'rescue' });
  }
  return { title, body, options, degraded: true };
}
