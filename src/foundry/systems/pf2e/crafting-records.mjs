import { CommandError, canOwn } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

// Keep crafting errors within the existing localized native-command boundary.
export function craftingError(code = "INVALID_INPUT") {
  throw new CommandError(code, localizeFoundry(`VEMOBILE.PF2E.Crafting.${code}`,
    code === "FORBIDDEN" ? "You cannot change this character's crafting."
      : code === "CAPABILITY_UNAVAILABLE" ? "This crafting action is unavailable."
        : "Crafting changed or this choice is invalid. Refresh and try again."));
}

// Confirm native character support without treating every Actor as a crafting actor.
export function nativeCrafting(actor) {
  if (actor?.type !== "character" || typeof actor.crafting?.getFormulas !== "function") craftingError("CAPABILITY_UNAVAILABLE");
  return actor.crafting;
}

// Match the native sheet's legacy Quick Alchemy capability, independently of
// the remastered spontaneous ability. A stale enabled flag grants no capability.
export function canUseLegacyQuickAlchemy(actor) {
  return Array.from(nativeCrafting(actor).abilities ?? []).some(ability => ability.isAlchemical === true)
    && Boolean(actor.rollOptions?.all?.["feature:quick-alchemy"] || actor.rollOptions?.all?.["feat:quick-alchemy"]);
}

// Recheck authority inside crafting operations as well as the shared command gateway.
export function assertCraftingOwner(actor, context) {
  context?.assertCurrent?.();
  nativeCrafting(actor);
  if (!canOwn(actor, globalThis.game?.user)) craftingError("FORBIDDEN");
}

// Formula source visibility is checked before native compendium data reaches a presenter.
export function formulaIsReadable(item, game = globalThis.game) {
  if (!item || !game?.user) return false;
  if (item.pack) return game.packs?.get?.(item.pack)?.testUserPermission?.(game.user, "LIMITED") === true;
  return item.testUserPermission?.(game.user, "OBSERVER") === true;
}

// Use the same public Coins API as PF2e's sheet, including price-per and rounding.
// Unavailable price data stays absent rather than inventing a crafting cost.
export function craftingFormulaCost(formula, quantity, game = globalThis.game) {
  const price = formula.item?.price;
  return price?.value && typeof game?.pf2e?.Coins?.fromPrice === "function"
    ? String(game.pf2e.Coins.fromPrice(price, quantity).toString()) : null;
}

// Project only the public formula identity and display fields, never a live Item.
export function craftingFormulaRecord(formula) {
  const item = formula.item;
  const traits = item.isIdentified === false && globalThis.game?.user?.isGM !== true ? [] : Array.from(item.traits ?? item.system?.traits?.value ?? [], String);
  const traitConfig = globalThis.CONFIG?.PF2E?.[`${item.type}Traits`] ?? {};
  return {
    uuid: String(formula.uuid), name: String(item.name ?? ""), img: String(item.img ?? ""),
    level: Number(item.level ?? 0), dc: Number(formula.dc ?? 0),
    batchSize: Number(formula.batchSize ?? 1), pricePer: Number(item.price?.per ?? item.system?.price?.per ?? 1),
    cost: craftingFormulaCost(formula, formula.batchSize ?? 1),
    price: craftingFormulaCost(formula, item.price?.per ?? 1),
    traits,
    traitLabels: traits.map(trait => localizeFoundry(traitConfig[trait] ?? globalThis.CONFIG?.PF2E?.itemTraits?.[trait] ?? trait, trait)),
    type: String(item.type ?? ""), identified: item.isIdentified !== false
  };
}

// A small entry-specific optimistic token protects indices and quantities from stale UI.
// This is evaluated for an open crafting read/action, not ordinary actor snapshots.
export function craftingAbilityStamp(ability, preparedFormulaData = ability.preparedFormulaData) {
  return JSON.stringify([ability.slug, ability.maxSlots, ability.maxItemLevel, ability.resource,
    ability.isDailyPrep, ability.isPrepared, ability.isAlchemical, ability.fieldDiscovery,
    ability.fieldDiscoveryBatchSize, ability.batchSize, ability.craftableItems, preparedFormulaData]);
}

// Resolve a current native entry by stable slug instead of retaining it across commands.
export function resolveCraftingAbility(actor, slug) {
  if (typeof slug !== "string" || !slug || slug.length > 150) craftingError();
  const ability = nativeCrafting(actor).abilities?.get?.(slug);
  if (!ability || ability.actor !== actor || ability.slug !== slug) craftingError("STALE_VALUE");
  return ability;
}
