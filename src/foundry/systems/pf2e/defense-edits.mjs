import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

const dictionaries = Object.freeze({ immunities: "immunityTypes", weaknesses: "weaknessTypes", resistances: "resistanceTypes" });
const invalid = () => { throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.PF2E.InvalidInput", "This PF2e action is invalid or has changed. Refresh and try again.")); };
const sourceRows = (actor, category) => actor._source?.system?.attributes?.[category] ?? [];
const typesFor = category => Object.entries(globalThis.CONFIG?.PF2E?.[dictionaries[category]] ?? {}).filter(([type]) => type !== "custom");
const tags = value => Array.isArray(value) ? value.filter(entry => typeof entry === "string") : [];
function entriesFor(actor, category) {
  const allowed = new Set(typesFor(category).map(([type]) => type));
  return Array.from(sourceRows(actor, category)).map((entry, sourceIndex) => ({ sourceIndex, type: String(entry.type ?? ""), ...(typeof entry.label === "string" ? { label: entry.label } : {}),
    value: category === "immunities" || !Number.isFinite(Number(entry.value)) ? null : Number(entry.value), exceptions: tags(entry.exceptions), doubleVs: tags(entry.doubleVs), editable: allowed.has(entry.type) }));
}

export function defenseEditorRecord(actor) {
  const categories = Object.keys(dictionaries);
  return {
    types: Object.fromEntries(categories.map(category => [category, typesFor(category).map(([value, label]) => ({ value, label: localizeFoundry(label, label) }))])),
    entries: Object.fromEntries(categories.map(category => [category, entriesFor(actor, category)])),
    derived: Object.fromEntries(categories.map(category => [category, Array.from(actor.attributes?.[category] ?? actor.system?.attributes?.[category] ?? [])
      .filter(entry => entry.source).map(entry => ({ label: String(entry.label ?? entry.type ?? ""), source: String(entry.source) }))]))
  };
}

export function editDefenses(actor, payload, context) {
  if (!["character", "npc", "hazard", "vehicle"].includes(actor.type) || typeof actor.update !== "function" || !Object.hasOwn(dictionaries, payload.category)) invalid();
  const category = payload.category;
  const current = entriesFor(actor, category);
  if (JSON.stringify(current) !== JSON.stringify(payload.originalEntries)) throw new CommandError("STALE_VALUE", localizeFoundry("VEMOBILE.PF2E.Character.Defenses.Changed", "Defences changed. Reopen the editor and try again."));
  if (!Array.isArray(payload.values) || payload.values.length > 128) invalid();
  const allowed = new Set(typesFor(category).map(([type]) => type));
  const used = new Set();
  const wire = ({ sourceIndex, type, value, exceptions, doubleVs }) => ({ sourceIndex, type, value, exceptions, doubleVs });
  const normalized = payload.values.map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).some(key => !["sourceIndex", "type", "value", "exceptions", "doubleVs"].includes(key))) invalid();
    const index = entry.sourceIndex;
    if (index !== null && (!Number.isInteger(index) || index < 0 || index >= current.length || used.has(index))) invalid();
    if (index !== null) used.add(index);
    const prior = index === null ? null : current[index];
    const raw = index === null ? {} : sourceRows(actor, category)[index];
    // Custom/manual entries outside the native picker's types remain intact.
    if (prior && !prior.editable) { if (JSON.stringify(wire(entry)) !== JSON.stringify(wire(prior))) invalid(); return { ...raw }; }
    if (typeof entry.type !== "string" || !allowed.has(entry.type)) invalid();
    for (const field of ["exceptions", "doubleVs"]) {
      const list = entry[field];
      if (!Array.isArray(list) || list.length > Math.max(6, prior?.[field]?.length ?? 0)
        || list.some(value => typeof value !== "string" || (!allowed.has(value) && !prior?.[field]?.includes(value)))) invalid();
    }
    if (category !== "resistances" && entry.doubleVs.length) invalid();
    if (category === "immunities" ? entry.value !== null : !Number.isSafeInteger(entry.value) || entry.value < 1 || entry.value > 999999) invalid();
    const result = { ...raw, type: entry.type, exceptions: [...entry.exceptions] };
    if (category !== "immunities") result.value = entry.value;
    if (category === "resistances") result.doubleVs = [...entry.doubleVs];
    return result;
  });
  if (current.some(entry => !entry.editable && !used.has(entry.sourceIndex))) invalid();
  context?.assertCurrent();
  // Match PF2e's IWREditor: update only manually stored rows. Prepared rows
  // supplied by rules/effects are never copied into the Actor's source arrays.
  return actor.update({ [`system.attributes.${category}`]: normalized });
}
