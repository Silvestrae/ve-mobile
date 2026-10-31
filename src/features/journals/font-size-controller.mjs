import { clampJournalFontSize, DEFAULT_JOURNAL_FONT_SIZE } from "../../kernel/journal-font-size.mjs";

/** Reflow text with two fingers; leave single-finger scrolling to the browser. */
export function bindJournalFontSize(content, commands, scope) {
  let size = clampJournalFontSize(commands.readJournalFontSize?.() ?? DEFAULT_JOURNAL_FONT_SIZE);
  let gesture = null;
  let dirty = false;
  let suppressClickUntil = 0;
  const owned = new Set();
  const apply = () => content.style.setProperty("--ve-journal-font-size", `${size}px`);
  const persist = () => { if (dirty) { dirty = false; commands.setJournalFontSize?.(size); } };
  const points = event => Array.from(event.touches ?? []).filter(touch => owned.has(touch.identifier));
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const start = event => {
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
  const move = event => {
    if (scope.disposed || !gesture) return;
    const touches = points(event);
    if (touches.length !== 2) return;
    if (event.cancelable) event.preventDefault();
    suppressClickUntil = Date.now() + 400;
    const next = clampJournalFontSize(gesture.size * distance(touches) / gesture.distance);
    if (next === size) return;
    size = next; dirty = true; apply();
  };
  const end = event => {
    if (scope.disposed) return;
    for (const touch of Array.from(event.changedTouches ?? [])) owned.delete(touch.identifier);
    if (owned.size < 2 || event.type === "touchcancel") { gesture = null; persist(); }
  };
  apply();
  scope.listen(content, "touchstart", start, { passive: false });
  scope.listen(content, "touchmove", move, { passive: false });
  scope.listen(content, "touchend", end, { passive: false });
  scope.listen(content, "touchcancel", end, { passive: false });
  scope.listen(content, "click", event => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, { capture: true });
  scope.own(() => { gesture = null; owned.clear(); persist(); });
}
