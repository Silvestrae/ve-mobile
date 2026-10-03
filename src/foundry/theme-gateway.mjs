import { KEYS, MODULE_ID } from "./preferences.mjs";
import { readLocalSetting, restoreLocalSetting } from "./client-setting-restoration.mjs";

const CORE_THEME_SETTING = "core.uiConfig";

/**
 * Synchronize VE Mobile with Foundry v13's Interface Theme.
 *
 * A direct VE choice intentionally sets both native themes. A native change
 * only flows from Interface Theme back into VE, leaving Application Theme as
 * an independent Foundry control.
 */
export function createFoundryThemeGateway({
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document
} = {}) {
  let knownConfig = null;
  let ignoredCoreFingerprint = "";
  let ignoredMobileTheme = "";
  let readMobileTheme = () => "";
  let setMobileTheme = async () => {};
  let queue = Promise.resolve();
  let started = false;

  const enqueue = (action) => {
    queue = queue.then(action).catch((error) => {
      console.warn("VE Mobile | Unified theme could not be saved", error);
    });
    return queue;
  };

  const applyMobileTheme = (theme, config = readCoreConfig(getGame())) => {
    const game = getGame();
    if (!game?.settings?.get || typeof game.configureUI !== "function") return false;
    const next = unifiedConfig(config, theme);
    if (!themesMatch(config, theme)) game.configureUI(next);
    updateHostedSurfaces(getDocument(), theme);
    return true;
  };

  const persistCore = async (theme) => {
    const game = getGame();
    if (!game?.settings?.get || !game.settings.set) return false;
    const current = readCoreConfig(game);
    const next = unifiedConfig(current, theme);
    knownConfig = next;
    applyMobileTheme(theme, current);
    if (themesMatch(current, theme)) return true;
    ignoredCoreFingerprint = configFingerprint(next);
    await restoreLocalSetting(game, CORE_THEME_SETTING, next);
    return true;
  };

  const acceptFoundryChange = (value) => enqueue(async () => {
    const next = copyUiConfig(value);
    const fingerprint = configFingerprint(next);
    const previousInterfaceChoice = knownConfig?.colorScheme?.interface;
    const interfaceChoice = next?.colorScheme?.interface;
    const interfaceTheme = readInterfaceTheme(next) ?? readInterfaceDocumentTheme(getDocument());
    knownConfig = next;
    if (fingerprint === ignoredCoreFingerprint) {
      ignoredCoreFingerprint = "";
      return;
    }
    // Foundry's Application Theme is deliberately independent. Only a native
    // Interface Theme change transfers back to VE Mobile.
    if (interfaceChoice === previousInterfaceChoice || readMobileTheme() === interfaceTheme) return;
    ignoredMobileTheme = interfaceTheme;
    updateHostedSurfaces(getDocument(), interfaceTheme);
    await setMobileTheme(interfaceTheme);
  });

  return Object.freeze({
    async beginMobileSession({ fresh = true, entryToken = "" } = {}) {
      const game = getGame();
      const saved = game?.settings?.get?.(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT);
      if (saved?.captured === true) return false;
      await game?.settings?.set?.(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT, {
        captured: true,
        original: copyUiConfig(readLocalSetting(game, CORE_THEME_SETTING)),
        entryToken: String(entryToken).slice(0, 120)
      });
      return true;
    },
    async restoreForDesktop({ notify = true } = {}) {
      await queue;
      const game = getGame();
      const saved = game?.settings?.get?.(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT);
      if (saved?.captured !== true) return false;
      const original = copyUiConfig(saved.original);
      if (configFingerprint(readLocalSetting(game, CORE_THEME_SETTING)) !== configFingerprint(original)) {
        await restoreLocalSetting(game, CORE_THEME_SETTING, original, { notify });
      }
      await game.settings.set(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT, {});
      return true;
    },
    /** Foundry's Interface Theme resolves any pre-existing mismatch once. */
    start(scope, { readTheme, setTheme } = {}) {
      if (started || !scope?.hook || typeof readTheme !== "function" || typeof setTheme !== "function") return false;
      started = true;
      readMobileTheme = readTheme;
      setMobileTheme = setTheme;
      knownConfig = readCoreConfig(getGame());
      scope.hook("clientSettingChanged", (key, value) => {
        if (key === CORE_THEME_SETTING) void acceptFoundryChange(value);
      });
      scope.own?.(() => {
        started = false;
        readMobileTheme = () => "";
        setMobileTheme = async () => {};
      });
      const theme = readInterfaceTheme(knownConfig) ?? readInterfaceDocumentTheme(getDocument());
      updateHostedSurfaces(getDocument(), theme);
      if (readMobileTheme() !== theme) {
        ignoredMobileTheme = theme;
        void enqueue(() => setMobileTheme(theme));
      }
      return true;
    },

    /** A direct VE change makes both Foundry theme controls match it. */
    sync(requested) {
      const theme = normalizedTheme(requested) ?? "dark";
      if (ignoredMobileTheme === theme) {
        ignoredMobileTheme = "";
        updateHostedSurfaces(getDocument(), theme);
        return true;
      }
      applyMobileTheme(theme);
      void enqueue(() => persistCore(theme));
      return true;
    },

    applicationTheme() {
      return readApplicationTheme(readCoreConfig(getGame())) ?? readApplicationDocumentTheme(getDocument());
    },

    whenIdle() {
      return queue;
    }
  });
}

function readCoreConfig(game) {
  return copyUiConfig(game?.settings?.get?.("core", "uiConfig"));
}

function readInterfaceTheme(config) {
  return normalizedTheme(config?.colorScheme?.interface);
}

function readApplicationTheme(config) {
  return normalizedTheme(config?.colorScheme?.applications);
}

function unifiedConfig(config, theme) {
  const current = copyUiConfig(config);
  return {
    ...current,
    colorScheme: { ...current.colorScheme, applications: theme, interface: theme }
  };
}

function themesMatch(config, theme) {
  return readApplicationTheme(config) === theme && readInterfaceTheme(config) === theme;
}

function normalizedTheme(value) {
  return value === "light" || value === "dark" ? value : null;
}

function readInterfaceDocumentTheme(document) {
  return document?.getElementById?.("interface")?.classList?.contains?.("theme-light")
    || document?.body?.classList?.contains?.("theme-light")
    ? "light"
    : "dark";
}

function readApplicationDocumentTheme(document) {
  return document?.body?.classList?.contains?.("theme-light") ? "light" : "dark";
}

function configFingerprint(config) {
  return JSON.stringify(config);
}

function updateHostedSurfaces(document, theme) {
  for (const element of document?.querySelectorAll?.(".ve-native-chat-screen, .ve-mobile-dialog.themed") ?? []) {
    element.classList?.add?.("themed");
    element.classList?.remove?.("theme-light", "theme-dark");
    element.classList?.add?.(`theme-${theme}`);
  }
}

function copyUiConfig(config) {
  const source = config ?? {};
  return {
    ...source,
    colorScheme: { ...(source.colorScheme ?? {}) },
    fade: { ...(source.fade ?? {}) }
  };
}
