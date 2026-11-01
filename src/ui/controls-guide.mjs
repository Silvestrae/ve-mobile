import { icon, node } from "./dom.mjs";
import { controlsGuideSections } from "../kernel/controls-guide-model.mjs";

/** Shared Desktop/mobile guide. It is appended above, never remounts its route. */
export function createControlsGuide({ scope, readContext, localize, onVisibility = () => {} }) {
  // Resolve guide copy through the injected localizer, keeping Foundry access outside the renderer.
  const text = key => localize(`VEMOBILE.Controls.${key}`);
  let opener = null;
  const body = node("div", { className: "ve-controls-guide-body", attrs: { tabindex: "0" } });
  const closeLabel = node("span", { text: text("Close") });
  const close = node("button", { className: "ve-button-accent-outline", attrs: { type: "button" }, children: [icon("fa-xmark"), closeLabel] });
  const title = node("h2", { text: text("Title"), attrs: { id: "ve-controls-guide-title" } });
  const card = node("section", { className: "ve-controls-guide-card", children: [
    node("header", { children: [icon("fa-hand-pointer"), title] }), body,
    node("footer", { children: [close] })
  ] });
  const element = node("div", { className: "ve-controls-guide", attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-controls-guide-title", "data-ve-back-kind": "controls-guide", "data-ve-back-dismissable": "true" }, children: [card] });
  // Close the guide and restore focus only when the original opener still belongs to a visible surface.
  function hide() {
    if (element.hidden) return;
    element.hidden = true;
    onVisibility(false);
    if (opener?.isConnected && !opener.closest?.("[hidden]")) opener.focus?.({ preventScroll: true });
    else element.closest(".ve-mobile-app")?.querySelector(".ve-bottom-nav button")?.focus?.({ preventScroll: true });
    opener = null;
  }
  scope.listen(close, "click", hide);
  scope.listen(element, "ve-close", hide);
  scope.listen(element, "keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); hide(); }
    if (event.key !== "Tab") return;
    const targets = [body, close];
    const index = targets.indexOf(element.ownerDocument.activeElement);
    event.preventDefault();
    targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
  });
  scope.own(() => { hide(); element.remove(); });
  // Rebuild the capability-appropriate sections selected by kernel/controls-guide-model.mjs.
  const renderCopy = () => body.replaceChildren(...controlsGuideSections(readContext()).map(section => node("section", { children: [
    node("h3", { text: text(`Sections.${section.id}`) }),
    ...section.entries.map(key => node("p", { text: text(`Entries.${key}`) }))
  ] })));
  // Refresh the retained guide's labels after localization becomes available.
  const refreshLabels = () => {
    title.textContent = text("Title");
    closeLabel.textContent = text("Close");
    renderCopy();
  };
  return Object.freeze({ element, hide,
    // Rebuild guide sections from the latest capabilities while retaining the shared surface.
    refresh() {
      if (scope.disposed || element.hidden) return;
      const scrollTop = body.scrollTop;
      refreshLabels();
      body.scrollTop = scrollTop;
    },
    // Render current copy, reveal the guide and remember the opener for later focus restoration.
    show(anchor = element.ownerDocument.activeElement) {
      if (scope.disposed) return;
      opener = anchor;
      refreshLabels();
      body.scrollTop = 0;
      element.hidden = false;
      onVisibility(true);
      close.focus({ preventScroll: true });
    }
  });
}
