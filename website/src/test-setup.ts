import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom 未实现 scrollTo；Layout 的 ScrollToTop 会调用，此处桩掉避免测试噪音
Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});
