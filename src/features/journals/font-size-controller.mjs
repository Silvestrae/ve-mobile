import { clampJournalFontSize, DEFAULT_JOURNAL_FONT_SIZE } from "../../kernel/journal-font-size.mjs";

/** Reflow text with two fingers; leave single-finger scrolling to the browser. */
export function bindJournalFontSize(content, commands, scope) {
  let size = clampJournalFontSize(commands.readJournalFontSize?.() ?? DEFAULT_JOURNAL_FONT_SIZE);
  let gesture = null;
  let dirty = false;
  let suppressClickUntil = 0;
  const owned = new Set();
  // Keep a CSS variable in sync with the clamped preference and write only changes.
  const apply = () => content.style.setProperty("--ve-journal-font-size", `${size}px`);
  // Write the preference once after an actual pinch change.
  const persist = () => { if (dirty) { dirty = false; commands.setJournalFontSize?.(size); } };
  // Track only touches that began inside this content element.
  const points = event => Array.from(event.touches ?? []).filter(touch => owned.has(touch.identifier));
  // Measure the two tracked contacts to scale text proportionally.
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  // Begin resizing only once two owned touches are far enough apart to measure.
  const handleTouchStart = event => {
    if (scope.disposed) return;
    for (const touch of Array.from(event.changedTouches ?? [])) owned.add(touch.identifier);
    const touches = points(event);
    if (touches.length !== 2) { gesture = null; return; }
    const spacing = distance(touches);
    if (spacing < 8) return;
    if (event.cancelable) event.preventDefault();
    gesture = { distance: spacing, size };
    suppressClickUntil = Date.now() + 400;
  };
  // Prevent browser zoom during an active pinch and update the local font size.
  const handleTouchMove = event => {
    if (scope.disposed || !gesture) return;
    const touches = points(event);
    if (touches.length !== 2) return;
    if (event.cancelable) event.preventDefault();
    suppressClickUntil = Date.now() + 400;
    const next = clampJournalFontSize(gesture.size * distance(touches) / gesture.distance);
    if (next === size) return;
    size = next; dirty = true; apply();
  };
  // Persist once when the gesture ends or is cancelled, then forget its touches.
  const handleTouchEnd = event => {
    if (scope.disposed) return;
    for (const touch of Array.from(event.changedTouches ?? [])) owned.delete(touch.identifier);
    if (owned.size < 2 || event.type === "touchcancel") { gesture = null; persist(); }
  };
  apply();
  scope.listen(content, "touchstart", handleTouchStart, { passive: false });
  scope.listen(content, "touchmove", handleTouchMove, { passive: false });
  scope.listen(content, "touchend", handleTouchEnd, { passive: false });
  scope.listen(content, "touchcancel", handleTouchEnd, { passive: false });
  scope.listen(content, "click", event => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, { capture: true });
  scope.own(() => { gesture = null; owned.clear(); persist(); });
}
