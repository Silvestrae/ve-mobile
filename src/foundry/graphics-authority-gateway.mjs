import { KEYS, MODULE_ID, normalizedMemoryProfile } from "./preferences.mjs";

export const GRAPHICS_KEYS = Object.freeze([
  "core.performanceMode", "core.maxFPS", "core.pixelRatioResolutionScaling", "core.mipmap", "core.lightAnimation"
]);
const GET_TARGET = "foundry.helpers.ClientSettings.prototype.get";

/** A page-scoped read authority, outside FCS's MIXED getter. Never wraps set,
 * registers mirror settings, edits FCS policy, or relies on its unlock map. */
export function createGraphicsAuthority({
  getGame = () => globalThis.game,
  getLibWrapper = () => globalThis.libWrapper,
  isMobileAuthorityActive = () => true,
  resolveTargets,
  createSetting = (key, value) => new globalThis.foundry.documents.Setting({ key, value: JSON.stringify(value) })
} = {}) {
  let installed = false;
  let bypassDepth = 0;
  const read = (ns, key) => getGame()?.settings?.get?.(ns, key);
  const enabled = () => Boolean(getGame()?.modules?.get?.("force-client-settings")?.active)
    && read(MODULE_ID, KEYS.FCS_AUTO_SOFT_OVERRIDE) !== false;
  function wrapper(wrapped, namespace, key, options, ...args) {
    const result = wrapped(namespace, key, options, ...args);
    const compound = `${namespace}.${key}`;
    if (bypassDepth || !GRAPHICS_KEYS.includes(compound) || !isMobileAuthorityActive() || !enabled()) return result;
    const profile = normalizedMemoryProfile(read(MODULE_ID, KEYS.MEMORY_PROTECTION_PROFILE), read(MODULE_ID, KEYS.LOW_MEMORY_CANVAS));
    if (profile === "normal") return result;
    const current = options?.document ? result?.value : result;
    const baseline = read(MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT)?.original ?? { [compound]: current };
    const target = resolveTargets(profile, baseline)[compound];
    const conservative = typeof target === "boolean"
      ? current === target
      : typeof target === "number"
      ? typeof current === "number" && Number.isFinite(current) && current <= target
      : current === target;
    if (conservative) return result;
    return options?.document ? createSetting(compound, target) : target;
  }
  return Object.freeze({
    get installed() { return installed; },
    enabled,
    install(scope) {
      if (installed) return true;
      const lib = getLibWrapper();
      if (!lib?.register) return false;
      // libWrapper sorts WRAPPER before MIXED, then by package priority.
      // Always invoke the chain, including FCS, before narrowing its result.
      const id = lib.register(MODULE_ID, GET_TARGET, wrapper, "WRAPPER");
      installed = true;
      scope.own(() => { lib.unregister(MODULE_ID, id ?? GET_TARGET); installed = false; });
      return true;
    },
    readUnderlying(namespace, key) {
      bypassDepth += 1;
      try { return read(namespace, key); }
      finally { bypassDepth -= 1; }
    }
  });
}
