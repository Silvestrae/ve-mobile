import { localizedText } from "../../ui/localized-text.mjs";

const INVENTORY_CATEGORIES = Object.freeze([
  ["weapons", "Weapons", new Set(["weapon"])],
  ["equipment", "Equipment", new Set(["equipment"])],
  ["consumables", "Consumables", new Set(["consumable"])],
  ["tools", "Tools", new Set(["tool"])],
  ["containers", "Containers", new Set(["backpack", "container"])],
  ["loot", "Loot", new Set(["loot"])],
  ["other", "Other", new Set()]
]);

const CONTAINER_TYPES = new Set(["backpack", "container"]);
const SOURCE_TYPES = new Set(["background", "class", "race", "species", "subclass"]);
const FAVOURITE_INVENTORY_CATEGORIES = Object.freeze([
  ["weapons", "Weapons", "fa-swords", new Set(["weapon"])],
  ["equipment", "Equipment", "fa-shield", new Set(["equipment"])],
  ["consumables", "Consumables", "fa-flask", new Set(["consumable"])],
  ["tools", "Tools", "fa-screwdriver-wrench", new Set(["tool"])],
  ["containers", "Containers", "fa-backpack", new Set(["container", "backpack"])],
  ["loot", "Loot", "fa-coins", new Set(["loot"])]
]);
const FAVOURITE_FEATURE_TYPES = new Set(["feat", "class", "subclass", "background", "race", "species", "facility"]);

export function groupInventory(items = [], sortMode = "manual", localize = null) {
  const sourceOrder = new Map(items.map((item, index) => [item.id, index]));
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map();
  const contained = new Set();

  for (const item of items) {
    const parent = byId.get(item.containerId);
    if (!parent || parent.id === item.id || !CONTAINER_TYPES.has(parent.type)) continue;
    children.set(parent.id, [...(children.get(parent.id) ?? []), item]);
    contained.add(item.id);
  }

  const included = new Set();
  const grouped = new Map();
  const addRoot = (item) => {
    const category = categoryForItem(item);
    grouped.set(category[0], [...(grouped.get(category[0]) ?? []), inventoryNode(item, children, included, sourceOrder, sortMode, new Set())]);
  };

  for (const item of items) if (!contained.has(item.id)) addRoot(item);
  for (const item of items) if (!included.has(item.id)) addRoot(item);

  return INVENTORY_CATEGORIES.map(([key, fallback]) => ({
    key,
    label: collectionText(localize, `Inventory.${key}`, fallback),
    nodes: (grouped.get(key) ?? []).sort((first, second) => compareItems(first.item, second.item, sourceOrder, sortMode))
  })).filter((group) => group.nodes.length);
}

export function groupSpells(spells = [], sortMode = "manual", localize = null) {
  const sections = new Map();
  const sourceOrder = new Map(spells.map((spell, index) => [spell.id, index]));
  for (const [index, spell] of spells.entries()) {
    const source = spell.sourceItem;
    const method = spell.spellcastingMethod;
    const sourceName = String(source?.name ?? "").trim();
    const sourceType = String(source?.type ?? "").trim().toLowerCase();
    const isItemSpell = Boolean(sourceName && sourceType !== "class");
    const level = Math.max(0, Number(spell.level) || 0);
    const methodKey = String(method?.key ?? "other").trim().toLowerCase() || "other";
    const levelSection = !isItemSpell && ["spell", "spellcasting"].includes(methodKey);
    const key = isItemSpell ? `source:${source.id || `${sourceType}:${sourceName.toLowerCase()}`}` : levelSection ? `method:${methodKey}:level:${level}` : `method:${methodKey}`;
    const label = isItemSpell ? sourceName : levelSection ? (level === 0 ? collectionText(localize, "Spells.Cantrips", "Cantrips") : collectionText(localize, "Spells.Level", "Level {ordinal}", { ordinal: String(level) })) : String(method?.label ?? "").trim() || collectionText(localize, "Spells.Other", "Other Spells");
    const group = levelSection ? "spellcasting" : "other";
    const current = sections.get(key) ?? { key, label, group, level: levelSection ? level : undefined, order: isItemSpell ? 1000 : Number.isFinite(Number(method?.order)) ? Number(method.order) : 100, firstIndex: index, spells: [] };
    current.spells.push(spell);
    sections.set(key, current);
  }
  return Array.from(sections.values())
    .sort((first, second) => compareSpellSections(first, second, sortMode))
    .map((section) => ({ ...section, spells: [...section.spells].sort((first, second) => compareItems(first, second, sourceOrder, sortMode)) }));
}

export function isSpellUnprepared(spell) {
  return Boolean(spell?.preparationEligible && Number(spell.preparationState) === 0);
}

/** D&D5e spell availability: only preparation-eligible, currently
 * unprepared spells are excluded. Always-on methods and granted spells stay. */
export function filterSpellsByAvailability(spells = [], preparedOnly = false) {
  return preparedOnly ? spells.filter((spell) => !isSpellUnprepared(spell)) : spells;
}

export function groupFeatures(features = [], sortMode = "manual", localize = null) {
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  const sections = new Map();
  for (const feature of features) {
    let source = feature.sourceItem;
    if (source?.type === "subclass" && source.id) source = byId.get(source.id)?.sourceItem ?? source;
    if (!source?.name && SOURCE_TYPES.has(feature.type)) source = feature;
    const key = source?.name ? `source:${source.id || `${source.type}:${source.name}`}` : "source:other";
    const label = source?.name ? (source.type === "race" || source.type === "species" ? collectionText(localize, "Features.Species", "Species: {name}", { name: source.name }) : source.name) : collectionText(localize, "Features.Other", "Other Features");
    const current = sections.get(key) ?? { key, label, sourceType: source?.type ?? "other", features: [] };
    current.features.push(feature);
    sections.set(key, current);
  }
  const compareSections = sortMode === "alphabetical"
    ? (first, second) => first.label.localeCompare(second.label, undefined, { numeric: true, sensitivity: "base" })
      || sourcePriority(first.sourceType) - sourcePriority(second.sourceType)
    : (first, second) => sourcePriority(first.sourceType) - sourcePriority(second.sourceType)
      || first.label.localeCompare(second.label);
  const compareFeatures = sortMode === "alphabetical"
    ? (first, second) => first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: "base" }) || compareManual(first, second)
    : compareManual;
  return Array.from(sections.values())
    .sort(compareSections)
    .map((section) => ({ ...section, features: [...section.features].sort(compareFeatures) }));
}

/** Native NPC sheet groups by the first Activity activation, or passive. */
export function groupNpcFeatures(features = [], sortMode = "manual", localize = null) {
  const preferred = ["passive", "action", "bonus", "reaction", "legendary", "mythic", "lair"];
  const sections = new Map();
  for (const feature of features) {
    const key = String(feature.npcGroup || "passive");
    const label = String(feature.npcGroupLabel || (key === "passive" ? collectionText(localize, "Features.Other", "Features") : key));
    const section = sections.get(key) ?? { key: `npc:${key}`, label, features: [] };
    section.features.push(feature);
    sections.set(key, section);
  }
  const compare = sortMode === "alphabetical"
    ? (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) || compareManual(a, b)
    : compareManual;
  return [...sections.values()]
    .sort((a, b) => {
      const aKey = a.key.slice(4);
      const bKey = b.key.slice(4);
      const ai = preferred.indexOf(aKey);
      const bi = preferred.indexOf(bKey);
      return (ai < 0 ? preferred.length : ai) - (bi < 0 ? preferred.length : bi) || a.label.localeCompare(b.label);
    })
    .map((section) => ({ ...section, features: section.features.sort(compare) }));
}

export function groupFavourites(items = [], sortMode = "manual", resources = [], localize = null) {
  const compareManualFavourite = (first, second) => (Number(first.favouriteSort) || 0) - (Number(second.favouriteSort) || 0)
    || (Number(first.sort) || 0) - (Number(second.sort) || 0)
    || first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: "base" });
  const compare = sortMode === "alphabetical"
    ? (first, second) => first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: "base" }) || compareManualFavourite(first, second)
    : compareManualFavourite;
  const inventory = new Map(FAVOURITE_INVENTORY_CATEGORIES.map(([key]) => [key, []]));
  const abilities = [];
  const features = [];
  const spells = [];
  const other = [];
  for (const item of items) {
    const inventoryCategory = FAVOURITE_INVENTORY_CATEGORIES.find(([, , , types]) => types.has(item.type));
    if (inventoryCategory) inventory.get(inventoryCategory[0]).push(item);
    else if (item.type === "spell") spells.push(item);
    else if (hasUsableActivity(item)) abilities.push(item);
    else if (FAVOURITE_FEATURE_TYPES.has(item.type)) features.push(item);
    else other.push(item);
  }
  const sections = FAVOURITE_INVENTORY_CATEGORIES.map(([key, label, icon]) => favouriteSection(key, collectionText(localize, `Inventory.${key}`, label), icon, inventory.get(key), compare));
  sections.push(favouriteSection("abilities", collectionText(localize, "Favourites.Abilities", "Abilities"), "fa-bolt", abilities, compare));
  sections.push(favouriteSection("features", collectionText(localize, "Favourites.Features", "Features"), "fa-star", features, compare));
  sections.push(...favouriteSpellSections(spells, resources, compare, localize));
  sections.push(favouriteSection("other", collectionText(localize, "Inventory.other", "Other"), "fa-shapes", other, compare));
  return sections.filter((section) => section.items.length);
}

function favouriteSection(key, label, icon, items, compare, resource = null) {
  return Object.freeze({ key, label, icon, resource, items: Object.freeze([...items].sort(compare)) });
}

function collectionText(localize, key, fallback, data) {
  return localizedText(localize, `VEMOBILE.Character.Collections.${key}`, fallback, data);
}

function favouriteSpellSections(spells, resources, compare, localize) {
  const groups = new Map();
  const resourceById = new Map(resources.filter(exactSpellSlotResource).map((resource) => [resource.id, resource]));
  for (const spell of spells) {
    const level = Math.max(0, Math.trunc(Number(spell.level) || 0));
    const methodKey = String(spell.spellcastingMethod?.key ?? "").trim().toLowerCase();
    let key;
    let label;
    let icon = "fa-sparkles";
    let resource = null;
    if (methodKey === "pact") {
      const pactPool = resourceById.get("spell-slot:pact") ?? null;
      resource = !spell.linked && (!spell.sourceItem || spell.sourceItem.type === "class") ? pactPool : null;
      const pactLevel = Math.max(0, Math.trunc(Number(pactPool?.slotLevel) || 0));
      key = "spells:pact";
      label = pactLevel ? collectionText(localize, "Spells.PactLevel", "Pact Magic · Level {ordinal}", { ordinal: String(pactLevel) }) : collectionText(localize, "Spells.Pact", "Pact Magic");
      icon = "fa-moon-stars";
    } else if (!level) {
      key = "spells:cantrips";
      label = collectionText(localize, "Spells.Cantrips", "Cantrips");
    } else if (["spell", "spellcasting"].includes(methodKey) && !spell.linked && (!spell.sourceItem || spell.sourceItem.type === "class")) {
      key = `spells:level:${level}`;
      label = collectionText(localize, "Spells.Level", "Level {ordinal}", { ordinal: String(level) });
      resource = resourceById.get(`spell-slot:spell${level}`) ?? null;
    } else {
      key = `spells:method:${methodKey || "other"}:level:${level}`;
      const methodLabel = String(spell.spellcastingMethod?.label ?? "").trim() || collectionText(localize, "Spells.Other", "Other Spells");
      label = collectionText(localize, "Spells.MethodLevel", "{method} · Level {ordinal}", { method: methodLabel, ordinal: String(level) });
    }
    const current = groups.get(key) ?? { key, label, icon, resource, items: [] };
    if (!current.resource && resource) current.resource = resource;
    current.items.push(spell);
    groups.set(key, current);
  }
  return Array.from(groups.values())
    .sort(compareFavouriteSpellSections)
    .map((section) => favouriteSection(section.key, section.label, section.icon, section.items, compare, section.resource));
}

function compareFavouriteSpellSections(first, second) {
  const rank = (section) => section.key === "spells:cantrips" ? 0
    : section.key.startsWith("spells:level:") ? Number(section.key.split(":").at(-1))
      : section.key === "spells:pact" ? 20 : 30;
  return rank(first) - rank(second) || first.label.localeCompare(second.label, undefined, { numeric: true, sensitivity: "base" });
}

function exactSpellSlotResource(resource) {
  return resource?.kind === "spell-slot" && Number.isInteger(Number(resource.value))
    && Number.isInteger(Number(resource.max)) && Number(resource.max) > 0;
}

function hasUsableActivity(item) {
  return item?.usableActivity === true || (item?.usableActivity === undefined && Boolean(item?.activities?.length));
}

export function favouriteItemMetadata(item, localize = null) {
  const activity = (item.activityId ? item.activities?.find((candidate) => candidate.id === item.activityId) : null)
    ?? item.activities?.[0] ?? null;
  const detail = (label) => activity?.details?.find((entry) => (entry.key ?? entry.label) === label)?.value
    ?? item.details?.find((entry) => (entry.key ?? entry.label) === label)?.value
    ?? "";
  const actionUse = compactActionUse(activity?.activationType || item.activationType || (!activity?.id ? item.activation : ""), localize);
  const range = meaningfulMetadata(activity?.range || detail("Range") || item.range);
  const uses = meaningfulMetadata(activity?.uses || detail("Uses") || item.usesLabel || formatUses(item.uses));
  const columns = Object.freeze([
    Object.freeze({ key: "uses", label: localizedText(localize, "VEMOBILE.Character.Labels.Uses", "Uses"), value: uses }),
    Object.freeze({ key: "action-use", label: localizedText(localize, "VEMOBILE.Character.Labels.Actionuse", "Action use"), value: actionUse }),
    Object.freeze({ key: "range", label: localizedText(localize, "VEMOBILE.Character.Labels.Range", "Range"), value: range })
  ]);
  return Object.freeze({
    actionUse,
    range,
    uses,
    columns,
    values: Object.freeze(columns.filter((entry) => entry.value))
  });
}

export function compactActionUse(value, localize = null) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[._-]+/gu, " ");
  if (!normalized || /^(?:none|n\/a|special|varies?)$/u.test(normalized)) return "";
  if (/\bbonus(?:\s+action)?\b/u.test(normalized)) return localizedText(localize, "VEMOBILE.Character.Copy.BonusActionAbbreviation", "BA");
  if (/\breaction\b/u.test(normalized)) return localizedText(localize, "VEMOBILE.Character.Copy.ReactionAbbreviation", "R");
  if (/\baction\b/u.test(normalized)) return localizedText(localize, "VEMOBILE.Character.Copy.ActionAbbreviation", "A");
  return "";
}

function meaningfulMetadata(value) {
  const prepared = String(value ?? "").trim();
  if (!prepared || /^(?:-|—|none|n\/a|not applicable)$/iu.test(prepared)) return "";
  return prepared
    .replace(/\blong\s+rest\b/giu, "LR")
    .replace(/\bshort\s+rest\b/giu, "SR")
    .replace(/\s*\/\s*/gu, " / ");
}

function formatUses(uses) {
  if (!uses || !(Number(uses.max) > 0)) return "";
  return `${Math.max(0, Number(uses.value) || 0)} / ${Math.max(0, Number(uses.max) || 0)}`;
}

export function itemSubtitle(item) {
  if (item.type === "spell") {
    const preparation = item.preparationEligible || item.alwaysPrepared ? item.preparationStatus : "";
    return [preparation, item.castingTime || item.activation].filter(Boolean).join(" · ");
  }
  const parts = [];
  const type = item.typeLabel || titleCase(item.type);
  if (type) parts.push(type);
  return parts.join(" · ");
}

export function countInventoryContents(node) {
  return (node.children ?? []).reduce((count, child) => count + 1 + countInventoryContents(child), 0);
}

function inventoryNode(item, children, included, sourceOrder, sortMode, ancestors) {
  included.add(item.id);
  const nextAncestors = new Set(ancestors).add(item.id);
  const childNodes = (children.get(item.id) ?? [])
    .filter((child) => !nextAncestors.has(child.id))
    .sort((first, second) => Number(CONTAINER_TYPES.has(second.type)) - Number(CONTAINER_TYPES.has(first.type)) || compareItems(first, second, sourceOrder, sortMode))
    .map((child) => inventoryNode(child, children, included, sourceOrder, sortMode, nextAncestors));
  return { item, children: childNodes };
}

function categoryForItem(item) {
  return INVENTORY_CATEGORIES.find(([, , types]) => types.has(item.type)) ?? INVENTORY_CATEGORIES.at(-1);
}

function compareItems(first, second, sourceOrder, sortMode = "manual") {
  if (sortMode === "alphabetical") {
    return first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: "base" })
      || compareItems(first, second, sourceOrder, "manual");
  }
  return (Number(first.sort) || 0) - (Number(second.sort) || 0)
    || (sourceOrder.get(first.id) ?? Number.MAX_SAFE_INTEGER) - (sourceOrder.get(second.id) ?? Number.MAX_SAFE_INTEGER);
}

function compareSpellSections(first, second, sortMode) {
  const groupOrder = Number(first.group === "other") - Number(second.group === "other");
  if (groupOrder) return groupOrder;
  if (first.group === "spellcasting") {
    return first.level - second.level || first.order - second.order || first.firstIndex - second.firstIndex;
  }
  if (sortMode === "alphabetical") {
    return first.label.localeCompare(second.label, undefined, { numeric: true, sensitivity: "base" })
      || first.firstIndex - second.firstIndex;
  }
  return first.order - second.order || first.firstIndex - second.firstIndex;
}

function compareManual(first, second) {
  return (Number(first.sort) || 0) - (Number(second.sort) || 0) || first.name.localeCompare(second.name);
}

function sourcePriority(type) {
  if (type === "class" || type === "subclass") return -100;
  if (type === "race" || type === "species") return -90;
  if (type === "background") return -80;
  return 0;
}

function ordinal(value) {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function titleCase(value) {
  return String(value ?? "").replace(/[-_]+/gu, " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}
