import { LONG_PRESS_DURATION_MS, LONG_PRESS_MOVEMENT_THRESHOLD } from "../../ui/long-press.mjs";

const ENGAGE_THRESHOLD = 0.50;
const RELEASE_THRESHOLD = 0.46;
// Default interval between repeated movement commands while a direction is held.
export const DEFAULT_JOYSTICK_REPEAT_MS = 500;
const DIRECTION_HYSTERESIS = Math.PI / 18;

const OCTANTS = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([1, 1]), Object.freeze([0, 1]), Object.freeze([-1, 1]),
  Object.freeze([-1, 0]), Object.freeze([-1, -1]), Object.freeze([0, -1]), Object.freeze([1, -1])
]);
// Precompute the eight compass directions used to render and snap the joystick.
const DEFAULT_DIRECTIONS = Object.freeze(OCTANTS.map(([dx, dy]) => Object.freeze({ dx, dy, angle: Math.atan2(dy, dx) })));

// Convert a pointer vector into a direction while retaining a stable prior direction near boundaries.
export function joystickDirection(x, y, radius, threshold = ENGAGE_THRESHOLD, directions, previousDirection = null) {
  const distance = Math.hypot(x, y);
  if (!(radius > 0) || distance < radius * threshold) return Object.freeze({ dx: 0, dy: 0, magnitude: 0 });
  const magnitude = Math.min(1, distance / radius);
  const angle = Math.atan2(y, x);
  const candidates = Array.isArray(directions) ? directions.filter((entry) => Number.isFinite(Number(entry?.angle))
    && Number.isFinite(Number(entry?.dx)) && Number.isFinite(Number(entry?.dy))) : DEFAULT_DIRECTIONS;
  if (!candidates.length) return Object.freeze({ dx: 0, dy: 0, magnitude: 0 });
  let nearest = candidates.reduce((best, entry) => angularDistance(angle, entry.angle) < angularDistance(angle, best.angle) ? entry : best);
  const previous = previousDirection && candidates.find((entry) => Number(entry.dx) === Number(previousDirection.dx)
    && Number(entry.dy) === Number(previousDirection.dy));
  if (previous && nearest !== previous) {
    const separation = angularDistance(previous.angle, nearest.angle);
    const hysteresis = Math.min(DIRECTION_HYSTERESIS, separation / 3);
    if (angularDistance(angle, previous.angle) <= separation / 2 + hysteresis) nearest = previous;
  }
  const result = { dx: Number(nearest.dx), dy: Number(nearest.dy), magnitude };
  if (Array.isArray(directions)) result.angle = Number(nearest.angle);
  return Object.freeze(result);
}

// Place the knob on the selected direction's endpoint at the given travel limit.
export function snappedJoystickOffset(direction, maximumTravel) {
  if (!direction?.dx && !direction?.dy) return Object.freeze({ x: 0, y: 0 });
  const travel = Math.max(0, Number(maximumTravel)) * Math.min(1, Math.max(0, Number(direction.magnitude) || 0));
  if (Number.isFinite(Number(direction.angle))) {
    return Object.freeze({ x: Math.cos(Number(direction.angle)) * travel, y: Math.sin(Number(direction.angle)) * travel });
  }
  const axisLength = Math.hypot(direction.dx, direction.dy);
  return Object.freeze({ x: direction.dx / axisLength * travel, y: direction.dy / axisLength * travel });
}

/** Own a centre-first serialized directional touch stream without knowing Foundry. */
// Bind continuous joystick movement, repeat timing, and scoped pointer cleanup.
export function createJoystickController({
  base,
  knob,
  scope,
  onStep,
  onDirection = () => {},
  onTouchChange = () => {},
  directions = DEFAULT_DIRECTIONS,
  repeatDelayMs = DEFAULT_JOYSTICK_REPEAT_MS,
  now = monotonicNow
}) {
  const document = base.ownerDocument;
  const eventWindow = document?.defaultView;
  let pointerId = null;
  let direction = { dx: 0, dy: 0, magnitude: 0 };
  let origin = null;
  let timer = null;
  let stepping = false;
  let stoppedByBlock = false;
  let disposed = false;
  let gestureVersion = 0;

  // Cancel any pending movement tick before resetting or scheduling another.
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  // Return the joystick to neutral and release capture for the active pointer.
  const reset = () => {
    const wasTouching = pointerId !== null;
    gestureVersion++;
    clearTimer();
    pointerId = null;
    origin = null;
    direction = { dx: 0, dy: 0, magnitude: 0 };
    stoppedByBlock = false;
    base.removeAttribute("data-direction");
    knob.style.transform = "translate(-50%, -50%)";
    onDirection(direction);
    if (wasTouching) onTouchChange(false);
  };

  // Queue the next movement tick only while this gesture remains active.
  const schedule = (delay = 0) => {
    if (timer !== null || stepping || disposed || stoppedByBlock || (!direction.dx && !direction.dy)) return;
    timer = setTimeout(tick, delay);
  };

  // Send one movement step, then recheck session ownership before repeating.
  const tick = async () => {
    timer = null;
    if (disposed || (!direction.dx && !direction.dy)) return;
    const attempted = { ...direction };
    const version = gestureVersion;
    const startedAt = now();
    stepping = true;
    try {
      const result = await onStep(attempted.dx, attempted.dy, attempted.angle);
      if (version === gestureVersion && result?.moved === false && attempted.dx === direction.dx && attempted.dy === direction.dy) {
        stoppedByBlock = true;
      }
    } catch {
      if (version === gestureVersion) stoppedByBlock = true;
    } finally {
      stepping = false;
    }
    if (disposed || stoppedByBlock || (!direction.dx && !direction.dy)) return;
    if (version !== gestureVersion || attempted.dx !== direction.dx || attempted.dy !== direction.dy) return schedule(0);
    const remaining = normalizedRepeatDelay(repeatDelayMs) - Math.max(0, now() - startedAt);
    if (remaining > 0) schedule(remaining);
    // One settled transaction may start one successor; overdue cadence slots are never queued.
    else void tick();
  };

  // Convert current pointer coordinates to a direction and visible knob offset.
  const update = (event) => {
    const rect = base.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    let x = Number(event.clientX) - origin.x;
    let y = Number(event.clientY) - origin.y;
    const distance = Math.hypot(x, y);
    if (distance > radius && distance > 0) {
      x = x / distance * radius;
      y = y / distance * radius;
    }
    const wasEngaged = Boolean(direction.dx || direction.dy);
    let next = joystickDirection(x, y, radius, wasEngaged ? RELEASE_THRESHOLD : ENGAGE_THRESHOLD, directions, direction);
    const visualDirection = joystickDirection(x, y, radius, 0.01, directions, direction);
    const changed = next.dx !== direction.dx || next.dy !== direction.dy;
    direction = next;
    if (!next.dx && !next.dy) {
      clearTimer();
      base.removeAttribute("data-direction");
      const knobRadius = Number(knob.offsetWidth || 52) / 2;
      const offset = snappedJoystickOffset(visualDirection, radius - knobRadius - 4);
      knob.style.transform = `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`;
    } else {
      base.dataset.direction = `${next.dx},${next.dy}`;
      const knobRadius = Number(knob.offsetWidth || 52) / 2;
      const offset = snappedJoystickOffset(next, radius - knobRadius - 4);
      knob.style.transform = `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`;
      if (changed) {
        stoppedByBlock = false;
        eventWindow?.navigator?.vibrate?.(5);
      }
      schedule(0);
    }
    onDirection(direction);
  };

  scope.listen(base, "pointerdown", (event) => {
    if (disposed || pointerId !== null || document?.visibilityState === "hidden") return;
    if (event.button !== 0 || event.isPrimary === false || !insideKnob(knob, event)) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    origin = { x: Number(event.clientX), y: Number(event.clientY) };
    onTouchChange(true);
  });
  scope.listen(eventWindow, "pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    update(event);
  }, { passive: false });
  // Finish this pointer's gesture, including cancelled and lost-capture paths.
  const end = (event) => {
    if (event.pointerId === pointerId) reset();
  };
  scope.listen(eventWindow, "pointerup", end);
  scope.listen(eventWindow, "pointercancel", end);
  scope.listen(base, "lostpointercapture", end);
  scope.listen(document, "visibilitychange", () => {
    if (document.visibilityState === "hidden") reset();
  });
  scope.listen(eventWindow, "pagehide", reset);
  scope.listen(eventWindow, "blur", reset);
  scope.own(() => {
    disposed = true;
    reset();
  });

  return Object.freeze({ reset, isActive: () => pointerId !== null });
}

/** Bind directional buttons as release-origin taps; movement starts only on a valid release. */
// Bind discrete directional presses with the same action-session guards as joystick movement.
export function createDpadController({
  base,
  knob,
  scope,
  onStep,
  onTouchChange = () => {},
  movementThreshold = LONG_PRESS_MOVEMENT_THRESHOLD,
  longPressMs = LONG_PRESS_DURATION_MS,
  now = () => Date.now()
}) {
  const document = base?.ownerDocument;
  const eventWindow = document?.defaultView;
  const buttons = Array.from(base?.querySelectorAll?.("button[data-direction]") ?? []);
  let press = null;
  let pending = false;
  let disposed = false;
  let pulse = false;
  knob?.style && (knob.style.transform = "translate(-50%, -50%)");

  // Release the tracked contact's native touch scroll hold after the gesture ends.
  const releaseTouch = () => {
    if (!press) return;
    press.button.classList?.remove("is-pressed");
    press = null;
    onTouchChange(false);
  };
  // Cancel movement and restore all d-pad buttons to their idle state.
  const cancel = () => {
    releaseTouch();
    for (const button of buttons) button.removeAttribute?.("data-press-pulse");
  };
  // Send one directional step and report command failures without stale UI writes.
  const run = async (dx, dy, angle = Math.atan2(dy, dx), button) => {
    if (disposed || pending || (!dx && !dy)) return false;
    pending = true;
    pulse = !pulse;
    button?.setAttribute?.("data-press-pulse", pulse ? "a" : "b");
    try { await onStep(dx, dy, angle); }
    catch { /* The supplied action owns user-facing error reporting. */ }
    finally { pending = false; }
    return true;
  };
  // Read the button's declared direction vector and reject malformed values.
  const parseDirection = (button) => {
    const values = String(button?.dataset?.direction ?? "").split(/[ ,]+/u).map(Number);
    const [dx, dy, dataAngle] = values;
    if (![dx, dy].every((value) => Number.isInteger(value) && value >= -1 && value <= 1) || (!dx && !dy)) return null;
    const angle = Number(button?.dataset?.angle ?? dataAngle);
    return { dx, dy, angle: Number.isFinite(angle) ? angle : Math.atan2(dy, dx) };
  };
  // Start repeat movement for a valid enabled direction control.
  const pointerDown = (button, event) => {
    if (disposed || pending || press || button.disabled || event.button !== 0 || event.isPrimary === false) return;
    const direction = parseDirection(button);
    if (!direction) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    press = { button, pointerId: event.pointerId, x: Number(event.clientX), y: Number(event.clientY), startedAt: now(), ...direction };
    button.classList?.add("is-pressed");
    onTouchChange(true);
  };
  // Stop a held direction if the pointer leaves its original button.
  const pointerMove = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (Math.hypot(Number(event.clientX) - press.x, Number(event.clientY) - press.y) >= movementThreshold) cancel();
  };
  // Stop repeat movement when its pointer is released.
  const pointerUp = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const pendingPress = press;
    releaseTouch();
    event.preventDefault?.();
    event.stopPropagation?.();
    if (pendingPress.button.disabled || now() - pendingPress.startedAt >= longPressMs || !containsClientPoint(pendingPress.button, event)) return;
    // Pointer capture retargets the event to its origin even across a clipped
    // sector seam. Resolve the actual release hit before accepting the tap.
    if (document?.elementFromPoint) {
      const hit = document.elementFromPoint(Number(event.clientX), Number(event.clientY));
      if (!pendingPress.button.contains(hit)) return;
    }
    void run(pendingPress.dx, pendingPress.dy, pendingPress.angle, pendingPress.button);
  };
  // Preserve keyboard activation while suppressing duplicate pointer clicks.
  const click = (button, event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    if (event.detail !== 0 || button.disabled || pending || press) return;
    const direction = parseDirection(button);
    if (direction) void run(direction.dx, direction.dy, direction.angle, button);
  };

  for (const button of buttons) {
    scope.listen(button, "pointerdown", (event) => pointerDown(button, event), { passive: false });
    scope.listen(button, "click", (event) => click(button, event));
    scope.listen(button, "contextmenu", (event) => { event.preventDefault?.(); cancel(); });
    scope.listen(button, "animationend", (event) => {
      if (event.animationName === `ve-dpad-flash-${button.dataset?.pressPulse}`) button.removeAttribute("data-press-pulse");
    });
  }
  scope.listen(eventWindow, "pointermove", pointerMove, { passive: true });
  scope.listen(eventWindow, "pointerup", pointerUp, { passive: false });
  scope.listen(eventWindow, "pointercancel", (event) => { if (press?.pointerId === event.pointerId) cancel(); }, { passive: true });
  scope.listen(document, "visibilitychange", () => { if (document.visibilityState === "hidden") cancel(); });
  scope.listen(eventWindow, "pagehide", cancel);
  scope.listen(eventWindow, "blur", cancel);
  scope.own(() => { disposed = true; cancel(); });
  return Object.freeze({ reset: cancel, cancel, isActive: () => Boolean(press), isPending: () => pending });
}

/** Bind the joystick pill release button to an origin-bound intentional tap. */
// Add an accessible release action for ending the currently held movement session.
export function bindJoystickReleaseControl({
  control,
  scope,
  onRelease,
  isJoystickActive = () => false,
  movementThreshold = LONG_PRESS_MOVEMENT_THRESHOLD,
  longPressMs = LONG_PRESS_DURATION_MS,
  getWindow = () => control?.ownerDocument?.defaultView ?? globalThis.window,
  now = () => Date.now()
}) {
  const eventWindow = getWindow() ?? control;
  let press = null;

  // Clear this control's active pointer and its held presentation state.
  const cancel = () => {
    press = null;
  };
  // Recheck the current action session before requesting its release command.
  const activate = () => {
    if (control.disabled || isJoystickActive()) return;
    onRelease();
  };
  // Start the release gesture only for a primary press inside the visible control.
  const pointerDown = (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    if (event.button !== undefined && event.button !== 0) return cancel();
    if (control.disabled || isJoystickActive()) return cancel();
    press = {
      pointerId: event.pointerId,
      x: Number(event.clientX),
      y: Number(event.clientY),
      startedAt: now()
    };
  };
  // Cancel activation when a press drifts outside the control boundary.
  const pointerMove = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (Math.hypot(Number(event.clientX) - press.x, Number(event.clientY) - press.y) >= movementThreshold) cancel();
  };
  // Activate on release only when the original pointer stayed within the control.
  const pointerUp = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const pending = press;
    cancel();
    event.preventDefault?.();
    event.stopPropagation?.();
    if ((now() - pending.startedAt) >= longPressMs) return;
    if (isJoystickActive() || !containsClientPoint(control, event)) return;
    activate();
  };
  // Drop state on browser cancellation without issuing a release action.
  const pointerCancel = (event) => {
    if (press?.pointerId === event.pointerId) cancel();
  };
  // Support keyboard clicks and avoid repeating a pointer-triggered activation.
  const click = (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    if (event.detail === 0) activate();
  };

  scope.listen(control, "pointerdown", pointerDown, { passive: false });
  scope.listen(eventWindow, "pointermove", pointerMove, { passive: true });
  scope.listen(eventWindow, "pointerup", pointerUp, { passive: false });
  scope.listen(eventWindow, "pointercancel", pointerCancel, { passive: true });
  scope.listen(control, "lostpointercapture", pointerCancel, { passive: true });
  scope.listen(control, "click", click);
  scope.listen(control, "contextmenu", (event) => {
    event.preventDefault?.();
    cancel();
  });
  scope.own(cancel);

  return Object.freeze({ cancel });
}

// Test client coordinates against the control's current bounding rectangle.
function containsClientPoint(control, event) {
  const rect = control?.getBoundingClientRect?.();
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) {
    return event.target === control || Boolean(control?.contains?.(event.target));
  }
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Determine whether a press began on the movable knob rather than its track.
function insideKnob(knob, event) {
  const rect = knob?.getBoundingClientRect?.();
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  if (!rect || ![rect.left, rect.top, rect.width, rect.height, x, y].every(Number.isFinite)) return false;
  const radius = Math.min(rect.width, rect.height) / 2;
  return Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2)) <= radius;
}

// Return the shortest circular distance between two direction angles.
function angularDistance(first, second) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

// Clamp the configured repeat interval to a safe positive timer delay.
function normalizedRepeatDelay(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1000, Math.max(0, Math.round(parsed))) : DEFAULT_JOYSTICK_REPEAT_MS;
}

// Use a monotonic clock where available for repeat and click suppression timing.
function monotonicNow() {
  const value = globalThis.performance?.now?.();
  return Number.isFinite(value) ? value : Date.now();
}
