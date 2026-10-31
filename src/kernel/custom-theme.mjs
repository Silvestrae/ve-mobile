/** Pure colour records. Only six-digit hex colours cross the CSS boundary. */
export const CUSTOM_THEME_DEFAULTS = Object.freeze({ primary: "#ff4fa3", secondary: "#ffd6e7", third: "#ff8fc4" });

export function normalizeThemeColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value.trim()) ? value.trim().toLowerCase() : null;
}

export function normalizeCustomThemeColors(value) {
  return Object.freeze({
    primary: normalizeThemeColor(value?.primary) ?? CUSTOM_THEME_DEFAULTS.primary,
    secondary: normalizeThemeColor(value?.secondary) ?? CUSTOM_THEME_DEFAULTS.secondary,
    third: value?.third == null ? null : normalizeThemeColor(value.third) ?? CUSTOM_THEME_DEFAULTS.third
  });
}

export function colorContrast(first, second) {
  const luminance = color => channels(color).map(value => value / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function deriveCustomThemePalette(colors, appearance = "dark") {
  const { primary, secondary, third } = normalizeCustomThemeColors(colors);
  const dark = appearance !== "light";
  const neutral = dark ? "#111111" : "#ffffff";
  const background = mix(secondary, neutral, dark ? 0.94 : 0.68);
  const surface = mix(secondary, neutral, dark ? 0.88 : 0.86);
  const raised = mix(secondary, neutral, dark ? 0.81 : 0.56);
  const surfaces = [background, surface, raised];
  const text = dark ? "#fafafa" : "#171717";
  const highlight = third ?? mix(primary, secondary, 0.5);
  return Object.freeze({
    accent: primary, highlight,
    accentInk: readable(primary, surfaces),
    highlightInk: readable(highlight, surfaces),
    accentText: colorContrast(primary, "#000000") >= colorContrast(primary, "#ffffff") ? "#000000" : "#ffffff",
    background, surface, raised, text,
    subtle: readable(dark ? "#bdbdbd" : "#626262", surfaces),
    border: readable(mix(secondary, text, 0.28), surfaces, 3)
  });
}

/** One frame owns one entry. Only the three colour values and appearance
 * invalidate it; unrelated renders reuse its immutable record. */
export function createCustomThemePaletteResolver() {
  let previousKey = null, previousPalette = null;
  return Object.freeze({
    resolve(colors, appearance) {
      const value = normalizeCustomThemeColors(colors);
      const key = `${appearance === "light" ? "light" : "dark"}:${value.primary}:${value.secondary}:${value.third}`;
      if (key !== previousKey) {
        previousPalette = deriveCustomThemePalette(value, appearance);
        previousKey = key;
      }
      return previousPalette;
    },
    clear() { previousKey = null; previousPalette = null; }
  });
}

function channels(color) {
  return [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16));
}

function mix(first, second, amount) {
  const a = channels(first), b = channels(second);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function readable(color, surfaces, minimum = 4.5) {
  const contrast = candidate => Math.min(...surfaces.map(surface => colorContrast(candidate, surface)));
  if (contrast(color) >= minimum) return color;
  const endpoint = contrast("#000000") >= contrast("#ffffff") ? "#000000" : "#ffffff";
  let low = 0, high = 1;
  for (let attempt = 0; attempt < 16; attempt++) {
    const middle = (low + high) / 2;
    if (contrast(mix(color, endpoint, middle)) >= minimum) high = middle;
    else low = middle;
  }
  const result = mix(color, endpoint, high);
  return contrast(result) >= minimum ? result : endpoint;
}
