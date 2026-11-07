// Resolve artwork from plain character records. The presenters own image loading.
import { HEADER_BANNERS } from "./header-banner-catalogue.mjs";
import { seededClassCandidate, seededHabitatCandidate } from "./seeded-class-banner.mjs";
import { customHeaderImagePath } from "./custom-header-image.mjs";

export const HEADER_ARTWORK_CHOICES = Object.freeze(["artwork", "automatic", "custom", "off"]);
export const DEFAULT_HEADER_ARTWORK = "artwork";
export const DEFAULT_HEADER_ARTWORK_OPACITY = 0.75;

// Match catalogue names consistently without changing their displayed spelling.
const key = (value) => String(value ?? "").trim().toLocaleLowerCase("en");
const byType = new Map(HEADER_BANNERS.filter((entry) => entry.kind === "creature-type").map((entry) => [key(entry.parentType), entry]));
const byClass = new Map(HEADER_BANNERS.filter((entry) => entry.kind === "class").map((entry) => [key(entry.label), entry]));
const speciesAliases = Object.freeze({ "high elf": "elf", "wood elf": "elf", "dark elf": "elf", drow: "elf", "hill dwarf": "dwarf", "mountain dwarf": "dwarf", "rock gnome": "gnome", "forest gnome": "gnome" });
const humanoidSpecies = new Set(["elf", "dwarf", "gnome", "human", "orc", "halfling", "dragonborn", "tiefling", "gnoll", "kobold", "lizardfolk", "sahuagin"]);
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

// Keep valid saved choices, including Automatic for Procedural SVG. Use Artwork for retired or missing values.
export function normalizedHeaderArtwork(value) {
  const choice = key(value);
  return HEADER_ARTWORK_CHOICES.includes(choice) ? choice : DEFAULT_HEADER_ARTWORK;
}

// Return ordered image candidates for the chosen preference; Off produces no image requests.
export function resolveHeaderBanner(actor, headerArtwork = DEFAULT_HEADER_ARTWORK, customHeader = null) {
  const choice = normalizedHeaderArtwork(headerArtwork);
  // User-wide Custom has priority only when explicitly selected. Empty paths
  // in either scope intentionally have no catalogue or other-scope fallback.
  if (choice === "custom") {
    const url = customHeaderImagePath(customHeader?.scope === "user" ? customHeader.image : actor?.header?.customImage);
    return Object.freeze({ choice, candidates: Object.freeze(url ? [Object.freeze({ id: "custom", url })] : []) });
  }
  const candidates = choice === "off" ? [] : automaticBanners(actor, { procedural: choice === "automatic" });
  return Object.freeze({ choice, candidates: Object.freeze(candidates) });
}

// Append stable heroic fallbacks after the actor's specific class, species or creature matches.
export function automaticBanners(actor, { procedural = true } = {}) {
  const matched = classifiedBanners(actor, procedural);
  return Object.freeze(appendHeroicFallback(actor, matched));
}

// Use class scenes or a general adventurer scene for PCs. NPCs start with their habitat in procedural mode.
function classifiedBanners(actor, procedural) {
  const classification = actor.header?.bannerClassification ?? {};
  const parentType = key(classification.parentType);
  const generic = byType.get(parentType);
  if (actor.type === "npc") {
    const tags = classification.tags ?? [];
    const exact = matchingTags(parentType, tags);
    const candidates = [...exact, ...(generic ? [generic] : [])];
    if (procedural) candidates.unshift(seededHabitatCandidate(parentType, actor.name) ?? seededHabitatCandidate("generic", actor.name));
    return candidates;
  }
  if (actor.type !== "character") return [];
  for (const entry of actor.classes ?? []) {
    const classId = key(entry.name);
    const matched = byClass.get(classId);
    if (matched) return [procedural ? seededClassCandidate(matched, classId, actor.name) : matched];
  }
  const species = normalizeBannerSpecies(actor.header?.bannerSpecies ?? actor.species, classification);
  const exact = matchingTags(species.parentType, species.tags);
  const candidates = [...exact, ...(generic ? [generic] : [])];
  if (procedural) candidates.unshift(seededHabitatCandidate("generic", actor.name));
  return candidates;
}

// Add each generic fallback once so a failed specific image still has somewhere to go.
function appendHeroicFallback(actor, candidates) {
  const existing = new Set(candidates.map((entry) => entry.id));
  const offset = stableHeroicOffset(actor);
  for (let index = 0; index < heroicPool.length; index += 1) {
    const candidate = heroicPool[(offset + index) % heroicPool.length];
    if (!existing.has(candidate.id)) candidates.push(candidate);
  }
  return candidates;
}

// Give each exact actor source a repeatable fallback rotation instead of changing artwork on every render.
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

// Match tags only inside their parent creature type and preserve the catalogue's priority order.
function matchingTags(parentType, tags = []) {
  // Catalogue source order remains the stable tie-break for multiple tags.
  return HEADER_BANNERS.filter((entry) => entry.kind === "creature-tag"
    && key(entry.parentType) === parentType && tags.some((tag) => key(tag) === key(entry.tag)));
}
