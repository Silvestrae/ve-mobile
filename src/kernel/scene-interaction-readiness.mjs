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

  const settlePresentationWaiters = (intent, method, value) => {
    for (const waiter of [...intent.presentationWaiters]) waiter[method](value);
    intent.presentationWaiters.clear();
  };

  const cancelIntent = (intent, reason) => {
    settlePresentationWaiters(intent, "reject", new SceneInteractionCancelledError(String(reason || "The camera intent was cancelled."), localize));
  };

  const record = (event, details = {}) => trace(Object.freeze({
    event,
    sequence,
    explicitIntentId: explicit?.id ?? null,
    ...details
  }));

  return Object.freeze({
    beginExplicit(details = {}) {
      if (explicit) cancelIntent(explicit, "A newer explicit camera intent replaced this one.");
      const intent = { id: ++sequence, presentationAcknowledged: false, presentationWaiters: new Set(), ...details };
      explicit = intent;
      record("explicit-began", { intent });
      return Object.freeze({
        id: intent.id,
        get current() { return explicit?.id === intent.id; },
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
            const onAbort = () => {
              intent.presentationWaiters.delete(waiter);
              waiter.reject(abortReason(signal, localize));
            };
            intent.presentationWaiters.add(waiter);
            signal?.addEventListener?.("abort", onAbort, { once: true });
          });
        },
        finish() {
          if (explicit?.id !== intent.id) return false;
          explicit = null;
          settlePresentationWaiters(intent, "reject", new SceneInteractionCancelledError("The camera intent finished before Scene presentation reconciliation.", localize));
          record("explicit-finished", { intent });
          return true;
        }
      });
    },
    cancelExplicit(reason = "cancelled") {
      if (!explicit) return false;
      const intent = explicit;
      explicit = null;
      cancelIntent(intent, reason);
      sequence += 1;
      record("explicit-cancelled", { intent, reason });
      return true;
    },
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
    allowsAutomatic(details = {}) {
      const allowed = !explicit;
      record(allowed ? "automatic-allowed" : "automatic-suppressed", { automatic: details });
      return allowed;
    },
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

  const cancelAll = () => {
    disposed = true;
    for (const cancel of [...pending]) cancel(new SceneInteractionCancelledError("VE Mobile stopped before the Scene became ready.", localize));
  };
  scope?.own?.(cancelAll);

  const ensure = ({ signal } = {}) => {
    if (disposed || scope?.disposed) return Promise.reject(new SceneInteractionCancelledError("VE Mobile is not active.", localize));
    if (signal?.aborted) return Promise.reject(abortReason(signal, localize));

    return new Promise((resolve, reject) => {
      let settled = false;
      let unsubscribe = null;
      let cleanupRequested = false;
      let navigationRequested = false;
      let sceneWasExposed = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        pending.delete(cancel);
        if (unsubscribe) unsubscribe();
        else cleanupRequested = true;
        signal?.removeEventListener?.("abort", onAbort);
        callback(value);
      };
      const cancel = (reason = new SceneInteractionCancelledError(undefined, localize)) => finish(reject, reason);
      const onAbort = () => cancel(abortReason(signal, localize));
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

function abortReason(signal, localize = null) {
  return signal?.reason instanceof SceneInteractionCancelledError
    ? signal.reason
    : new SceneInteractionCancelledError("A newer Scene interaction replaced this one.", localize);
}
