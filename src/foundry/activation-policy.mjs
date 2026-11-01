/**
 * Resolve the user's preference and the page-lifetime device class separately.
 * Auto detection is intentionally sticky: browser chrome, orientation changes,
 * reconnects and display zoom may change viewport geometry, not the device.
 */
export function createActivationPolicyResolver({
  getWindow = () => globalThis.window,
  getNavigator = () => globalThis.navigator
} = {}) {
  let resolvedAutoMode = null;
  return Object.freeze({
    // Resolve the requested presentation mode with its confirmation and client-capability constraints.
    resolve(preferences = {}) {
      const window = getWindow();
      const navigator = getNavigator();
      const preference = normalizedPreference(preferences.mode);
      if (preference === "auto" && !resolvedAutoMode) {
        resolvedAutoMode = classifyRuntimeMode({ window, navigator });
      }
      const runtimeMode = preference === "auto"
        ? resolvedAutoMode
        : preference === "off" || preference === "desktop"
          ? "desktop"
          : preference;
      const width = Math.max(1, window.visualViewport?.width ?? window.innerWidth);
      const height = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
      return Object.freeze({
        active: runtimeMode !== "desktop",
        preference,
        runtimeMode,
        formFactor: runtimeMode,
        orientation: resolveOrientation({ window, navigator, width, height }),
        theme: resolveTheme(preferences.theme, window)
      });
    },
    get resolvedAutoMode() {
      return resolvedAutoMode;
    }
  });
}

/** Physical keyboards and software keyboards may change the visual viewport's
 * aspect ratio without rotating the device. Prefer the device orientation API
 * only for touch/mobile runtimes; desktop forced-mode testing still follows
 * the resized browser viewport. */
export function resolveOrientation({ window = globalThis.window, navigator = globalThis.navigator, width, height } = {}) {
  const viewportWidth = Math.max(1, Number(width) || window?.visualViewport?.width || window?.innerWidth || 1);
  const viewportHeight = Math.max(1, Number(height) || window?.visualViewport?.height || window?.innerHeight || 1);
  const userAgent = String(navigator?.userAgent ?? "");
  const touchRuntime = (navigator?.maxTouchPoints ?? 0) > 0
    || Boolean(window?.matchMedia?.("(pointer: coarse)")?.matches)
    || /Android|iPhone|iPad|iPod|Mobile|Tablet/iu.test(userAgent);
  if (touchRuntime) {
    const type = String(window?.screen?.orientation?.type ?? "");
    if (type.startsWith("landscape")) return "landscape";
    if (type.startsWith("portrait")) return "portrait";
    const angle = Number(window?.orientation);
    if (Number.isFinite(angle)) return Math.abs(angle) % 180 === 90 ? "landscape" : "portrait";
  }
  return viewportWidth > viewportHeight ? "landscape" : "portrait";
}

export function evaluateActivation(preferences) {
  // Stateless convenience for callers that do not need Auto's page-lifetime latch.
  return createActivationPolicyResolver().resolve(preferences);
}

/** Classify from stable platform evidence first; ambiguous touch/viewport-only
 * signals deliberately fall back to Desktop so a laptop is not auto-activated. */
export function classifyRuntimeMode({ window = globalThis.window, navigator = globalThis.navigator } = {}) {
  const touchPoints = Number(navigator.maxTouchPoints) || 0;
  const userAgent = String(navigator.userAgent ?? "");
  const legacyPlatform = String(navigator.platform ?? "");
  const hintPlatform = String(navigator.userAgentData?.platform ?? "");
  const reportsMobile = navigator.userAgentData?.mobile;

  if (/iPhone|iPod|Mobile.+Android|Android.+Mobile/iu.test(userAgent)) return "phone";
  if (/iPad/iu.test(userAgent + " " + legacyPlatform)) return "tablet";
  if (/Android/iu.test(userAgent + " " + hintPlatform)) return /Mobile/iu.test(userAgent) ? "phone" : "tablet";
  // Client hints identify real desktop platforms explicitly, including Chrome OS.
  // Unknown hints must not mask a useful legacy platform or user-agent signal.
  if (/^(?:Windows|macOS|Linux|Chrome OS|Chromium OS)$/iu.test(hintPlatform)) return "desktop";
  if (reportsMobile === true) return "phone";
  // iPadOS desktop-site mode has this legacy Mac identity, without desktop hints.
  // Do not require a coarse primary pointer: an iPad may have a mouse attached.
  if (legacyPlatform === "MacIntel" && /Macintosh/iu.test(userAgent) && touchPoints > 1) return "tablet";
  if (/Win|Linux|Mac|CrOS|Chrome OS/iu.test(legacyPlatform + " " + userAgent)) return "desktop";
  if (/Tablet|Silk|Kindle|PlayBook/iu.test(userAgent)) return "tablet";
  // Touch and viewport size alone also describe PCs and privacy-reduced browsers.
  // Ambiguous devices start in Desktop and can choose Phone/Tablet explicitly.
  return "desktop";
}

/** A page-lifetime override used by "Return to desktop interface". */
export function createSessionActivationOverride() {
  let suspended = false;
  return Object.freeze({
    apply(policy) {
      return suspended ? Object.freeze({ ...policy, active: false }) : policy;
    },
    suspend() {
      suspended = true;
    }
  });
}

// Normalize the saved activation mode to its supported values.
function normalizedPreference(value) {
  return ["auto", "phone", "tablet", "desktop", "off"].includes(value) ? value : "auto";
}

// Resolve the selected theme from the current actor, user preference, and system profile.
function resolveTheme(preference, window = globalThis.window) {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}
