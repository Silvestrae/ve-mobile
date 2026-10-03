/** Presentation-only adapter to an injected native Foundry localizer. No loader,
 * dictionaries, settings reads or campaign-data rewriting live here. Callers
 * insert the result as text; HTML callers must escape their interpolation data. */
export function localizedText(localize, key, fallback = key, data) {
  // Resolve the template first and substitute exactly once. Calling native
  // format and then replacing again would rewrite braces in campaign names.
  const translated = localize?.(key, fallback);
  const text = translated && translated !== key ? translated : fallback;
  return data ? String(text).replace(/\{([^}]+)\}/gu, (token, name) => Object.hasOwn(data, name) ? String(data[name]) : token) : String(text);
}

// Thirty-six entries cover the six supported languages, number precisions and
// common native regional aliases. Bounded caches key on the actual language;
// a Foundry language reload cannot reuse a formatter from a different locale.
const numberFormats = new Map();
const dateFormats = new Map();
const pluralRules = new Map();
function formatter(cache, locale, Factory, options, variant = "") {
  const language = locale || "en";
  const key = `${language}|${variant}`;
  if (!cache.has(key)) {
    if (cache.size >= 36) cache.delete(cache.keys().next().value);
    let value;
    try { value = new Factory(language, options); }
    catch { value = new Factory("en", options); }
    cache.set(key, value);
  }
  return cache.get(key);
}
export function localizedNumber(value, locale = "en", fractionDigits = null) {
  const digits = Number.isInteger(fractionDigits) ? Math.min(20, Math.max(0, fractionDigits)) : null;
  return formatter(numberFormats, locale, Intl.NumberFormat, digits === null ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits }, digits ?? "default").format(value);
}
export function localizedDate(value, locale = "en") {
  return formatter(dateFormats, locale, Intl.DateTimeFormat, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

/** Select complete native dictionary messages; Foundry format does not parse ICU.
 * These six languages need one/other UI forms; other categories use Other. */
export function localizedCount(localize, key, { one, other }, count, locale = "en", data = {}) {
  const category = formatter(pluralRules, locale, Intl.PluralRules).select(count) === "one" ? "One" : "Other";
  return localizedText(localize, `${key}.${category}`, category === "One" ? one : other, { ...data, count: localizedNumber(count, locale) });
}
