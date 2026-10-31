import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";

export function itemArt(item, descriptor = { kind: "item", itemId: item.id, label: item.name, img: item.img ?? "" }, className = "") {
  const art = item.img ? node("img", { attrs: { src: item.img, alt: "", draggable: false } }) : icon(descriptor.kind === "skill" ? "fa-dice-d20" : "fa-scroll");
  art.dataset.pf2eShortcut = JSON.stringify(descriptor);
  if (className) art.classList.add(className);
  return art;
}

/** A row owns its reading surface; native descriptions load only when opened. */
export function itemRow({ item, actor, commands, scope, className, header, actions = [], extraDetails = null, dataset = {}, depth = 0, primaryAction = null, disclosureKey = `item:${item.id}` }) {
  const rowHeader = [...header];
  const shortcutArtIndex = primaryAction ? rowHeader.findIndex(child => child?.dataset?.pf2eShortcut) : -1;
  if (shortcutArtIndex >= 0) {
    const art = rowHeader[shortcutArtIndex];
    const enabled = primaryAction.enabled !== false && typeof primaryAction.activate === "function";
    const action = node("button", { className: "ve-pf2e-row-primary", attrs: {
      type: "button",
      disabled: !enabled,
      "aria-label": primaryAction.label || item.name,
      title: primaryAction.label || item.name
    }, on: { click: event => {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled || typeof primaryAction.activate !== "function") return;
      primaryAction.activate(event.currentTarget);
    } }, children: [art] }, scope);
    rowHeader[shortcutArtIndex] = action;
  }
  const description = node("div", { className: "ve-pf2e-row-description" });
  const footer = node("div", { className: "ve-pf2e-row-controls", children: actions });
  const row = node("details", { className: `ve-pf2e-expandable-item ${className}`, attrs: {
    "data-pf2e-disclosure-key": disclosureKey, style: `--ve-feat-depth:${depth}`
  }, dataset: { pf2eSearchText: [item.name, ...(item.traits ?? [])].join(" ").toLocaleLowerCase(), ...dataset, itemId: item.id, pf2eSortName: item.name, ...(item.parentId ? { pf2eSortParent: item.parentId } : {}) }, children: [
    node("summary", { className: "ve-pf2e-item-heading", children: [...rowHeader, icon("fa-chevron-down")] }),
    node("div", { className: "ve-pf2e-row-expanded", children: [description, extraDetails, footer] })
  ] });
  let loaded = false;
  let pending = false;
  // Match the existing details gateway's OWNER boundary. Read-only rows must
  // not offer a disclosure that can only fail with a permission error.
  if (!actor.capabilities?.owner) {
    row.querySelector("summary").setAttribute("aria-disabled", "true");
    row.querySelector("summary").lastElementChild?.setAttribute("hidden", "");
    scope.listen(row.querySelector("summary"), "click", event => event.preventDefault());
  }
  scope.listen(row, "toggle", async () => {
    if (!actor.capabilities?.owner || !row.open || loaded || pending || scope.disposed) return;
    pending = true;
    description.setAttribute("aria-busy", "true");
    try {
      const result = await commands.readCharacterItemDetails({ actorSourceUuid: actor.sourceUuid, itemId: item.id });
      if (scope.disposed || commands.pf2eActionCurrent?.(actor.sourceUuid) === false || result.actorSourceUuid !== actor.sourceUuid || result.itemId !== item.id) return;
      description.innerHTML = result.html;
      if (!result.html?.trim()) description.textContent = localizedText(commands.localize, "VEMOBILE.PF2E.Character.Empty", "Nothing to show here.");
      loaded = true;
    } catch (error) {
      if (!scope.disposed) description.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.PF2E.Character.ActionFailed", "That action could not be completed.");
    } finally {
      if (!scope.disposed) description.removeAttribute("aria-busy");
      pending = false;
    }
  });
  return row;
}
