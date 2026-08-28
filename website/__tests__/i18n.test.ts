import { describe, it, expect } from 'vitest';
import { messages } from '../src/i18n/messages';
import { t } from '../src/i18n';

describe('i18n messages', () => {
  it('slogan is the brand promise in both languages', () => {
    expect(t('brand.slogan', 'zh')).toBe('不急，但我帮您盯着。');
    expect(t('brand.slogan', 'en')).toContain('keep an eye');
  });

  it('every message has both zh and en', () => {
    for (const [id, m] of Object.entries(messages)) {
      expect(typeof m.zh, `id=${id}`).toBe('string');
      expect(typeof m.en, `id=${id}`).toBe('string');
      expect(m.zh.length).toBeGreaterThan(0);
      expect(m.en.length).toBeGreaterThan(0);
    }
  });

  it('returns the id when unknown', () => {
    expect(t('nope.none', 'zh')).toBe('nope.none');
  });

  it('has no empty zh value for Chinese-first audience', () => {
    const zhEmpty = Object.entries(messages).filter(([, m]) => !m.zh.trim());
    expect(zhEmpty).toEqual([]);
  });
});
