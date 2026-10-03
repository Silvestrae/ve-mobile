const HISTORY_KEY = "__veMobileBackGuard";
const MARKER_KIND = "ve-mobile-back";

/** Install during Foundry's init hook, before its own Window popstate listener. */
export function createFoundryMobileBackGateway({
  getWindow = () => globalThis.window,
  getFoundryBackPrompt = () => globalThis.game?.i18n?.localize?.("APP.NavigateBackConfirm"),
  now = () => Date.now(),
  trace = () => {}
} = {}) {
  const pageToken = `${now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random()}`;
  let installed = false;
  let active = false;
  let armed = false;
  let ownerToken = "";
  let onBack = () => "root";
  let getDiagnosticContext = () => ({});
  let lastPopstateAt = null;
  let lastAction = "none";
  let lastError = "";
  let leaveNavigationAttempted = false;
  let leaveConfirmed = false;
  let restorePendingConfirm = null;

  const browser = () => getWindow?.();
  const marker = (phase) => ({ kind: MARKER_KIND, pageToken, ownerToken, phase });
  const stateWithMarker = (history, phase) => ({
    ...plainState(history.state),
    [HISTORY_KEY]: marker(phase)
  });
  const recordError = (message, error) => {
    lastError = `${message}: ${error?.message ?? String(error)}`;
    trace({ action: "error", message, error: lastError });
  };
  const arm = (history, { replaceCurrent = false } = {}) => {
    try {
      if (replaceCurrent) history.replaceState(stateWithMarker(history, "active"), "");
      else history.pushState(stateWithMarker(history, "active"), "");
      armed = true;
      return true;
    } catch (error) {
      armed = false;
      recordError("Browser Back protection could not be armed", error);
      return false;
    }
  };

  // Foundry's game-view popstate listener is registered after ours. Its
  // native confirm() call is synchronous. Observe only that exact prompt so
  // Cancel can restore our marker without suppressing the native dialog.
  const permitFoundryRootBack = (window, history) => {
    let prompt;
    try {
      prompt = getFoundryBackPrompt?.();
    } catch (error) {
      recordError("Foundry Back confirmation could not be identified", error);
      return false;
    }
    const originalConfirm = window?.confirm;
    if (typeof prompt !== "string" || !prompt || prompt === "APP.NavigateBackConfirm" || typeof originalConfirm !== "function") return false;
    let timeout = null;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (timeout !== null) clearTimeout(timeout);
      if (window.confirm === observeConfirm) window.confirm = originalConfirm;
      if (restorePendingConfirm === restore) restorePendingConfirm = null;
    };
    const observeConfirm = function(message, ...args) {
      if (String(message) !== prompt) return Reflect.apply(originalConfirm, this, [message, ...args]);
      restore();
      let confirmed = false;
      try {
        confirmed = Boolean(Reflect.apply(originalConfirm, this, [message, ...args]));
      } catch (error) {
        recordError("Foundry Back confirmation failed", error);
      }
      if (confirmed) leaveConfirmed = true;
      else if (active) {
        // Foundry already pushed its replacement entry before confirm().
        // Reuse that slot instead of growing the stack on every Cancel.
        arm(history, { replaceCurrent: true });
      }
      trace({ action: confirmed ? "core-confirm-accepted" : "core-confirm-cancelled" });
      return confirmed;
    };
    try {
      window.confirm = observeConfirm;
      if (window.confirm !== observeConfirm) return false;
    } catch (error) {
      recordError("Foundry Back confirmation could not be intercepted", error);
      return false;
    }
    restorePendingConfirm = restore;
    // If Foundry's handler did not run, do not leave a global override behind.
    timeout = setTimeout(() => {
      restore();
      if (active && !armed) arm(history);
    }, 0);
    return true;
  };

  const handlePopstate = (event) => {
    if (!active || leaveConfirmed) return;
    lastPopstateAt = now();
    if (!armed) {
      event?.stopImmediatePropagation?.();
      return;
    }
    armed = false;
    try {
      lastAction = String(onBack?.() ?? "root");
    } catch (error) {
      lastAction = "error";
      recordError("VE Back action failed", error);
    }
    const history = browser()?.history;
    // Only the base Character view may fall through to Foundry. Its handler
    // pushes its own history entry, then calls the localized native confirm.
    // The native confirmation remains visible. Cancel re-arms VE; Confirm
    // leaves Foundry's own navigation sequence unimpeded.
    const passedToFoundry = lastAction === "root" && permitFoundryRootBack(browser(), history);
    if (!passedToFoundry) {
      event?.stopImmediatePropagation?.();
      // Back moved to the predecessor. Pushing here truncates the forward
      // marker, so repeated VE-handled Back presses do not grow history.
      arm(browser()?.history);
    }
    // Chromium can skip script-created entries without fresh user activation;
    // neither this handler nor Foundry's can guarantee trapping later Back.
    trace({ action: "popstate", result: lastAction, passedToFoundry });
  };

  return Object.freeze({
    install(scope) {
      if (installed) return true;
      const window = browser();
      if (!window?.history?.pushState || !scope?.listen) {
        recordError("Browser Back protection could not install", new Error("History API or task scope unavailable"));
        return false;
      }
      // This must run synchronously within Hooks.init before Foundry calls
      // Game#activateListeners later in Game#initialize.
      scope.listen(window, "popstate", handlePopstate);
      scope.listen(window, "beforeunload", () => {
        if (active) leaveNavigationAttempted = true;
      }, { passive: true });
      scope.own(() => {
        restorePendingConfirm?.();
        active = false;
        armed = false;
        leaveConfirmed = false;
        installed = false;
      });
      installed = true;
      return true;
    },
    enable(scope, { onBack: action = () => "root", getDiagnosticContext: context = () => ({}) } = {}) {
      if (!installed || !scope?.own) {
        recordError("Browser Back protection could not enable", new Error("Early listener or task scope unavailable"));
        return false;
      }
      if (active) return false;
      const history = browser()?.history;
      if (!history?.pushState || !history?.replaceState) {
        recordError("Browser Back protection could not enable", new Error("History API unavailable"));
        return false;
      }
      const previous = history.state?.[HISTORY_KEY];
      const reuseInactive = previous?.kind === MARKER_KIND
        && previous.pageToken === pageToken
        && previous.phase === "inactive";
      ownerToken = `${now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random()}`;
      onBack = action;
      getDiagnosticContext = context;
      active = true;
      leaveConfirmed = false;
      if (!arm(history, { replaceCurrent: reuseInactive })) {
        active = false;
        return false;
      }
      const ownedToken = ownerToken;
      scope.own(() => {
        if (ownerToken !== ownedToken) return;
        restorePendingConfirm?.();
        active = false;
        leaveConfirmed = false;
        onBack = () => "root";
        getDiagnosticContext = () => ({});
        const current = history.state?.[HISTORY_KEY];
        if (!armed || current?.kind !== MARKER_KIND || current.pageToken !== pageToken || current.ownerToken !== ownedToken) {
          armed = false;
          return;
        }
        try {
          history.replaceState(stateWithMarker(history, "inactive"), "");
        } catch (error) {
          recordError("Browser Back protection could not be deactivated", error);
        }
        armed = false;
      });
      trace({ action: "enabled", reused: reuseInactive });
      return true;
    },
    snapshot() {
      const window = browser();
      const history = window?.history;
      const current = history?.state?.[HISTORY_KEY];
      let context = {};
      try { context = getDiagnosticContext?.() ?? {}; } catch { /* Diagnostics must remain read-only. */ }
      const location = window?.location;
      const currentHref = location?.origin && location?.pathname
        ? `${location.origin}${location.pathname}`
        : location?.pathname ?? "";
      return Object.freeze({
        installed,
        active,
        armed,
        historyStateKind: current?.kind === MARKER_KIND
          ? current.pageToken === pageToken ? current.phase : "stale"
          : "other",
        historyLength: history?.length ?? null,
        currentHref,
        route: String(context.route ?? ""),
        routeDepth: Number(context.routeDepth) || 0,
        topmostDismissible: String(context.topmostDismissible ?? "none"),
        closeWatcher: context.closeWatcher ?? null,
        lastPopstateAt,
        lastAction,
        leaveNavigationAttempted,
        lastError
      });
    }
  });
}

function plainState(state) {
  return state && typeof state === "object" && !Array.isArray(state) ? state : {};
}
