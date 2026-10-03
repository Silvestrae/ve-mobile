import { localizeFoundry } from "./localization.mjs";
// Foundry 13 client settings use this public storage adapter. Restoration must
// never enter a forced ClientSettings#set: FCS can turn it into a WORLD write.
const OWNED_SETTINGS = new Set(["core.performanceMode", "core.maxFPS", "core.pixelRatioResolutionScaling", "core.mipmap", "core.lightAnimation", "core.noCanvas", "core.uiConfig"]);

export function readLocalSetting(game, key) {
  const config = game?.settings?.settings?.get?.(key);
  const storage = game?.settings?.storage?.get?.("client");
  if (storage && config?.scope === "client") {
    const raw = storage.getItem(key);
    const Setting = globalThis.foundry?.documents?.Setting;
    if (typeof Setting === "function") return new Setting({ key, value: raw ?? config.default }).value;
    return raw === null || raw === undefined ? structuredClone(config.default) : JSON.parse(raw);
  }
  const [namespace, name] = key.split(".");
  return game?.settings?.get?.(namespace, name);
}

export async function restoreLocalSetting(game, key, value, { notify = true } = {}) {
  if (!OWNED_SETTINGS.has(key)) throw new Error(localizeFoundry("VEMOBILE.Interface.ClientSettingRestoration.UnownedRestorationSetting", "Unowned restoration setting: {key}", { key: (key) }));
  const config = game?.settings?.settings?.get?.(key);
  const storage = game?.settings?.storage?.get?.("client");
  const [namespace, name] = key.split(".");
  if (!storage || config?.scope !== "client") {
    // Older adapters may use the ordinary native route only for unforced keys.
    if (config?.scope && config.scope !== "client") throw new Error(localizeFoundry("VEMOBILE.Interface.ClientSettingRestoration.NonClientRestorationSetting", "Non-client restoration setting: {key}", { key: (key) }));
    if (game?.modules?.get?.("force-client-settings")?.active && game.settings.get("force-client-settings", "forced")?.[key]) throw new Error(localizeFoundry("VEMOBILE.Interface.ClientSettingRestoration.ClientLocalRestorationUnavailableFor", "Client-local restoration unavailable for {key}", { key: (key) }));
    await game.settings.set(namespace, name, value);
  } else {
    const cleaned = typeof config.type?.clean === "function" ? config.type.clean(structuredClone(value)) : value;
    const invalid = config.type?.validate?.(cleaned, { fallback: false });
    if (invalid) throw invalid.asError?.() ?? new Error(localizeFoundry("VEMOBILE.Interface.ClientSettingRestoration.InvalidCapturedValueFor", "Invalid captured value for {key}", { key: (key) }));
    const json = JSON.stringify(cleaned);
    if (json === undefined) throw new Error(localizeFoundry("VEMOBILE.Interface.ClientSettingRestoration.MissingCapturedValueFor", "Missing captured value for {key}", { key: (key) }));
    storage.setItem(key, json);
    if (notify) {
      // Honour current effective FCS policy in live callbacks. The restored
      // local preference remains latent while the administrator's lock applies.
      const effective = game.settings.get(namespace, name);
      config.onChange?.(effective, {});
      globalThis.Hooks?.callAll?.("clientSettingChanged", key, effective, {});
    }
  }
  if (JSON.stringify(readLocalSetting(game, key)) !== JSON.stringify(value)) throw new Error(localizeFoundry("VEMOBILE.Interface.ClientSettingRestoration.RestorationVerificationFailedFor", "Restoration verification failed for {key}", { key: (key) }));
  return value;
}
