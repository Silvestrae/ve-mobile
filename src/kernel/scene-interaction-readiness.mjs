import { localizedText } from "../ui/localized-text.mjs";
export class SceneInteractionCancelledError extends Error {
  constructor(message = "The Scene interaction was canceled.", localize = null) {
    super(localize ? localizedText(localize, "VEMOBILE.Errors.SceneInteractionCanceled", "The Scene interaction was canceled.") : message);
    this.reason = message;
    this.name = "SceneInteractionCancelledError";
    this.code = "SCENE_INTERACTION_CANCELLED";
  }
}

/**
 * Own camera priority across route and presentation lifecycles. Explicit user
 * intent remains active until its complete pan/ping operation settles; lower
 * priority presentation and movement-follow writers must ask before acting.
 */
export function createSceneCameraIntentCoordinator({ trace = () => {}, localize = null } = {}) {
  let sequence = 0;
  let explicit = null;

  // Complete all listeners attached to an intent, then release their registrations.
  const settlePresentationWaiters = (intent, method, value) => {
    for (const waiter of [...intent.presentationWaiters]) waiter[method](value);
    intent.presentationWaiters.clear();
  };

  // Reject presentation waits with the same typed cancellation used by Scene callers.
  const cancelIntent = (intent, reason) => {
    settlePresentationWaiters(intent, "reject", new SceneInteractionCancelledError(String(reason || "The camera intent was cancelled."), localize));
  };

  // Send a plain trace record to the injected observer without retaining Scene documents.
  const record = (event, details = {}) => trace(Object.freeze({
    event,
    sequence,
    explicitIntentId: explicit?.id ?? null,
    ...details
  }));

  return Object.freeze({
    // Replace the prior camera request and give the new one its own presentation acknowledgement waiters.
    beginExplicit(details = {}) {
      if (explicit) cancelIntent(explicit, "A newer explicit camera intent replaced this one.");
      const intent = { id: ++sequence, presentationAcknowledged: false, presentationWaiters: new Set(), ...details };
      explicit = intent;
      record("explicit-began", { intent });
      return Object.freeze({
        id: intent.id,
        get current() { return explicit?.id === intent.id; },
        // Await the map layout acknowledgement while preserving abort cleanup and exact intent ownership.
        waitForPresentation({ signal } = {}) {
          if (explicit?.id !== intent.id) return Promise.reject(new SceneInteractionCancelledError(undefined, localize));
          if (intent.presentationAcknowledged) return Promise.resolve(true);
          if (signal?.aborted) return Promise.reject(abortReason(signal, localize));
          return new Promise((resolve, reject) => {
            const waiter = {
              resolve(value) {
                signal?.removeEventListener?.("abort", onAbort);
                resolve(value);
              },
              reject(error) {
                signal?.removeEventListener?.("abort", onAbort);
                reject(error);
              }
            };
            // Remove this wait from its owner before rejecting it with the cancellation reason.
            const onAbort = () => {
              intent.presentationWaiters.delete(waiter);
              waiter.reject(abortReason(signal, localize));
            };
            intent.presentationWaiters.add(waiter);
            signal?.addEventListener?.("abort", onAbort, { once: true });
          });
        },
        // Release only this camera intent and reject any waiter that outlived its completed action.
        finish() {
          if (explicit?.id !== intent.id) return false;
          explicit = null;
          settlePresentationWaiters(intent, "reject", new SceneInteractionCancelledError("The camera intent finished before Scene presentation reconciliation.", localize));
          record("explicit-finished", { intent });
          return true;
        }
      });
    },
    // Revoke camera priority and reject the old intent's pending layout waits.
    cancelExplicit(reason = "cancelled") {
      if (!explicit) return false;
      const intent = explicit;
      explicit = null;
      cancelIntent(intent, reason);
      sequence += 1;
      record("explicit-cancelled", { intent, reason });
      return true;
    },
    // Tell the active explicit action that the renderer has reconciled its map presentation.
    acknowledgePresentation(details = {}) {
      if (!explicit) {
        record("presentation-acknowledged", { presentation: details, matched: false });
        return false;
      }
      explicit.presentationAcknowledged = true;
      settlePresentationWaiters(explicit, "resolve", true);
      record("presentation-acknowledged", { presentation: details, matched: true });
      return true;
    },
    // Admit automatic camera movement only when no explicit user camera request owns priority.
    allowsAutomatic(details = {}) {
      const allowed = !explicit;
      record(allowed ? "automatic-allowed" : "automatic-suppressed", { automatic: details });
      return allowed;
    },
    // Expose a plain description of the current intent without leaking its mutable waiter set.
    get active() {
      if (!explicit) return null;
      const { presentationWaiters, ...details } = explicit;
      return Object.freeze({ ...details });
    }
  });
}

/**
 * Coordinate route visibility and presentation readiness for any operation
 * which needs the live Foundry Scene. Callers retain ownership of the action.
 */
export function createSceneInteractionReadiness({
  getNavigationState,
  navigate,
  inspect,
  subscribe,
  scope,
  localize = null
}) {
  let disposed = false;
  const pending = new Set();

  // Retire the readiness owner and reject every outstanding action instead of leaving promises pending.
  const cancelAll = () => {
    disposed = true;
    for (const cancel of [...pending]) cancel(new SceneInteractionCancelledError("VE Mobile stopped before the Scene became ready.", localize));
  };
  scope?.own?.(cancelAll);

  // Navigate only when needed, then subscribe until the Scene is usable or the request loses ownership.
  const ensure = ({ signal } = {}) => {
    if (disposed || scope?.disposed) return Promise.reject(new SceneInteractionCancelledError("VE Mobile is not active.", localize));
    if (signal?.aborted) return Promise.reject(abortReason(signal, localize));

    return new Promise((resolve, reject) => {
      let settled = false;
      let unsubscribe = null;
      let cleanupRequested = false;
      let navigationRequested = false;
      let sceneWasExposed = false;

      // Settle a readiness request once and always release its subscription and abort listener.
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        pending.delete(cancel);
        if (unsubscribe) unsubscribe();
        else cleanupRequested = true;
        signal?.removeEventListener?.("abort", onAbort);
        callback(value);
      };
      // Reject this readiness wait through the same cleanup path used by success.
      const cancel = (reason = new SceneInteractionCancelledError(undefined, localize)) => finish(reject, reason);
      // Remove this wait from its owner before rejecting it with the cancellation reason.
      const onAbort = () => cancel(abortReason(signal, localize));
      // Reinspect current presentation and cancel if the user has moved away from the map while it was settling.
      const check = () => {
        if (settled) return;
        if (disposed || scope?.disposed) return cancel(new SceneInteractionCancelledError("VE Mobile stopped before the Scene became ready.", localize));
        const state = getNavigationState();
        const presentation = inspect();
        const exposed = Boolean(presentation?.sceneExposed);
        sceneWasExposed ||= exposed;
        if (sceneWasExposed && !exposed) {
          return cancel(new SceneInteractionCancelledError("The Scene was hidden before the interaction became ready.", localize));
        }
        if (navigationRequested && state?.route !== "scene" && !presentation?.splitScreen) {
          return cancel(new SceneInteractionCancelledError("Navigation moved away from the Scene.", localize));
        }
        if (!sceneInteractionIsReady(presentation)) return;
        finish(resolve, Object.freeze({
          navigated: navigationRequested,
          splitScreen: Boolean(presentation.splitScreen),
          viewport: presentation.viewport ?? null
        }));
      };

      pending.add(cancel);
      signal?.addEventListener?.("abort", onAbort, { once: true });
      unsubscribe = subscribe(check) ?? (() => {});
      if (cleanupRequested) unsubscribe();
      const initial = inspect();
      if (!initial?.sceneExposed) {
        navigationRequested = true;
        navigate("scene");
      }
      check();
    });
  };

  return Object.freeze({ ensure, cancelAll });
}

// Require both visible geometry and mounted Canvas interactions; a surviving DOM node alone is not enough.
export function sceneInteractionIsReady(presentation) {
  return Boolean(
    presentation?.sceneExposed
    && presentation?.rootConnected
    && presentation?.rootVisible
    && presentation?.geometryReady
    && presentation?.canvasReady
    && presentation?.canvasGeometryReady
    && presentation?.interactionMounted
  );
}

// Preserve a deliberate Scene cancellation reason while wrapping unrelated abort reasons consistently.
function abortReason(signal, localize = null) {
  return signal?.reason instanceof SceneInteractionCancelledError
    ? signal.reason
    : new SceneInteractionCancelledError("A newer Scene interaction replaced this one.", localize);
}
