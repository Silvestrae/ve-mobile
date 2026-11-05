import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

const PLAYER_NUMBER = Object.freeze({ min: 1, max: 9_999_999 });
const CHARACTER_NUMBER = Object.freeze({ min: 2001, max: 9999 });
const REPUTATION = Object.freeze({ min: 0, max: Number.MAX_SAFE_INTEGER });
const CATALOG_LIMIT = 100;
const ERROR_MESSAGES = Object.freeze({
  InvalidInput: Object.freeze({ code: "INVALID_INPUT", key: "VEMOBILE.PF2E.Society.InvalidInput", fallback: "This Society value is invalid or has changed. Refresh and try again." }),
  Changed: Object.freeze({ code: "STALE_VALUE", key: "VEMOBILE.PF2E.Society.Changed", fallback: "Society data changed. Refresh and try again." }),
  ActionUnavailable: Object.freeze({ code: "CAPABILITY_UNAVAILABLE", key: "VEMOBILE.PF2E.Society.ActionUnavailable", fallback: "This Pathfinder Society action is unavailable." }),
  SearchFailed: Object.freeze({ code: "COMMAND_FAILED", key: "VEMOBILE.PF2E.Society.SearchFailed", fallback: "Could not search the available Pathfinder Society boons. Please try again." })
});

// Raise localized errors for malformed, stale, or unavailable Society actions.
function fail(message) {
  const error = ERROR_MESSAGES[message];
  throw new CommandError(error.code, localizeFoundry(error.key, error.fallback));
}
const invalid = () => fail("InvalidInput");
const stale = () => fail("Changed");
const unavailable = () => fail("ActionUnavailable");

// Read supported faction IDs from PF2e's current configuration, retaining its localized labels.
function factionOptions() {
  return Object.entries(globalThis.CONFIG?.PF2E?.pfsFactions ?? {})
    .filter(([id]) => /^[A-Z]{2}$/u.test(id))
    .map(([id, label]) => ({ id, label: localizeFoundry(label, id) }));
}

// Read the feat browser's active pack list at each check so catalogues cannot outlive visibility.
function loadedFeatPackIds() {
  const loaded = globalThis.game?.pf2e?.compendiumBrowser?.loadedPacks?.("feat");
  return Array.isArray(loaded) ? loaded : [];
}

// Serialize only PF2e Society fields and embedded boons belonging to this Actor.
export function societyRecord(actor) {
  if (actor?.type !== "character") return null;
  const pfs = actor?.system?.pfs ?? {};
  const factions = factionOptions();
  const reputation = Object.fromEntries(factions.map(({ id }) => [id, nullableReputation(pfs.reputation?.[id]) ]));
  const boons = Array.from(actor?.items ?? []).filter(item => item?.type === "feat" && item.system?.category === "pfsboon")
    .map(item => ({ id: String(item.id), name: String(item.name ?? ""), img: String(item.img ?? "") }));
  return {
    playerNumber: nullableInteger(pfs.playerNumber),
    characterNumber: nullableInteger(pfs.characterNumber),
    currentFaction: factions.some(({ id }) => id === pfs.currentFaction) ? pfs.currentFaction : "EA",
    levelBump: pfs.levelBump === true,
    reputation,
    factions,
    boons,
    bounds: { playerNumber: PLAYER_NUMBER, characterNumber: CHARACTER_NUMBER, reputation: REPUTATION }
  };
}

// Preserve null Society defaults while excluding non-integer document values from UI records.
function nullableInteger(value) {
  return value === null || value === undefined || Number.isSafeInteger(value) ? value ?? null : null;
}

// Slow advancement can award half Reputation without rounding. Preserve those
// native values instead of treating fractional bookkeeping as an empty field.
function nullableReputation(value) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;
}

// Validate full metadata payloads and update only the native Society fields shown by the editor.
async function updateSociety(actor, payload, context) {
  if (actor.type !== "character" || typeof actor.update !== "function") unavailable();
  assertPayloadKeys(payload, ["operation", "values", "originalValues"]);
  const factions = factionOptions();
  const ids = factions.map(({ id }) => id);
  const values = payload.values, original = payload.originalValues;
  if (!exactKeys(values, ["playerNumber", "characterNumber", "currentFaction", "reputation"])
    || !exactKeys(original, ["playerNumber", "characterNumber", "currentFaction", "reputation"])
    || !exactKeys(values.reputation, ids) || !exactKeys(original.reputation, ids)) invalid();
  validateOptionalInteger(values.playerNumber, PLAYER_NUMBER);
  validateOptionalInteger(values.characterNumber, CHARACTER_NUMBER);
  validateOptionalInteger(original.playerNumber, PLAYER_NUMBER);
  validateOptionalInteger(original.characterNumber, CHARACTER_NUMBER);
  if (typeof values.currentFaction !== "string" || !ids.includes(values.currentFaction)) invalid();
  if (typeof original.currentFaction !== "string" || !ids.includes(original.currentFaction)) invalid();
  for (const id of ids) {
    for (const value of [values.reputation[id], original.reputation[id]]) {
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < REPUTATION.min || value > REPUTATION.max)) invalid();
    }
  }

  const pfs = actor.system?.pfs ?? {};
  if (pfs.playerNumber !== original.playerNumber || pfs.characterNumber !== original.characterNumber
    || pfs.currentFaction !== original.currentFaction
    // Invalid imported source values must fail closed rather than being erased
    // because the transport-safe snapshot represented them as an empty field.
    || ids.some(id => (pfs.reputation?.[id] ?? null) !== original.reputation[id])) stale();

  const update = {
    "system.pfs.playerNumber": values.playerNumber,
    "system.pfs.characterNumber": values.characterNumber,
    "system.pfs.currentFaction": values.currentFaction
  };
  for (const id of ids) update[`system.pfs.reputation.${id}`] = values.reputation[id];
  context?.assertCurrent();
  return actor.update(update);
}

// Change only the PFS level-bump switch after confirming the captured state.
async function setLevelBump(actor, payload, context) {
  assertPayloadKeys(payload, ["operation", "value", "originalValue"]);
  if (actor.type !== "character" || typeof actor.update !== "function" || typeof payload.value !== "boolean"
    || typeof payload.originalValue !== "boolean") unavailable();
  if ((actor.system?.pfs?.levelBump === true) !== payload.originalValue) stale();
  context?.assertCurrent();
  return actor.update({ "system.pfs.levelBump": payload.value });
}

// Search only visible PF2e Item packs already enabled in the native feat browser.
export async function searchSocietyBoons(actor, payload, context) {
  assertPayloadKeys(payload, ["operation", "search"]);
  if (actor.type !== "character" || typeof payload.search !== "string") invalid();
  const query = payload.search.trim().slice(0, 80).toLocaleLowerCase();
  const browser = globalThis.game?.pf2e?.compendiumBrowser;
  if (typeof browser?.loadedPacks !== "function") unavailable();
  const loaded = new Set(browser.loadedPacks("feat"));
  const packs = Array.from(globalThis.game?.packs ?? []).filter(pack => loaded.has(pack.collection)
    && validVisiblePack(pack) && typeof pack.getIndex === "function");
  const matches = [];
  let successfulIndexes = 0;
  for (const pack of packs) {
    let index;
    try { index = await pack.getIndex({ fields: ["type", "system.category"] }); }
    catch {
      context?.assertCurrent();
      if (!isCurrentVisibleFeatPack(pack)) stale();
      continue;
    }
    context?.assertCurrent();
    if (!isCurrentVisibleFeatPack(pack)) stale();
    successfulIndexes += 1;
    for (const row of index ?? []) {
      if (row?.type !== "feat" || row.system?.category !== "pfsboon" || typeof row._id !== "string") continue;
      const name = String(row.name ?? "");
      if (query && !name.toLocaleLowerCase().includes(query)) continue;
      matches.push({ uuid: `Compendium.${pack.collection}.Item.${row._id}`, name, img: String(row.img ?? "") });
    }
  }
  if (packs.length > 0 && successfulIndexes === 0) fail("SearchFailed");
  matches.sort((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid));
  return { boons: matches.slice(0, CATALOG_LIMIT), truncated: matches.length > CATALOG_LIMIT };
}

// Add a boon from its exact visible PF2e pack after asynchronous and source checks.
async function addBoon(actor, payload, context) {
  assertPayloadKeys(payload, ["operation", "uuid"]);
  const reference = typeof payload.uuid === "string" ? parseCompendiumItemUuid(payload.uuid) : null;
  if (!reference || actor.type !== "character" || typeof actor.createEmbeddedDocuments !== "function") invalid();
  const { packId, itemId } = reference;
  const pack = globalThis.game?.packs?.get?.(packId);
  if (!validVisiblePack(pack) || pack.collection !== packId || !loadedFeatPackIds().includes(packId)
    || typeof pack.getDocument !== "function") invalid();
  const document = await pack.getDocument(itemId);
  context?.assertCurrent();
  if (globalThis.game?.packs?.get?.(packId) !== pack || !validVisiblePack(pack)
    || !loadedFeatPackIds().includes(packId) || document?.id !== itemId || document?.pack !== packId || document?.type !== "feat"
    || document.system?.category !== "pfsboon" || typeof document.toObject !== "function") invalid();
  const source = document.toObject();
  // Foundry 14's Document.fromDropData records the compendium UUID when none is
  // present. Apply the same rule to this detached source without mutating a pack
  // document or losing existing provenance from a legitimate prior import.
  source._stats ??= {};
  source._stats.compendiumSource ??= payload.uuid;
  delete source._id;
  delete source.folder;
  if (source.type !== "feat" || source.system?.category !== "pfsboon") invalid();
  context?.assertCurrent();
  return actor.createEmbeddedDocuments("Item", [source]);
}

// Remove only the exact current embedded boon whose displayed name is unchanged.
async function removeBoon(actor, payload, context) {
  assertPayloadKeys(payload, ["operation", "itemId", "originalName"]);
  const item = actor.items?.get?.(payload.itemId);
  if (actor.type !== "character" || !item || item.actor !== actor || actor.items?.get?.(item.id) !== item
    || item.type !== "feat" || item.system?.category !== "pfsboon" || typeof actor.deleteEmbeddedDocuments !== "function") invalid();
  if (typeof payload.originalName !== "string" || payload.originalName !== item.name) stale();
  context?.assertCurrent();
  return actor.deleteEmbeddedDocuments("Item", [item.id]);
}

// Check a plain object contains exactly the named keys before trusting an edit record.
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// Reject unknown command fields while allowing the gateway's stable Actor target.
function assertPayloadKeys(payload, keys) {
  if (Object.keys(payload).some(key => ![...keys, "actorSourceUuid", "actorId"].includes(key))) invalid();
}

// Accept only nullable safe integers within the native PF2e field bounds.
function validateOptionalInteger(value, bounds) {
  if (value !== null && (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max)) invalid();
}

// Confirm a compendium belongs to the installed PF2e system and exposes current LIMITED access.
function validVisiblePack(pack) {
  return pack?.metadata?.type === "Item" && pack.testUserPermission?.(globalThis.game?.user, "LIMITED") === true;
}

// Parse the complete pack collection before the Item ID, including third-party namespaces.
function parseCompendiumItemUuid(uuid) {
  const match = /^Compendium\.(.+)\.Item\.([^.]+)$/u.exec(uuid);
  if (!match || !match[1] || !match[2]) return null;
  return { packId: match[1], itemId: match[2] };
}

// Recheck pack identity, loaded-browser visibility and permission after every awaited index read.
function isCurrentVisibleFeatPack(pack) {
  return globalThis.game?.packs?.get?.(pack.collection) === pack && validVisiblePack(pack)
    && loadedFeatPackIds().includes(pack.collection);
}

// Route each Society action through narrow validation and revalidate async work before mutation.
export async function editSociety(actor, payload, context) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalid();
  if (payload.operation === "update") return updateSociety(actor, payload, context);
  if (payload.operation === "level-bump") return setLevelBump(actor, payload, context);
  if (payload.operation === "search") return searchSocietyBoons(actor, payload, context);
  if (payload.operation === "add-boon") return addBoon(actor, payload, context);
  if (payload.operation === "remove-boon") return removeBoon(actor, payload, context);
  invalid();
}
