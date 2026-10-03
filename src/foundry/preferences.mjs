import { COLOR_SCHEME_CHOICES } from "../kernel/character-theme.mjs";
import { localizeFoundry } from "./localization.mjs";

export const MODULE_ID = "ve-mobile";
export const BOOTSTRAP_PREFERENCES_KEY = "ve-mobile:bootstrap-preferences:v1";
export const LOAD_TIMING_KEYS = Object.freeze({ FULL: "lastSuccessfulFullLoadMs", RESYNC: "lastSuccessfulResyncMs" });

const KEYS = Object.freeze({
  MODE: "mode",
  THEME: "theme",
  COLOR_SCHEME: "colorScheme",
  HEADER_ARTWORK: "headerArtwork",
  HEADER_ARTWORK_OPACITY: "headerArtworkOpacity",
  QUICKBAR_ENABLED: "quickbarEnabled",
  QUICKBAR_ROWS: "quickbarRows",
  QUICKBAR_SOURCE: "quickbarSource",
  SHOW_ACTION_SUMMARIES: "showActionSummaries",
  COMPACT_ACTION_SUMMARIES: "compactActionSummaries",
  GRAPHICS_SAFETY: "graphicsSafety",
  DICE_RENDERING: "diceRendering",
  MOBILE_OPTIMIZED_ASSETS: "mobileOptimizedAssets",
  LOW_MEMORY_CANVAS: "lowMemoryCanvas",
  MEMORY_PROTECTION_PROFILE: "memoryProtectionProfile",
  MEMORY_PROTECTION_BEHAVIOR: "memoryProtectionBehavior",
  MEMORY_PREFLIGHT_STATE: "memoryPreflightState",
  AFTER_GRAPHICS_FAILURE: "afterGraphicsFailure",
  SCENE_MEMORY_WARNINGS: "sceneMemoryWarnings",
  GRAPHICS_SETTINGS_SNAPSHOT: "graphicsSettingsSnapshot",
  THEME_SETTINGS_SNAPSHOT: "themeSettingsSnapshot",
  PENDING_DESKTOP_RESTORE: "pendingDesktopRestore",
  MOBILE_ENTRY_HANDOFF: "mobileEntryHandoff",
  GRAPHICS_RECOVERY_ACKNOWLEDGED: "graphicsRecoveryAcknowledged",
  MOBILE_ASSET_CATALOG: "mobileAssetCatalog",
  FCS_AUTO_SOFT_OVERRIDE: "fcsAutoSoftOverride",
  FCS_MANAGED_UNLOCK_KEYS: "fcsManagedUnlockKeys",
  GRAPHICS_PROFILE_TRANSACTION: "graphicsProfileTransaction",
  MOVEMENT_REPEAT_DELAY: "movementRepeatDelay",
  RECENTER_AFTER_MOVE: "recenterAfterMove",
  JOYSTICK_SIDE: "joystickSide",
  COMBAT_CAROUSEL: "combatCarousel",
  KEEP_SCREEN_AWAKE: "keepScreenAwake",
  PROTECT_VE_STYLING: "protectVeStyling",
  MODULE_OVERLAY_VISIBILITY: "moduleOverlayVisibility",
  MODULE_OVERLAY_CATALOG: "moduleOverlayCatalog",
  MODULE_OVERLAY_ORDER: "moduleOverlayOrder",
  MODULE_OVERLAY_SCALE: "moduleOverlayScale",
  CHARACTER_INVENTORY_SORT: "characterInventorySort",
  CHARACTER_SPELL_SORT: "characterSpellSort",
  CHARACTER_SPELL_FILTER: "characterSpellFilter",
  CHARACTER_FEATURE_SORT: "characterFeatureSort",
  CHARACTER_FAVOURITES_SORT: "characterFavouritesSort",
  CHARACTER_EFFECTS_SORT: "characterEffectsSort",
  CHARACTER_FAVOURITES_SOURCE: "characterFavouritesSource",
  LOGGING_LEVEL: "loggingLevel",
  SAVE_DIAGNOSTICS_TO_JOURNAL: "saveDiagnosticsToJournal"
});

const CHOICES = Object.freeze({
  [KEYS.MODE]: Object.freeze(["auto", "phone", "tablet", "desktop"]),
  [KEYS.THEME]: Object.freeze(["system", "light", "dark"]),
  [KEYS.COLOR_SCHEME]: COLOR_SCHEME_CHOICES,
  [KEYS.HEADER_ARTWORK]: Object.freeze(["automatic", "race", "heroic1", "heroic2", "heroic3", "heroic4", "off"]),
  [KEYS.QUICKBAR_ROWS]: Object.freeze(["1", "2"]),
  [KEYS.QUICKBAR_SOURCE]: Object.freeze(["character", "foundry"]),
  [KEYS.GRAPHICS_SAFETY]: Object.freeze(["auto", "strict", "balanced", "off"]),
  [KEYS.DICE_RENDERING]: Object.freeze(["auto", "static", "reduced", "normal"]),
  [KEYS.MOBILE_OPTIMIZED_ASSETS]: Object.freeze(["auto", "on", "off"]),
  [KEYS.MEMORY_PROTECTION_PROFILE]: Object.freeze(["normal", "balanced", "strong", "maximum"]),
  [KEYS.MEMORY_PROTECTION_BEHAVIOR]: Object.freeze(["recommend", "automatic", "off"]),
  [KEYS.AFTER_GRAPHICS_FAILURE]: Object.freeze(["ask", "auto", "nothing"]),
  [KEYS.JOYSTICK_SIDE]: Object.freeze(["follow", "left", "right"]),
  [KEYS.CHARACTER_INVENTORY_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_SPELL_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_SPELL_FILTER]: Object.freeze(["all", "prepared"]),
  [KEYS.CHARACTER_FEATURE_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_FAVOURITES_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_EFFECTS_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_FAVOURITES_SOURCE]: Object.freeze(["core", "tidy", "both", "off"]),
  [KEYS.LOGGING_LEVEL]: Object.freeze(["off", "error", "warn", "info", "debug"])
});

const DEFAULTS = Object.freeze({ mode: "auto", theme: "system", colorScheme: "class", headerArtwork: "automatic", headerArtworkOpacity: 1, quickbarEnabled: true, quickbarSource: "character", quickbarRows: "1", showActionSummaries: true, compactActionSummaries: false, graphicsSafety: "auto", diceRendering: "auto", mobileOptimizedAssets: "auto", lowMemoryCanvas: false, memoryProtectionProfile: "normal", memoryProtectionBehavior: "recommend", afterGraphicsFailure: "ask", sceneMemoryWarnings: true, fcsAutoSoftOverride: true, movementRepeatDelay: 0.5, recenterAfterMove: false, joystickSide: "follow", combatCarousel: true, keepScreenAwake: false, protectVeStyling: true, moduleOverlayVisibility: Object.freeze({}), moduleOverlayCatalog: Object.freeze({ scanned: false, entries: Object.freeze([]) }), moduleOverlayOrder: Object.freeze([]), moduleOverlayScale: Object.freeze({}), characterInventorySort: "manual", characterSpellSort: "manual", characterSpellFilter: "all", characterFeatureSort: "manual", characterFavouritesSort: "manual", characterEffectsSort: "manual", characterFavouritesSource: "core", loggingLevel: "warn", saveDiagnosticsToJournal: true });

const CHARACTER_COLLECTION_SETTING_KEYS = Object.freeze({
  inventorySort: KEYS.CHARACTER_INVENTORY_SORT,
  spellSort: KEYS.CHARACTER_SPELL_SORT,
  spellFilter: KEYS.CHARACTER_SPELL_FILTER,
  featureSort: KEYS.CHARACTER_FEATURE_SORT,
  favouritesSort: KEYS.CHARACTER_FAVOURITES_SORT,
  effectsSort: KEYS.CHARACTER_EFFECTS_SORT
});

const BOOTSTRAP_DEFAULTS = Object.freeze({
  mode: "auto",
  theme: "system",
  keepScreenAwake: false
});

export function registerPreferences({
  onApplicationChange,
  onPresentationChange,
  onWakeChange,
  onVisualIsolationChange,
  isMobilePresentation = () => true,
  openMobileAssetOptimizer,
  openControlsGuide
} = {}) {
  const changed = (key, notify) => (value) => {
    syncBootstrapPreferences();
    notify?.(Object.freeze({ key, value }));
  };
  game.settings.register(MODULE_ID, KEYS.MODE, {
    name: "VEMOBILE.Settings.Mode.Name",
    hint: "VEMOBILE.Settings.Mode.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      auto: "VEMOBILE.Settings.Mode.Auto",
      phone: "VEMOBILE.Settings.Mode.Phone",
      tablet: "VEMOBILE.Settings.Mode.Tablet",
      desktop: "VEMOBILE.Settings.Mode.Desktop"
    },
    default: "auto",
    onChange: changed(KEYS.MODE, onPresentationChange)
  });

  game.settings.register(MODULE_ID, KEYS.THEME, {
    name: "VEMOBILE.Settings.Theme.Name",
    hint: "VEMOBILE.Settings.Theme.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      system: "VEMOBILE.Settings.Theme.System",
      light: "VEMOBILE.Settings.Theme.Light",
      dark: "VEMOBILE.Settings.Theme.Dark"
    },
    default: "system",
    onChange: changed(KEYS.THEME, onPresentationChange)
  });

  game.settings.register(MODULE_ID, KEYS.COLOR_SCHEME, {
    name: "VEMOBILE.Settings.ColourScheme.Name",
    hint: "VEMOBILE.Settings.ColourScheme.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      class: "VEMOBILE.Settings.ColourScheme.Class",
      red: "VEMOBILE.Settings.ColourScheme.Red",
      neutral: "VEMOBILE.Settings.ColourScheme.Neutral",
      bestiary: "VEMOBILE.Settings.ColourScheme.Bestiary"
    },
    default: "class",
    onChange: changed(KEYS.COLOR_SCHEME, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.HEADER_ARTWORK, {
    name: "VEMOBILE.Settings.HeaderArtwork.Name",
    hint: "VEMOBILE.Settings.HeaderArtwork.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: Object.fromEntries(CHOICES[KEYS.HEADER_ARTWORK].map(value => [value, "VEMOBILE.Settings.HeaderArtwork." + value[0].toUpperCase() + value.slice(1)])),
    default: DEFAULTS.headerArtwork,
    onChange: changed(KEYS.HEADER_ARTWORK, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.HEADER_ARTWORK_OPACITY, {
    name: "VEMOBILE.Settings.HeaderArtworkOpacity.Name",
    hint: "VEMOBILE.Settings.HeaderArtworkOpacity.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 1,
    onChange: changed(KEYS.HEADER_ARTWORK_OPACITY, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.QUICKBAR_ENABLED, {
    name: "VEMOBILE.Settings.QuickbarEnabled.Name",
    hint: "VEMOBILE.Settings.QuickbarEnabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: changed(KEYS.QUICKBAR_ENABLED, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.QUICKBAR_ROWS, {
    name: "VEMOBILE.Settings.QuickbarRows.Name",
    hint: "VEMOBILE.Settings.QuickbarRows.Hint",
    scope: "client",
    config: false,
    type: String,
    choices: {
      1: "VEMOBILE.Settings.QuickbarRows.1",
      2: "VEMOBILE.Settings.QuickbarRows.2"
    },
    default: "1",
    onChange: changed(KEYS.QUICKBAR_ROWS, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.QUICKBAR_SOURCE, {
    name: "VEMOBILE.Settings.QuickbarSource.Name",
    hint: "VEMOBILE.Settings.QuickbarSource.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: { character: "VEMOBILE.Settings.QuickbarSource.Character", foundry: "VEMOBILE.Settings.QuickbarSource.Foundry" },
    default: "character",
    onChange: changed(KEYS.QUICKBAR_SOURCE, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.SHOW_ACTION_SUMMARIES, {
    name: "VEMOBILE.Settings.ShowActionSummaries.Name",
    hint: "VEMOBILE.Settings.ShowActionSummaries.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULTS.showActionSummaries,
    onChange: changed(KEYS.SHOW_ACTION_SUMMARIES, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.COMPACT_ACTION_SUMMARIES, {
    name: "VEMOBILE.Settings.CompactActionSummaries.Name",
    hint: "VEMOBILE.Settings.CompactActionSummaries.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULTS.compactActionSummaries,
    onChange: changed(KEYS.COMPACT_ACTION_SUMMARIES, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.GRAPHICS_SAFETY, {
    name: "VEMOBILE.Settings.GraphicsSafety.Name",
    hint: "VEMOBILE.Settings.GraphicsSafety.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      auto: "VEMOBILE.Settings.GraphicsSafety.Auto",
      strict: "VEMOBILE.Settings.GraphicsSafety.Strict",
      balanced: "VEMOBILE.Settings.GraphicsSafety.Balanced",
      off: "VEMOBILE.Settings.GraphicsSafety.Off"
    },
    default: DEFAULTS.graphicsSafety,
    onChange: changed(KEYS.GRAPHICS_SAFETY, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.DICE_RENDERING, {
    name: "VEMOBILE.Settings.DiceRendering.Name",
    hint: "VEMOBILE.Settings.DiceRendering.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      auto: "VEMOBILE.Settings.DiceRendering.Auto",
      static: "VEMOBILE.Settings.DiceRendering.Static",
      reduced: "VEMOBILE.Settings.DiceRendering.Reduced",
      normal: "VEMOBILE.Settings.DiceRendering.Normal"
    },
    default: DEFAULTS.diceRendering,
    onChange: changed(KEYS.DICE_RENDERING, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.MOBILE_OPTIMIZED_ASSETS, {
    name: "VEMOBILE.Settings.MobileOptimizedAssets.Name",
    hint: "VEMOBILE.Settings.MobileOptimizedAssets.Hint",
    scope: "client",
    config: false,
    type: String,
    choices: {
      auto: "VEMOBILE.Settings.MobileOptimizedAssets.Auto",
      on: "VEMOBILE.Settings.MobileOptimizedAssets.On",
      off: "VEMOBILE.Settings.MobileOptimizedAssets.Off"
    },
    default: DEFAULTS.mobileOptimizedAssets,
    requiresReload: true,
    onChange: changed(KEYS.MOBILE_OPTIMIZED_ASSETS, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.LOW_MEMORY_CANVAS, {
    name: "VEMOBILE.Settings.LowMemoryCanvas.Name",
    hint: "VEMOBILE.Settings.LowMemoryCanvas.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: DEFAULTS.lowMemoryCanvas,
    requiresReload: true,
    onChange: changed(KEYS.LOW_MEMORY_CANVAS, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.MEMORY_PROTECTION_PROFILE, {
    name: "VEMOBILE.Settings.MemoryProtectionProfile.Name",
    hint: "VEMOBILE.Settings.MemoryProtectionProfile.Hint",
    scope: "client",
    config: false,
    type: String,
    choices: {
      normal: "VEMOBILE.Settings.MemoryProtectionProfile.Normal",
      balanced: "VEMOBILE.Settings.MemoryProtectionProfile.Balanced",
      strong: "VEMOBILE.Settings.MemoryProtectionProfile.Strong",
      maximum: "VEMOBILE.Settings.MemoryProtectionProfile.Maximum"
    },
    default: DEFAULTS.memoryProtectionProfile,
    onChange: changed(KEYS.MEMORY_PROTECTION_PROFILE, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.MEMORY_PROTECTION_BEHAVIOR, {
    name: "VEMOBILE.Settings.MemoryProtectionBehavior.Name",
    hint: "VEMOBILE.Settings.MemoryProtectionBehavior.Hint",
    scope: "client",
    config: false,
    type: String,
    choices: {
      recommend: "VEMOBILE.Settings.MemoryProtectionBehavior.Recommend",
      automatic: "VEMOBILE.Settings.MemoryProtectionBehavior.Automatic",
      off: "VEMOBILE.Settings.MemoryProtectionBehavior.Off"
    },
    default: DEFAULTS.memoryProtectionBehavior,
    onChange: changed(KEYS.MEMORY_PROTECTION_BEHAVIOR, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.MEMORY_PREFLIGHT_STATE, {
    name: "VE Mobile Scene Preflight reload state",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.AFTER_GRAPHICS_FAILURE, {
    name: "VEMOBILE.Settings.AfterGraphicsFailure.Name",
    hint: "VEMOBILE.Settings.AfterGraphicsFailure.Hint",
    scope: "client",
    config: false,
    type: String,
    choices: {
      ask: "VEMOBILE.Settings.AfterGraphicsFailure.Ask",
      auto: "VEMOBILE.Settings.AfterGraphicsFailure.Auto",
      nothing: "VEMOBILE.Settings.AfterGraphicsFailure.Nothing"
    },
    default: DEFAULTS.afterGraphicsFailure,
    onChange: changed(KEYS.AFTER_GRAPHICS_FAILURE, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.SCENE_MEMORY_WARNINGS, {
    name: "VEMOBILE.Settings.SceneMemoryWarnings.Name",
    hint: "VEMOBILE.Settings.SceneMemoryWarnings.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: DEFAULTS.sceneMemoryWarnings,
    onChange: changed(KEYS.SCENE_MEMORY_WARNINGS, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT, {
    name: "VE Mobile graphics settings snapshot",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT, {
    name: "VE Mobile native theme restoration snapshot",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.PENDING_DESKTOP_RESTORE, {
    name: "VE Mobile pending Desktop settings restoration",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.MOBILE_ENTRY_HANDOFF, {
    name: "VE Mobile fresh performance capture handoff",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.GRAPHICS_RECOVERY_ACKNOWLEDGED, {
    name: "VE Mobile graphics recovery acknowledgement",
    scope: "client",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, KEYS.MOBILE_ASSET_CATALOG, {
    name: "VE Mobile world asset catalog",
    scope: "world",
    config: false,
    type: Object,
    default: { schemaVersion: 1, generatedAt: 0, assets: {}, scenes: {} }
  });

  game.settings.register(MODULE_ID, KEYS.FCS_MANAGED_UNLOCK_KEYS, {
    name: "VE Mobile-managed Force Client Settings unlocks",
    scope: "client",
    config: false,
    type: Object,
    default: []
  });

  game.settings.register(MODULE_ID, KEYS.FCS_AUTO_SOFT_OVERRIDE, {
    name: "VEMOBILE.Settings.FcsAutoSoftOverride.Name",
    hint: "VEMOBILE.Settings.FcsAutoSoftOverride.Hint",
    scope: "world",
    config: Boolean(game.modules?.get?.("force-client-settings")?.active),
    requiresReload: true,
    type: Boolean,
    default: DEFAULTS.fcsAutoSoftOverride,
    onChange: changed(KEYS.FCS_AUTO_SOFT_OVERRIDE, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.GRAPHICS_PROFILE_TRANSACTION, {
    name: "VE Mobile graphics profile transaction",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.MOVEMENT_REPEAT_DELAY, {
    name: "VEMOBILE.Settings.MovementRepeatDelay.Name",
    hint: "VEMOBILE.Settings.MovementRepeatDelay.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.1 },
    default: 0.5,
    onChange: changed(KEYS.MOVEMENT_REPEAT_DELAY, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.RECENTER_AFTER_MOVE, {
    name: "VEMOBILE.Settings.RecenterAfterMove.Name",
    hint: "VEMOBILE.Settings.RecenterAfterMove.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: changed(KEYS.RECENTER_AFTER_MOVE, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.JOYSTICK_SIDE, {
    name: "VEMOBILE.Settings.JoystickSide.Name",
    hint: "VEMOBILE.Settings.JoystickSide.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      follow: "VEMOBILE.Settings.JoystickSide.Follow",
      left: "VEMOBILE.Settings.JoystickSide.Left",
      right: "VEMOBILE.Settings.JoystickSide.Right"
    },
    default: DEFAULTS.joystickSide,
    onChange: changed(KEYS.JOYSTICK_SIDE, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.COMBAT_CAROUSEL, {
    name: "VEMOBILE.Settings.CombatCarousel.Name",
    hint: "VEMOBILE.Settings.CombatCarousel.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULTS.combatCarousel,
    onChange: changed(KEYS.COMBAT_CAROUSEL, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.KEEP_SCREEN_AWAKE, {
    name: "VEMOBILE.Settings.KeepScreenAwake.Name",
    hint: "VEMOBILE.Settings.KeepScreenAwake.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: changed(KEYS.KEEP_SCREEN_AWAKE, onWakeChange)
  });

  game.settings.register(MODULE_ID, KEYS.PROTECT_VE_STYLING, {
    name: "VEMOBILE.Settings.ProtectVeStyling.Name",
    hint: "VEMOBILE.Settings.ProtectVeStyling.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: changed(KEYS.PROTECT_VE_STYLING, onVisualIsolationChange)
  });

  game.settings.register(MODULE_ID, KEYS.MODULE_OVERLAY_VISIBILITY, {
    name: "VEMOBILE.Settings.ModuleOverlays.Visibility",
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange: changed(KEYS.MODULE_OVERLAY_VISIBILITY, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.MODULE_OVERLAY_CATALOG, {
    name: "VEMOBILE.Settings.ModuleOverlays.Catalog",
    scope: "client",
    config: false,
    type: Object,
    default: { scanned: false, entries: [] },
    onChange: changed(KEYS.MODULE_OVERLAY_CATALOG, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.MODULE_OVERLAY_ORDER, {
    name: "VEMOBILE.Settings.ModuleOverlays.Order",
    scope: "client",
    config: false,
    type: Object,
    default: [],
    onChange: changed(KEYS.MODULE_OVERLAY_ORDER, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.MODULE_OVERLAY_SCALE, {
    name: "VEMOBILE.Settings.ModuleOverlays.Scale",
    scope: "client",
    config: false,
    type: Object,
    default: {},
    onChange: changed(KEYS.MODULE_OVERLAY_SCALE, onApplicationChange)
  });

  for (const key of Object.values(CHARACTER_COLLECTION_SETTING_KEYS)) {
    game.settings.register(MODULE_ID, key, {
      name: `VE Mobile ${key}`,
      scope: "client",
      config: false,
      type: String,
      default: DEFAULTS[key],
      onChange: changed(key, onApplicationChange)
    });
  }

  const tidyDetected = isTidy5eActive(game);
  game.settings.register(MODULE_ID, KEYS.CHARACTER_FAVOURITES_SOURCE, {
    name: "VEMOBILE.Settings.CharacterFavouritesSource.Name",
    hint: "VEMOBILE.Settings.CharacterFavouritesSource.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      core: "VEMOBILE.Settings.CharacterFavouritesSource.Core",
      ...(tidyDetected ? {
        tidy: "VEMOBILE.Settings.CharacterFavouritesSource.Tidy",
        both: "VEMOBILE.Settings.CharacterFavouritesSource.Both"
      } : {}),
      off: "VEMOBILE.Settings.CharacterFavouritesSource.Off"
    },
    default: DEFAULTS.characterFavouritesSource,
    onChange: changed(KEYS.CHARACTER_FAVOURITES_SOURCE, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.LOGGING_LEVEL, {
    name: "VEMOBILE.Settings.LoggingLevel.Name",
    hint: "VEMOBILE.Settings.LoggingLevel.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      off: "VEMOBILE.Settings.LoggingLevel.Off",
      error: "VEMOBILE.Settings.LoggingLevel.Error",
      warn: "VEMOBILE.Settings.LoggingLevel.Warn",
      info: "VEMOBILE.Settings.LoggingLevel.Info",
      debug: "VEMOBILE.Settings.LoggingLevel.Debug"
    },
    default: "warn",
    onChange: changed(KEYS.LOGGING_LEVEL, onApplicationChange)
  });
  game.settings.register(MODULE_ID, KEYS.SAVE_DIAGNOSTICS_TO_JOURNAL, {
    name: "VEMOBILE.Settings.SaveDiagnosticsToJournal.Name",
    hint: "VEMOBILE.Settings.SaveDiagnosticsToJournal.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: changed(KEYS.SAVE_DIAGNOSTICS_TO_JOURNAL, onApplicationChange)
  });
  for (const key of Object.values(LOAD_TIMING_KEYS)) {
    game.settings.register(MODULE_ID, key, {
      name: `VE Mobile ${key}`,
      scope: "client",
      config: false,
      type: Number,
      default: 0
    });
  }
  if (typeof game.settings.registerMenu === "function" && typeof openMobileAssetOptimizer === "function") {
    game.settings.registerMenu(MODULE_ID, "mobileAssetOptimizer", {
      name: "VEMOBILE.Settings.AssetOptimizer.MenuName",
      label: "VEMOBILE.Settings.AssetOptimizer.MenuLabel",
      hint: "VEMOBILE.Settings.AssetOptimizer.MenuHint",
      icon: "fa-solid fa-images",
      type: mobileAssetOptimizerMenuType(openMobileAssetOptimizer),
      restricted: true
    });
  }
  if (typeof game.settings.registerMenu === "function" && typeof openControlsGuide === "function") {
    game.settings.registerMenu(MODULE_ID, "controlsGuide", {
      name: "VEMOBILE.Controls.Title", label: "VEMOBILE.Controls.View", hint: "VEMOBILE.Controls.MenuHint",
      icon: "fa-solid fa-hand-pointer", type: controlsGuideMenuType(openControlsGuide), restricted: false
    });
  }
  syncBootstrapPreferences();
  const storedArtwork = readSetting(KEYS.HEADER_ARTWORK, DEFAULTS.headerArtwork);
  if (isMobilePresentation() && typeof storedArtwork === "string" && !CHOICES[KEYS.HEADER_ARTWORK].includes(storedArtwork)) {
    // One client-setting migration at registration; snapshots never write.
    void Promise.resolve(game.settings.set(MODULE_ID, KEYS.HEADER_ARTWORK, DEFAULTS.headerArtwork)).catch((error) => {
      console.warn("VE Mobile | Could not migrate obsolete Header Artwork setting", error);
    });
  }
}

function controlsGuideMenuType(openControlsGuide) {
  const Base = globalThis.foundry?.applications?.api?.ApplicationV2 ?? globalThis.FormApplication ?? class {};
  return class VEControlsGuideMenu extends Base {
    render() { queueMicrotask(openControlsGuide); return this; }
  };
}

function mobileAssetOptimizerMenuType(openMobileAssetOptimizer) {
  const Base = globalThis.foundry?.applications?.api?.ApplicationV2 ?? globalThis.FormApplication ?? class {};
  return class VEMobileAssetOptimizerMenu extends Base {
    render() {
      queueMicrotask(() => openMobileAssetOptimizer());
      return this;
    }
  };
}

export function readPreferences() {
  const cached = readBootstrapPreferences();
  return {
    mode: normalizedModePreference(readSetting(KEYS.MODE, cached.mode)),
    theme: readSetting(KEYS.THEME, cached.theme)
  };
}

/** Cheap native locale read for Intl formatters used by presentation code. */
export function readLocale(gameRef = globalThis.game) {
  return String(gameRef?.i18n?.lang ?? "en");
}

export function readMovementRepeatDelayMs() {
  const seconds = Number(game.settings.get(MODULE_ID, KEYS.MOVEMENT_REPEAT_DELAY));
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(seconds) ? seconds : 0.5)) * 1000);
}

export function readRecenterAfterMove() {
  return Boolean(game.settings.get(MODULE_ID, KEYS.RECENTER_AFTER_MOVE));
}

export function readKeepScreenAwake() {
  return Boolean(readSetting(KEYS.KEEP_SCREEN_AWAKE, readBootstrapPreferences().keepScreenAwake));
}

export function readProtectVeStyling() {
  return readSetting(KEYS.PROTECT_VE_STYLING, true) !== false;
}

export function readLoggingLevel() {
  return normalizedLoggingLevel(readSetting(KEYS.LOGGING_LEVEL, "warn"));
}

export function readSaveDiagnosticsToJournal() {
  return readSetting(KEYS.SAVE_DIAGNOSTICS_TO_JOURNAL, true) !== false;
}

export function readBootstrapPreferences({ getStorage = () => globalThis.localStorage } = {}) {
  try {
    const parsed = JSON.parse(getStorage()?.getItem?.(BOOTSTRAP_PREFERENCES_KEY) ?? "null");
    return Object.freeze({
      mode: normalizedModePreference(parsed?.mode),
      theme: CHOICES[KEYS.THEME].includes(parsed?.theme) ? parsed.theme : BOOTSTRAP_DEFAULTS.theme,
      keepScreenAwake: typeof parsed?.keepScreenAwake === "boolean" ? parsed.keepScreenAwake : BOOTSTRAP_DEFAULTS.keepScreenAwake
    });
  } catch {
    return BOOTSTRAP_DEFAULTS;
  }
}

export function syncBootstrapPreferences(getGame = () => globalThis.game, { getStorage = () => globalThis.localStorage } = {}) {
  const cached = readBootstrapPreferences({ getStorage });
  const game = getGame();
  const read = (key, fallback) => {
    try {
      const value = game?.settings?.get?.(MODULE_ID, key);
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  };
  const next = {
    mode: normalizedModePreference(read(KEYS.MODE, cached.mode)),
    theme: read(KEYS.THEME, cached.theme),
    keepScreenAwake: Boolean(read(KEYS.KEEP_SCREEN_AWAKE, cached.keepScreenAwake))
  };
  try {
    getStorage()?.setItem?.(BOOTSTRAP_PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Client settings remain authoritative when storage is unavailable.
  }
  return Object.freeze(next);
}

/** Permission-safe access to VE Mobile's finite set of client preferences. */
export function createFoundryPreferencesGateway({
  getGame = () => globalThis.game,
  getNavigator = () => globalThis.navigator,
  setMobileNoCanvas = null
} = {}) {
  const localize = (key, data) => localizeValue(getGame(), key, data);
  const setting = (key) => getGame()?.settings?.get?.(MODULE_ID, key);

  const readers = {
    mode: () => normalizedModePreference(setting(KEYS.MODE)),
    movementRepeatDelayMs: () => normalizedDelay(setting(KEYS.MOVEMENT_REPEAT_DELAY)) * 1000,
    colorScheme: () => normalizedColorScheme(setting(KEYS.COLOR_SCHEME)),
    headerArtwork: () => normalizedChoice(KEYS.HEADER_ARTWORK, setting(KEYS.HEADER_ARTWORK), DEFAULTS.headerArtwork),
    headerArtworkOpacity: () => normalizedOpacity(setting(KEYS.HEADER_ARTWORK_OPACITY)),
    quickbarEnabled: () => setting(KEYS.QUICKBAR_ENABLED) !== false,
    quickbarSource: () => normalizedChoice(KEYS.QUICKBAR_SOURCE, setting(KEYS.QUICKBAR_SOURCE), "character"),
    quickbarRows: () => Number(CHOICES[KEYS.QUICKBAR_ROWS].includes(String(setting(KEYS.QUICKBAR_ROWS))) ? setting(KEYS.QUICKBAR_ROWS) : DEFAULTS.quickbarRows),
    showActionSummaries: () => setting(KEYS.SHOW_ACTION_SUMMARIES) !== false,
    compactActionSummaries: () => setting(KEYS.COMPACT_ACTION_SUMMARIES) === true,
    graphicsSafety: () => normalizedChoice(KEYS.GRAPHICS_SAFETY, setting(KEYS.GRAPHICS_SAFETY), DEFAULTS.graphicsSafety),
    diceRendering: () => normalizedChoice(KEYS.DICE_RENDERING, setting(KEYS.DICE_RENDERING), DEFAULTS.diceRendering),
    mobileOptimizedAssets: () => normalizedChoice(KEYS.MOBILE_OPTIMIZED_ASSETS, setting(KEYS.MOBILE_OPTIMIZED_ASSETS), DEFAULTS.mobileOptimizedAssets),
    lowMemoryCanvas: () => Boolean(setting(KEYS.LOW_MEMORY_CANVAS)),
    memoryProtectionProfile: () => normalizedMemoryProfile(setting(KEYS.MEMORY_PROTECTION_PROFILE), setting(KEYS.LOW_MEMORY_CANVAS)),
    memoryProtectionBehavior: () => normalizedChoice(KEYS.MEMORY_PROTECTION_BEHAVIOR, setting(KEYS.MEMORY_PROTECTION_BEHAVIOR), DEFAULTS.memoryProtectionBehavior),
    fcsAutoSoftOverride: () => setting(KEYS.FCS_AUTO_SOFT_OVERRIDE) !== false,
    afterGraphicsFailure: () => normalizedChoice(KEYS.AFTER_GRAPHICS_FAILURE, setting(KEYS.AFTER_GRAPHICS_FAILURE), DEFAULTS.afterGraphicsFailure),
    sceneMemoryWarnings: () => setting(KEYS.SCENE_MEMORY_WARNINGS) !== false,
    recenterAfterMove: () => Boolean(setting(KEYS.RECENTER_AFTER_MOVE)),
    joystickSide: () => normalizedChoice(KEYS.JOYSTICK_SIDE, setting(KEYS.JOYSTICK_SIDE), DEFAULTS.joystickSide),
    combatCarousel: () => setting(KEYS.COMBAT_CAROUSEL) !== false,
    keepScreenAwake: () => Boolean(setting(KEYS.KEEP_SCREEN_AWAKE)),
    protectVeStyling: () => setting(KEYS.PROTECT_VE_STYLING) !== false,
    characterCollections: () => Object.freeze({
        inventorySort: normalizedChoice(KEYS.CHARACTER_INVENTORY_SORT, setting(KEYS.CHARACTER_INVENTORY_SORT), DEFAULTS.characterInventorySort),
        spellSort: normalizedChoice(KEYS.CHARACTER_SPELL_SORT, setting(KEYS.CHARACTER_SPELL_SORT), DEFAULTS.characterSpellSort),
        spellFilter: normalizedChoice(KEYS.CHARACTER_SPELL_FILTER, setting(KEYS.CHARACTER_SPELL_FILTER), DEFAULTS.characterSpellFilter),
        featureSort: normalizedChoice(KEYS.CHARACTER_FEATURE_SORT, setting(KEYS.CHARACTER_FEATURE_SORT), DEFAULTS.characterFeatureSort),
        favouritesSort: normalizedChoice(KEYS.CHARACTER_FAVOURITES_SORT, setting(KEYS.CHARACTER_FAVOURITES_SORT), DEFAULTS.characterFavouritesSort),
        effectsSort: normalizedChoice(KEYS.CHARACTER_EFFECTS_SORT, setting(KEYS.CHARACTER_EFFECTS_SORT), DEFAULTS.characterEffectsSort)
      }),
    characterFavouritesSource: favourites => favourites().effective,
    characterFavouritesConfiguredSource: favourites => favourites().configured,
    characterFavouritesEnabled: favourites => favourites().enabled,
    characterFavouritesStale: favourites => favourites().stale,
    tidy5eDetected: favourites => favourites().tidyDetected,
  };
  const pick = keys => {
    let favouriteRecord;
    const favourites = () => favouriteRecord ??= resolveCharacterFavouritesSource(setting(KEYS.CHARACTER_FAVOURITES_SOURCE), getGame());
    return Object.freeze(Object.fromEntries((keys ?? Object.keys(readers)).map(key => [key, readers[key](favourites)])));
  };
  const presentation = () => pick();
  let restoring = false;
  return Object.freeze({
    localize(key, data) {
      return localize(key, data);
    },
    readLocale: () => readLocale(getGame()),
    presentation,
    layout: () => pick(["mode", "joystickSide"]),
    frame: () => pick(["colorScheme", "headerArtworkOpacity", "protectVeStyling", "joystickSide", "movementRepeatDelayMs", "quickbarEnabled", "quickbarSource", "combatCarousel"]),
    character: () => pick(["colorScheme", "headerArtwork", "quickbarEnabled", "quickbarSource", "characterCollections", "characterFavouritesSource", "characterFavouritesEnabled"]),
    scene: () => pick(["joystickSide", "movementRepeatDelayMs", "quickbarEnabled", "quickbarSource", "quickbarRows", "combatCarousel", "showActionSummaries", "compactActionSummaries"]),
    actionMenu: () => pick(["quickbarEnabled", "quickbarSource"]),
    actionSummaries: () => pick(["showActionSummaries", "compactActionSummaries"]),
    snapshot() {
      const fields = preferenceFields(setting, localize, getNavigator, getGame);
      return Object.freeze({
        ...presentation(),
        loggingLevel: normalizedLoggingLevel(setting(KEYS.LOGGING_LEVEL)),
        saveDiagnosticsToJournal: setting(KEYS.SAVE_DIAGNOSTICS_TO_JOURNAL) !== false,
        wakeLockSupported: typeof getNavigator()?.wakeLock?.request === "function",
        logoutLabel: localize("MENU.Logout"),
        labels: settingsLabels(localize),
        performanceMode: performanceModeField(getGame(), localize),
        fields
      });
    },

    async set({ namespace = MODULE_ID, key, value }) {
      const game = getGame();
      if (!game?.settings?.set) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.FoundrySettingsUnavailable", "Foundry settings are unavailable."));
      const registered = findRegisteredSetting(game, namespace, key);
      assertSettingAuthority(game, registered, namespace, key);
      const normalized = namespace === MODULE_ID
        ? normalizeSetting(key, value)
        : normalizeRegisteredSetting(registered, value);
      if (namespace === "core" && key === "noCanvas" && setMobileNoCanvas) await setMobileNoCanvas(normalized);
      else await game.settings.set(namespace, key, normalized);
      const stored = game.settings.get(namespace, key);
      if (namespace === MODULE_ID) syncBootstrapPreferences(() => game);
      return Object.freeze({
        ok: true,
        namespace,
        key,
        value: namespace === MODULE_ID ? normalizeSetting(key, stored) : serializableValue(stored),
        requiresReload: Boolean(registered?.requiresReload)
      });
    },

    async setCharacterCollectionPreference({ key, value }) {
      const settingKey = CHARACTER_COLLECTION_SETTING_KEYS[key];
      if (!settingKey) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.CollectionPreferenceUnsupported", "That character collection preference is not supported."));
      const game = getGame();
      if (!game?.settings?.set) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.FoundrySettingsUnavailable", "Foundry settings are unavailable."));
      const normalized = normalizeSetting(settingKey, value);
      await game.settings.set(MODULE_ID, settingKey, normalized);
      return Object.freeze({ ok: true, key, value: normalizeSetting(settingKey, game.settings.get(MODULE_ID, settingKey)) });
    },

    async restoreDefaults() {
      if (restoring) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.DefaultsRestoring", "Defaults are already being restored."));
      restoring = true;
      try {
        const session = getGame();
        const fields = preferenceFields(setting, localize, getNavigator, getGame);
        let requiresReload = false;
        const overlayVisibility = sanitizeBooleanRecord(setting(KEYS.MODULE_OVERLAY_VISIBILITY));
        if (Object.keys(overlayVisibility).length) {
          await session.settings.set(MODULE_ID, KEYS.MODULE_OVERLAY_VISIBILITY, {});
        }
        const overlayOrder = sanitizeStringArray(setting(KEYS.MODULE_OVERLAY_ORDER));
        if (overlayOrder.length) await session.settings.set(MODULE_ID, KEYS.MODULE_OVERLAY_ORDER, []);
        const overlayScale = sanitizeScaleRecord(setting(KEYS.MODULE_OVERLAY_SCALE));
        if (Object.keys(overlayScale).length) await session.settings.set(MODULE_ID, KEYS.MODULE_OVERLAY_SCALE, {});
        for (const settingKey of Object.values(CHARACTER_COLLECTION_SETTING_KEYS)) {
          if (setting(settingKey) !== DEFAULTS[settingKey]) await session.settings.set(MODULE_ID, settingKey, DEFAULTS[settingKey]);
        }
        if (setting(KEYS.CHARACTER_FAVOURITES_SOURCE) !== DEFAULTS.characterFavouritesSource) {
          await session.settings.set(MODULE_ID, KEYS.CHARACTER_FAVOURITES_SOURCE, DEFAULTS.characterFavouritesSource);
        }
        if (setting(KEYS.MEMORY_PROTECTION_BEHAVIOR) !== DEFAULTS.memoryProtectionBehavior) {
          await session.settings.set(MODULE_ID, KEYS.MEMORY_PROTECTION_BEHAVIOR, DEFAULTS.memoryProtectionBehavior);
        }
        // Browser defaults never reset the GM-owned world graphics policy.
        if (Object.keys(setting(KEYS.GRAPHICS_PROFILE_TRANSACTION) ?? {}).length) {
          await session.settings.set(MODULE_ID, KEYS.GRAPHICS_PROFILE_TRANSACTION, {});
        }
        if (Object.keys(setting(KEYS.MEMORY_PREFLIGHT_STATE) ?? {}).length) {
          await session.settings.set(MODULE_ID, KEYS.MEMORY_PREFLIGHT_STATE, {});
        }
        // Auto-detect may stop a forced mobile view, so restore mode last.
        const ordered = [...fields].sort((a, b) => Number(a.key === KEYS.MODE) - Number(b.key === KEYS.MODE));
        for (const field of ordered) {
          if (getGame() !== session) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.SessionChanged", "The session changed. Try restoring defaults again."));
          if ((field.namespace !== MODULE_ID && field.supported === false) || field.value === field.defaultValue) continue;
          const result = await this.set({ namespace: field.namespace, key: field.key, value: field.defaultValue });
          requiresReload ||= result.requiresReload;
        }
        return Object.freeze({ ok: true, requiresReload });
      } finally {
        restoring = false;
      }
    },

    async logout() {
      const game = getGame();
      if (typeof game?.logOut !== "function") throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.LogoutUnavailable", "Foundry logout is unavailable."));
      await game.logOut();
      return Object.freeze({ ok: true });
    }
  });
}

/** A live proxy description of Foundry v13's native client performance setting. */
export function performanceModeField(game = globalThis.game, localize = (key) => localizeValue(game, key)) {
  const registered = findRegisteredSetting(game, "core", "performanceMode");
  const modes = globalThis.CONST?.CANVAS_PERFORMANCE_MODES;
  const expectedValues = [modes?.LOW, modes?.MED, modes?.HIGH, modes?.MAX];
  const nativeChoices = settingChoices(registered ?? {}, game)
    .filter(choice => expectedValues.includes(Number(choice.value)))
    .sort((a, b) => Number(a.value) - Number(b.value));
  let value = null;
  try {
    value = game?.settings?.get?.("core", "performanceMode");
  } catch {
    // Foundry has not finished registering its core client settings.
  }
  const automatic = value === null;
  const choices = automatic
    ? Object.freeze([Object.freeze({ value: "", label: localize("VEMOBILE.Settings.FoundryPerformance.Automatic") }), ...nativeChoices])
    : nativeChoices;
  return Object.freeze({
    namespace: "core",
    key: "performanceMode",
    type: "choice",
    name: localize("VEMOBILE.Settings.FoundryPerformance.Name"),
    hint: localize("VEMOBILE.Settings.FoundryPerformance.Hint"),
    value: automatic ? "" : Number(value),
    choices,
    scope: "client",
    requiresReload: Boolean(registered?.requiresReload),
    supported: Boolean(registered?.config && expectedValues.every(Number.isFinite) && nativeChoices.length === 4),
    ...(registered?.config ? {} : { unsupported: localize("VEMOBILE.Settings.FoundryPerformance.Unsupported") })
  });
}

function preferenceFields(setting, localize, getNavigator, getGame) {
  return Object.freeze([
    choiceField(KEYS.MODE, "Mode", normalizedModePreference(setting(KEYS.MODE)), localize),
    choiceField(KEYS.THEME, "Theme", setting(KEYS.THEME), localize),
    choiceField(KEYS.COLOR_SCHEME, "ColourScheme", setting(KEYS.COLOR_SCHEME), localize),
    booleanField(KEYS.PROTECT_VE_STYLING, "ProtectVeStyling", setting(KEYS.PROTECT_VE_STYLING) !== false, localize),
    choiceField(KEYS.HEADER_ARTWORK, "HeaderArtwork", setting(KEYS.HEADER_ARTWORK), localize),
    Object.freeze({
      namespace: MODULE_ID,
      key: KEYS.HEADER_ARTWORK_OPACITY,
      type: "range",
      name: localize("VEMOBILE.Settings.HeaderArtworkOpacity.Name"),
      hint: localize("VEMOBILE.Settings.HeaderArtworkOpacity.Hint"),
      value: normalizedOpacity(setting(KEYS.HEADER_ARTWORK_OPACITY)),
      min: 0,
      max: 1,
      step: 0.05,
      suffix: "%"
    }),
    booleanField(KEYS.QUICKBAR_ENABLED, "QuickbarEnabled", setting(KEYS.QUICKBAR_ENABLED) !== false, localize),
    choiceField(KEYS.QUICKBAR_SOURCE, "QuickbarSource", String(setting(KEYS.QUICKBAR_SOURCE) ?? "character"), localize),
    booleanField(KEYS.SHOW_ACTION_SUMMARIES, "ShowActionSummaries", setting(KEYS.SHOW_ACTION_SUMMARIES) !== false, localize),
    booleanField(KEYS.COMPACT_ACTION_SUMMARIES, "CompactActionSummaries", setting(KEYS.COMPACT_ACTION_SUMMARIES) === true, localize),
    choiceField(KEYS.GRAPHICS_SAFETY, "GraphicsSafety", normalizedChoice(KEYS.GRAPHICS_SAFETY, setting(KEYS.GRAPHICS_SAFETY), DEFAULTS.graphicsSafety), localize),
    choiceField(KEYS.DICE_RENDERING, "DiceRendering", normalizedChoice(KEYS.DICE_RENDERING, setting(KEYS.DICE_RENDERING), DEFAULTS.diceRendering), localize),
    choiceField(KEYS.MOBILE_OPTIMIZED_ASSETS, "MobileOptimizedAssets", normalizedChoice(KEYS.MOBILE_OPTIMIZED_ASSETS, setting(KEYS.MOBILE_OPTIMIZED_ASSETS), DEFAULTS.mobileOptimizedAssets), localize),
    choiceField(KEYS.AFTER_GRAPHICS_FAILURE, "AfterGraphicsFailure", normalizedChoice(KEYS.AFTER_GRAPHICS_FAILURE, setting(KEYS.AFTER_GRAPHICS_FAILURE), DEFAULTS.afterGraphicsFailure), localize),
    booleanField(KEYS.SCENE_MEMORY_WARNINGS, "SceneMemoryWarnings", setting(KEYS.SCENE_MEMORY_WARNINGS) !== false, localize),
    choiceField(KEYS.LOGGING_LEVEL, "LoggingLevel", setting(KEYS.LOGGING_LEVEL), localize),
    booleanField(KEYS.SAVE_DIAGNOSTICS_TO_JOURNAL, "SaveDiagnosticsToJournal", setting(KEYS.SAVE_DIAGNOSTICS_TO_JOURNAL) !== false, localize),
    canvasField(getGame, localize),
    Object.freeze({
      namespace: MODULE_ID,
      key: KEYS.MOVEMENT_REPEAT_DELAY,
      type: "range",
      name: localize("VEMOBILE.Settings.MovementRepeatDelay.Name"),
      hint: localize("VEMOBILE.Settings.MovementRepeatDelay.Hint"),
      value: normalizedDelay(setting(KEYS.MOVEMENT_REPEAT_DELAY)),
      min: 0,
      max: 1,
      step: 0.1,
      suffix: localize("VEMOBILE.Settings.Seconds")
    }),
    booleanField(KEYS.RECENTER_AFTER_MOVE, "RecenterAfterMove", setting(KEYS.RECENTER_AFTER_MOVE), localize),
    choiceField(KEYS.JOYSTICK_SIDE, "JoystickSide", normalizedChoice(KEYS.JOYSTICK_SIDE, setting(KEYS.JOYSTICK_SIDE), DEFAULTS.joystickSide), localize),
    booleanField(KEYS.COMBAT_CAROUSEL, "CombatCarousel", setting(KEYS.COMBAT_CAROUSEL) !== false, localize),
    Object.freeze({
      ...booleanField(KEYS.KEEP_SCREEN_AWAKE, "KeepScreenAwake", setting(KEYS.KEEP_SCREEN_AWAKE), localize),
      supported: typeof getNavigator()?.wakeLock?.request === "function",
      unsupported: localize("VEMOBILE.Settings.KeepScreenAwake.Unsupported"),
      wakeLock: true,
      failure: localize("VEMOBILE.Settings.KeepScreenAwake.Failure")
    })
  ].map(field => Object.freeze({ ...field, defaultValue: field.namespace === MODULE_ID ? DEFAULTS[field.key] : (findRegisteredSetting(getGame(), field.namespace, field.key)?.default ?? false) })));
}

function settingControlType(registered, choices, range) {
  if (choices.length) return "choice";
  const name = registered.type?.constructor?.name ?? registered.type?.name ?? "";
  if (registered.type === Boolean || name === "BooleanField") return "boolean";
  if (registered.type === Number || name === "NumberField") return range ? "range" : "number";
  if (name === "ColorField") return "color";
  if (registered.type === String || ["StringField", "FilePathField"].includes(name) || registered.filePicker) return "text";
  return null;
}

function settingChoices(registered, game = globalThis.game) {
  let raw = registered.choices ?? registered.type?.choices;
  try {
    if (typeof raw === "function") raw = raw();
  } catch {
    return Object.freeze([]);
  }
  const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw ?? {});
  return Object.freeze(entries.map(([value, label]) => Object.freeze({
    value: String(value),
    label: localizeValue(game, label)
  })));
}

function settingRange(registered) {
  const source = registered.range ?? registered.type;
  const min = Number(source?.min);
  const max = Number(source?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const step = Number(source?.step);
  return Object.freeze({ min, max, step: Number.isFinite(step) && step > 0 ? step : 1 });
}

function findRegisteredSetting(game, namespace, key) {
  return game?.settings?.settings?.get?.(`${namespace}.${key}`)
    ?? registryValues(game?.settings?.settings).find((entry) => entry?.namespace === namespace && entry?.key === key)
    ?? null;
}

function assertSettingAuthority(game, registered, namespace, key) {
  if (!registered) {
    if (namespace === MODULE_ID) return;
    throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.FoundrySettingMissing", "That Foundry setting does not exist."));
  }
  if (!registered.config) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.FoundrySettingNotConfigurable", "That Foundry setting is not configurable here."));
  if (registered.scope === "world" && !game?.user?.can?.("SETTINGS_MODIFY")) {
    throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.WorldSettingPermission", "You do not have permission to change that world setting."));
  }
  if (registered.namespace !== namespace || registered.key !== key) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.FoundrySettingMissing", "That Foundry setting does not exist."));
}

function normalizeRegisteredSetting(registered, value) {
  const choices = settingChoices(registered);
  if (choices.length) {
    const choice = String(value ?? "");
    if (!choices.some((entry) => entry.value === choice)) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.ChoiceUnsupported", "That setting choice is not supported."));
    return isNumberSetting(registered) ? Number(choice) : choice;
  }
  const type = settingControlType(registered, choices, settingRange(registered));
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.BooleanExpected", "That setting requires an on or off value."));
    return value;
  }
  if (type === "number" || type === "range") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.NumberExpected", "That setting requires a number."));
    const range = settingRange(registered);
    if (range && (number < range.min || number > range.max)) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.RangeExceeded", "That setting is outside its allowed range."));
    return number;
  }
  if (type === "text" || type === "color") return String(value ?? "");
  throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.MobileTypeUnsupported", "That setting type is not supported on mobile."));
}

function isNumberSetting(registered) {
  const name = registered.type?.constructor?.name ?? registered.type?.name ?? "";
  return registered.type === Number || name === "NumberField";
}

function registryValues(registry) {
  try {
    return typeof registry?.values === "function" ? [...registry.values()] : [];
  } catch {
    return [];
  }
}

function serializableValue(value) {
  if (["string", "number", "boolean"].includes(typeof value) || value === null) return value;
  return String(value ?? "");
}

function settingsLabels(localize) {
  const keys = [
    "SettingsSubtitle", "MobileSettingsTitle", "DeviceLabel", "DeviceResolving", "PhoneModeEnabled", "TabletModeEnabled",
    "DesktopModeEnabled", "PhoneModeSelected", "TabletModeSelected", "DesktopModeSelected", "Left", "Right", "JoystickCurrently",
    "ModuleOverlayExplanation", "ModuleOverlayWarning", "ModuleOverlayScan", "ModuleOverlayRescan", "ModuleOverlayNotScanned",
    "ModuleOverlayNone", "ModuleOverlayDetectedOne", "ModuleOverlayDetectedMany", "ModuleOverlayShow", "ModuleOverlayUnavailable",
    "ModuleOverlayScanning", "ModuleOverlayOrderHint", "ModuleOverlayScale", "SessionTitle", "Online", "LatencyTitle", "FpsTitle", "SessionMetricsNote"
  ];
  return Object.freeze(Object.fromEntries(keys.map((key) => [key[0].toLowerCase() + key.slice(1), localize(`VEMOBILE.Settings.Copy.${key}`)])));
}

function localizeValue(game, value, data) {
  const text = String(value ?? "");
  if (data && typeof game?.i18n?.format === "function") return game.i18n.format(text, data);
  return game?.i18n?.localize?.(text) ?? text;
}

function choiceField(key, group, value, localize) {
  return Object.freeze({
    namespace: MODULE_ID,
    key,
    type: "choice",
    name: localize(`VEMOBILE.Settings.${group}.Name`),
    hint: localize(`VEMOBILE.Settings.${group}.Hint`),
    value: CHOICES[key].includes(value) ? value : CHOICES[key][0],
    choices: Object.freeze(CHOICES[key].map((choice) => Object.freeze({
      value: choice,
      label: localize(`VEMOBILE.Settings.${group}.${choice[0].toUpperCase()}${choice.slice(1)}`)
    })))
  });
}

function booleanField(key, group, value, localize) {
  return Object.freeze({
    namespace: MODULE_ID,
    key,
    type: "boolean",
    name: localize(`VEMOBILE.Settings.${group}.Name`),
    hint: localize(`VEMOBILE.Settings.${group}.Hint`),
    value: Boolean(value),
    supported: true
  });
}

function normalizeSetting(key, value) {
  if (key === KEYS.MODE && value === "off") return "desktop";
  if (CHOICES[key]) {
    const choice = String(value ?? "");
    if (!CHOICES[key].includes(choice)) throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.ChoiceUnsupported", "That setting choice is not supported."));
    return choice;
  }
  if (key === KEYS.MOVEMENT_REPEAT_DELAY) return normalizedDelay(value);
  if (key === KEYS.HEADER_ARTWORK_OPACITY) return normalizedOpacity(value);
  if (key === KEYS.MODULE_OVERLAY_VISIBILITY) return sanitizeBooleanRecord(value);
  if (key === KEYS.MODULE_OVERLAY_CATALOG) return sanitizeOverlayCatalog(value);
  if (key === KEYS.MODULE_OVERLAY_ORDER) return sanitizeStringArray(value);
  if (key === KEYS.MODULE_OVERLAY_SCALE) return sanitizeScaleRecord(value);
  if (key === KEYS.RECENTER_AFTER_MOVE || key === KEYS.COMBAT_CAROUSEL || key === KEYS.KEEP_SCREEN_AWAKE || key === KEYS.PROTECT_VE_STYLING || key === KEYS.QUICKBAR_ENABLED || key === KEYS.SHOW_ACTION_SUMMARIES || key === KEYS.COMPACT_ACTION_SUMMARIES
    || key === KEYS.LOW_MEMORY_CANVAS || key === KEYS.SCENE_MEMORY_WARNINGS || key === KEYS.FCS_AUTO_SOFT_OVERRIDE || key === KEYS.SAVE_DIAGNOSTICS_TO_JOURNAL) {
    if (typeof value !== "boolean") throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.BooleanExpected", "That setting requires an on or off value."));
    return value;
  }
  throw new Error(localizeFoundry("VEMOBILE.Settings.Errors.VeSettingMissing", "That VE Mobile setting does not exist."));
}

export function isTidy5eActive(game = globalThis.game) {
  return Boolean(game?.modules?.get?.("tidy5e-sheet")?.active);
}

export function resolveCharacterFavouritesSource(value, game = globalThis.game) {
  const configured = normalizedChoice(KEYS.CHARACTER_FAVOURITES_SOURCE, value, DEFAULTS.characterFavouritesSource);
  const tidyDetected = isTidy5eActive(game);
  const stale = !tidyDetected && ["tidy", "both"].includes(configured);
  const effective = stale ? "core" : configured;
  return Object.freeze({ configured, effective, enabled: effective !== "off", tidyDetected, stale });
}

function sanitizeBooleanRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key, enabled]) => /^[a-z0-9][a-z0-9:_-]{0,191}$/u.test(key) && enabled === true)
    .slice(0, 128));
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))].slice(0, 128);
}

function sanitizeScaleRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => /^[a-z0-9][a-z0-9:_-]{0,191}$/u.test(key))
    .map(([key, scale]) => [key, Math.max(50, Math.min(100, Math.round(Number(scale) / 5) * 5))])
    .filter(([, scale]) => Number.isFinite(scale) && scale !== 100)
    .slice(0, 128));
}

function sanitizeOverlayCatalog(value) {
  const source = Array.isArray(value) ? value : value?.entries;
  if (!Array.isArray(source)) return { scanned: false, entries: [] };
  const entries = source.slice(0, 128).map((entry) => ({
    id: String(entry?.id ?? "").slice(0, 192),
    moduleId: String(entry?.moduleId ?? "").slice(0, 128),
    moduleTitle: String(entry?.moduleTitle ?? "").slice(0, 160),
    overlayName: String(entry?.overlayName ?? "").slice(0, 160),
    rootId: String(entry?.rootId ?? "").slice(0, 160)
  })).filter((entry) => entry.id && entry.moduleId && entry.rootId);
  return { scanned: value?.scanned === true, entries };
}

function normalizedModePreference(value) {
  const mode = value === "off" ? "desktop" : String(value ?? "");
  return CHOICES[KEYS.MODE].includes(mode) ? mode : BOOTSTRAP_DEFAULTS.mode;
}

function canvasField(getGame, localize) {
  const game = getGame();
  const registered = findRegisteredSetting(game, "core", "noCanvas");
  let value = false;
  try {
    value = Boolean(game?.settings?.get?.("core", "noCanvas"));
  } catch {
    // The setting is unavailable until Foundry has registered its core settings.
  }
  return Object.freeze({
    kind: "setting",
    namespace: "core",
    key: "noCanvas",
    type: "boolean",
    name: localize("VEMOBILE.Settings.DisableCanvas.Name"),
    hint: localize("VEMOBILE.Settings.DisableCanvas.Hint"),
    value,
    scope: "client",
    requiresReload: true,
    supported: Boolean(registered?.config),
    ...(registered?.config ? {} : { unsupported: localize("VEMOBILE.Settings.DisableCanvas.Unsupported") })
  });
}

function normalizedLoggingLevel(value) {
  const level = String(value ?? "");
  return CHOICES[KEYS.LOGGING_LEVEL].includes(level) ? level : "warn";
}

function normalizedChoice(key, value, fallback) {
  const choice = String(value ?? "");
  return CHOICES[key]?.includes(choice) ? choice : fallback;
}

export function normalizedMemoryProfile(value, legacyLowMemory = false) {
  const profile = String(value ?? "");
  if (CHOICES[KEYS.MEMORY_PROTECTION_PROFILE].includes(profile) && profile !== "normal") return profile;
  // v0.1 candidates stored the accepted sharp-token profile as a boolean.
  // Keep it effective as Balanced until a staged profile is explicitly saved.
  if (legacyLowMemory === true) return "balanced";
  return "normal";
}

function normalizedColorScheme(value) {
  const scheme = String(value ?? "class");
  return CHOICES[KEYS.COLOR_SCHEME].includes(scheme) ? scheme : "class";
}

function normalizedDelay(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.round(Math.min(1, Math.max(0, number)) * 10) / 10;
}

function normalizedOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.round(Math.min(1, Math.max(0, number)) * 20) / 20;
}

function readSetting(key, fallback) {
  try {
    const value = game?.settings?.get?.(MODULE_ID, key);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

export { KEYS };
