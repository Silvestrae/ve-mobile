import { resolveHeaderBanner } from "./header-banner.mjs";

// Native class slugs select plain visual records shared by the adapter and renderer.
export const PF2E_CLASS_APPEARANCES = Object.freeze({
  alchemist: Object.freeze({ label: "Alchemist", themeKey: "pf2e-alchemist",
    accent: Object.freeze({ deep: "#567b2e", bright: "#a5c85a" }),
    banner: Object.freeze({ id: "pf2e-class-alchemist", kind: "class", label: "Alchemist",
      path: "pf2e/classes/alchemist.webp", url: new URL("../../assets/header-banners/pf2e/classes/alchemist.webp", import.meta.url).href }) }),
  animist: Object.freeze({ label: "Animist", themeKey: "pf2e-animist",
    accent: Object.freeze({ deep: "#357f79", bright: "#75c5b6" }),
    banner: Object.freeze({ id: "pf2e-class-animist", kind: "class", label: "Animist",
      path: "pf2e/classes/animist.webp", url: new URL("../../assets/header-banners/pf2e/classes/animist.webp", import.meta.url).href }) }),
  barbarian: Object.freeze({ label: "Barbarian", themeKey: "barbarian", bannerClassName: "Barbarian" }),
  bard: Object.freeze({ label: "Bard", themeKey: "bard", bannerClassName: "Bard" }),
  champion: Object.freeze({ label: "Champion", themeKey: "paladin", bannerClassName: "Paladin" }),
  cleric: Object.freeze({ label: "Cleric", themeKey: "cleric", bannerClassName: "Cleric" }),
  commander: Object.freeze({ label: "Commander", themeKey: "pf2e-commander",
    accent: Object.freeze({ deep: "#8f3e49", bright: "#d77c83" }),
    banner: Object.freeze({ id: "pf2e-class-commander", kind: "class", label: "Commander",
      path: "pf2e/classes/commander.webp", url: new URL("../../assets/header-banners/pf2e/classes/commander.webp", import.meta.url).href }) }),
  druid: Object.freeze({ label: "Druid", themeKey: "druid", bannerClassName: "Druid" }),
  exemplar: Object.freeze({ label: "Exemplar", themeKey: "pf2e-exemplar",
    accent: Object.freeze({ deep: "#ad7931", bright: "#efc56c" }),
    banner: Object.freeze({ id: "pf2e-class-exemplar", kind: "class", label: "Exemplar",
      path: "pf2e/classes/exemplar.webp", url: new URL("../../assets/header-banners/pf2e/classes/exemplar.webp", import.meta.url).href }) }),
  fighter: Object.freeze({ label: "Fighter", themeKey: "fighter", bannerClassName: "Fighter" }),
  guardian: Object.freeze({ label: "Guardian", themeKey: "pf2e-guardian",
    accent: Object.freeze({ deep: "#496b7b", bright: "#8eb5c6" }),
    banner: Object.freeze({ id: "pf2e-class-guardian", kind: "class", label: "Guardian",
      path: "pf2e/classes/guardian.webp", url: new URL("../../assets/header-banners/pf2e/classes/guardian.webp", import.meta.url).href }) }),
  gunslinger: Object.freeze({ label: "Gunslinger", themeKey: "pf2e-gunslinger",
    accent: Object.freeze({ deep: "#96613a", bright: "#d9a26a" }),
    banner: Object.freeze({ id: "pf2e-class-gunslinger", kind: "class", label: "Gunslinger",
      path: "pf2e/classes/gunslinger.webp", url: new URL("../../assets/header-banners/pf2e/classes/gunslinger.webp", import.meta.url).href }) }),
  inventor: Object.freeze({ label: "Inventor", themeKey: "pf2e-inventor",
    accent: Object.freeze({ deep: "#8e6332", bright: "#d4a15b" }),
    banner: Object.freeze({ id: "pf2e-class-inventor", kind: "class", label: "Inventor",
      path: "pf2e/classes/inventor.webp", url: new URL("../../assets/header-banners/pf2e/classes/inventor.webp", import.meta.url).href }) }),
  investigator: Object.freeze({ label: "Investigator", themeKey: "pf2e-investigator",
    accent: Object.freeze({ deep: "#497a7c", bright: "#80b7b7" }),
    banner: Object.freeze({ id: "pf2e-class-investigator", kind: "class", label: "Investigator",
      path: "pf2e/classes/investigator.webp", url: new URL("../../assets/header-banners/pf2e/classes/investigator.webp", import.meta.url).href }) }),
  kineticist: Object.freeze({ label: "Kineticist", themeKey: "pf2e-kineticist",
    accent: Object.freeze({ deep: "#387f92", bright: "#75c4d2" }),
    banner: Object.freeze({ id: "pf2e-class-kineticist", kind: "class", label: "Kineticist",
      path: "pf2e/classes/kineticist.webp", url: new URL("../../assets/header-banners/pf2e/classes/kineticist.webp", import.meta.url).href }) }),
  magus: Object.freeze({ label: "Magus", themeKey: "pf2e-magus",
    accent: Object.freeze({ deep: "#555da3", bright: "#959be0" }),
    banner: Object.freeze({ id: "pf2e-class-magus", kind: "class", label: "Magus",
      path: "pf2e/classes/magus.webp", url: new URL("../../assets/header-banners/pf2e/classes/magus.webp", import.meta.url).href }) }),
  monk: Object.freeze({ label: "Monk", themeKey: "monk", bannerClassName: "Monk" }),
  necromancer: Object.freeze({ label: "Necromancer", themeKey: "pf2e-necromancer",
    accent: Object.freeze({ deep: "#597e6a", bright: "#94bea5" }),
    banner: Object.freeze({ id: "pf2e-class-necromancer", kind: "class", label: "Necromancer",
      path: "pf2e/classes/necromancer.webp", url: new URL("../../assets/header-banners/pf2e/classes/necromancer.webp", import.meta.url).href }) }),
  oracle: Object.freeze({ label: "Oracle", themeKey: "pf2e-oracle",
    accent: Object.freeze({ deep: "#8b689f", bright: "#c8a0d8" }),
    banner: Object.freeze({ id: "pf2e-class-oracle", kind: "class", label: "Oracle",
      path: "pf2e/classes/oracle.webp", url: new URL("../../assets/header-banners/pf2e/classes/oracle.webp", import.meta.url).href }) }),
  psychic: Object.freeze({ label: "Psychic", themeKey: "pf2e-psychic",
    accent: Object.freeze({ deep: "#6653a8", bright: "#aa92df" }),
    banner: Object.freeze({ id: "pf2e-class-psychic", kind: "class", label: "Psychic",
      path: "pf2e/classes/psychic.webp", url: new URL("../../assets/header-banners/pf2e/classes/psychic.webp", import.meta.url).href }) }),
  ranger: Object.freeze({ label: "Ranger", themeKey: "ranger", bannerClassName: "Ranger" }),
  rogue: Object.freeze({ label: "Rogue", themeKey: "rogue", bannerClassName: "Rogue" }),
  runesmith: Object.freeze({ label: "Runesmith", themeKey: "pf2e-runesmith",
    accent: Object.freeze({ deep: "#a15c39", bright: "#e59b62" }),
    banner: Object.freeze({ id: "pf2e-class-runesmith", kind: "class", label: "Runesmith",
      path: "pf2e/classes/runesmith.webp", url: new URL("../../assets/header-banners/pf2e/classes/runesmith.webp", import.meta.url).href }) }),
  sorcerer: Object.freeze({ label: "Sorcerer", themeKey: "sorcerer", bannerClassName: "Sorcerer" }),
  summoner: Object.freeze({ label: "Summoner", themeKey: "pf2e-summoner",
    accent: Object.freeze({ deep: "#3f8d91", bright: "#81d4ce" }),
    banner: Object.freeze({ id: "pf2e-class-summoner", kind: "class", label: "Summoner",
      path: "pf2e/classes/summoner.webp", url: new URL("../../assets/header-banners/pf2e/classes/summoner.webp", import.meta.url).href }) }),
  swashbuckler: Object.freeze({ label: "Swashbuckler", themeKey: "pf2e-swashbuckler",
    accent: Object.freeze({ deep: "#aa5343", bright: "#e68d72" }),
    banner: Object.freeze({ id: "pf2e-class-swashbuckler", kind: "class", label: "Swashbuckler",
      path: "pf2e/classes/swashbuckler.webp", url: new URL("../../assets/header-banners/pf2e/classes/swashbuckler.webp", import.meta.url).href }) }),
  thaumaturge: Object.freeze({ label: "Thaumaturge", themeKey: "pf2e-thaumaturge",
    accent: Object.freeze({ deep: "#8a536c", bright: "#c991ab" }),
    banner: Object.freeze({ id: "pf2e-class-thaumaturge", kind: "class", label: "Thaumaturge",
      path: "pf2e/classes/thaumaturge.webp", url: new URL("../../assets/header-banners/pf2e/classes/thaumaturge.webp", import.meta.url).href }) }),
  witch: Object.freeze({ label: "Witch", themeKey: "pf2e-witch",
    accent: Object.freeze({ deep: "#6b5787", bright: "#b69aca" }),
    banner: Object.freeze({ id: "pf2e-class-witch", kind: "class", label: "Witch",
      path: "pf2e/classes/witch.webp", url: new URL("../../assets/header-banners/pf2e/classes/witch.webp", import.meta.url).href }) }),
  wizard: Object.freeze({ label: "Wizard", themeKey: "wizard", bannerClassName: "Wizard" }),
});

export const PF2E_CLASS_ACCENTS = Object.freeze(Object.fromEntries(
  Object.values(PF2E_CLASS_APPEARANCES).filter(entry => entry.accent).map(entry => [entry.themeKey, entry.accent])
));

export function pf2eClassThemeKey(slug) {
  return PF2E_CLASS_APPEARANCES[String(slug ?? "").toLowerCase()]?.themeKey ?? "neutral";
}

export function resolvePf2eHeaderBanner(actor, headerArtwork = "automatic") {
  const identity = actor?.pf2e?.identity ?? {};
  const appearance = PF2E_CLASS_APPEARANCES[String(identity.classSlug ?? "").toLowerCase()];
  const resolution = resolveHeaderBanner({
    ...actor,
    classes: appearance?.bannerClassName ? [{ name: appearance.bannerClassName }] : [],
    header: {
      ...(actor?.header ?? {}),
      bannerClassification: actor?.header?.bannerClassification ?? actor?.pf2e?.bannerClassification,
      bannerSpecies: identity.ancestrySlug ?? identity.ancestry
    }
  }, headerArtwork);
  if (actor?.type !== "character" || !appearance?.banner || resolution.choice !== "automatic") return resolution;
  return Object.freeze({ ...resolution, candidates: Object.freeze([appearance.banner, ...resolution.candidates]) });
}
