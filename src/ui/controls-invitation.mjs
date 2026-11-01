import { node } from "./dom.mjs";
import { controlsInvitationReady } from "../kernel/controls-guide-model.mjs";
import { localizedText } from "./localized-text.mjs";

/** Event-driven first-use invitation; no polling, route changes or focus stealing. */
export function createControlsInvitation({ root, scope, commands, getState, isReady, isNativeOpen, openGuide }) {
  // Resolve invitation copy through the kernel's supplied localization command.
  const text = (key, fallback) => localizedText(commands.localize, `VEMOBILE.Controls.${key}`, fallback);
  const view = node("button", { attrs: { type: "button" }, text: text("View", "View") });
  const later = node("button", { attrs: { type: "button" }, text: text("Later", "Later") });
  const invitation = text("Invitation", "Your mobile controls are ready to explore. Would you like a quick guide?");
  const copy = node("p", { text: invitation });
  const element = node("aside", { className: "ve-controls-invitation", attrs: { hidden: true, "aria-label": invitation, "data-ve-back-dismissable": "true", "data-ve-back-kind": "controls-invitation" }, children: [
    copy, node("div", { children: [view, later] })
  ] });
  const waiting = scope.child("controls-invitation-wait");
  let interacting = false;
  let pending = false;
  let observer = null;
  // Dismiss the invitation surface without opening another interaction.
  const hide = () => { element.hidden = true; };
  // Detect native dialogs, active typing and VE overlays that should take priority over the invitation.
  const blocked = () => Boolean(isNativeOpen?.()
    || root.ownerDocument.activeElement?.matches?.("input, textarea, select, [contenteditable='true']")
    || root.ownerDocument.querySelector(".ve-controls-guide:not([hidden]), .ve-mobile-bootstrap, .ve-portrait-token-ghost, .ve-portrait-action-menu:not([hidden]), .ve-character-item-menu, .ve-mobile-dialog:not([hidden]), .ve-settings-report-modal:not([hidden]), .ve-settings-reload:not([hidden]), .ve-asset-optimizer:not([hidden]), .ve-graphics-recovery:not([hidden]), .ve-action-bar-picker:not([hidden])"));
  // Show the invitation only when safe, then retire the observers used to wait for that first opportunity.
  function reconcile() {
    if (scope.disposed) return;
    const safe = controlsInvitationReady({ ready: isReady(), state: getState(), blocked: blocked(), interacting });
    if (!element.hidden && !safe) hide();
    if (commands.controlsInvitationSeen?.()) { observer?.disconnect(); observer = null; waiting.dispose(); return; }
    if (!root.isConnected || !safe) return;
    element.hidden = false;
    commands.markControlsInvitationPresented?.();
    observer?.disconnect(); observer = null; waiting.dispose();
  }
  // Coalesce related DOM/state notifications into one scoped reconciliation task.
  const schedule = () => {
    if (pending || scope.disposed) return;
    if (element.hidden && commands.controlsInvitationSeen?.()) return;
    pending = true;
    scope.timeout(() => { pending = false; reconcile(); }, 0);
  };
  // Refresh retained button and accessibility copy together.
  const refreshLabels = () => {
    view.textContent = text("View", "View");
    later.textContent = text("Later", "Later");
    const label = text("Invitation", "Your mobile controls are ready to explore. Would you like a quick guide?");
    copy.textContent = label;
    element.setAttribute("aria-label", label);
  };
  scope.listen(view, "click", () => { hide(); openGuide(view); });
  scope.listen(later, "click", hide);
  scope.listen(element, "ve-close", hide);
  waiting.listen(root.ownerDocument, "pointerdown", () => { interacting = true; }, { capture: true, passive: true });
  waiting.listen(root.ownerDocument, "pointerup", () => { interacting = false; schedule(); }, { capture: true, passive: true });
  waiting.listen(root.ownerDocument, "pointercancel", () => { interacting = false; schedule(); }, { capture: true, passive: true });
  waiting.listen(root.ownerDocument, "focusout", schedule, { capture: true });
  const Observer = root.ownerDocument.defaultView?.MutationObserver;
  if (Observer && !commands.controlsInvitationSeen?.()) {
    observer = new Observer(schedule);
    waiting.own(() => observer?.disconnect());
    observer.observe(root.ownerDocument.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }
  scope.own(() => element.remove());
  return Object.freeze({ element, reconcile: schedule, refreshLabels });
}
