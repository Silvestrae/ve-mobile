import { pulseHoldHaptic } from "./haptics.mjs";

export const LONG_PRESS_DURATION_MS = 500;
export const LONG_PRESS_MOVEMENT_THRESHOLD = 8;

/** Bind a scroll-safe long press that suppresses the synthetic release click. */
export function bindLongPress(target, scope, onLongPress, {
  durationMs = LONG_PRESS_DURATION_MS,
  movementThreshold = LONG_PRESS_MOVEMENT_THRESHOLD,
  getWindow = () => globalThis.window,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  now = () => Date.now(),
  haptic = pulseHoldHaptic,
  claimPointer = false,
  invokeOnRelease = false,
  trace = () => {}
} = {}) {
  const eventWindow = getWindow() ?? target;
  const holdDelay = Math.max(0, Number(durationMs) || LONG_PRESS_DURATION_MS);
  let press = null;
  let suppressClickUntil = 0;

  if (claimPointer) prepareLongPressOwnership(target, scope);

  const releaseCapture = (current) => {
    if (!current || !claimPointer) return;
    try { if (target.hasPointerCapture?.(current.pointerId)) target.releasePointerCapture(current.pointerId); } catch {}
  };

  const cancel = (reason = "cancelled") => {
    if (press?.timer !== null && press?.timer !== undefined) clearTimeoutFn(press.timer);
    if (press) trace(Object.freeze({ phase: "cancelled", reason, pointerId: press.pointerId }));
    releaseCapture(press);
    press = null;
  };
  const arm = (current) => {
    if (!current || press !== current) return false;
    if (current.armed) return true;
    if (current.timer !== null && current.timer !== undefined) clearTimeoutFn(current.timer);
    current.timer = null;
    current.armed = true;
    trace(Object.freeze({ phase: "threshold-reached", pointerId: current.pointerId }));
    haptic?.();
    if (invokeOnRelease) return true;
    return invoke(current, current.startEvent, true);
  };
  const invoke = (current, event, hapticDone = false) => {
    if (!current || press !== current) return false;
    if (current.timer !== null && current.timer !== undefined) clearTimeoutFn(current.timer);
    current.timer = null;
    suppressClickUntil = now() + 1000;
    press = null;
    releaseCapture(current);
    if (!hapticDone) {
      trace(Object.freeze({ phase: "threshold-reached", pointerId: current.pointerId }));
      haptic?.();
    }
    trace(Object.freeze({ phase: "context-invocation", pointerId: current.pointerId }));
    onLongPress(event);
    return true;
  };
  const pointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (target.disabled) return;
    cancel("restarted");
    if (claimPointer) {
      try { target.setPointerCapture?.(event.pointerId); } catch {}
    }
    const current = { pointerId: event.pointerId, x: Number(event.clientX), y: Number(event.clientY), startedAt: now(), timer: null, moveTraces: 0, armed: false, startEvent: event };
    trace(Object.freeze({ phase: "pointerdown", pointerId: current.pointerId, x: current.x, y: current.y }));
    current.timer = setTimeoutFn(() => {
      if (press !== current) return;
      arm(current);
    }, holdDelay);
    press = current;
    trace(Object.freeze({ phase: "timer-armed", pointerId: current.pointerId, durationMs }));
  };
  const pointerMove = (event) => {
    if (!press || press.pointerId !== event.pointerId) return;
    // Until the hold threshold is reached, movement belongs to the nearest
    // vertical scroller. This is essential for list rows which also expose a
    // long-press context menu.
    if (claimPointer && press.armed) event.preventDefault?.();
    const distance = Math.hypot(Number(event.clientX) - press.x, Number(event.clientY) - press.y);
    if (press.moveTraces < 4) {
      press.moveTraces += 1;
      trace(Object.freeze({ phase: "movement", pointerId: press.pointerId, distance }));
    }
    if (distance >= movementThreshold) cancel("movement-threshold");
  };
  const pointerEnd = (event) => {
    if (press?.pointerId !== event.pointerId) return;
    if (event.type === "pointerup" && invokeOnRelease && press.armed && invoke(press, event, true)) return;
    if (event.type === "pointerup" && now() - press.startedAt >= holdDelay) {
      if (invokeOnRelease) {
        const current = press;
        arm(current);
        if (press && invoke(current, event, true)) return;
      } else if (invoke(press, event)) return;
    }
    cancel(event.type ?? "pointer-end");
  };
  const click = (event) => {
    if (now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const contextMenu = (event) => {
    event.preventDefault?.();
    if (!press) {
      if (!claimPointer || target.disabled) return;
      if (now() <= suppressClickUntil) return;
      suppressClickUntil = now() + 1000;
      trace(Object.freeze({ phase: "native-contextmenu", pointerId: event.pointerId, recovered: true }));
      haptic?.();
      trace(Object.freeze({ phase: "context-invocation", pointerId: event.pointerId, recovered: true }));
      onLongPress(event);
      return;
    }
    trace(Object.freeze({ phase: "native-contextmenu", pointerId: press.pointerId }));
    if (invokeOnRelease) arm(press);
    else invoke(press, event);
  };

  scope.listen(target, "pointerdown", pointerDown, { capture: claimPointer, passive: !claimPointer });
  scope.listen(eventWindow, "pointermove", pointerMove, { capture: claimPointer, passive: !claimPointer });
  scope.listen(eventWindow, "pointerup", pointerEnd, { capture: claimPointer, passive: true });
  scope.listen(eventWindow, "pointercancel", pointerEnd, { capture: claimPointer, passive: true });
  scope.listen(target, "lostpointercapture", pointerEnd, { capture: claimPointer, passive: true });
  scope.listen(target, "click", click, { capture: true });
  scope.listen(target, "contextmenu", contextMenu);
  scope.own(() => cancel("scope-disposed"));
}

/** Preserve vertical scrolling while reserving a stationary hold gesture. */
export function prepareLongPressOwnership(target, scope) {
  const style = target?.style;
  if (!style?.setProperty) return;
  const value = style.getPropertyValue("touch-action");
  const priority = style.getPropertyPriority("touch-action");
  style.setProperty("touch-action", "pan-y", "important");
  scope?.own?.(() => value ? style.setProperty("touch-action", value, priority) : style.removeProperty("touch-action"));
}
