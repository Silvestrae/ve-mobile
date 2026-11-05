import { localizeFoundry } from "../../localization.mjs";
import { assertCraftingOwner, craftingError, formulaIsReadable } from "./crafting-records.mjs";

/** PF2e 8.6.1's legacy sheet calls an unexported craftItem helper after spending
 * one Infused Reagent. Mirror only its item-source conversion and use the native
 * resource/inventory APIs. Validate everything available before spending; a later
 * inventory failure is reported without replaying or compensating consumption. */
export async function createLegacyQuickAlchemyItem(actor, formula, context) {
  assertCraftingOwner(actor, context);
  const originalItem = formula.item;
  if (!formulaIsReadable(originalItem) || typeof originalItem.toObject !== "function"
    || typeof actor.addToInventory !== "function" || typeof actor.updateResource !== "function") craftingError("CAPABILITY_UNAVAILABLE");
  const source = originalItem.toObject();
  delete source._id;
  source.system.quantity = 1;
  source.system.size = actor.size === "tiny" ? "tiny" : "med";
  const traits = source.system.traits?.value ?? [];
  if (traits.includes("alchemical") && traits.includes("consumable")) {
    source.system.traits = { ...source.system.traits, value: [...traits, "infused"] };
    source.system.temporary = true;
  }
  const resource = actor.getResource("infused-reagents");
  if (!resource || !Number.isFinite(resource.value) || resource.value < 1) craftingError();
  assertCraftingOwner(actor, context);
  await actor.updateResource("infused-reagents", resource.value - 1, { render: false });
  assertCraftingOwner(actor, context);
  const item = await actor.addToInventory(source);
  assertCraftingOwner(actor, context);
  if (!item) craftingError("COMMAND_FAILED");
  await announceCraftedItem(actor, item, 1, context);
  return item;
}

/** Identify only PF2e's configured blank spell-consumable templates. An existing
 * scroll with an embedded spell must retain that spell rather than opening a new picker. */
export function spellConsumableTemplate(item, config = globalThis.CONFIG?.PF2E) {
  if (item?.type !== "consumable") return null;
  for (const category of ["scroll", "wand", "spell-gem"]) {
    const definition = config?.spellcastingItems?.[category];
    if (!Object.values(definition?.compendiumUuids ?? {}).includes(item.uuid)) continue;
    // These rank calculations match the native 8.6.1 crafting helper, whose
    // selector accepts the actor's non-cantrip, non-focus, non-ritual spells.
    const rank = category === "wand" ? Math.ceil(item.level / 2) - 1 : Math.ceil(item.level / 2);
    return Number.isSafeInteger(rank) && rank >= 1 && rank <= 10
      ? { category, rank, nameTemplate: definition.nameTemplate ?? null } : null;
  }
  return null;
}

// Native-owned actor spells are the eligible source, including correctly heightened lower-rank spells.
export function craftingSpellOptions(actor, template) {
  if (!template) return [];
  return Array.from(actor.itemTypes?.spell ?? []).filter(spell => spell.actor === actor
    && actor.items?.get?.(spell.id) === spell && !spell.isCantrip && !spell.isFocusSpell && !spell.isRitual
    && Number.isSafeInteger(spell.baseRank) && spell.baseRank >= 1 && spell.baseRank <= template.rank);
}

/** Free crafting has no exported PF2e helper in 8.6.1. This narrow adapter builds
 * supported native item source fields and delegates inventory placement to addToInventory.
 * Paid crafting and its native result-card path do not use this adapter. */
export async function createFreeCraftingItem(actor, formula, payload, context) {
  assertCraftingOwner(actor, context);
  const originalItem = formula.item;
  if (!formulaIsReadable(originalItem) || typeof originalItem.toObject !== "function"
    || typeof actor.addToInventory !== "function") craftingError("CAPABILITY_UNAVAILABLE");
  const source = originalItem.toObject();
  delete source._id;
  source.system.quantity = payload.quantity;
  source.system.size = actor.size === "tiny" ? "tiny" : "med";
  const template = spellConsumableTemplate(originalItem);
  if (template) {
    const spell = craftingSpellOptions(actor, template).find(item => item.id === payload.spellId);
    if (!spell) craftingError();
    applyCraftingSpell(source, spell, template);
  } else if (payload.spellId !== undefined) craftingError();
  assertCraftingOwner(actor, context);
  const item = await actor.addToInventory(source);
  // Creation may already have committed if authority changes here. Do not
  // attempt a compensating deletion or replay; the caller refreshes native state.
  assertCraftingOwner(actor, context);
  if (!item) craftingError("COMMAND_FAILED");
  await announceCraftedItem(actor, item, payload.quantity, context);
  return item;
}

// Match the native sheet's receipt for direct crafting-ability/inventory calls.
// These calls do not execute an Action Item's richer chat-card pipeline.
export async function announceCraftedItem(actor, item, quantity, context) {
  assertCraftingOwner(actor, context);
  const Message = globalThis.ChatMessage;
  if (typeof Message?.create === "function") {
    const content = localizeFoundry("PF2E.Actions.Craft.Information.ReceiveItem",
      "{actorName} receives {quantity} × {itemName}.", {
        actorName: escapeCraftingText(actor.name), quantity, itemName: escapeCraftingText(item.name)
      });
    await Message.create({ author: globalThis.game.user.id, content: `<p>${content}</p>`,
      speaker: Message.getSpeaker?.({ actor }) ?? { alias: actor.name } });
  }
}

/** Assemble a spell consumable using native config, a native base template and
 * the exact embedded spell source. This is version-sensitive document conversion,
 * not a second implementation of spell casting, costs or crafting rules. */
function applyCraftingSpell(source, spell, template) {
  const traditions = new Set(Object.keys(globalThis.CONFIG?.PF2E?.magicTraditions ?? {}));
  const traits = new Set([...(source.system.traits?.value ?? []), ...(spell.system?.traits?.value ?? [])]);
  if ([...traits].some(trait => traditions.has(trait))) traits.delete("magical");
  source.system.traits = { ...source.system.traits, value: [...traits].sort(), rarity: spell.rarity };
  source.name = template.nameTemplate
    ? localizeFoundry(template.nameTemplate, "{name} (Rank {level})", { name: spell.name, level: template.rank })
    : `${template.category} of ${spell.name} (Rank ${template.rank})`;
  const spellSource = spell.toObject();
  const randomId = globalThis.foundry?.utils?.randomID;
  if (typeof randomId !== "function") craftingError("CAPABILITY_UNAVAILABLE");
  spellSource._id = randomId();
  spellSource.system.location = { ...spellSource.system.location, value: null, heightenedLevel: template.rank };
  source.system.spell = spellSource;
  const description = spell.sourceId ? `<p>${escapeCraftingText(`@UUID[${spell.sourceId}]{${spell.name}}`)}</p>`
    : spell.description ?? `<p>${escapeCraftingText(spell.name)}</p>`;
  source.system.description = { ...source.system.description,
    value: `${description}<hr>${source.system.description?.value ?? ""}` };
}

// Escape text substitutions while preserving PF2e's own trusted localized markup/template description.
function escapeCraftingText(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/gu, character => entities[character]);
}
