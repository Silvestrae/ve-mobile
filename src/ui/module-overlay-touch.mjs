import { pulseHoldHaptic } from "./haptics.mjs";

export const OVERLAY_TOUCH_MOVE_THRESHOLD = 8;
export const OVERLAY_LONG_PRESS_MS = 500;
const GHOST_CLICK_WINDOW_MS = 750;
const DEDICATED_DRAG_HANDLE_SELECTOR = [
  "[data-drag-handle]",
  "[data-window-drag-handle]",
  "[data-application-drag-handle]",
  "[id*='drag' i]",
  "[class*='drag' i]"
].join(", ");
const DEDICATED_DRAG_HANDLE_NAME = /(?:^|[-_\s])(drag[-_\s]*handle|window[-_\s]*drag|application[-_\s]*drag)(?:$|[-_\s])/iu;
const MOVE_CURSOR = /^(?:move|grab|grabbing)$/iu;

/** Translate touch pointers within one explicitly enabled module overlay. */
export function enableModuleOverlayTouch(root, scope, {
  dragStrategy = "mouse-target",
  moveWindow = null,
  moveThreshold = OVERLAY_TOUCH_MOVE_THRESHOLD,
  longPressMs = OVERLAY_LONG_PRESS_MS,
  now = () => Date.now(),
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel = (id) => globalThis.clearTimeout(id),
  createMouseEvent = (type, init) => new MouseEvent(type, init),
  createPointerEvent = (type, init) => new PointerEvent(type, init),
  haptic = pulseHoldHaptic,
  trace = () => {}
} = {}) {
  let gesture = null;
  let suppressClickUntil = 0;
  const synthetic = new WeakSet();
  if (dragStrategy === "pointer-window" || dragStrategy === "pointer-root") {
    preparePointerWindowTouchOwnership(root, scope, { includeRoot: dragStrategy === "pointer-root" });
  }

  const record = (eventName, event, phase = gesture?.phase ?? "none") => trace(Object.freeze({
    event: eventName,
    phase,
    pointerId: Number(event?.pointerId) || 0,
    pointerType: String(event?.pointerType ?? "unknown"),
    buttons: Number(event?.buttons) || 0,
    pressure: Number(event?.pressure) || 0,
    captured: Boolean(root.hasPointerCapture?.(event?.pointerId)),
    defaultPrevented: Boolean(event?.defaultPrevented ?? event?.prevented),
    touchAction: touchActionAt(root, event?.target)
  }));

  const dispatchMouse = (target, type, source, { button = 0, buttons = 0 } = {}) => {
    if (!target?.dispatchEvent) return false;
    const event = createMouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: root.ownerDocument?.defaultView ?? globalThis.window,
      clientX: Number(source?.clientX) || 0,
      clientY: Number(source?.clientY) || 0,
      screenX: Number(source?.screenX) || 0,
      screenY: Number(source?.screenY) || 0,
      button,
      buttons,
      detail: type === "click" || type === "contextmenu" ? 1 : 0
    });
    synthetic.add(event);
    return target.dispatchEvent(event);
  };

  const dispatchPointer = (target, type, source, { button = 0, buttons = 0, pointerId = 1 } = {}) => {
    if (!target?.dispatchEvent) return false;
    const event = createPointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: root.ownerDocument?.defaultView ?? globalThis.window,
      clientX: Number(source?.clientX) || 0,
      clientY: Number(source?.clientY) || 0,
      screenX: Number(source?.screenX) || 0,
      screenY: Number(source?.screenY) || 0,
      button,
      buttons,
      pointerId,
      pointerType: "mouse",
      isPrimary: true
    });
    synthetic.add(event);
    return target.dispatchEvent(event);
  };

  const dragEvent = (active, type, source, buttons) => {
    if (active.dedicatedHandle) {
      const captured = active.dedicatedHandle.hasPointerCapture?.(active.pointerId) === true;
      const target = captured ? active.dedicatedHandle : (root.ownerDocument?.defaultView ?? globalThis.window);
      return dispatchPointer(target, type, source, { button: 0, buttons, pointerId: active.pointerId });
    }
    if (typeof moveWindow === "function") {
      const point = {
        clientX: Number(source?.clientX) || 0,
        clientY: Number(source?.clientY) || 0
      };
      return moveWindow(Object.freeze({
        phase: type === "pointerdown" ? "start" : type === "pointermove" ? "move" : "end",
        deltaX: point.clientX - active.start.clientX,
        deltaY: point.clientY - active.start.clientY,
        point: Object.freeze(point)
      }));
    }
    if (dragStrategy === "pointer-window" || dragStrategy === "pointer-root") {
      const target = type === "pointerdown"
        ? active.target
        : dragStrategy === "pointer-root" ? root : (root.ownerDocument?.defaultView ?? globalThis.window);
      return dispatchPointer(target, type, source, { button: 0, buttons, pointerId: active.syntheticPointerId });
    }
    const mouseType = type === "pointerdown" ? "mousedown" : type === "pointermove" ? "mousemove" : "mouseup";
    return dispatchMouse(releaseTarget(active), mouseType, source, { button: 0, buttons });
  };

  const clearTimer = (active = gesture) => {
    if (active?.timer === null || active?.timer === undefined) return;
    cancel(active.timer);
    active.timer = null;
  };

  const ownPointer = (event) => {
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
  };

  const releaseCapture = (pointerId) => {
    try {
      if (root.hasPointerCapture?.(pointerId)) root.releasePointerCapture(pointerId);
    } catch {
      // Removal can make pointer capture disappear before cleanup runs.
    }
  };

  const suppressGhostClick = () => {
    suppressClickUntil = Math.max(suppressClickUntil, now() + GHOST_CLICK_WINDOW_MS);
  };

  const releaseTarget = (active) => active?.target?.isConnected === false
    ? (root.ownerDocument ?? active.target)
    : active.target;

  const arm = (active = gesture) => {
    if (!active || active !== gesture || active.phase !== "pending") return false;
    clearTimer(active);
    active.phase = "armed";
    haptic?.();
    record("hold-armed", active.last, active.phase);
    return true;
  };

  const armIfElapsed = (active = gesture) => {
    if (active?.phase === "pending" && now() - active.startedAt >= longPressMs) arm(active);
    return active?.phase === "armed";
  };

  const cancelGesture = ({ releaseMouse = true } = {}) => {
    if (!gesture) return;
    const active = gesture;
    clearTimer(active);
    gesture = null;
    if (releaseMouse && active.dedicatedHandle) {
      dragEvent(active, "pointercancel", active.last, 0);
    } else if (releaseMouse && active.phase === "dragging") {
      dragEvent(active, "pointerup", active.last, 0);
    }
    restoreSelectionSuppression(active);
    releaseCapture(active.pointerId);
    suppressGhostClick();
  };

  const onPointerDown = (event) => {
    if (synthetic.has(event)) return;
    if (gesture || event.pointerType !== "touch" || event.isPrimary === false || event.button > 0) return;
    const target = event.target;
    if (editableControl(target)) return;
    const dedicatedHandle = findDedicatedDragHandle(root, target);
    if (dedicatedHandle) event.preventDefault?.();
    else ownPointer(event);
    const active = {
      pointerId: event.pointerId,
      target,
      start: Object.freeze({
        clientX: Number(event.clientX) || 0,
        clientY: Number(event.clientY) || 0,
        screenX: Number(event.screenX) || 0,
        screenY: Number(event.screenY) || 0
      }),
      startedAt: now(),
      last: event,
      phase: "pending",
      dedicatedHandle,
      timer: null,
      moveTraces: 0,
      syntheticPointerId: Math.max(1, Number(event.pointerId) || 1) + 1_000_000,
      selectionRestore: suppressSelection(root)
    };
    gesture = active;
    if (!dedicatedHandle) {
      try { root.setPointerCapture?.(event.pointerId); } catch { /* capture is best-effort */ }
    }
    record("pointerdown", event, active.phase);
    if (!dedicatedHandle) active.timer = schedule(() => arm(active), longPressMs);
  };

  const onPointerMove = (event) => {
    if (synthetic.has(event)) return;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const active = gesture;
    active.last = event;
    if (active.moveTraces < 4) {
      active.moveTraces += 1;
      record("pointermove", event, active.phase);
    }
    const distance = Math.hypot(
      (Number(event.clientX) || 0) - active.start.clientX,
      (Number(event.clientY) || 0) - active.start.clientY
    );
    if (active.dedicatedHandle) {
      event.preventDefault?.();
      if (distance < moveThreshold) {
        ownPointer(event);
        return;
      }
      if (active.phase === "pending") {
        active.phase = "dragging";
        record("drag-handle-start", event, active.phase);
        suppressGhostClick();
      }
      // The real pointerdown already armed the overlay's own handle listener.
      // Once threshold is crossed, preserve that captured pointer stream so its
      // target/document/window move listener performs authoritative movement.
      return;
    }
    ownPointer(event);
    if (!active.dedicatedHandle) armIfElapsed(active);

    if (active.phase === "pending" && distance >= moveThreshold) {
      // An immediate finger move was never an intentional desktop drag. Keep
      // capture until release so this owned overlay gesture cannot leak to the
      // Scene, but emit no synthetic mouse sequence.
      clearTimer(active);
      active.phase = "cancelled";
      suppressGhostClick();
      return;
    }

    if (active.phase === "armed" && distance >= moveThreshold) {
      active.phase = "dragging";
      record("drag-start", event, active.phase);
      suppressGhostClick();
      dragEvent(active, "pointerdown", active.start, 1);
      dragEvent(active, "pointermove", event, 1);
      return;
    }

    if (active.phase === "dragging") dragEvent(active, "pointermove", event, 1);
  };

  const onPointerUp = (event) => {
    if (synthetic.has(event)) return;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const active = gesture;
    if (active.dedicatedHandle) event.preventDefault?.();
    else ownPointer(event);
    active.last = event;
    if (!active.dedicatedHandle) armIfElapsed(active);
    clearTimer(active);
    gesture = null;
    record("pointerup", event, active.phase);
    suppressGhostClick();

    if (active.phase === "dragging" && !active.dedicatedHandle) {
      dragEvent(active, "pointerup", event, 0);
    } else if (active.phase === "armed" && !active.dedicatedHandle) {
      dispatchMouse(active.target, "mousedown", event, { button: 2, buttons: 2 });
      dispatchMouse(active.target, "mouseup", event, { button: 2, buttons: 0 });
      dispatchMouse(active.target, "contextmenu", event, { button: 2, buttons: 0 });
    } else if (active.phase === "pending" && !active.dedicatedHandle) {
      dispatchMouse(active.target, "mousedown", active.start, { button: 0, buttons: 1 });
      dispatchMouse(active.target, "mouseup", event, { button: 0, buttons: 0 });
      dispatchMouse(active.target, "click", event, { button: 0, buttons: 0 });
    }

    restoreSelectionSuppression(active);
    releaseCapture(active.pointerId);
  };

  const onPointerCancel = (event) => {
    if (synthetic.has(event)) return;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dedicatedHandle = gesture.dedicatedHandle;
    if (dedicatedHandle) event.preventDefault?.();
    else ownPointer(event);
    record("pointercancel", event);
    cancelGesture({ releaseMouse: !dedicatedHandle });
  };

  const onLostPointerCapture = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    record("lostpointercapture", event);
    if (gesture.dedicatedHandle) return;
    cancelGesture();
  };

  /** Dedicated handles can reparent their overlay while unpinning. That drops
   * element capture on touch even though their native window drag remains
   * active. Own the hardware stream at window capture and relay it through the
   * original handle so neither reparenting nor leaving the handle hands the
   * gesture to the Scene. */
  const onDedicatedWindowMove = (event) => {
    if (synthetic.has(event) || !gesture?.dedicatedHandle || event.pointerId !== gesture.pointerId) return;
    const active = gesture;
    ownPointer(event);
    active.last = event;
    const distance = Math.hypot(
      (Number(event.clientX) || 0) - active.start.clientX,
      (Number(event.clientY) || 0) - active.start.clientY
    );
    if (distance < moveThreshold) return;
    if (active.phase === "pending") {
      active.phase = "dragging";
      record("drag-handle-start", event, active.phase);
      suppressGhostClick();
    }
    dispatchPointer(active.dedicatedHandle, "pointermove", event, { button: 0, buttons: 1, pointerId: active.pointerId });
  };

  const finishDedicatedWindowGesture = (event, type) => {
    if (synthetic.has(event) || !gesture?.dedicatedHandle || event.pointerId !== gesture.pointerId) return;
    const active = gesture;
    ownPointer(event);
    active.last = event;
    dispatchPointer(active.dedicatedHandle, type, event, { button: 0, buttons: 0, pointerId: active.pointerId });
    gesture = null;
    record(type, event, active.phase);
    restoreSelectionSuppression(active);
    releaseCapture(active.pointerId);
    suppressGhostClick();
  };

  const onDedicatedWindowUp = (event) => finishDedicatedWindowGesture(event, "pointerup");
  const onDedicatedWindowCancel = (event) => finishDedicatedWindowGesture(event, "pointercancel");

  const onClick = (event) => {
    if (synthetic.has(event) || now() > suppressClickUntil) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
  };

  scope.listen(root, "pointerdown", onPointerDown, { capture: true, passive: false });
  scope.listen(root, "pointermove", onPointerMove, { capture: true, passive: false });
  scope.listen(root, "pointerup", onPointerUp, { capture: true, passive: false });
  scope.listen(root, "pointercancel", onPointerCancel, { capture: true, passive: false });
  scope.listen(root, "lostpointercapture", onLostPointerCapture, { capture: true, passive: false });
  scope.listen(root, "click", onClick, { capture: true });
  const pointerWindow = root.ownerDocument?.defaultView;
  if (pointerWindow) {
    scope.listen(pointerWindow, "pointermove", onDedicatedWindowMove, { capture: true, passive: false });
    scope.listen(pointerWindow, "pointerup", onDedicatedWindowUp, { capture: true, passive: false });
    scope.listen(pointerWindow, "pointercancel", onDedicatedWindowCancel, { capture: true, passive: false });
  }
  prepareDedicatedDragHandleTouchOwnership(root, scope);
  const suppressOwnedSelection = (event) => {
    if (!gesture) return;
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  const document = root.ownerDocument;
  if (document) {
    scope.listen(document, "selectstart", suppressOwnedSelection, { capture: true, passive: false });
    scope.listen(document, "dragstart", suppressOwnedSelection, { capture: true, passive: false });
  }
  scope.own(() => cancelGesture());
  return Object.freeze({ cancel: cancelGesture });
}

/** Find only a strongly identified, drag-only child of an admitted overlay.
 * A move cursor is supporting evidence, never sufficient by itself. Ordinary
 * Foundry window headers retain the shared hold gesture. */
export function findDedicatedDragHandle(root, target) {
  const candidate = target?.closest?.(DEDICATED_DRAG_HANDLE_SELECTOR);
  if (!candidate || candidate === root || !root?.contains?.(candidate)) return null;
  const dataset = candidate.dataset ?? {};
  const declarative = candidate.hasAttribute?.("data-drag-handle")
    || candidate.hasAttribute?.("data-window-drag-handle")
    || candidate.hasAttribute?.("data-application-drag-handle")
    || dataset.dragHandle !== undefined
    || dataset.windowDragHandle !== undefined
    || dataset.applicationDragHandle !== undefined;
  const identity = `${candidate.id ?? ""} ${typeof candidate.className === "string" ? candidate.className : ""}`;
  const namedHandle = DEDICATED_DRAG_HANDLE_NAME.test(identity);
  if (!declarative && !namedHandle) return null;
  if (candidate.matches?.("button, a[href], input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='button'], [role='slider']")) return null;
  const cursor = computedCursor(root, candidate);
  if (!declarative && !MOVE_CURSOR.test(cursor)) return null;
  return candidate;
}

/** Claim browser touch ownership before a gesture starts on structural handles. */
export function prepareDedicatedDragHandleTouchOwnership(root, scope) {
  const candidates = [...(root?.querySelectorAll?.(DEDICATED_DRAG_HANDLE_SELECTOR) ?? [])];
  const handles = candidates.filter((candidate) => findDedicatedDragHandle(root, candidate) === candidate);
  for (const handle of handles) {
    const style = handle?.style;
    const value = style?.getPropertyValue?.("touch-action") ?? "";
    const priority = style?.getPropertyPriority?.("touch-action") ?? "";
    style?.setProperty?.("touch-action", "none", "important");
    scope?.own?.(() => value ? style?.setProperty?.("touch-action", value, priority) : style?.removeProperty?.("touch-action"));
  }
  return handles.length;
}

/** Chrome decides touch ownership before movement, so admitted drag surfaces
 * must opt out of browser panning before the hold begins. Pointer-window
 * overlays claim native headers only; pointer-root overlays also claim their
 * admitted positioned root. Every change is scoped and restored. */
export function preparePointerWindowTouchOwnership(root, scope, { includeRoot = false } = {}) {
  const headers = [...(root?.querySelectorAll?.(".window-header") ?? [])];
  const surfaces = includeRoot ? [...new Set([root, ...headers].filter(Boolean))] : headers;
  for (const surface of surfaces) {
    const style = surface?.style;
    const value = style?.getPropertyValue?.("touch-action") ?? "";
    const priority = style?.getPropertyPriority?.("touch-action") ?? "";
    style?.setProperty?.("touch-action", "none", "important");
    scope?.own?.(() => value ? style?.setProperty?.("touch-action", value, priority) : style?.removeProperty?.("touch-action"));
  }
  return surfaces.length;
}

function suppressSelection(root) {
  const style = root?.style;
  const properties = ["user-select", "-webkit-user-select", "-webkit-touch-callout", "-webkit-user-drag"];
  const previous = properties.map((property) => [property, style?.getPropertyValue?.(property) ?? "", style?.getPropertyPriority?.(property) ?? ""]);
  for (const property of properties) style?.setProperty?.(property, "none", "important");
  root?.classList?.add?.("ve-mobile-overlay-touch-active");
  return () => {
    root?.classList?.remove?.("ve-mobile-overlay-touch-active");
    for (const [property, value, priority] of previous) {
      if (value) style?.setProperty?.(property, value, priority);
      else style?.removeProperty?.(property);
    }
  };
}

function restoreSelectionSuppression(active) {
  active?.selectionRestore?.();
  if (active) active.selectionRestore = null;
}

function editableControl(target) {
  return Boolean(target?.closest?.("input, textarea, select, option, [contenteditable]:not([contenteditable='false']), [role='slider']"));
}

function touchActionAt(root, target) {
  try {
    const header = target?.closest?.(".window-header") ?? target ?? root;
    return root?.ownerDocument?.defaultView?.getComputedStyle?.(header)?.touchAction
      ?? header?.style?.getPropertyValue?.("touch-action")
      ?? "unknown";
  } catch {
    return "unknown";
  }
}

function computedCursor(root, target) {
  try {
    return String(root?.ownerDocument?.defaultView?.getComputedStyle?.(target)?.cursor
      ?? target?.style?.getPropertyValue?.("cursor")
      ?? target?.style?.cursor
      ?? "").trim();
  } catch {
    return "";
  }
}
