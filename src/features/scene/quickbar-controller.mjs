import { pulseHoldHaptic } from "../../ui/haptics.mjs";

const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD = 8;

/** Pointer controller for fixed Quickbar slots and staged slot swapping. */
export function bindQuickbarController({
  bar,
  scope,
  getSlots,
  canPress = (index) => Boolean(getSlots()[index]),
  deferSwap = false,
  isEditing,
  onActivate,
  onEnterEdit,
  onSelect,
  onSwap,
  onDragChange = () => {},
  getWindow = () => globalThis.window,
  longPressMs = LONG_PRESS_MS,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  haptic = pulseHoldHaptic
}) {
  const eventWindow = getWindow() ?? bar;
  let active = null;

  const slotElements = () => Array.from(bar.querySelectorAll("[data-ve-quickbar-slot]"));
  const clearTimer = () => {
    if (active?.timer !== null && active?.timer !== undefined) clearTimeoutFn(active.timer);
    if (active) active.timer = null;
  };
  const reset = () => {
    clearTimer();
    if (active?.dragging) onDragChange(active.currentIndex, false);
    active = null;
  };
  const pointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const element = event.target?.closest?.("[data-ve-quickbar-slot]");
    if (!element || !bar.contains(element)) return;
    const index = Number(element.dataset.veQuickbarSlot);
    if (!Number.isInteger(index) || element.disabled || !canPress(index)) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
    active = {
      pointerId: event.pointerId,
      startX: Number(event.clientX),
      startY: Number(event.clientY),
      startIndex: index,
      currentIndex: index,
      editingAtStart: isEditing(),
      longFired: false,
      cancelled: false,
      dragging: false,
      timer: null
    };
    if (!active.editingAtStart) {
      const press = active;
      press.timer = setTimeoutFn(() => {
        if (active !== press || press.cancelled) return;
        press.timer = null;
        press.longFired = true;
        haptic?.();
        onEnterEdit(press.startIndex);
      }, Math.max(0, Number(longPressMs) || LONG_PRESS_MS));
    }
    element.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event) => {
    if (!active || active.pointerId !== event.pointerId) return;
    const distance = Math.hypot(Number(event.clientX) - active.startX, Number(event.clientY) - active.startY);
    if (distance < DRAG_THRESHOLD) return;
    if (!isEditing()) {
      active.cancelled = true;
      clearTimer();
      return;
    }
    if (!active.dragging) {
      active.dragging = true;
      onDragChange(active.currentIndex, true);
    }
    const targetIndex = slotIndexAt(slotElements(), Number(event.clientX), Number(event.clientY));
    if (targetIndex < 0 || targetIndex === active.currentIndex) return;
    const previous = active.currentIndex;
    onDragChange(previous, false);
    if (!deferSwap) onSwap(previous, targetIndex);
    active.currentIndex = targetIndex;
    onDragChange(targetIndex, true);
  };
  const pointerEnd = (event, cancelled = false) => {
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const press = active;
    clearTimer();
    if (!cancelled && !press.cancelled && press.dragging && deferSwap && press.currentIndex !== press.startIndex) {
      onSwap(press.startIndex, press.currentIndex);
    }
    if (!cancelled && !press.cancelled && !press.longFired && !press.dragging) {
      if (press.editingAtStart) onSelect(press.startIndex);
      else onActivate(press.startIndex);
    }
    reset();
  };

  scope.listen(bar, "pointerdown", pointerDown, { capture: true });
  scope.listen(eventWindow, "pointermove", pointerMove, { passive: true, capture: true });
  scope.listen(eventWindow, "pointerup", pointerEnd, { capture: true });
  scope.listen(eventWindow, "pointercancel", (event) => pointerEnd(event, true), { capture: true });
  scope.listen(bar, "click", (event) => {
    const element = event.target?.closest?.("[data-ve-quickbar-slot]");
    if (!element || !bar.contains(element)) return;
    event.preventDefault();
    if (event.detail !== 0) return;
    const index = Number(element.dataset.veQuickbarSlot);
    if (element.disabled || !canPress(index)) return;
    if (isEditing()) onSelect(index);
    else onActivate(index);
  });
  scope.listen(bar, "dragstart", (event) => event.preventDefault());
  scope.own(reset);
  return Object.freeze({ reset });
}

function slotIndexAt(elements, x, y) {
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return Number(element.dataset.veQuickbarSlot);
    }
  }
  return -1;
}
