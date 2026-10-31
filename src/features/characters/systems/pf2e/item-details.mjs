import { node, icon } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";

const allowed = (actor, itemId) => actor?.capabilities?.useItem === true
  || (Array.isArray(actor?.capabilities?.useItem) && actor.capabilities.useItem.includes(itemId));

export function syncItemDetails(shell, deferred) {
  const modal = shell.itemDetails;
  if (modal && (deferred || shell.actor?.sourceUuid !== modal.sourceUuid || !allowed(shell.actor, modal.itemId))) modal.close(false);
}

/** Item reading is a mobile surface; editing remains an explicit native action. */
export async function openItemDetails(shell, { actorSourceUuid, itemId, fullPage = false }, ownerScope, overlayHost) {
  if (ownerScope.disposed || shell.actor?.sourceUuid !== actorSourceUuid || !allowed(shell.actor, itemId)) return;
  shell.itemDetails?.close(false);
  const scope = ownerScope.child("pf2e-item-details");
  const commands = shell.commands;
  const t = (key, fallback) => localizedText(commands.localize, key, fallback);
  const focus = shell.screen.ownerDocument?.activeElement;
  const modal = shell.itemDetails = { sourceUuid: actorSourceUuid, itemId };
  let layer;
  modal.close = (restoreFocus = true) => {
    scope.dispose();
    if (restoreFocus && !ownerScope.disposed && focus?.isConnected) focus.focus?.({ preventScroll: true });
  };
  scope.own(() => { layer?.remove(); if (shell.itemDetails === modal) shell.itemDetails = null; });
  const title = node("h2", { text: t("VEMOBILE.PF2E.Character.Details", "Details") });
  const close = node("button", { attrs: { type: "button", "aria-label": t("VEMOBILE.Controls.Close", "Close") }, children: [icon("fa-xmark")], on: { click: () => modal.close() } }, scope);
  const description = node("div", { className: "ve-pf2e-item-description", attrs: { "aria-busy": "true" } });
  const traits = node("div", { className: "ve-pf2e-item-traits" });
  const image = node("img", { attrs: { alt: "", hidden: true } });
  const status = node("p", { className: "ve-pf2e-item-error", attrs: { role: "alert" } });
  const dialog = node("section", { className: "ve-pf2e-item-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-label": title.textContent }, children: [
    node("header", { children: [image, title, close] }),
    node("div", { className: "ve-pf2e-item-body", children: [traits, description, status] })
  ] });
  layer = node("div", { className: `ve-pf2e-conditions-layer ve-pf2e-item-layer${fullPage ? " is-full-page" : ""}`, children: [dialog], on: { click: event => { if (event.target === layer) modal.close(); } } }, scope);
  (shell.screen.closest?.(".ve-mobile-app") ?? overlayHost ?? shell.screen).append(layer);
  scope.listen(layer, "keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); modal.close(); }
    if (event.key !== "Tab") return;
    const controls = [...layer.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1), current = layer.ownerDocument?.activeElement;
    if (event.shiftKey && current === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && current === last) { event.preventDefault(); first?.focus(); }
  });
  close.focus?.({ preventScroll: true });
  try {
    const result = await commands.readCharacterItemDetails({ actorSourceUuid, itemId });
    if (scope.disposed || shell.actor?.sourceUuid !== actorSourceUuid || result?.actorSourceUuid !== actorSourceUuid || result?.itemId !== itemId || !allowed(shell.actor, itemId)) return;
    title.textContent = result.name;
    dialog.setAttribute("aria-label", result.name);
    if (result.img) { image.setAttribute("src", result.img); image.hidden = false; }
    traits.replaceChildren(...result.traits.map(trait => node("span", { text: trait.label })));
    description.innerHTML = result.html;
  } catch (error) {
    if (!scope.disposed) status.textContent = error.message;
  } finally {
    if (!scope.disposed) description.removeAttribute("aria-busy");
  }
}
