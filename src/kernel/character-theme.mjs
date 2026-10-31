/**
 * Colour scheme choices are plain records so renderers can resolve them
 * without reaching into Foundry or a live document.
 */
import { normalizeCustomThemeColors } from "./custom-theme.mjs";
import { PF2E_CLASS_ACCENTS } from "./pf2e-class-appearance.mjs";

export const COLOR_SCHEME_CHOICES = Object.freeze(["class", "red", "neutral", "bestiary", "custom"]);

const COLOR_SCHEME_THEME_KEYS = Object.freeze({
  class: null,
  red: "red",
  neutral: "neutral",
  bestiary: "bestiary",
  custom: "custom"
});

const THEME_ACCENTS = Object.freeze({
  ...PF2E_CLASS_ACCENTS,
  neutral: Object.freeze({ deep: "#746348", bright: "#bea46f" }),
  red: Object.freeze({ deep: "#a60f2f", bright: "#cf2347" }),
  bestiary: Object.freeze({ deep: "#5b2025", bright: "#c57970" }),
  wizard: Object.freeze({ deep: "#3c5f9e", bright: "#668edb" }),
  sorcerer: Object.freeze({ deep: "#a844ba", bright: "#d866e6" }),
  cleric: Object.freeze({ deep: "#9e7b32", bright: "#e0ba63" }),
  paladin: Object.freeze({ deep: "#9e7b32", bright: "#e0ba63" }),
  druid: Object.freeze({ deep: "#5d8b2b", bright: "#8fbd52" }),
  ranger: Object.freeze({ deep: "#5d8b2b", bright: "#8fbd52" }),
  bard: Object.freeze({ deep: "#944c86", bright: "#cc6fbc" }),
  fighter: Object.freeze({ deep: "#4f7595", bright: "#7fa7c7" }),
  rogue: Object.freeze({ deep: "#67549a", bright: "#9b8ac7" }),
  barbarian: Object.freeze({ deep: "#9a3f25", bright: "#d26743" }),
  monk: Object.freeze({ deep: "#9b661e", bright: "#d49b45" }),
  warlock: Object.freeze({ deep: "#5e48a5", bright: "#8d72c9" }),
  artificer: Object.freeze({ deep: "#8c632a", bright: "#c79a55" }),
  psion: Object.freeze({ deep: "#5e51a9", bright: "#8e80dc" })
});

export function resolveCharacterTheme(classTheme = "neutral", colorScheme = "class") {
  const key = String(colorScheme ?? "class");
  if (key === "class") return String(classTheme || "neutral");
  return COLOR_SCHEME_THEME_KEYS[key] ?? "neutral";
}

export function resolveCharacterThemeProfile(classThemes = [], colorScheme = "class", customTheme = null) {
  const knownThemes = [...new Set(classThemes
    .map((theme) => String(theme ?? ""))
    .filter((theme) => THEME_ACCENTS[theme]))];
  const primary = resolveCharacterTheme(knownThemes[0] ?? "neutral", colorScheme);
  const blendThemes = colorScheme === "class" ? knownThemes : [primary];
  const colors = colorScheme === "custom" ? normalizeCustomThemeColors(customTheme) : null;
  const accents = colors ? [colors.primary, colors.secondary, colors.third ?? colors.primary].map(color => ({ deep: color, bright: color }))
    : (blendThemes.length ? blendThemes : [primary]).slice(0, 3).map((theme) => THEME_ACCENTS[theme]);
  const fallback = THEME_ACCENTS[primary] ?? THEME_ACCENTS.neutral;
  while (accents.length < 3) accents.push(accents[accents.length - 1] ?? fallback);
  return Object.freeze({
    theme: primary,
    multiclass: colorScheme === "class" && blendThemes.length > 1,
    accents: Object.freeze(accents.map((accent) => Object.freeze({ ...accent })))
  });
}
