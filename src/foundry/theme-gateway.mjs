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
  // Read and normalize the selected mobile theme preference.
  let readMobileTheme = () => "";
  // Persist the requested theme after validating it against the supported theme list.
  let setMobileTheme = async () => {};
  let queue = Promise.resolve();
  let started = false;

  // Serialize theme changes so native settings updates cannot race each other.
  const enqueue = (action) => {
    queue = queue.then(action).catch((error) => {
      console.warn("VE Mobile | Unified theme could not be saved", error);
    });
    return queue;
  };

  const applyMobileTheme = (theme, config = readCoreConfig(getGame())) => {
    // Update Foundry's native UI config only when its two theme choices differ;
    // hosted VE chat/dialog surfaces still need their class synchronized.
    const game = getGame();
    if (!game?.settings?.get || typeof game.configureUI !== "function") return false;
    const next = unifiedConfig(config, theme);
    if (!themesMatch(config, theme)) game.configureUI(next);
    updateHostedSurfaces(getDocument(), theme);
    return true;
  };

  const persistCore = async (theme) => {
    // Mark our expected echo before writing, so the native-setting hook does not
    // turn this VE-originated update into a second preference change.
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

  // Accept external Foundry theme changes only when the current policy allows them.
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
    // This serialized callback rejects our own echo and avoids queued writes
    // applying out of order. Foundry's Application Theme is deliberately
    // independent; only a native Interface Theme change transfers back to VE.
    if (interfaceChoice === previousInterfaceChoice || readMobileTheme() === interfaceTheme) return;
    ignoredMobileTheme = interfaceTheme;
    updateHostedSurfaces(getDocument(), interfaceTheme);
    await setMobileTheme(interfaceTheme);
  });

  return Object.freeze({
    async beginMobileSession({ fresh = true, entryToken = "" } = {}) {
      // Capture once, before mode changes, so Desktop restoration can put the
      // user's original core theme back rather than the VE-synchronized value.
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
      // Drain pending VE writes first and retain the snapshot until the native
      // setting has been returned to its captured value.
      await queue;
      const game = getGame();
      const saved = game?.settings?.get?.(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT);
      if (saved?.captured !== true) return false;
      const original = copyUiConfig(saved.original);
      const current = copyUiConfig(readLocalSetting(game, CORE_THEME_SETTING));
      if (configFingerprint(current) !== configFingerprint(original)) {
        try {
          await restoreLocalSetting(game, CORE_THEME_SETTING, original, { notify });
        } catch (error) {
          // Appearance preferences are expendable: an incompatible old capture
          // must not prevent Phone/Tablet startup. Retain the current native
          // preferences instead, using the same validated client-local route so
          // forced settings cannot become writes to administrator/world policy.
          // Keep the capture if even this fallback cannot be persisted/verified.
          await restoreLocalSetting(game, CORE_THEME_SETTING, current, { notify });
          console.warn("VE Mobile | Saved appearance preferences could not be restored; keeping current interface settings", error);
        }
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

// Read Foundry’s current core theme configuration.
function readCoreConfig(game) {
  return copyUiConfig(game?.settings?.get?.("core", "uiConfig"));
}

// Read the selected interface theme setting.
function readInterfaceTheme(config) {
  return normalizedTheme(config?.colorScheme?.interface);
}

// Read the selected application theme setting.
function readApplicationTheme(config) {
  return normalizedTheme(config?.colorScheme?.applications);
}

// Combine current theme configuration into the values used by VE theme matching.
function unifiedConfig(config, theme) {
  const current = copyUiConfig(config);
  return {
    ...current,
    colorScheme: { ...current.colorScheme, applications: theme, interface: theme }
  };
}

// Check whether current Foundry and VE theme preferences resolve to the same theme.
function themesMatch(config, theme) {
  return readApplicationTheme(config) === theme && readInterfaceTheme(config) === theme;
}

// Normalize a theme value to the supported canonical identifier.
function normalizedTheme(value) {
  return value === "light" || value === "dark" ? value : null;
}

// Read the theme currently applied to Foundry’s interface document.
function readInterfaceDocumentTheme(document) {
  return document?.getElementById?.("interface")?.classList?.contains?.("theme-light")
    || document?.body?.classList?.contains?.("theme-light")
    ? "light"
    : "dark";
}

// Read the theme currently applied to native application surfaces.
function readApplicationDocumentTheme(document) {
  return document?.body?.classList?.contains?.("theme-light") ? "light" : "dark";
}

// Build a stable theme fingerprint for detecting external configuration changes.
function configFingerprint(config) {
  return JSON.stringify(config);
}

// Apply the current allowed theme classes to Foundry and VE-owned surfaces.
function updateHostedSurfaces(document, theme) {
  for (const element of document?.querySelectorAll?.(".ve-native-chat-screen, .ve-mobile-dialog.themed") ?? []) {
    element.classList?.add?.("themed");
    element.classList?.remove?.("theme-light", "theme-dark");
    element.classList?.add?.(`theme-${theme}`);
  }
}

// Copy the supported UI theme settings while leaving unrelated config fields intact.
function copyUiConfig(config) {
  const source = config ?? {};
  return {
    ...source,
    colorScheme: { ...(source.colorScheme ?? {}) },
    fade: { ...(source.fade ?? {}) }
  };
}
