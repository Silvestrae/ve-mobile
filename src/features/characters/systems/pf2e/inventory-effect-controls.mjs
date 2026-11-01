import { ACTOR_COMMANDS } from "../../../../kernel/command-names.mjs";
import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";

// Resolve localized text from the PF2e inventory-controls namespace.
const text = (commands, key, fallback) => localizedText(commands.localize, `VEMOBILE.PF2E.Controls.${key}`, fallback);
// Create a scoped inventory action button with its current disabled/pressed state.
const action = (label, glyph, onClick, scope, disabled = false, pressed = undefined) => node("button", {
  className: "ve-pf2e-action-button ve-pf2e-item-control",
  attrs: { type: "button", "aria-label": label, title: label, disabled, ...(pressed === undefined ? {} : { "aria-pressed": String(pressed) }) },
  children: [icon(glyph)], on: { click: event => { event.preventDefault(); event.stopPropagation(); if (!disabled) onClick(event.currentTarget); } }
}, scope);

// Read the current quantity command record, with a simple legacy item fallback.
function quantityRecord(item) {
  return item.inventoryControls ?? {
    itemId: item.id, quantity: item.quantity, containerId: item.containerId ?? null, containers: [], canEditQuantity: true, canMove: false
  };
}
// Return the prepared effect-action record when this item has one.
function effectRecord(item) {
  return item.effectControls ?? null;
}
// Send one explicit inventory operation with the source values needed for revalidation.
function runInventory(run, actor, item, record, operation, value) {
  return run(ACTOR_COMMANDS.EDIT_PF2E_INVENTORY, {
    itemId: item.id, operation, [operation === "quantity" ? "quantity" : "containerId"]: value,
    originalQuantity: record.quantity, originalContainerId: record.containerId ?? null
  });
}

/** Compact quantity and container controls for a PF2e physical-item row. */
export function inventoryControls(item, actor, commands, scope, run) {
  const record = quantityRecord(item);
  if (!record || !run) return null;
  const controls = [];
  if (record.canEditQuantity !== false && Number.isSafeInteger(record.quantity ?? item.quantity)) {
    const quantity = Number.isSafeInteger(record.quantity) ? record.quantity : item.quantity;
    const input = node("input", { className: "ve-pf2e-item-quantity", attrs: {
      type: "number", min: "0", max: "999999", step: "1", value: String(quantity), inputmode: "numeric",
      "aria-label": text(commands, "Quantity", "Quantity")
    } });
    controls.push(input, action(text(commands, "ApplyQuantity", "Apply quantity"), "fa-check", () => {
      const value = Number(input.value);
      if (!Number.isSafeInteger(value) || value < 0 || value > 999999 || value === quantity) { input.value = String(quantity); return; }
      runInventory(run, actor, item, record, "quantity", value);
    }, scope, false));
  }
  if (record.canMove && Array.isArray(record.containers)) {
    const select = node("select", { className: "ve-pf2e-item-container", attrs: { "aria-label": text(commands, "Container", "Container") }, children: [
      node("option", { text: text(commands, "NoContainer", "No container"), attrs: { value: "" } }),
      ...record.containers.map(container => node("option", { text: container.name, attrs: { value: container.id } }))
    ] });
    select.value = record.containerId ?? "";
    controls.push(select, action(text(commands, "ApplyContainer", "Move item"), "fa-box", () => {
      const value = select.value || null;
      if (value === (record.containerId ?? null)) return;
      runInventory(run, actor, item, record, "container", value);
    }, scope, false));
  }
  return controls.length ? node("div", { className: "ve-pf2e-inventory-controls", children: controls }) : null;
}

/** Badge counter adjustment and two-step removal controls for a PF2e Effect row. */
export function effectControls(item, actor, commands, scope, run) {
  const record = effectRecord(item);
  if (!record || !run) return null;
  // Carry the badge's displayed original type/value so the command can reject an outdated edit.
  const payload = operation => ({ itemId: item.id, operation, originalBadgeType: record.badgeType, originalBadgeValue: record.badgeValue });
  const controls = [];
  if (record.badgeType === "counter" && Number.isSafeInteger(record.badgeValue)) {
    const value = node("span", { className: "ve-pf2e-effect-badge", attrs: { "aria-live": "polite" }, text: String(record.badgeValue) });
    controls.push(value,
      action(text(commands, "DecreaseEffect", "Decrease effect value"), "fa-minus", () => run(ACTOR_COMMANDS.EDIT_PF2E_EFFECT, payload("decrease")), scope, !record.canDecrease),
      action(text(commands, "IncreaseEffect", "Increase effect value"), "fa-plus", () => run(ACTOR_COMMANDS.EDIT_PF2E_EFFECT, payload("increase")), scope, !record.canIncrease));
  } else if (record.badgeType && record.badgeValue !== null) {
    controls.push(node("span", { className: "ve-pf2e-effect-badge", text: String(record.badgeValue) }));
  }
  if (record.canRemove) {
    let confirming = false;
    const confirmLabel = text(commands, "ConfirmRemoveEffect", "Tap again to remove this effect");
    const remove = action(text(commands, "RemoveEffect", "Remove effect"), "fa-trash", () => {
      if (!confirming) {
        confirming = true;
        remove.classList.add("is-confirming");
        confirmText.hidden = false;
        remove.setAttribute("aria-pressed", "true");
        remove.title = confirmLabel;
        remove.setAttribute("aria-label", remove.title);
        return;
      }
      run(ACTOR_COMMANDS.EDIT_PF2E_EFFECT, { ...payload("remove"), confirmed: true });
    }, scope);
    const confirmText = node("span", { className: "ve-pf2e-effect-remove-confirmation", text: confirmLabel });
    confirmText.hidden = true;
    remove.append(confirmText);
    remove.style.maxWidth = "10rem";
    remove.style.whiteSpace = "normal";
    controls.push(remove);
  }
  return controls.length ? node("div", { className: "ve-pf2e-effect-controls", children: controls }) : null;
}
