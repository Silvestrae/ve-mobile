import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

const fail = (code = "INVALID_INPUT") => {
  const key = code === "STALE_VALUE" ? "VEMOBILE.PF2E.InventoryEffect.Changed" : "VEMOBILE.PF2E.InvalidInput";
  const fallback = code === "STALE_VALUE" ? "This item changed. Refresh and try again." : "This PF2e action is invalid or has changed. Refresh and try again.";
  throw new CommandError(code, localizeFoundry(key, fallback));
};
const inventoryOf = actor => Array.from(actor?.inventory?.contents ?? actor?.inventory ?? actor?.items ?? []);
const sameItem = (actor, item) => Boolean(item?.id && item.actor === actor && actor.items?.get?.(item.id) === item);
const containerId = item => item?.system?.containerId ?? null;
const quantityOf = item => Number(item?.quantity ?? item?.system?.quantity);
const isPhysical = item => item?.isOfType?.("physical") === true || ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "ammo"].includes(item?.type);
function eligibleContainers(actor, item) {
  const items = inventoryOf(actor);
  return items.filter(container => {
    if (!container || container.id === item.id || container.actor !== actor || actor.items?.get?.(container.id) !== container) return false;
    const backpack = container.isOfType?.("backpack") ?? container.type === "backpack";
    if (!backpack) return false;
    // Match PF2e's isContainerCycle guard by walking the candidate's parent chain.
    const seen = new Set();
    let parentId = containerId(container);
    while (parentId && !seen.has(parentId)) {
      if (parentId === item.id) return false;
      seen.add(parentId);
      parentId = containerId(actor.items?.get?.(parentId));
    }
    return true;
  }).map(container => ({ id: String(container.id), name: String(container.name ?? "Container") }));
}

/** Transport-safe inventory control state for one exact embedded physical Item. */
export function inventoryControlRecord(actor, item) {
  if (!sameItem(actor, item) || !isPhysical(item)) return null;
  const quantity = quantityOf(item);
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 999999) return null;
  const currentContainerId = containerId(item);
  const containers = eligibleContainers(actor, item);
  // Preserve a current container that has become invalid as display data; the
  // command will reject it as a move target until the row is refreshed/repaired.
  const currentContainer = currentContainerId ? actor.items?.get?.(currentContainerId) : null;
  return {
    itemId: String(item.id),
    quantity,
    containerId: currentContainerId ? String(currentContainerId) : null,
    containerName: currentContainer?.name ? String(currentContainer.name) : null,
    containers,
    canEditQuantity: typeof item.update === "function",
    canMove: typeof actor.stowOrUnstow === "function"
  };
}

/** Update quantity or move an exact Item into/out of a PF2e backpack. */
export async function editInventory(actor, payload, context) {
  const item = actor.items?.get?.(payload?.itemId);
  if (!sameItem(actor, item) || !isPhysical(item)) fail();
  const currentQuantity = quantityOf(item);
  const currentContainerId = containerId(item);
  if (payload.originalQuantity !== currentQuantity || (payload.originalContainerId ?? null) !== (currentContainerId ?? null)) fail("STALE_VALUE");
  if (payload.operation === "quantity") {
    if (!Number.isSafeInteger(payload.quantity) || payload.quantity < 0 || payload.quantity > 999999 || typeof item.update !== "function") fail();
    context?.assertCurrent();
    if (payload.quantity === currentQuantity) return item;
    return item.update({ "system.quantity": payload.quantity });
  }
  if (payload.operation !== "container" || (payload.containerId !== null && typeof payload.containerId !== "string")) fail();
  if (payload.containerId === currentContainerId) return item;
  const target = payload.containerId === null ? null : actor.items?.get?.(payload.containerId);
  if (payload.containerId !== null && (!target || !eligibleContainers(actor, item).some(entry => entry.id === target.id))) fail();
  if (typeof actor.stowOrUnstow !== "function") {
    // PF2e's actor method is the native operation for container changes. Do not
    // replace it with a partial document update when the system API is absent.
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.PF2E.Unavailable", "This PF2e action is unavailable."));
  }
  context?.assertCurrent();
  return actor.stowOrUnstow(item, target);
}

function badgeBounds(badge) {
  const min = Number.isSafeInteger(badge?.min) ? badge.min : 1;
  const declaredMax = Number.isSafeInteger(badge?.max) ? badge.max : null;
  const labelsMax = Array.isArray(badge?.labels) ? badge.labels.length : null;
  const max = labelsMax ?? declaredMax;
  return { min, max };
}

/** Transport-safe badge controls for an exact embedded PF2e Effect. */
export function effectControlRecord(actor, item) {
  if (!sameItem(actor, item) || item.type !== "effect") return null;
  const badge = item.system?.badge ?? null;
  const counter = badge?.type === "counter" && Number.isSafeInteger(badge.value);
  const bounds = counter ? badgeBounds(badge) : null;
  const validBounds = Boolean(bounds && badge.value >= bounds.min && (bounds.max === null || badge.value <= bounds.max));
  const fromAura = item.fromAura === true || Boolean(item.flags?.pf2e?.aura);
  return {
    itemId: String(item.id),
    name: String(item.name ?? "Effect"),
    badgeType: typeof badge?.type === "string" ? badge.type : null,
    badgeValue: Number.isFinite(badge?.value) ? badge.value : null,
    badgeMin: bounds?.min ?? null,
    badgeMax: bounds?.max ?? null,
    canIncrease: counter && validBounds && !item.isExpired && (bounds.max === null || badge.value < bounds.max || badge.loop === true),
    canDecrease: counter && validBounds && !item.isExpired && badge.value > bounds.min,
    canRemove: typeof item.delete === "function" && !fromAura,
    expired: item.isExpired === true
  };
}

/** Adjust a counter through PF2e's native methods, or explicitly delete an effect. */
export async function editEffect(actor, payload, context) {
  const item = actor.items?.get?.(payload?.itemId);
  if (!sameItem(actor, item) || item.type !== "effect") fail();
  const badge = item.system?.badge ?? null;
  if ((badge?.type ?? null) !== (payload.originalBadgeType ?? null) || (Number.isFinite(badge?.value) ? badge.value : null) !== (payload.originalBadgeValue ?? null)) fail("STALE_VALUE");
  context?.assertCurrent();
  if (payload.operation === "remove") {
    if (payload.confirmed !== true || typeof item.delete !== "function" || item.fromAura === true || item.flags?.pf2e?.aura) fail();
    return item.delete();
  }
  if (payload.operation !== "increase" && payload.operation !== "decrease") fail();
  if (badge?.type !== "counter" || item.isExpired || !Number.isSafeInteger(badge.value)) fail();
  const { min, max } = badgeBounds(badge);
  if (payload.operation === "increase") {
    if (max !== null && badge.value >= max && badge.loop !== true || typeof item.increase !== "function") fail();
    return item.increase();
  }
  // PF2e decrease() deletes a counter when decrementing below its minimum.
  // Keep that destructive transition behind the separate confirmed remove UI.
  if (badge.value <= min || typeof item.decrease !== "function") fail();
  return item.decrease();
}
