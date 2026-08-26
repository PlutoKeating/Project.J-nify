import { describe, expect, it } from 'vitest';
import { CAPTURE_MESSAGE, captureValues, parseTitle } from '../src/services/capture';

describe('capture', () => {
  it('parses title from raw text', () => {
    expect(parseTitle('  月底还信用卡  ')).toBe('月底还信用卡');
  });
  it('falls back when blank', () => {
    expect(parseTitle('   ')).toBe('有一件事');
  });
  it('builds parked values with defaults', () => {
    const v = captureValues({ rawText: '晒被子', category: 'chore' });
    expect(v.status).toBe('parked');
    expect(v.category).toBe('chore');
    expect(v.dueAt).toBeNull();
    expect(v.importance).toBe(1);
    expect(v.estMinutes).toBe(5);
  });
  it('keeps capture message', () => {
    expect(CAPTURE_MESSAGE).toBe('记下了：不急，但我帮您盯着。');
  });
});
