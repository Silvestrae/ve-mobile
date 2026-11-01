import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

// Raise the localized capability error when the persistent-damage workflow is unavailable.
const unavailable = () => { throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.PF2E.PersistentDamage.Unavailable", "This PF2e persistent damage action is unavailable.")); };
// Raise the localized input error for an unsupported persistent-damage request.
const invalid = () => { throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.PF2E.PersistentDamage.InvalidInput", "This persistent damage action is invalid or has changed. Refresh and try again.")); };
// Raise the stale-value error when the condition changed after the editor opened.
const stale = () => { throw new CommandError("STALE_VALUE", localizeFoundry("VEMOBILE.PF2E.PersistentDamage.Changed", "Persistent damage changed. Reopen the editor and try again.")); };

// Select the Actor's current persistent-damage condition Items.
const persistentConditions = actor => Array.from(actor?.itemTypes?.condition ?? actor?.items ?? [])
  .filter(item => item?.type === "condition" && item.slug === "persistent-damage");

// Read configured PF2e damage types for the persistent-damage editor.
function damageTypes() {
  return Object.entries(globalThis.CONFIG?.PF2E?.damageTypes ?? {})
    .map(([value, label]) => ({ value, label: localizeFoundry(label, value) }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

// Serialize one persistent-damage condition's current formula, type, and recovery details.
function conditionRecord(item) {
  const persistent = item.system?.persistent ?? {};
  return {
    id: String(item.id ?? ""),
    active: item.active !== false,
    formula: typeof persistent.formula === "string" ? persistent.formula : "",
    damageType: typeof persistent.damageType === "string" ? persistent.damageType : "",
    dc: Number.isSafeInteger(persistent.dc) ? persistent.dc : null
  };
}

/** Return a transport-safe persistent damage editor snapshot for a PF2e Actor. */
export function persistentDamageRecord(actor) {
  // Read only persistent-damage conditions that can be represented by the
  // supported editor; the returned rows carry IDs for command-time re-resolution.
  return {
    types: damageTypes(),
    conditions: persistentConditions(actor).map(conditionRecord)
  };
}

// Resolve a condition by stable Item ID within the current Actor.
function itemById(actor, itemId) {
  if (typeof itemId !== "string" || !itemId || itemId.length > 128) invalid();
  const item = actor.items?.get?.(itemId) ?? null;
  if (!item || item.actor !== actor || item.type !== "condition" || item.slug !== "persistent-damage") invalid();
  return item;
}

// Compare the captured condition values with the live Item before applying edits.
function assertOriginal(item, original) {
  if (!original || typeof original !== "object" || Array.isArray(original)
    || Object.keys(original).length !== 4
    || original.formula !== item.system?.persistent?.formula
    || original.damageType !== item.system?.persistent?.damageType
    || original.dc !== item.system?.persistent?.dc
    || original.active !== (item.active !== false)) stale();
}

// Reject unexpected payload keys so the edit remains limited to supported fields.
function assertPayloadKeys(payload, allowed) {
  if (Object.keys(payload).some(key => ![...allowed, "actorSourceUuid", "actorId"].includes(key))) invalid();
}

// Validate and normalize the persistent formula, damage type, and recovery DC.
function validateValues(formula, damageType, dc) {
  const types = globalThis.CONFIG?.PF2E?.damageTypes;
  if (typeof formula !== "string" || !formula.trim() || formula.length > 500
    || typeof damageType !== "string" || !Object.hasOwn(types ?? {}, damageType)
    || !Number.isSafeInteger(dc) || dc < 1 || dc > 999) invalid();
  const rollClass = globalThis.CONFIG?.Dice?.rolls?.find?.(roll => roll?.name === "DamageRoll");
  if (typeof rollClass?.validate !== "function") unavailable();
  const typedFormula = `(${formula.trim()})[${damageType}]`;
  try {
    if (!rollClass.validate(typedFormula)) invalid();
    const roll = new rollClass(typedFormula, {}, { evaluatePersistent: true });
    if (!Number.isFinite(roll.maximumValue) || roll.maximumValue < 0) invalid();
  } catch (error) {
    if (error instanceof CommandError) throw error;
    invalid();
  }
  return { formula: formula.trim(), damageType, dc };
}

// Create a PF2e persistent-damage condition through the Actor's embedded-document API.
function createCondition(actor, values) {
  const template = globalThis.game?.pf2e?.ConditionManager?.getCondition?.("persistent-damage");
  const merge = globalThis.foundry?.utils?.mergeObject;
  if (!template || typeof template.toObject !== "function" || typeof merge !== "function"
    || typeof actor.createEmbeddedDocuments !== "function") unavailable();
  const source = template.toObject();
  const data = merge(source, { system: { persistent: values } });
  return actor.createEmbeddedDocuments("Item", [data]);
}

/** Execute one named edit against the exact PF2e persistent damage Item. */
export function editPersistentDamage(actor, payload, context) {
  // The edit endpoint permits a small, explicit set of condition fields and
  // rejects stale originals before updating or creating an embedded condition.
  if (!actor || actor.type !== "character" || !payload || typeof payload !== "object" || Array.isArray(payload)) invalid();
  const operation = payload.operation;
  if (operation === "add") {
    assertPayloadKeys(payload, ["operation", "formula", "damageType", "dc"]);
    const values = validateValues(payload.formula, payload.damageType, payload.dc);
    context?.assertCurrent();
    return createCondition(actor, values);
  }

  if (!["update", "remove", "recover", "roll-damage"].includes(operation)) invalid();
  assertPayloadKeys(payload, operation === "update"
    ? ["operation", "itemId", "original", "formula", "damageType", "dc"]
    : ["operation", "itemId", "original"]);
  const item = itemById(actor, payload.itemId);
  assertOriginal(item, payload.original);
  context?.assertCurrent();

  if (operation === "update") {
    const values = validateValues(payload.formula, payload.damageType, payload.dc);
    if (typeof item.update !== "function") unavailable();
    return item.update({ "system.persistent.formula": values.formula,
      "system.persistent.damageType": values.damageType, "system.persistent.dc": values.dc });
  }
  if (operation === "remove") {
    if (typeof item.delete !== "function") unavailable();
    return item.delete();
  }
  if (item.active === false) unavailable();
  if (operation === "recover") {
    if (typeof item.rollRecovery !== "function") unavailable();
    // PF2e rolls the condition's DC as a native flat check and applies recovery
    // through Actor.decreaseCondition, preserving same-type cleanup semantics.
    return item.rollRecovery();
  }
  if (typeof item.onEndTurn !== "function") unavailable();
  // This action rolls the persistent damage itself; it is distinct from the
  // recovery flat check exposed by rollRecovery().
  return item.onEndTurn();
}
