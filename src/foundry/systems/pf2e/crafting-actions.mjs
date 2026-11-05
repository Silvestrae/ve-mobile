import { craftingError, assertCraftingOwner, nativeCrafting, formulaIsReadable,
  craftingAbilityStamp, resolveCraftingAbility, canUseLegacyQuickAlchemy } from "./crafting-records.mjs";
import { createFreeCraftingItem, createLegacyQuickAlchemyItem, announceCraftedItem } from "./crafting-item-actions.mjs";
import { runNativeCraftingCheck } from "./crafting-check.mjs";
import { actorSourceUuid, resolveActorSource } from "../../character-source.mjs";

/** Execute one explicit crafting operation under the shared per-actor command lock.
 * PF2e owns preparation rule-element persistence, item generation and resource costs.
 * VE never replays native consuming calls after an uncertain failure. */
export async function editCrafting(actor, payload, context) {
  assertCraftingOwner(actor, context);
  if (!payload || typeof payload.operation !== "string") craftingError();
  const crafting = nativeCrafting(actor);
  const operation = payload.operation;
  // Both native modes change formula Craft semantics. Keep the selected mode
  // stable across source resolution; an old UI must never spend a new resource.
  const assertCurrent = () => {
    assertCraftingOwner(actor, context);
    if (operation === "craft" && (typeof payload.originalFreeCrafting !== "boolean"
      || typeof payload.originalQuickAlchemy !== "boolean"
      || (actor.flags?.pf2e?.freeCrafting === true) !== payload.originalFreeCrafting
      || (actor.flags?.pf2e?.quickAlchemy === true) !== payload.originalQuickAlchemy)) craftingError("STALE_VALUE");
  };
  assertCurrent();

  if (["learn", "forget", "reorder"].includes(operation)) return editFormulaBook(actor, payload, assertCurrent);
  if (operation === "mode") {
    if (!["freeCrafting", "quickAlchemy"].includes(payload.mode) || typeof payload.value !== "boolean"
      || typeof payload.originalValue !== "boolean" || typeof payload.originalOtherValue !== "boolean") craftingError();
    const otherMode = payload.mode === "freeCrafting" ? "quickAlchemy" : "freeCrafting";
    if ((actor.flags?.pf2e?.[payload.mode] === true) !== payload.originalValue) craftingError("STALE_VALUE");
    if ((actor.flags?.pf2e?.[otherMode] === true) !== payload.originalOtherValue) craftingError("STALE_VALUE");
    if (payload.mode === "quickAlchemy" && payload.value && !canUseLegacyQuickAlchemy(actor)) craftingError("CAPABILITY_UNAVAILABLE");
    assertCurrent();
    // Native Character preUpdate makes these flags mutually exclusive.
    return actor.update({ [`flags.pf2e.${payload.mode}`]: payload.value });
  }
  if (["daily", "reset"].includes(operation)) {
    if (typeof payload.originalComplete !== "boolean"
      || (actor.flags?.pf2e?.dailyCraftingComplete === true) !== payload.originalComplete) craftingError("STALE_VALUE");
    const abilities = Array.from(crafting.abilities);
    if (!abilities.some(ability => ability.isDailyPrep)) craftingError();
    if (!Array.isArray(payload.abilityStamps) || payload.abilityStamps.length !== abilities.length
      || abilities.some(ability => !payload.abilityStamps.some(row => row.slug === ability.slug && row.stamp === craftingAbilityStamp(ability)))) craftingError("STALE_VALUE");
    if (operation === "reset") {
      if (!payload.originalComplete || payload.confirmed !== true) craftingError();
      assertCurrent();
      return crafting.resetDailyCrafting();
    }
    if (payload.originalComplete || payload.confirmed !== true) craftingError();
    // Preflight only native calculations. Shared resources need their combined cost,
    // as two individually affordable entries can still exceed the actor's budget.
    const results = [];
    for (const ability of abilities.filter(entry => entry.isDailyPrep)) {
      for (const formula of await ability.getPreparedCraftingFormulas()) {
        await resolveFormulaSource(formula, assertCurrent);
      }
      results.push(await ability.calculateDailyCrafting());
      assertCurrent();
      if (crafting.abilities.get(ability.slug) !== ability
        || !payload.abilityStamps.some(row => row.slug === ability.slug && row.stamp === craftingAbilityStamp(ability))) craftingError("STALE_VALUE");
    }
    const costs = new Map();
    for (const result of results) {
      if (result.insufficient) craftingError();
      if (result.resource) costs.set(result.resource.slug, (costs.get(result.resource.slug) ?? 0) + result.resource.cost);
    }
    if (!results.some(result => result.items?.length)) craftingError();
    for (const [slug, cost] of costs) if (!(actor.getResource(slug)?.value >= cost)) craftingError();
    assertCurrent();
    const currentAbilities = Array.from(crafting.abilities);
    if (currentAbilities.length !== abilities.length || currentAbilities.some(ability => !payload.abilityStamps.some(row => row.slug === ability.slug && row.stamp === craftingAbilityStamp(ability)))) craftingError("STALE_VALUE");
    if (actor.flags?.pf2e?.dailyCraftingComplete === true) craftingError("STALE_VALUE");
    return crafting.performDailyCrafting();
  }
  if (["prepare", "unprepare", "quantity", "expended", "signature", "ability-craft"].includes(operation)) {
    const ability = resolveCraftingAbility(actor, payload.abilitySlug);
    const assertAbility = () => {
      assertCurrent();
      if (resolveCraftingAbility(actor, payload.abilitySlug) !== ability || craftingAbilityStamp(ability) !== payload.abilityStamp) craftingError("STALE_VALUE");
    };
    assertAbility();
    if (operation === "ability-craft" && !ability.isPrepared) {
      if (payload.confirmed !== true || ability.isDailyPrep) craftingError();
      const valid = await ability.getValidFormulas();
      assertAbility();
      let formula = valid.find(row => row.uuid === payload.formulaUuid && formulaIsReadable(row.item));
      if (!formula) craftingError();
      formula = await resolveFormulaSource(formula, assertAbility);
      assertAbilityItemSupported(formula.item);
      if (ability.resource && !(actor.getResource(ability.resource)?.value > 0)) craftingError();
      const item = await ability.craft(formula.uuid, { consume: true, destination: "hand" });
      if (!item) craftingError("COMMAND_FAILED");
      await announceCraftedItem(actor, item, formula.batchSize, context);
      return item;
    }
    const prepared = await ability.getPreparedCraftingFormulas();
    assertAbility();
    if (operation === "prepare") {
      if (!ability.isPrepared) craftingError();
      const valid = await ability.getValidFormulas();
      assertAbility();
      const selected = valid.find(row => row.uuid === payload.formulaUuid && formulaIsReadable(row.item));
      if (!selected) craftingError();
      await resolveFormulaSource(selected, assertAbility);
      return ability.prepareFormula(payload.formulaUuid);
    }
    const index = payload.index;
    if (!Number.isSafeInteger(index) || index < 0) craftingError();
    const formula = prepared[index];
    if (!formula || formula.uuid !== payload.formulaUuid || !formulaIsReadable(formula.item)) craftingError("STALE_VALUE");
    if (operation === "unprepare") return ability.unprepareFormula(index);
    if (operation === "quantity") {
      if (!["increase", "decrease"].includes(payload.direction)) craftingError();
      return ability.setFormulaQuantity(index, payload.direction);
    }
    if (operation === "signature") {
      if (!ability.isAlchemical || typeof ability.toggleSignatureItem !== "function"
        || typeof payload.originalSignature !== "boolean"
        || (formula.isSignatureItem === true) !== payload.originalSignature) craftingError("STALE_VALUE");
      await resolveFormulaSource(formula, assertAbility);
      // PF2e adjusts persisted quantity and field-discovery cost together.
      return ability.toggleSignatureItem(formula.uuid);
    }
    if (operation === "expended") {
      if (typeof payload.value !== "boolean" || ability.isDailyPrep || ability.resource) craftingError();
      return ability.toggleFormulaExpended(index, payload.value);
    }
    if (payload.confirmed !== true || formula.expended || ability.isDailyPrep) craftingError();
    await resolveFormulaSource(formula, assertAbility);
    assertAbilityItemSupported(formula.item);
    if (ability.resource && !(actor.getResource(ability.resource)?.value > 0)) craftingError();
    const item = await ability.craft(index, { consume: true });
    if (!item) craftingError("COMMAND_FAILED");
    await announceCraftedItem(actor, item, formula.batchSize, context);
    return item;
  }
  if (["craft", "post"].includes(operation)) {
    const formulas = await crafting.getFormulas();
    assertCurrent();
    let formula = formulas.find(row => row.uuid === payload.formulaUuid);
    if (!formula || !formulaIsReadable(formula.item)) craftingError();
    formula = await resolveFormulaSource(formula, assertCurrent);
    if (operation === "post") {
      // Match native formula-to-chat's actor-parented temporary Item so chat
      // listeners recognize the formula rather than an owned inventory item.
      const ItemClass = globalThis.Item?.implementation ?? globalThis.CONFIG?.Item?.documentClass;
      if (typeof ItemClass !== "function") craftingError("CAPABILITY_UNAVAILABLE");
      const item = new ItemClass(formula.item.toObject(), { parent: actor });
      assertCurrent();
      return item.toMessage(null, { create: true, data: { fromFormula: true } });
    }
    if (payload.confirmed !== true) craftingError();
    const quantity = payload.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) craftingError();
    if (payload.originalQuickAlchemy) {
      if (!canUseLegacyQuickAlchemy(actor) || payload.spellId !== undefined) craftingError("CAPABILITY_UNAVAILABLE");
      return createLegacyQuickAlchemyItem(actor, formula, { ...context, assertCurrent });
    }
    if (payload.originalFreeCrafting) return createFreeCraftingItem(actor, formula, payload, { ...context, assertCurrent });
    if (payload.spellId !== undefined) craftingError();
    if (typeof globalThis.game?.pf2e?.actions?.craft !== "function") craftingError("CAPABILITY_UNAVAILABLE");
    return runNativeCraftingCheck(actor, formula, quantity, context);
  }
  craftingError();
}

// The native formula cache can outlive deletion/replacement of its source Item.
// Re-resolve only an explicitly chosen/consumed source, then recheck authority.
async function resolveFormulaSource(formula, assertCurrent) {
  const item = await globalThis.fromUuid?.(formula.uuid);
  assertCurrent();
  if (!item || item.uuid !== formula.uuid || item.isOfType?.("physical") !== true || !formulaIsReadable(item)) craftingError("STALE_VALUE");
  return { ...formula, item };
}

// Native PF2e 8.6.1 explicitly declines snare creation after expenditure in
// ability.craft. Reject before expenditure; ordinary Craft retains its native path.
function assertAbilityItemSupported(item) {
  if (item.system?.traits?.value?.includes?.("snare") || item.traits?.has?.("snare")) craftingError("CAPABILITY_UNAVAILABLE");
}

/** Formula learning/removal/order use the same persisted list as the native sheet.
 * Preserve metadata and reject a stale list before any direct supported-field write. */
async function editFormulaBook(actor, payload, assertCurrent) {
  const current = actor.system?.crafting?.formulas;
  if (!Array.isArray(current) || !Array.isArray(payload.originalUuids)
    || current.length !== payload.originalUuids.length || current.some((row, index) => row.uuid !== payload.originalUuids[index])) craftingError("STALE_VALUE");
  const next = current.map(row => ({ ...row }));
  const uuid = payload.formulaUuid;
  if (typeof uuid !== "string" || !uuid || uuid.length > 500) craftingError();
  if (payload.operation === "learn") {
    if (!/^(?:Compendium\.|Item\.|Actor\.|Scene\.)/u.test(uuid)) craftingError();
    if (next.some(row => row.uuid === uuid)) craftingError("STALE_VALUE");
    const item = await globalThis.fromUuid?.(uuid);
    assertCurrent();
    if (actor.system?.crafting?.formulas !== current) craftingError("STALE_VALUE");
    if (item?.isOfType?.("physical") !== true || !formulaIsReadable(item)) craftingError();
    // A source document can disappear while fromUuid is loading. Validate its
    // actual collection membership, including exact synthetic-parent provenance.
    const game = globalThis.game;
    if (item.actor) {
      if (resolveActorSource(actorSourceUuid(item.actor), { game }) !== item.actor || item.actor.items?.get?.(item.id) !== item) craftingError("STALE_VALUE");
    } else if (item.pack) {
      if (game.packs?.get?.(item.pack)?.get?.(item.id) !== item) craftingError("STALE_VALUE");
    } else if (game.items?.get?.(item.id) !== item) craftingError("STALE_VALUE");
    next.push({ uuid: item.uuid });
  } else {
    const index = next.findIndex(row => row.uuid === uuid);
    if (index < 0) craftingError("STALE_VALUE");
    if (payload.operation === "forget") {
      if (payload.confirmed !== true) craftingError();
      next.splice(index, 1);
    } else {
      const target = next.findIndex(row => row.uuid === payload.beforeUuid);
      if (target < 0 || target === index) craftingError();
      const formulas = await nativeCrafting(actor).getFormulas();
      assertCurrent();
      if (actor.system?.crafting?.formulas !== current) craftingError("STALE_VALUE");
      const source = formulas.find(row => row.uuid === uuid);
      const destination = formulas.find(row => row.uuid === payload.beforeUuid);
      if (!source || !destination || source.item.level !== destination.item.level
        || !formulaIsReadable(source.item) || !formulaIsReadable(destination.item)) craftingError();
      const [row] = next.splice(index, 1);
      next.splice(next.findIndex(entry => entry.uuid === payload.beforeUuid), 0, row);
    }
  }
  assertCurrent();
  return actor.update({ "system.crafting.formulas": next });
}
