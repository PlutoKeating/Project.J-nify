export const ALLOWED_SIGNALS = new Set(['calendar', 'weather', 'location', 'usage']);

const SCOPE_GATED: Record<string, string> = {
  weather: 'weather',
  calendar: 'calendar',
  location: 'coarse_location',
};

export function checkSignal(
  signalType: string,
  scope: Record<string, boolean>,
): { allowed: boolean; reason?: string } {
  if (!ALLOWED_SIGNALS.has(signalType)) return { allowed: false, reason: `unknown signal_type: ${signalType}` };
  if (signalType === 'usage') return { allowed: true };
  if (SCOPE_GATED[signalType] && scope[SCOPE_GATED[signalType]] !== true) {
    return { allowed: false, reason: `${SCOPE_GATED[signalType]} scope not granted` };
  }
  return { allowed: true };
}