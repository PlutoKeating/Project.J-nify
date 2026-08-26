import { describe, expect, it } from 'vitest';
import { checkSignal } from '../src/lib/privacy';

describe('checkSignal', () => {
  it('rejects unknown signal types', () => {
    expect(checkSignal('brain_wave', {}).allowed).toBe(false);
  });

  it('requires coarse_location scope for location', () => {
    expect(checkSignal('location', { coarse_location: false }).allowed).toBe(false);
    expect(checkSignal('location', { coarse_location: true }).allowed).toBe(true);
  });

  it('requires weather and calendar scope flags', () => {
    expect(checkSignal('weather', {}).allowed).toBe(false);
    expect(checkSignal('calendar', {}).allowed).toBe(false);
  });

  it('usage is always allowed', () => {
    expect(checkSignal('usage', {}).allowed).toBe(true);
  });
});