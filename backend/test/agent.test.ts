import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/services/agent';

describe('buildSystemPrompt', () => {
  it('injects current date and timezone, and forbids training-data years', () => {
    const prompt = buildSystemPrompt(new Date('2026-08-29T10:00:00Z'), 'Asia/Shanghai');
    expect(prompt).toContain('今天是 2026-08-29');
    expect(prompt).toContain('用户时区：Asia/Shanghai');
    expect(prompt).toContain('不得使用训练数据中的年份');
  });
});
