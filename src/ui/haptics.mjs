export const HOLD_HAPTIC_DURATION_MS = 5;

/** One subtle, capability-gated pulse for a VE gesture which became armed. */
export function pulseHoldHaptic(navigatorRef = globalThis.navigator, durationMs = HOLD_HAPTIC_DURATION_MS) {
  try {
    if (typeof navigatorRef?.vibrate !== "function") return false;
    return navigatorRef.vibrate(Math.max(1, Number(durationMs) || HOLD_HAPTIC_DURATION_MS)) !== false;
  } catch {
    return false;
  }
}
