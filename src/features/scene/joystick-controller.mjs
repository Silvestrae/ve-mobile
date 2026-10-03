import { LONG_PRESS_DURATION_MS, LONG_PRESS_MOVEMENT_THRESHOLD } from "../../ui/long-press.mjs";

const ENGAGE_THRESHOLD = 0.50;
const RELEASE_THRESHOLD = 0.46;
export const DEFAULT_JOYSTICK_REPEAT_MS = 500;
const DIRECTION_HYSTERESIS = Math.PI / 18;

const OCTANTS = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([1, 1]), Object.freeze([0, 1]), Object.freeze([-1, 1]),
  Object.freeze([-1, 0]), Object.freeze([-1, -1]), Object.freeze([0, -1]), Object.freeze([1, -1])
]);

export function joystickDirection(x, y, radius, threshold = ENGAGE_THRESHOLD) {
  const distance = Math.hypot(x, y);
  if (!(radius > 0) || distance < radius * threshold) return Object.freeze({ dx: 0, dy: 0, magnitude: 0 });
  const magnitude = Math.min(1, distance / radius);
  const angle = Math.atan2(y, x);
  const octant = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  const [dx, dy] = OCTANTS[octant];
  return Object.freeze({ dx, dy, magnitude });
}

export function snappedJoystickOffset(direction, maximumTravel) {
  if (!direction?.dx && !direction?.dy) return Object.freeze({ x: 0, y: 0 });
  const axisLength = Math.hypot(direction.dx, direction.dy);
  const travel = Math.max(0, Number(maximumTravel)) * Math.min(1, Math.max(0, Number(direction.magnitude) || 0));
  return Object.freeze({ x: direction.dx / axisLength * travel, y: direction.dy / axisLength * travel });
}

/** Own a serialized eight-direction touch stream without knowing Foundry. */
export function createJoystickController({
  base,
  knob,
  scope,
  onStep,
  onDirection = () => {},
  onTouchChange = () => {},
  repeatDelayMs = DEFAULT_JOYSTICK_REPEAT_MS,
  now = monotonicNow
}) {
  const document = base.ownerDocument;
  const eventWindow = document?.defaultView;
  let pointerId = null;
  let direction = { dx: 0, dy: 0, magnitude: 0 };
  let timer = null;
  let stepping = false;
  let stoppedByBlock = false;
  let disposed = false;
  let gestureVersion = 0;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const reset = () => {
    const wasTouching = pointerId !== null;
    gestureVersion++;
    clearTimer();
    pointerId = null;
    direction = { dx: 0, dy: 0, magnitude: 0 };
    stoppedByBlock = false;
    base.removeAttribute("data-direction");
    knob.style.transform = "translate(-50%, -50%)";
    onDirection(direction);
    if (wasTouching) onTouchChange(false);
  };

  const schedule = (delay = 0) => {
    if (timer !== null || stepping || disposed || stoppedByBlock || (!direction.dx && !direction.dy)) return;
    timer = setTimeout(tick, delay);
  };

  const tick = async () => {
    timer = null;
    if (disposed || (!direction.dx && !direction.dy)) return;
    const attempted = { ...direction };
    const version = gestureVersion;
    const startedAt = now();
    stepping = true;
    try {
      const result = await onStep(attempted.dx, attempted.dy);
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

  const update = (event) => {
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2;
    let x = Number(event.clientX) - (rect.left + radius);
    let y = Number(event.clientY) - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    if (distance > radius && distance > 0) {
      x = x / distance * radius;
      y = y / distance * radius;
    }
    const wasEngaged = Boolean(direction.dx || direction.dy);
    let next = joystickDirection(x, y, radius, wasEngaged ? RELEASE_THRESHOLD : ENGAGE_THRESHOLD);
    const visualDirection = joystickDirection(x, y, radius, 0.01);
    if ((direction.dx || direction.dy) && (next.dx || next.dy)
      && (next.dx !== direction.dx || next.dy !== direction.dy)
      && angularDistance(Math.atan2(y, x), Math.atan2(direction.dy, direction.dx)) < Math.PI / 8 + DIRECTION_HYSTERESIS) {
      next = { dx: direction.dx, dy: direction.dy, magnitude: next.magnitude };
    }
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
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    onTouchChange(true);
    update(event);
  });
  scope.listen(eventWindow, "pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    update(event);
  }, { passive: false });
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

/** Bind the joystick pill release button to an origin-bound intentional tap. */
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

  const cancel = () => {
    press = null;
  };
  const activate = () => {
    if (control.disabled || isJoystickActive()) return;
    onRelease();
  };
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
  const pointerMove = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (Math.hypot(Number(event.clientX) - press.x, Number(event.clientY) - press.y) >= movementThreshold) cancel();
  };
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
  const pointerCancel = (event) => {
    if (press?.pointerId === event.pointerId) cancel();
  };
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

function containsClientPoint(control, event) {
  const rect = control?.getBoundingClientRect?.();
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) {
    return event.target === control || Boolean(control?.contains?.(event.target));
  }
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function angularDistance(first, second) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function normalizedRepeatDelay(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1000, Math.max(0, Math.round(parsed))) : DEFAULT_JOYSTICK_REPEAT_MS;
}

function monotonicNow() {
  const value = globalThis.performance?.now?.();
  return Number.isFinite(value) ? value : Date.now();
}
