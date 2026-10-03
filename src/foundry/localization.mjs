import { localizedText } from "../ui/localized-text.mjs";

/** Narrow native translation access for Foundry-boundary messages. English is
 * only a pre-i18n fallback; language selection and dictionary fallback remain
 * owned by Foundry's Localization implementation. */
export function localizeFoundry(key, fallback = key, data) {
  const i18n = globalThis.game?.i18n;
  return localizedText(_key => i18n?.localize?.(_key), key, fallback, data);
}
