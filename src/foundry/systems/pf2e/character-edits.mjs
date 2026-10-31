import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

const sections = Object.freeze({
  appearance: { appearance: "rich", height: "text", weight: "text" },
  backstory: { backstory: "rich", birthPlace: "text" },
  personality: { attitude: "text", beliefs: "text", edicts: "list", anathema: "list", likes: "text", dislikes: "text", catchphrases: "text" },
  campaign: { campaignNotes: "rich", allies: "rich", enemies: "rich", organizations: "rich" }
});
const path = key => ["height", "weight"].includes(key) ? `system.details.${key}.value` : `system.details.biography.${key}`;
const fail = (code, key, fallback) => { throw new CommandError(code, localizeFoundry(key, fallback)); };
const invalid = () => fail("INVALID_INPUT", "VEMOBILE.PF2E.InvalidInput", "This PF2e action is invalid or has changed. Refresh and try again.");

export function biographyEditorData(actor, section) {
  if (actor.type !== "character" || !Object.hasOwn(sections, section)) return null;
  const details = actor._source?.system?.details ?? actor.system?.details ?? {};
  return Object.entries(sections[section]).map(([key, kind]) => {
    const raw = ["height", "weight"].includes(key) ? details[key]?.value : details.biography?.[key];
    return { key, kind, value: kind === "list" ? Array.isArray(raw) ? raw.filter(value => typeof value === "string") : [] : typeof raw === "string" ? raw : "" };
  });
}

export function updateBiography(actor, payload, context) {
  const fields = biographyEditorData(actor, payload.section);
  if (!fields || typeof actor.update !== "function") invalid();
  const keys = fields.map(field => field.key);
  for (const record of [payload.values, payload.originalValues]) {
    if (!record || typeof record !== "object" || Array.isArray(record) || Object.keys(record).length !== keys.length || Object.keys(record).some(key => !keys.includes(key))) invalid();
  }
  const update = {};
  for (const field of fields) {
    if (JSON.stringify(field.value) !== JSON.stringify(payload.originalValues[field.key])) {
      fail("STALE_VALUE", "VEMOBILE.Character.BiographyGateway.TheBiographyChangedWhileItWasLoading", "The biography changed while it was loading.");
    }
    const value = payload.values[field.key];
    if (field.kind === "list") {
      if (!Array.isArray(value) || value.length > 64 || value.some(entry => typeof entry !== "string" || entry.length > 500)) invalid();
      update[path(field.key)] = value.map(entry => entry.trim()).filter(Boolean);
    } else {
      if (typeof value !== "string" || value.length > (field.kind === "rich" ? 200000 : 5000)) invalid();
      update[path(field.key)] = field.kind === "rich" ? value : value.trim();
    }
  }
  context?.assertCurrent();
  return actor.update(update);
}

export function customAcModifiers(actor) {
  const source = actor._source?.system?.customModifiers?.ac ?? actor.system?.customModifiers?.ac ?? [];
  return Array.isArray(source) ? source.map(modifier => ({ slug: String(modifier.slug ?? ""), label: String(modifier.label ?? ""),
    value: Number(modifier.modifier) || 0, type: String(modifier.type ?? "untyped") })) : [];
}

export function editShield(actor, payload, context) {
  // Native character-sheet shield HP edits update the held Item, not the
  // Actor's prepared shield summary. Never redirect a stale modal to new gear.
  const item = actor.heldShield;
  if (!item || typeof payload.itemId !== "string" || item.id !== payload.itemId
    || actor.items?.get?.(item.id) !== item || typeof item.update !== "function") invalid();
  context?.assertCurrent();
  if (payload.operation === "repair") {
    const repair = globalThis.game?.pf2e?.actions?.repair;
    if (typeof repair !== "function") invalid();
    return repair({ actors: actor, item });
  }
  const hp = item.system?.hp;
  if (payload.operation !== "set-hp" || !hp || !Number.isSafeInteger(payload.value)
    || payload.value < 0 || payload.value > hp.max) invalid();
  if (payload.originalValue !== hp.value) fail("STALE_VALUE", "VEMOBILE.PF2E.Character.Shield.Changed", "Shield Hit Points changed. Reopen the editor and try again.");
  return item.update({ "system.hp.value": payload.value });
}

export function editAcModifier(actor, payload, context) {
  if (!["character", "npc"].includes(actor.type)) invalid();
  const current = customAcModifiers(actor);
  if (JSON.stringify(payload.originalModifiers) !== JSON.stringify(current)) {
    fail("STALE_VALUE", "VEMOBILE.PF2E.Character.ModifiersChanged", "Armor Class modifiers changed. Reopen the editor and try again.");
  }
  context?.assertCurrent();
  if (payload.operation === "remove") {
    if (typeof payload.slug !== "string" || !current.some(entry => entry.slug === payload.slug) || typeof actor.removeCustomModifier !== "function") invalid();
    return actor.removeCustomModifier("ac", payload.slug);
  }
  if (payload.operation !== "add" || typeof actor.addCustomModifier !== "function" || typeof payload.label !== "string"
    || !payload.label.trim() || payload.label.length > 100 || !Number.isSafeInteger(payload.value) || Math.abs(payload.value) > 999
    || !["circumstance", "item", "status", "untyped"].includes(payload.modifierType)) invalid();
  return actor.addCustomModifier("ac", payload.label.trim(), payload.value, payload.modifierType);
}
