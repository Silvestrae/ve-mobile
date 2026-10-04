/** Dice Tray 3.x owns formula parsing and clicks. VE owns only its mobile
 * gesture and focus policy; no copied dice syntax or document mutations. */
export function bindChatDiceInteraction({ host, input, scope, getDiceTray = () => globalThis.CONFIG?.DICETRAY }) {
  const layer = host.querySelector?.(".ve-chat-dice-layer");
  if (!layer) return;
  let gesture = null;
  const release = () => {
    const prior = gesture;
    gesture = null;
    if (prior && layer.hasPointerCapture?.(prior.id)) layer.releasePointerCapture(prior.id);
  };
  scope.own(release);
  // Capture on the persistent layer: a module replacing a die mid-gesture
  // cannot send pointerup/click into navigation exposed beneath it.
  scope.listen(layer, "pointerdown", event => {
    const button = event.target.closest?.("button");
    if (!button || !layer.contains(button) || button.disabled || event.button !== 0 || !event.isPrimary) return;
    release();
    event.preventDefault();
    event.stopImmediatePropagation(); // suppress Dice Tray's textarea.select()
    gesture = { id: event.pointerId, button, x: event.clientX, y: event.clientY, moved: false };
    layer.setPointerCapture(event.pointerId);
  }, { capture: true });
  scope.listen(layer, "pointermove", event => {
    if (gesture?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10) gesture.moved = true;
  }, { passive: true });
  scope.listen(layer, "pointerup", event => {
    if (gesture?.id !== event.pointerId) return;
    const completed = gesture;
    gesture = null;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Keep capture until the browser's implicit release. Its compatibility
    // click targets the stable layer, where it is consumed below.
    if (!scope.disposed && !completed.moved && completed.button.isConnected
      && layer.contains(completed.button) && !completed.button.disabled) completed.button.click();
  }, { capture: true });
  scope.listen(layer, "pointercancel", release, { capture: true });
  scope.listen(layer, "contextmenu", () => { if (gesture) gesture.moved = true; }, { capture: true });
  scope.listen(layer, "lostpointercapture", () => { gesture = null; });
  scope.listen(layer, "click", event => {
    // Native keyboard/assistive activation and our one explicit click have
    // detail=0. Touch/mouse compatibility clicks must not activate twice.
    if (event.detail > 0 || event.target === layer) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true });

  const tray = getDiceTray();
  if (typeof tray?.applyModifier !== "function") return;
  const descriptor = Object.getOwnPropertyDescriptor(tray, "applyModifier");
  const original = tray.applyModifier;
  const applyModifier = function(html, options = {}) {
    // updateChatDice calls this even for ordinary dice. Its supported noFocus
    // option prevents the IME before focus occurs, preserving native parsing.
    const mobileInput = !scope.disposed && host.contains(input) && this.textarea === input;
    return original.call(this, html, mobileInput && input.ownerDocument.activeElement !== input
      ? { ...options, noFocus: true } : options);
  };
  scope.own(() => {
    if (tray.applyModifier !== applyModifier) return;
    if (descriptor) Object.defineProperty(tray, "applyModifier", descriptor);
    else delete tray.applyModifier;
  });
  tray.applyModifier = applyModifier;
}
