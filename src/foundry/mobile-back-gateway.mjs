const HISTORY_KEY = "__veMobileBackGuard";
const MARKER_KIND = "ve-mobile-back";

/** Install during Foundry's init hook, before its own Window popstate listener. */
export function createFoundryMobileBackGateway({
  getWindow = () => globalThis.window,
  getFoundryBackPrompt = () => {
    for (const key of ["APPLICATION.NavigateBackConfirm", "APP.NavigateBackConfirm"]) {
      const value = globalThis.game?.i18n?.localize?.(key);
      if (typeof value === "string" && value && value !== key) return value;
    }
    return "";
  },
  now = () => Date.now(),
  trace = () => {}
} = {}) {
  const pageToken = `${now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random()}`;
  let installed = false;
  let active = false;
  let armed = false;
  let ownerToken = "";
  // Dispatch the current mobile back action through the registered lifecycle owner.
  let onBack = () => "root";
  // Capture safe current context for back-navigation diagnostics.
  let getDiagnosticContext = () => ({});
  let lastPopstateAt = null;
  let lastAction = "none";
  let lastError = "";
  let leaveNavigationAttempted = false;
  let leaveConfirmed = false;
  let restorePendingConfirm = null;

  // Resolve the current browser history surface used by the back guard.
  const browser = () => getWindow?.();
  // Create the unique state marker owned by this back-navigation entry.
  const marker = (phase) => ({ kind: MARKER_KIND, pageToken, ownerToken, phase });
  // Copy the current history state and attach this guard’s marker.
  const stateWithMarker = (history, phase) => ({
    ...plainState(history.state),
    [HISTORY_KEY]: marker(phase)
  });
  // Record a bounded error when history restoration or back dispatch fails.
  const recordError = (message, error) => {
    lastError = `${message}: ${error?.message ?? String(error)}`;
    trace({ action: "error", message, error: lastError });
  };
  // Push the owned history entry and register its cleanup before intercepting browser back.
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
    // Remove the guard’s history entry only while its marker still identifies the current state.
    const restore = () => {
      if (restored) return;
      restored = true;
      if (timeout !== null) clearTimeout(timeout);
      if (window.confirm === observeConfirm) window.confirm = originalConfirm;
      if (restorePendingConfirm === restore) restorePendingConfirm = null;
    };
    // Watch for a native confirmation surface and suspend back handling while it is active.
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

  // Handle browser back by distinguishing the owned marker from a user or Foundry history transition.
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
    // Install the early browser-history listener and register restoration with the mobile lifecycle.
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
    // Enable scoped Back handling with the caller's navigation action and diagnostic context.
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
    // Expose current Back protection, intercepted action, and latest diagnostic outcome.
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

// Convert history state to a plain object before adding or removing the guard marker.
function plainState(state) {
  return state && typeof state === "object" && !Array.isArray(state) ? state : {};
}
