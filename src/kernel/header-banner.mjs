import { HEADER_BANNERS, HEADER_BANNER_BY_ID } from "./header-banner-catalogue.mjs";

const key = (value) => String(value ?? "").trim().toLocaleLowerCase("en");
const byType = new Map(HEADER_BANNERS.filter((entry) => entry.kind === "creature-type").map((entry) => [key(entry.parentType), entry]));
const byClass = new Map(HEADER_BANNERS.filter((entry) => entry.kind === "class").map((entry) => [key(entry.label), entry]));
const speciesAliases = Object.freeze({ "high elf": "elf", "wood elf": "elf", "dark elf": "elf", drow: "elf", "hill dwarf": "dwarf", "mountain dwarf": "dwarf", "rock gnome": "gnome", "forest gnome": "gnome" });
const humanoidSpecies = new Set(["elf", "dwarf", "gnome", "human", "orc", "halfling", "dragonborn", "tiefling", "gnoll", "kobold", "lizardfolk", "sahuagin"]);
const heroicIds = Object.freeze({ heroic1: "heroic-starlit-legacy", heroic2: "heroic-stormbound-resolve", heroic3: "heroic-embers-of-victory", heroic4: "heroic-dawn-of-adventure" });
const heroicPool = Object.freeze(HEADER_BANNERS.filter((entry) => entry.kind === "heroic-general"));

/** D&D5e 5.3 uses {value, subtype}; older actors may retain a type string. */
export function normalizeBannerClassification(type) {
  let parentType = "";
  let rawTags = "";
  if (typeof type === "string") {
    const match = /^\s*([^()]+?)\s*(?:\(([^()]*)\))?\s*$/u.exec(type);
    if (match) [, parentType, rawTags = ""] = match;
  } else if (type && typeof type === "object") {
    parentType = String(type.value === "custom" ? type.custom ?? "" : type.value ?? "");
    rawTags = String(type.subtype ?? "");
  }
  const tags = rawTags.split(/[,;]+/u).map((tag) => key(tag)).filter(Boolean);
  return Object.freeze({ parentType: key(parentType), tags: Object.freeze(tags) });
}

/** Race Item and legacy details.race names share this one classification path. */
export function normalizeBannerSpecies(species, classification = {}) {
  const raw = typeof species === "string" ? species : species?.name ?? "";
  const name = key(raw);
  const tag = speciesAliases[name] ?? name;
  const parentType = key(classification.parentType) || (humanoidSpecies.has(tag) ? "humanoid" : "");
  return Object.freeze({ parentType, tags: Object.freeze(tag ? [tag] : []) });
}

export function normalizedHeaderArtwork(value) {
  const choice = key(value);
  return ["automatic", "race", "heroic1", "heroic2", "heroic3", "heroic4", "off"].includes(choice) ? choice : "automatic";
}

export function resolveHeaderBanner(actor, headerArtwork = "automatic") {
  const choice = normalizedHeaderArtwork(headerArtwork);
  const candidates = choice === "off" ? [] : heroicIds[choice]
    ? [HEADER_BANNER_BY_ID.get(heroicIds[choice])]
    : automaticBanners(actor, { ignoreClass: choice === "race" });
  return Object.freeze({ choice, candidates: Object.freeze(candidates) });
}

export function automaticBanners(actor, { ignoreClass = false } = {}) {
  const matched = classifiedBanners(actor, { ignoreClass });
  return Object.freeze(appendHeroicFallback(actor, matched));
}

function classifiedBanners(actor, { ignoreClass = false } = {}) {
  const classification = actor.header?.bannerClassification ?? {};
  const parentType = key(classification.parentType);
  const generic = byType.get(parentType);
  if (actor.type === "npc") {
    const tags = classification.tags ?? [];
    const exact = matchingTags(parentType, tags);
    return [...exact, ...(generic ? [generic] : [])];
  }
  if (actor.type !== "character") return [];
  if (!ignoreClass) {
    const matched = (actor.classes ?? []).map((entry) => byClass.get(key(entry.name))).find(Boolean);
    if (matched) return [matched];
  }
  const species = normalizeBannerSpecies(actor.header?.bannerSpecies ?? actor.species, classification);
  const exact = matchingTags(species.parentType, species.tags);
  return [...exact, ...(generic ? [generic] : [])];
}

function appendHeroicFallback(actor, candidates) {
  const existing = new Set(candidates.map((entry) => entry.id));
  const offset = stableHeroicOffset(actor);
  for (let index = 0; index < heroicPool.length; index += 1) {
    const candidate = heroicPool[(offset + index) % heroicPool.length];
    if (!existing.has(candidate.id)) candidates.push(candidate);
  }
  return candidates;
}

function stableHeroicOffset(actor) {
  // sourceUuid preserves token/synthetic provenance; id supports older plain records.
  const identity = String(actor?.sourceUuid ?? actor?.uuid ?? actor?.id ?? "");
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % heroicPool.length;
}

function matchingTags(parentType, tags = []) {
  // Catalogue source order remains the stable tie-break for multiple tags.
  return HEADER_BANNERS.filter((entry) => entry.kind === "creature-tag"
    && key(entry.parentType) === parentType && tags.some((tag) => key(tag) === key(entry.tag)));
}
