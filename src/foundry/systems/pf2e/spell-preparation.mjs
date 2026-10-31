import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

const fail = (code, key, fallback) => {
  throw new CommandError(code, localizeFoundry(`VEMOBILE.PF2E.SpellPreparation.${key}`, fallback));
};
const invalid = () => fail("INVALID_INPUT", "InvalidInput", "This spell preparation choice is invalid or has changed. Refresh and try again.");
const unavailable = () => fail("CAPABILITY_UNAVAILABLE", "Unavailable", "This PF2e spell preparation action is unavailable.");
const SLOT_GROUPS = Object.freeze(Array.from({ length: 11 }, (_, rank) => `slot${rank}`));

/** Build the plain preparation panel data from the native spellcasting entry. */
export function spellPreparationRecord(entry) {
  if (!entry || entry.isPrepared !== true) return null;
  const flexible = entry.isFlexible === true;
  const spells = Array.from(entry.spells ?? []);
  const ranks = [];
  const maxRank = highestRank(entry);
  if (maxRank < 0) return null;

  for (let rank = 0; rank <= maxRank; rank += 1) {
    if (flexible && rank > 0) continue;
    const data = entry.system?.slots?.[SLOT_GROUPS[rank]];
    const prepared = data?.prepared;
    if (!Array.isArray(prepared)) continue;
    ranks.push({
      rank,
      slots: prepared.slice(0, nonNegativeInteger(data.max)).map((slot, slotId) => ({
        slotId,
        spellId: typeof slot?.id === "string" ? slot.id : null,
        expended: slot?.expended === true
      })),
      options: spells.filter(spell => !isFocusSpell(spell) && !isRitual(spell)
        && isCantrip(spell) === (rank === 0)
        && (rank === 0 || Number(spell.baseRank ?? spell.rank ?? spell.system?.level?.value) <= rank))
        .map(spellOption)
    });
  }

  let flexibleOptions = [];
  let flexibleLimit = null;
  if (flexible) {
    const rankedSlots = SLOT_GROUPS.slice(1).map(group => entry.system?.slots?.[group]).filter(Boolean);
    const max = rankedSlots.reduce((sum, slot) => sum + nonNegativeInteger(slot.max), 0);
    flexibleOptions = spells.filter(spell => !isCantrip(spell) && !isFocusSpell(spell) && !isRitual(spell)
      && spellRank(spell) >= 1 && spellRank(spell) <= maxRank)
      .map(spell => ({ ...spellOption(spell), rank: spellRank(spell), selected: spell.system?.location?.signature === true }));
    flexibleLimit = { value: flexibleOptions.filter(option => option.selected).length, max };
  }

  return { flexible, ranks, flexibleOptions, flexibleLimit };
}

/** Return plain signature options for entries that do not prepare individual slots. */
export function spellManagementRecord(entry) {
  if (!entry?.spells || typeof entry.spells.addSpell !== "function" || entry.isFocusPool || entry.isRitual) return null;
  const flexible = entry.isFlexible === true;
  const spells = Array.from(entry.spells ?? []).filter(spell => !isFocusSpell(spell) && !isRitual(spell));
  const signatureSpells = spells.filter(spell => !isCantrip(spell));
  const max = flexible ? flexibleSlotCapacity(entry) : null;
  const signatures = signatureSpells.filter(spell => spell.system?.location?.signature === true).length;
  return {
    signatures: signatureSpells.map(spell => ({ ...spellOption(spell), rank: spellRank(spell), selected: spell.system?.location?.signature === true })),
    signatureOptions: entry.isSpontaneous || flexible ? signatureSpells.map(spell => String(spell.id)) : [],
    signatureLimit: flexible ? { value: signatures, max } : null,
    maxRank: highestRank(entry),
    spontaneous: entry.isSpontaneous === true,
    tradition: entry.tradition ?? null,
    canAdd: true
  };
}

/** Read a small, permission-safe catalogue from installed PF2e system packs. */
export async function readSpellCatalog(actor, payload, context) {
  if (!payload || typeof payload !== "object") invalid();
  const entry = resolveEntry(actor, payload.entryId);
  if (!entry || !entry.spells) unavailable();
  const query = typeof payload.search === "string" ? payload.search.trim().slice(0, 80).toLocaleLowerCase() : "";
  const cursor = Number.isSafeInteger(payload.cursor) && payload.cursor >= 0 ? payload.cursor : 0;
  const browser = globalThis.game?.pf2e?.compendiumBrowser;
  if (typeof browser?.loadedPacks !== "function") unavailable();
  const enabledPacks = new Set(browser.loadedPacks("spell"));
  const packs = Array.from(globalThis.game?.packs ?? []).filter(pack => pack?.metadata?.packageType === "system"
    && pack?.metadata?.packageName === "pf2e" && pack?.metadata?.type === "Item"
    && enabledPacks.has(pack.collection) && pack.testUserPermission?.(globalThis.game.user, "LIMITED") === true
    && typeof pack.getIndex === "function" && typeof pack.getDocument === "function");
  const matches = [];
  for (const pack of packs) {
    let index;
    try { index = await pack.getIndex({ fields: ["type", "system.level.value", "system.traits.value", "system.traits.traditions", "system.ritual"] }); }
    catch { continue; }
    context?.assertCurrent();
    if (resolveEntry(actor, payload.entryId) !== entry || globalThis.game?.packs?.get?.(pack.collection) !== pack
      || pack.testUserPermission?.(globalThis.game.user, "LIMITED") !== true) stale();
    for (const row of index ?? []) {
      if (row?.type !== "spell" || typeof row._id !== "string") continue;
      const rank = Number(row.system?.level?.value);
      const traits = row.system?.traits?.value ?? [];
      const traditions = row.system?.traits?.traditions ?? [];
      const cantrip = traits.includes("cantrip");
      if (traits.includes("focus") || (cantrip && traditions.length === 0) || row.system?.ritual) continue;
      if (!Number.isSafeInteger(rank) || rank < 1 || rank > 10) continue;
      if (rank > highestRank(entry)) continue;
      if (!entry.tradition || !traditions.includes(entry.tradition)) continue;
      const name = String(row.name ?? "");
      if (query && !name.toLocaleLowerCase().includes(query)) continue;
      matches.push({ uuid: `Compendium.${pack.collection}.Item.${row._id}`, name, img: String(row.img ?? ""), rank, cantrip });
    }
  }
  matches.sort((a, b) => a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid));
  const page = matches.slice(cursor, cursor + 30);
  return { entryId: entry.id, query, spells: page, nextCursor: cursor + page.length < matches.length ? cursor + page.length : null };
}

/** Execute bounded compendium import, signature toggle, or direct spell-attack roll. */
export async function editSpellManagement(actor, payload, context) {
  if (!payload || typeof payload !== "object") invalid();
  const entry = resolveEntry(actor, payload.entryId);
  if (!entry || !entry.spells) unavailable();
  if (payload.operation === "import") {
    if (typeof payload.spellUuid !== "string" || !payload.spellUuid.startsWith("Compendium.pf2e.")) invalid();
    const packId = payload.spellUuid.slice("Compendium.".length).split(".Item.")[0];
    const pack = globalThis.game?.packs?.get?.(packId);
    if (!pack || pack.metadata?.packageType !== "system" || pack.metadata?.packageName !== "pf2e" || pack.metadata?.type !== "Item") invalid();
    const spell = await globalThis.fromUuid?.(payload.spellUuid);
    if (!eligibleCompendiumSpell(spell) || spell.pack !== packId) invalid();
    if (pack.testUserPermission?.(globalThis.game.user, "LIMITED") !== true || !globalThis.game?.pf2e?.compendiumBrowser?.loadedPacks?.("spell")?.includes?.(packId)) invalid();
    context?.assertCurrent();
    if (resolveEntry(actor, payload.entryId) !== entry || globalThis.game?.packs?.get?.(packId) !== pack) stale();
    if (typeof entry.canCast !== "function" || !entry.canCast(spell)) invalid();
    const rank = spellRank(spell);
    const importRank = entry.isSpontaneous && !isCantrip(spell) ? integer(payload.rank ?? rank, rank, Math.min(10, highestRank(entry))) : rank;
    if (rank > highestRank(entry)) invalid();
    if (entry.spells.has?.(spell.id) || collectionGet(entry.spells, spell.id)) stale();
    if (typeof entry.spells.addSpell !== "function") unavailable();
    context?.assertCurrent();
    const result = await entry.spells.addSpell(spell, entry.isSpontaneous && !isCantrip(spell) ? { groupId: importRank } : {});
    if (!result) invalid();
    return result;
  }
  if (payload.operation === "toggle-signature") {
    if (typeof payload.spellId !== "string" || typeof payload.selected !== "boolean" || typeof payload.originalSelected !== "boolean") invalid();
    if (!entry.isSpontaneous && !entry.isFlexible) invalid();
    const spell = resolveEntrySpell(actor, entry, payload.spellId);
    if (!spell || isCantrip(spell) || isFocusSpell(spell) || isRitual(spell)) invalid();
    const selected = spell.system?.location?.signature === true;
    if (selected !== payload.originalSelected) stale();
    const rank = spellRank(spell);
    if (rank < 1 || rank > highestRank(entry)) invalid();
    if (entry.isFlexible && payload.selected && !selected && flexibleSignatureCount(entry) >= flexibleSlotCapacity(entry)) invalid();
    if (selected === payload.selected) return null;
    if (typeof spell.update !== "function") unavailable();
    context?.assertCurrent();
    return spell.update({ "system.location.signature": payload.selected });
  }
  if (payload.operation === "attack") {
    if (typeof entry.statistic?.check?.roll !== "function") unavailable();
    if (payload.spellId !== undefined) invalid();
    context?.assertCurrent();
    return entry.statistic.check.roll({});
  }
  invalid();
}

function eligibleCompendiumSpell(spell) {
  return spell?.type === "spell" && !isFocusSpell(spell) && !isRitual(spell)
    && typeof spell.id === "string" && Number.isSafeInteger(spell.baseRank) && spell.baseRank >= 1 && spell.baseRank <= 10;
}

/** Apply one explicit slot edit or flexible signature toggle using PF2e's native APIs. */
export async function editSpellPreparation(actor, payload, context) {
  if (!payload || typeof payload !== "object") invalid();
  const entry = resolveEntry(actor, payload.entryId);
  if (!entry || entry.isPrepared !== true) unavailable();

  if (payload.operation === "toggle-flexible") return toggleFlexible(entry, payload, context);
  if (payload.operation !== "assign" && payload.operation !== "clear") invalid();
  if (entry.isFlexible === true && payload.rank !== 0) invalid();

  const rank = integer(payload.rank, 0, 10);
  if (rank > highestRank(entry)) invalid();
  const group = entry.system?.slots?.[SLOT_GROUPS[rank]];
  const slots = group?.prepared;
  const slotId = integer(payload.slotId, 0, 99);
  if (slotId >= nonNegativeInteger(group?.max)) invalid();
  const slot = Array.isArray(slots) ? slots[slotId] : null;
  if (!slot || typeof slot.expended !== "boolean" || slot.id !== (payload.originalSpellId ?? null)
    || slot.expended !== payload.originalExpended) stale();

  let spell = null;
  if (payload.operation === "assign") {
    if (typeof payload.spellId !== "string" || !payload.spellId) invalid();
    spell = resolveEntrySpell(actor, entry, payload.spellId);
    if (!spell || isFocusSpell(spell) || isRitual(spell) || isCantrip(spell) !== (rank === 0)) invalid();
    if (rank > 0 && spellRank(spell) > rank) invalid();
    if (rank === 0 && slots.some((candidate, index) => index !== slotId && candidate?.id === spell.id)) invalid();
  } else if (payload.spellId !== undefined && payload.spellId !== null) invalid();

  if (typeof entry.spells?.prepareSpell !== "function") unavailable();
  // PF2e's native implementation clones the slot and carries its expended bit
  // across assignment and clear; it also validates cantrip and minimum rank.
  context?.assertCurrent();
  return entry.spells.prepareSpell(spell, rank === 0 ? "cantrips" : rank, slotId);
}

function toggleFlexible(entry, payload, context) {
  if (entry.isFlexible !== true || typeof payload.spellId !== "string" || !payload.spellId
    || typeof payload.selected !== "boolean" || typeof payload.originalSelected !== "boolean") invalid();
  const spell = resolveEntrySpell(entry.actor, entry, payload.spellId);
  if (!spell || isCantrip(spell) || isFocusSpell(spell) || isRitual(spell)) invalid();
  const selected = spell.system?.location?.signature === true;
  if (selected !== payload.originalSelected) stale();
  const rank = spellRank(spell);
  if (rank < 1 || rank > highestRank(entry)) invalid();
  if (payload.selected && !selected && flexibleSignatureCount(entry) >= flexibleSlotCapacity(entry)) invalid();
  if (selected === payload.selected) return null;
  if (typeof spell.update !== "function") unavailable();
  context?.assertCurrent();
  return spell.update({ "system.location.signature": payload.selected });
}

function resolveEntry(actor, id) {
  if (typeof id !== "string" || !id) invalid();
  const item = actor?.items?.get?.(id);
  if (!item || item.id !== id || item.type !== "spellcastingEntry" || item.actor !== actor) return null;
  const entries = Array.from(actor.spellcasting?.regular ?? actor.spellcasting?.contents ?? actor.spellcasting ?? []);
  return entries.find(entry => entry === item && entry.id === id) ?? null;
}

function resolveEntrySpell(actor, entry, id) {
  const spell = collectionGet(entry.spells, id);
  if (!spell || spell.id !== id || spell.type !== "spell" || spell.actor !== actor
    || actor?.items?.get?.(id) !== spell || spell.system?.location?.value !== entry.id) return null;
  return spell;
}

function flexibleSignatureCount(entry) {
  return Array.from(entry.spells ?? []).filter(spell => spell.system?.location?.signature === true
    && !isCantrip(spell) && !isFocusSpell(spell) && !isRitual(spell)).length;
}

function flexibleSlotCapacity(entry) {
  return SLOT_GROUPS.slice(1).reduce((sum, group) => sum + nonNegativeInteger(entry.system?.slots?.[group]?.max), 0);
}

function spellOption(spell) {
  return { spellId: String(spell.id), name: String(spell.name ?? ""), img: String(spell.img ?? "") };
}

function spellRank(spell) {
  const rank = Number(spell.baseRank ?? spell.rank ?? spell.system?.level?.value ?? 0);
  return Number.isSafeInteger(rank) ? rank : 0;
}

function highestRank(entry) {
  return Number.isSafeInteger(entry?.highestRank) && entry.highestRank >= 0 && entry.highestRank <= 10
    ? entry.highestRank : -1;
}

function isCantrip(spell) {
  return spell?.isCantrip === true || spell?.system?.traits?.value?.includes?.("cantrip") === true;
}

function isFocusSpell(spell) {
  return spell?.isFocusSpell === true || spell?.system?.traits?.value?.includes?.("focus") === true;
}

function isRitual(spell) {
  return spell?.isRitual === true || Boolean(spell?.system?.ritual);
}

function collectionGet(collection, id) {
  return collection?.get?.(id) ?? Array.from(collection ?? []).find(spell => spell?.id === id) ?? null;
}

function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function stale() {
  fail("STALE_VALUE", "Changed", "Spell preparation changed. Refresh and try again.");
}
