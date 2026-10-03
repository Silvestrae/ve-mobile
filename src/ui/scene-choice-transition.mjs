export const SCENE_CHOICE_MOVE_THRESHOLD = 8;
export const SCENE_CHOICE_HOLD_THRESHOLD_MS = 500;
export const SCENE_CHOICE_GHOST_WINDOW_MS = 1000;

/**
 * Own one Scene-row activation across picker remounts. Touch is allowed to
 * scroll vertically, but a completed tap is not allowed to become a second
 * click on the replacement picker while Foundry redraws the Scene.
 */
export function createSceneChoiceTransition({
  now = () => Date.now(),
  defer = (callback) => queueMicrotask(callback),
  trace = () => {}
} = {}) {
  const controls = new Set();
  let press = null;
  let releasedTap = null;
  let suppressClicksUntil = 0;
  let pending = null;
  let sequence = 0;

  const describe = (phase, details = {}) => {
    try {
      trace(Object.freeze({
        phase,
        sequence,
        pendingSceneId: pending?.sceneId ?? "",
        ...details
      }));
    } catch { /* Diagnostics must never interrupt input handling. */ }
  };

  const setControlState = (control) => {
    if (!control) return;
    control.disabled = Boolean(pending);
    if (pending) control.setAttribute?.("aria-busy", "true");
    else control.removeAttribute?.("aria-busy");
  };
  const publishControlState = () => {
    for (const control of controls) setControlState(control);
  };
  const releaseCapture = (current) => {
    if (!current) return;
    try {
      if (current.target.hasPointerCapture?.(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    } catch { /* Pointer capture is best-effort on WebKit. */ }
  };
  const suppressTouchClick = (current, phase) => {
    releasedTap = null;
    suppressClicksUntil = Math.max(suppressClicksUntil, now() + SCENE_CHOICE_GHOST_WINDOW_MS);
    describe(phase, pointerDetails(current));
  };
  const cancelPress = (phase, event = press) => {
    if (!press) return;
    const current = press;
    press = null;
    releaseCapture(current);
    suppressTouchClick({ ...current, event }, phase);
  };

  const run = (sceneId, activate) => {
    if (pending) {
      describe("activation-ignored", { sceneId, reason: "transition-pending" });
      return pending.promise;
    }
    const transition = { sceneId, sequence: ++sequence, promise: null };
    pending = transition;
    publishControlState();
    describe("activation-start", { sceneId });
    let activation;
    try {
      activation = activate();
    } catch (error) {
      activation = Promise.reject(error);
    }
    transition.promise = Promise.resolve(activation)
      .then((result) => {
        describe("activation-settled", { sceneId });
        return result;
      }, (error) => {
        describe("activation-rejected", { sceneId, error: String(error?.message ?? error ?? "Unknown error") });
        throw error;
      })
      .finally(() => {
        if (pending === transition) {
          pending = null;
          publishControlState();
        }
      });
    return transition.promise;
  };

  return Object.freeze({
    get pending() {
      return Boolean(pending);
    },
    get sceneId() {
      return pending?.sceneId ?? "";
    },
    bind(target, sceneId, activate, scope, { getWindow = () => target?.ownerDocument?.defaultView ?? globalThis.window } = {}) {
      const eventWindow = getWindow?.() ?? target;
      controls.add(target);
      setControlState(target);
      scope.own(() => {
        controls.delete(target);
        if (press?.target === target) cancelPress("scope-disposed");
        if (releasedTap?.target === target) releasedTap = null;
      });

      const pointerDown = (event) => {
        if (pending || target.disabled || (event.button !== undefined && event.button !== 0)) return;
        const pointerType = String(event.pointerType ?? "mouse");
        if (pointerType !== "touch" && pointerType !== "pen") return;
        if (press) cancelPress("pointer-restarted");
        press = {
          target,
          sceneId,
          pointerId: Number(event.pointerId) || 0,
          pointerType,
          x: Number(event.clientX) || 0,
          y: Number(event.clientY) || 0,
          startedAt: now(),
          moved: false,
          event
        };
        try { target.setPointerCapture?.(event.pointerId); } catch { /* Best-effort on WebKit. */ }
        describe("pointerdown", pointerDetails(press));
      };
      const pointerMove = (event) => {
        if (!press || press.pointerId !== (Number(event.pointerId) || 0)) return;
        const distance = Math.hypot((Number(event.clientX) || 0) - press.x, (Number(event.clientY) || 0) - press.y);
        if (distance < SCENE_CHOICE_MOVE_THRESHOLD) return;
        press.moved = true;
        cancelPress("pointer-scroll", event);
      };
      const pointerUp = (event) => {
        if (!press || press.pointerId !== (Number(event.pointerId) || 0)) return;
        const current = press;
        press = null;
        releaseCapture(current);
        const elapsedMs = Math.max(0, now() - current.startedAt);
        if (current.moved || elapsedMs >= SCENE_CHOICE_HOLD_THRESHOLD_MS) {
          suppressTouchClick({ ...current, elapsedMs, event }, current.moved ? "pointer-scroll" : "pointer-hold");
          return;
        }
        releasedTap = { ...current, elapsedMs, event };
        describe("pointerup", pointerDetails(releasedTap));
      };
      const pointerCancel = (event) => {
        if (!press || press.pointerId !== (Number(event.pointerId) || 0)) return;
        cancelPress(event.type === "lostpointercapture" ? "lostpointercapture" : "pointercancel", event);
      };
      const click = (event) => {
        const timestamp = now();
        const touchTap = releasedTap?.target === target && releasedTap.sceneId === sceneId ? releasedTap : null;
        if (pending || (timestamp < suppressClicksUntil && !touchTap)) {
          event.preventDefault?.();
          event.stopImmediatePropagation?.();
          event.stopPropagation?.();
          describe("click-suppressed", { sceneId, reason: pending ? "transition-pending" : "touch-followup" });
          releasedTap = null;
          return;
        }
        if (releasedTap && !touchTap) releasedTap = null;
        if (touchTap) {
          releasedTap = null;
          suppressClicksUntil = timestamp + SCENE_CHOICE_GHOST_WINDOW_MS;
        }
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
        describe("click", { sceneId, pointerType: touchTap?.pointerType ?? "keyboard-or-mouse", targetConnected: target.isConnected !== false });
        defer(() => { void run(sceneId, activate).catch(() => {}); });
      };

      scope.listen(target, "pointerdown", pointerDown, { passive: true });
      scope.listen(eventWindow, "pointermove", pointerMove, { passive: true });
      scope.listen(eventWindow, "pointerup", pointerUp, { passive: true });
      scope.listen(eventWindow, "pointercancel", pointerCancel, { passive: true });
      scope.listen(target, "lostpointercapture", pointerCancel, { passive: true });
      scope.listen(target, "click", click, { capture: true });
      return target;
    }
  });
}

function pointerDetails(current) {
  return {
    sceneId: current?.sceneId ?? "",
    pointerId: current?.pointerId ?? 0,
    pointerType: current?.pointerType ?? "unknown",
    x: current?.x ?? 0,
    y: current?.y ?? 0,
    elapsedMs: current?.elapsedMs ?? 0,
    targetConnected: current?.target?.isConnected !== false
  };
}
