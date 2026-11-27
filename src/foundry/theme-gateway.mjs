import { KEYS, MODULE_ID } from "./preferences.mjs";
import { readLocalSetting, restoreLocalSetting } from "./client-setting-restoration.mjs";

const CORE_THEME_SETTING = "core.uiConfig";

/** Keep the VE frame and hosted Chat aligned with Foundry's Interface Theme.
 * Foundry retains Application Theme authority over its sheets and dialogs. */
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
  let owner = null;

  // Serialize theme changes so native settings updates cannot race each other.
  const enqueue = (action) => {
    queue = queue.then(action).catch((error) => {
      console.warn("VE Mobile | Interface theme could not be saved", error);
    });
    return queue;
  };

  // Record the interface value VE is about to own, then merge into current
  // raw client settings so a simultaneous native application edit survives.
  const persistInterface = async (theme, scope) => {
    const game = getGame();
    if (owner !== scope || !scope || scope.disposed || !game?.settings?.set) return false;
    const current = copyUiConfig(readLocalSetting(game, CORE_THEME_SETTING));
    const previousInterface = current.colorScheme.interface;
    if (previousInterface === theme) return true;
    const saved = game.settings.get(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT);
    if (saved?.captured) {
      // Legacy captures record only the old config. Start tracking ownership
      // from the current Interface Theme before the first write after upgrade.
      const original = ownsInterfaceTheme(saved, previousInterface)
        ? saved.original : current;
      await game.settings.set(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT, {
        ...saved, interfaceOnly: true, original, appliedInterface: theme
      });
    }
    if (owner !== scope || scope.disposed || getGame() !== game) return false;
    const latest = copyUiConfig(readLocalSetting(game, CORE_THEME_SETTING));
    if (latest.colorScheme.interface !== previousInterface) return false;
    const next = withInterfaceTheme(latest, theme);
    knownConfig = next;
    ignoredCoreFingerprint = configFingerprint(next);
    await restoreLocalSetting(game, CORE_THEME_SETTING, next);
    return true;
  };

  // Accept external Foundry theme changes only when the current policy allows them.
  const acceptFoundryChange = (value, scope) => enqueue(async () => {
    if (owner !== scope || scope.disposed) return;
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
    updateHostedChat(getDocument(), interfaceTheme);
    await setMobileTheme(interfaceTheme);
  });

  return Object.freeze({
    async beginMobileSession({ fresh = true, entryToken = "" } = {}) {
      // Capture before the first VE write. An existing capture remains in
      // place until Desktop exit or the next VE-owned Interface Theme write.
      const game = getGame();
      const saved = game?.settings?.get?.(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT);
      if (saved?.captured === true) return false;
      await game?.settings?.set?.(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT, {
        captured: true,
        interfaceOnly: true,
        original: copyUiConfig(readLocalSetting(game, CORE_THEME_SETTING)),
        entryToken: String(entryToken).slice(0, 120)
      });
      return true;
    },
    async restoreForDesktop({ notify = true } = {}) {
      // Drain pending VE writes and restore only a recorded VE-owned value.
      // Legacy records contain no proof of ownership, so keep the current
      // native preferences and retire the older snapshot without a core write.
      await queue;
      const game = getGame();
      const saved = game?.settings?.get?.(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT);
      if (saved?.captured !== true) return false;
      const current = copyUiConfig(readLocalSetting(game, CORE_THEME_SETTING));
      const originalInterface = saved.original?.colorScheme?.interface;
      if (ownsInterfaceTheme(saved, current.colorScheme.interface) && current.colorScheme.interface !== originalInterface) {
        try {
          await restoreLocalSetting(game, CORE_THEME_SETTING, withInterfaceTheme(current, originalInterface), { notify });
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
      if (owner || !scope?.hook || typeof readTheme !== "function" || typeof setTheme !== "function") return false;
      owner = scope;
      readMobileTheme = readTheme;
      setMobileTheme = setTheme;
      knownConfig = readCoreConfig(getGame());
      scope.hook("clientSettingChanged", (key, value) => {
        if (key === CORE_THEME_SETTING) void acceptFoundryChange(value, scope);
      });
      scope.own?.(() => {
        owner = null;
        readMobileTheme = () => "";
        setMobileTheme = async () => {};
      });
      const theme = readInterfaceTheme(knownConfig) ?? readInterfaceDocumentTheme(getDocument());
      updateHostedChat(getDocument(), theme);
      if (readMobileTheme() !== theme) {
        ignoredMobileTheme = theme;
        void enqueue(() => { if (owner === scope && !scope.disposed) return setMobileTheme(theme); });
      }
      return true;
    },

    /** A direct VE choice changes only Foundry's Interface Theme. */
    sync(requested) {
      const theme = normalizedTheme(requested) ?? "dark";
      const scope = owner;
      updateHostedChat(getDocument(), theme);
      if (ignoredMobileTheme === theme) {
        ignoredMobileTheme = "";
        return true;
      }
      void enqueue(() => persistInterface(theme, scope));
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

// Only snapshots that recorded a matching VE write establish ownership.
function ownsInterfaceTheme(snapshot, currentTheme) {
  return snapshot.interfaceOnly === true && snapshot.appliedInterface !== undefined
    && snapshot.appliedInterface === currentTheme;
}

// Replace the one field VE owns in the current client config.
function withInterfaceTheme(config, theme) {
  const colorScheme = { ...config.colorScheme };
  if (theme === undefined) delete colorScheme.interface;
  else colorScheme.interface = theme;
  return { ...config, colorScheme };
}

// Normalize a theme value to the supported canonical identifier.
function normalizedTheme(value) {
  return value === "light" || value === "dark" ? value : null;
}

// Read the theme currently applied to Foundry’s interface document.
function readInterfaceDocumentTheme(document) {
  const classes = document?.getElementById?.("interface")?.classList;
  if (classes?.contains?.("theme-light")) return "light";
  if (classes?.contains?.("theme-dark")) return "dark";
  return readApplicationDocumentTheme(document);
}

// Read the theme currently applied to native application surfaces.
function readApplicationDocumentTheme(document) {
  return document?.body?.classList?.contains?.("theme-light") ? "light" : "dark";
}

// Build a stable theme fingerprint for detecting external configuration changes.
function configFingerprint(config) {
  return JSON.stringify(config);
}

// The hosted transcript moved outside Foundry's interface theme ancestor.
function updateHostedChat(document, theme) {
  for (const element of document?.querySelectorAll?.(".ve-native-chat-screen") ?? []) {
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
