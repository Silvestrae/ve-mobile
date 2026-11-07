import { PF2E_CLASS_BANNERS } from "./header-banner-catalogue.mjs";
import { DEFAULT_HEADER_ARTWORK, normalizedHeaderArtwork, resolveHeaderBanner } from "./header-banner.mjs";
import { seededClassCandidate } from "./seeded-class-banner.mjs";

// Native class slugs select plain visual records shared by the adapter and renderer.
export const PF2E_CLASS_APPEARANCES = Object.freeze({
  alchemist: Object.freeze({ label: "Alchemist", themeKey: "pf2e-alchemist",
    accent: Object.freeze({ deep: "#567b2e", bright: "#a5c85a" }), banner: PF2E_CLASS_BANNERS.alchemist }),
  animist: Object.freeze({ label: "Animist", themeKey: "pf2e-animist",
    accent: Object.freeze({ deep: "#357f79", bright: "#75c5b6" }), banner: PF2E_CLASS_BANNERS.animist }),
  barbarian: Object.freeze({ label: "Barbarian", themeKey: "barbarian", bannerClassName: "Barbarian", banner: PF2E_CLASS_BANNERS.barbarian }),
  bard: Object.freeze({ label: "Bard", themeKey: "bard", bannerClassName: "Bard", banner: PF2E_CLASS_BANNERS.bard }),
  champion: Object.freeze({ label: "Champion", themeKey: "paladin", bannerClassName: "Paladin", banner: PF2E_CLASS_BANNERS.champion }),
  cleric: Object.freeze({ label: "Cleric", themeKey: "cleric", bannerClassName: "Cleric", banner: PF2E_CLASS_BANNERS.cleric }),
  commander: Object.freeze({ label: "Commander", themeKey: "pf2e-commander",
    accent: Object.freeze({ deep: "#8f3e49", bright: "#d77c83" }), banner: PF2E_CLASS_BANNERS.commander }),
  druid: Object.freeze({ label: "Druid", themeKey: "druid", bannerClassName: "Druid", banner: PF2E_CLASS_BANNERS.druid }),
  exemplar: Object.freeze({ label: "Exemplar", themeKey: "pf2e-exemplar",
    accent: Object.freeze({ deep: "#ad7931", bright: "#efc56c" }), banner: PF2E_CLASS_BANNERS.exemplar }),
  fighter: Object.freeze({ label: "Fighter", themeKey: "fighter", bannerClassName: "Fighter", banner: PF2E_CLASS_BANNERS.fighter }),
  guardian: Object.freeze({ label: "Guardian", themeKey: "pf2e-guardian",
    accent: Object.freeze({ deep: "#496b7b", bright: "#8eb5c6" }), banner: PF2E_CLASS_BANNERS.guardian }),
  gunslinger: Object.freeze({ label: "Gunslinger", themeKey: "pf2e-gunslinger",
    accent: Object.freeze({ deep: "#96613a", bright: "#d9a26a" }), banner: PF2E_CLASS_BANNERS.gunslinger }),
  inventor: Object.freeze({ label: "Inventor", themeKey: "pf2e-inventor",
    accent: Object.freeze({ deep: "#8e6332", bright: "#d4a15b" }), banner: PF2E_CLASS_BANNERS.inventor }),
  investigator: Object.freeze({ label: "Investigator", themeKey: "pf2e-investigator",
    accent: Object.freeze({ deep: "#497a7c", bright: "#80b7b7" }), banner: PF2E_CLASS_BANNERS.investigator }),
  kineticist: Object.freeze({ label: "Kineticist", themeKey: "pf2e-kineticist",
    accent: Object.freeze({ deep: "#387f92", bright: "#75c4d2" }), banner: PF2E_CLASS_BANNERS.kineticist }),
  magus: Object.freeze({ label: "Magus", themeKey: "pf2e-magus",
    accent: Object.freeze({ deep: "#555da3", bright: "#959be0" }), banner: PF2E_CLASS_BANNERS.magus }),
  monk: Object.freeze({ label: "Monk", themeKey: "monk", bannerClassName: "Monk", banner: PF2E_CLASS_BANNERS.monk }),
  necromancer: Object.freeze({ label: "Necromancer", themeKey: "pf2e-necromancer",
    accent: Object.freeze({ deep: "#597e6a", bright: "#94bea5" }), banner: PF2E_CLASS_BANNERS.necromancer }),
  oracle: Object.freeze({ label: "Oracle", themeKey: "pf2e-oracle",
    accent: Object.freeze({ deep: "#8b689f", bright: "#c8a0d8" }), banner: PF2E_CLASS_BANNERS.oracle }),
  psychic: Object.freeze({ label: "Psychic", themeKey: "pf2e-psychic",
    accent: Object.freeze({ deep: "#6653a8", bright: "#aa92df" }), banner: PF2E_CLASS_BANNERS.psychic }),
  ranger: Object.freeze({ label: "Ranger", themeKey: "ranger", bannerClassName: "Ranger", banner: PF2E_CLASS_BANNERS.ranger }),
  rogue: Object.freeze({ label: "Rogue", themeKey: "rogue", bannerClassName: "Rogue", banner: PF2E_CLASS_BANNERS.rogue }),
  runesmith: Object.freeze({ label: "Runesmith", themeKey: "pf2e-runesmith",
    accent: Object.freeze({ deep: "#a15c39", bright: "#e59b62" }), banner: PF2E_CLASS_BANNERS.runesmith }),
  sorcerer: Object.freeze({ label: "Sorcerer", themeKey: "sorcerer", bannerClassName: "Sorcerer", banner: PF2E_CLASS_BANNERS.sorcerer }),
  summoner: Object.freeze({ label: "Summoner", themeKey: "pf2e-summoner",
    accent: Object.freeze({ deep: "#3f8d91", bright: "#81d4ce" }), banner: PF2E_CLASS_BANNERS.summoner }),
  swashbuckler: Object.freeze({ label: "Swashbuckler", themeKey: "pf2e-swashbuckler",
    accent: Object.freeze({ deep: "#aa5343", bright: "#e68d72" }), banner: PF2E_CLASS_BANNERS.swashbuckler }),
  thaumaturge: Object.freeze({ label: "Thaumaturge", themeKey: "pf2e-thaumaturge",
    accent: Object.freeze({ deep: "#8a536c", bright: "#c991ab" }), banner: PF2E_CLASS_BANNERS.thaumaturge }),
  witch: Object.freeze({ label: "Witch", themeKey: "pf2e-witch",
    accent: Object.freeze({ deep: "#6b5787", bright: "#b69aca" }), banner: PF2E_CLASS_BANNERS.witch }),
  wizard: Object.freeze({ label: "Wizard", themeKey: "wizard", bannerClassName: "Wizard", banner: PF2E_CLASS_BANNERS.wizard }),
});

export const PF2E_CLASS_ACCENTS = Object.freeze(Object.fromEntries(
  Object.values(PF2E_CLASS_APPEARANCES).filter(entry => entry.accent).map(entry => [entry.themeKey, entry.accent])
));

// Resolve a native class slug to VE's own theme, using the neutral fallback for an unknown class.
export function pf2eClassThemeKey(slug) {
  return PF2E_CLASS_APPEARANCES[String(slug ?? "").toLowerCase()]?.themeKey ?? "neutral";
}

// Select native PF2e class artwork and share the other artwork modes and fallbacks.
export function resolvePf2eHeaderBanner(actor, headerArtwork = DEFAULT_HEADER_ARTWORK, customHeader = null) {
  const identity = actor?.pf2e?.identity ?? {};
  const classSlug = String(identity.classSlug ?? "").toLowerCase();
  const appearance = PF2E_CLASS_APPEARANCES[classSlug];
  const choice = normalizedHeaderArtwork(headerArtwork);
  const classBanner = actor?.type === "character" ? appearance?.banner : null;
  // Build the approved fallback list without generating a D&D scene for a shared class.
  const sharedChoice = classBanner && choice === "automatic" ? "artwork" : choice;
  const resolution = resolveHeaderBanner({
    ...actor,
    classes: appearance?.bannerClassName ? [{ name: appearance.bannerClassName }] : [],
    header: {
      ...(actor?.header ?? {}),
      bannerClassification: actor?.header?.bannerClassification ?? actor?.pf2e?.bannerClassification,
      bannerSpecies: identity.ancestrySlug ?? identity.ancestry
    }
  }, sharedChoice, customHeader);
  if (!classBanner || (choice !== "artwork" && choice !== "automatic")) return resolution;
  // Shared classes already have a D&D image in the first slot. Use the PF2e framing and keep the remaining choices.
  const fallbacks = appearance.bannerClassName ? resolution.candidates.slice(1) : resolution.candidates;
  const banner = choice === "automatic" ? seededClassCandidate(classBanner, classSlug, actor.name) : classBanner;
  return Object.freeze({ choice, candidates: Object.freeze([banner, ...fallbacks]) });
}
