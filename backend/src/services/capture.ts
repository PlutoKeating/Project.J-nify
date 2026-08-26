export const CAPTURE_MESSAGE = '记下了：不急，但我帮您盯着。';

export function parseTitle(rawText: string): string {
  const title = rawText.trim();
  return title || '有一件事';
}

export type NewCommitment = {
  title: string;
  rawText: string;
  sourceType: string;
  category: string;
  status: string;
  dueAt: Date | null;
  importance: number;
  urgency: number;
  abandonCost: number;
  estMinutes: number;
};

export function captureValues(input: {
  rawText: string;
  sourceType?: string;
  category?: string;
  dueAt?: Date | null;
}): NewCommitment {
  return {
    title: parseTitle(input.rawText),
    rawText: input.rawText.trim(),
    sourceType: input.sourceType ?? 'text',
    category: input.category ?? 'life',
    status: 'parked',
    dueAt: input.dueAt ?? null,
    importance: 1,
    urgency: 1,
    abandonCost: 1,
    estMinutes: 5,
  };
}
