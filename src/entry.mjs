import { localizeFoundry } from "./foundry/localization.mjs";
import { createControlsGuideGateway } from "./foundry/controls-guide-gateway.mjs";
import { createControlsGuide } from "./ui/controls-guide.mjs";
import { createAppKernel } from "./kernel/app-kernel.mjs";
import { createSignalStore } from "./kernel/signal-store.mjs";
import { initialAppState, reduceAppState } from "./kernel/app-state.mjs";
import { classifyRuntimeMode, createActivationPolicyResolver, createSessionActivationOverride } from "./foundry/activation-policy.mjs";
import {
  createFoundryPreferencesGateway,
  KEYS,
  MODULE_ID,
  readKeepScreenAwake,
  readLocale,
  readLoggingLevel,
  readProtectVeStyling,
  readPreferences,
  registerPreferences
} from "./foundry/preferences.mjs";
import { createFoundrySessionGateway } from "./foundry/session-gateway.mjs";
import { enableMobilePresentation, enableVeStyleAuthority } from "./foundry/mobile-presentation.mjs";
import { createFoundryCommandGateway } from "./foundry/command-gateway.mjs";
import { createFoundrySceneGateway } from "./foundry/scene-gateway.mjs";
import { enableMobileMediaGuard } from "./foundry/mobile-media-guard.mjs";
import { enableMobileDiceGuard } from "./foundry/mobile-dice-guard.mjs";
import { createGraphicsSafetyJournal, resolveMobileGraphicsPolicy } from "./foundry/mobile-graphics-policy.mjs";
import { createTaskScope } from "./kernel/task-scope.mjs";
import { createFoundryTokenMovementGateway } from "./foundry/token-movement-gateway.mjs";
import { createFoundryNativeChatGateway } from "./foundry/native-chat-gateway.mjs";
import { createFoundryActionSessionGateway } from "./foundry/action-session-gateway.mjs";
import { createBootstrapWakePreference, createScreenWakeLockController } from "./foundry/screen-wake-lock.mjs";
import { enableMobileConnectionGrace } from "./foundry/connection-grace.mjs";
import { createMobileBootstrap, navigationStartAt, suppressBootstrapSoftwareKeyboard } from "./ui/bootstrap-loader.mjs";
import { createBootstrapWatchdog } from "./kernel/bootstrap-watchdog.mjs";
import { createMobileDiagnostics } from "./foundry/mobile-diagnostics.mjs";
import { createDiagnosticsJournalGateway } from "./foundry/diagnostics-journal-gateway.mjs";
import { createArmorClassGateway } from "./foundry/armor-class-gateway.mjs";
import { createFoundryHotbarGateway } from "./foundry/hotbar-gateway.mjs";
import { createActionBarPreferences } from "./foundry/action-bar-preferences.mjs";
import { createFoundryQuickbarGateway } from "./foundry/quickbar-gateway.mjs";
import { createMobileMetrics } from "./foundry/mobile-metrics.mjs";
import { createFoundryCombatGateway } from "./foundry/combat-gateway.mjs";
import { createFoundryAuthoritativeSessionGateway } from "./foundry/authoritative-session-gateway.mjs";
import { createFoundryCanvasRecoveryGateway } from "./foundry/canvas-recovery-gateway.mjs";
import { createClientLoadTimingGateway } from "./foundry/client-load-timing-gateway.mjs";
import { observeNativeSceneArtworkProgress } from "./foundry/native-scene-artwork-progress.mjs";
import { createConnectionGeneration } from "./kernel/connection-generation.mjs";
import { createFoundryThemeGateway } from "./foundry/theme-gateway.mjs";
import { createFoundrySettingsCompatibilityGateway } from "./foundry/settings-compatibility-gateway.mjs";
import { createFoundryDesktopSettingsVisibilityGateway } from "./foundry/desktop-settings-visibility-gateway.mjs";
import { createFoundryTemplatePlacementGateway } from "./foundry/template-placement-gateway.mjs";
import { createNativeTokenPlacementGateway } from "./foundry/native-token-placement-gateway.mjs";
import { createActorTokenPlacementGateway } from "./foundry/actor-token-placement-gateway.mjs";
import { createModuleOverlayGateway } from "./foundry/module-overlay-gateway.mjs";
import { createFoundrySessionStatusGateway } from "./foundry/session-status-gateway.mjs";
import { createFoundryActiveEffectContextGateway } from "./foundry/active-effect-context-gateway.mjs";
import { createDeviceIdentityGateway } from "./foundry/device-identity.mjs";
import { createSceneCameraIntentCoordinator } from "./kernel/scene-interaction-readiness.mjs";
import { createPerformanceObserver } from "./kernel/performance-observer.mjs";
import { createMobilePerformanceAuthority, isMobilePerformanceAuthorityActive } from "./kernel/presentation-mode-authority.mjs";
import { createMobileStartupGateway } from "./foundry/mobile-startup-gateway.mjs";
import { showDesktopRestorationRecovery } from "./ui/desktop-restoration-recovery.mjs";
import { createMobilePerformanceLifecycle } from "./kernel/mobile-performance-lifecycle.mjs";
import { createFoundryBiographyGateway } from "./foundry/biography-gateway.mjs";
import { createFoundryMobileAssetGateway } from "./foundry/mobile-asset-gateway.mjs";
import { createLowMemoryCanvasGateway, memoryProfilePolicy } from "./foundry/low-memory-canvas-gateway.mjs";
import { createGraphicsRecoveryGateway } from "./foundry/graphics-recovery-gateway.mjs";
import { enableMobileJournalReader } from "./foundry/mobile-journal-reader-gateway.mjs";
import { createDurableProfileHandoff, createScenePreflightGateway } from "./foundry/scene-preflight-gateway.mjs";
import { createChatDomGateway, installVeChatWindowClass } from "./foundry/chat-dom-gateway.mjs";
import { createMobileAssetOptimizer } from "./features/settings/presenter.mjs";
import { createMobileClientCapabilityGateway } from "./foundry/mobile-client-capability-gateway.mjs";
import { createFoundryMobileBackGateway } from "./foundry/mobile-back-gateway.mjs";
import { createNativeLightingPrecisionCompatibility } from "./foundry/native-lighting-precision.mjs";
import { createActorEditorGateway } from "./foundry/actor-editor-gateway.mjs";

const isGamePage = /\/game\/?$/.test(window.location.pathname);

if (isGamePage) {
  const fullLoadStartedAt = navigationStartAt();
  const loadTimingGateway = createClientLoadTimingGateway();
  // This page-lifetime physical classification is deliberately independent of
  // the user's Phone/Tablet/Desktop presentation choice.
  const physicalDeviceClass = classifyRuntimeMode();
  const sessionActivation = createSessionActivationOverride();
  const activationPolicy = createActivationPolicyResolver();
  let mobileMutationReady = false;
  let startupBlocked = false;
  const readRequestedPolicy = () => sessionActivation.apply(activationPolicy.resolve(readPreferences()));
  const readPolicy = () => {
    const requested = readRequestedPolicy();
    return { ...requested, active: requested.active && !startupBlocked,
      canvasAvailable: !readNoCanvas(), sessionReady: globalThis.game?.ready === true && !startupBlocked };
  };
  const mobilePerformanceAuthority = createMobilePerformanceAuthority(readPolicy, () => mobileMutationReady && !startupBlocked);
  const preferencesGateway = createFoundryPreferencesGateway({ setMobileNoCanvas: value => lowMemoryGateway.setNoCanvas(value) });
  const settingsCompatibilityGateway = createFoundrySettingsCompatibilityGateway();
  const controlsGuideGateway = createControlsGuideGateway();
  const desktopSettingsVisibility = createFoundryDesktopSettingsVisibilityGateway({ readPolicy });
  const deviceIdentityGateway = createDeviceIdentityGateway();
  const graphicsJournal = createGraphicsSafetyJournal();
  const graphicsDecisionRecovery = () => {
    const recovery = graphicsJournal.recovery();
    let acknowledgedAt = 0;
    try { acknowledgedAt = Number(globalThis.game?.settings?.get?.(MODULE_ID, KEYS.GRAPHICS_RECOVERY_ACKNOWLEDGED) ?? 0); }
    catch { /* The setting may not yet be registered during init. */ }
    const pendingLoss = Number(recovery.lastContextLossAt ?? 0) > acknowledgedAt;
    return {
      ...recovery,
      ambiguousUncleanExit: false,
      recentSceneDrawInterruption: false,
      historicalContextLoss: false,
      contextLossThisSession: pendingLoss && recovery.contextLossThisSession,
      repeatedRecentContextLoss: pendingLoss && recovery.repeatedRecentContextLoss,
      recentContextLossCount: pendingLoss ? recovery.recentContextLossCount : 0
    };
  };
  let mobileAssetGateway = null;
  let lowMemoryGateway = null;
  let durableProfileHandoff = null;
  let graphicsRecoveryGateway = null;
  let scenePreflightGateway = null;
  let clientCapabilityGateway = null;
  let preflightScope = null;
  let chatDomGateway = null;
  let mobileBackGateway = null;
  let visualIsolationController = null;
  const baseGraphicsPolicy = () => {
    const preferences = preferencesGateway.snapshot();
    return resolveMobileGraphicsPolicy({
      graphicsSafety: preferences.graphicsSafety,
      diceRendering: preferences.diceRendering,
      recovery: graphicsDecisionRecovery()
    });
  };
  const resolvedGraphicsPolicy = () => memoryProfilePolicy(
    mobilePerformanceAuthority.active() ? (lowMemoryGateway?.snapshot?.().profile ?? preferencesGateway.snapshot().memoryProtectionProfile ?? "normal") : "normal",
    baseGraphicsPolicy()
  );
  let performanceEnabled = false;
  const performanceObserver = createPerformanceObserver({ enabled: () => performanceEnabled });
  let diagnosticsJournalGateway = null;
  const lightingPrecision = createNativeLightingPrecisionCompatibility();
  const diagnostics = createMobileDiagnostics({
    readLevel: readLoggingLevel,
    getGraphicsPolicy: () => resolvedGraphicsPolicy(),
    getModuleOverlays: () => moduleOverlayGateway.diagnosticSnapshot(),
    getMobileMemory: () => mobileMemoryDiagnostics(),
    getChatDom: () => chatDomGateway?.snapshot?.() ?? null,
    getMobileBack: () => mobileBackGateway?.snapshot?.() ?? null,
    getLightingPrecision: () => lightingPrecision.snapshot(),
    getLoadTiming: () => loadTimingGateway.snapshot(),
    onRecord: (entry) => diagnosticsJournalGateway?.onRecord?.(entry)
  });
  diagnosticsJournalGateway = createDiagnosticsJournalGateway({
    getMode: () => readPolicy().runtimeMode,
    getPreferences: () => preferencesGateway.snapshot(),
    getGraphics: () => ({ ...resolvedGraphicsPolicy(), ...lowMemoryGateway?.snapshot?.() }),
    getDiagnostics: () => diagnostics
  });
  mobileBackGateway = createFoundryMobileBackGateway({
    trace: (event) => diagnostics.record(event.action === "error" ? "warn" : "debug", `Browser Back ${JSON.stringify(event)}`)
  });
  const moduleOverlayGateway = createModuleOverlayGateway({ diagnostics, performanceObserver });
  const wakeLockSupported = typeof navigator.wakeLock?.request === "function";
  let resolveSettingsReady;
  const settingsReady = new Promise((resolve) => { resolveSettingsReady = resolve; });
  let startupComplete = false;
  let bootstrapFinishing = false;
  let wakePreferenceHandedOff = false;
  let wakeStatusVersion = 0;
  const bootstrapWakePreference = createBootstrapWakePreference({
    initialValue: readKeepScreenAwake(),
    persist: async (value) => {
      await settingsReady;
      try {
        await preferencesGateway.set({ key: KEYS.KEEP_SCREEN_AWAKE, value });
      } catch (error) {
        console.warn("VE Mobile | Could not save the loading screen wake preference", error);
      }
    }
  });
  const readWakeEnabled = () => wakePreferenceHandedOff
    ? readKeepScreenAwake()
    : bootstrapWakePreference.enabled;
  // The only implemented wake mechanism is the native Screen Wake Lock API.
  // Do not offer a control on a browser where it cannot do anything.
  const showBootstrapWakeControl = wakeLockSupported;
  const wakeLock = createScreenWakeLockController({ readEnabled: readWakeEnabled });
  const bootstrap = createMobileBootstrap({
    readLocale,
    localize: (key, fallback) => localizeFoundry(key, fallback),
    iconUrl: new URL("../Icon.png", import.meta.url).href
  });
  const refreshBootstrapLocalization = () => { bootstrap.refreshLocalization?.(); renderBootstrapPhase(currentBootstrapStage); if (bootstrapRecoveryReason) showBootstrapRecovery(bootstrapRecoveryReason); };
  const localizationHook = Hooks.once("i18nInit", refreshBootstrapLocalization);
  window.addEventListener("pagehide", () => Hooks.off("i18nInit", localizationHook), { once: true });
  let currentBootstrapStage = "module";
  let bootstrapRecoveryReason = "";
  let bootstrapScope = null;
  let bootstrapWatchdog = null;

  const showBootstrapRecovery = (reason = "stalled") => {
    if (startupComplete || !bootstrap.mounted) return;
    bootstrapRecoveryReason = reason;
    const message = reason === "backgrounded"
      ? localizeFoundry("VEMOBILE.Boot.BrowserSuspended", "The browser was suspended before Foundry finished loading. Refresh the game to restart the session safely.")
      : reason === "startup-error"
        ? localizeFoundry("VEMOBILE.Boot.StartupFailed", "The mobile interface could not finish starting. Refresh the game to try again.")
        : localizeFoundry("VEMOBILE.Boot.StartupStalled", "Foundry has stopped reporting startup progress. Refresh the game to try again.");
    bootstrap.showRecovery({
      title: localizeFoundry("VEMOBILE.Boot.Interrupted", "Loading interrupted"),
      message,
      actionLabel: localizeFoundry("VEMOBILE.Boot.Refresh", "Refresh game")
    });
  };

  const advanceBootstrap = (stage) => {
    currentBootstrapStage = stage;
    bootstrapWatchdog?.progress();
    bootstrap.advance(stage);
    renderBootstrapPhase(stage);
  };
  const renderBootstrapPhase = stage => {
    const labels = {
      init: localizeFoundry("VEMOBILE.Boot.Phase.init", "Preparing game settings…"), world: localizeFoundry("VEMOBILE.Boot.Phase.world", "Preparing world data…"),
      canvas: localizeFoundry("VEMOBILE.Boot.Phase.canvas", "Preparing scene…"), theme: localizeFoundry("VEMOBILE.Boot.Phase.theme", "Preparing mobile appearance…"),
      recovery: localizeFoundry("VEMOBILE.Boot.Phase.recovery", "Checking session…"), session: localizeFoundry("VEMOBILE.Boot.Phase.session", "Restoring your session…"),
      interface: localizeFoundry("VEMOBILE.Boot.Phase.interface", "Restoring mobile interface…")
    };
    bootstrap.setPhase?.({ label: labels[stage] ?? localizeFoundry("VEMOBILE.Boot.Phase.Default", "Loading Foundry…") });
  };

  const updateBootstrapWake = async (fromGesture = false) => {
    const statusVersion = ++wakeStatusVersion;
    if (!bootstrap.mounted) return;
    const enabled = readWakeEnabled();
    if (!enabled) {
      bootstrap.setWakeState("off", {
        checked: false,
        visible: showBootstrapWakeControl
      });
      await wakeLock.reconcile();
      return;
    }
    if (!wakeLock.supported) {
      bootstrap.setWakeState("unsupported", {
        checked: true,
        visible: showBootstrapWakeControl
      });
      return;
    }
    bootstrap.setWakeState("pending", {
      checked: true,
      visible: showBootstrapWakeControl
    });
    const active = fromGesture
      ? await wakeLock.requestFromUserGesture()
      : await wakeLock.reconcile();
    if (!bootstrap.mounted || statusVersion !== wakeStatusVersion) return;
    bootstrap.setWakeState(active ? "active" : "attention", {
      checked: true,
      visible: showBootstrapWakeControl
    });
  };

  const chooseBootstrapWake = (enabled, { fromGesture = false } = {}) => {
    void bootstrapWakePreference.choose(enabled);
    void updateBootstrapWake(fromGesture);
  };

  const stopBootstrap = () => {
    bootstrapWatchdog?.stop();
    bootstrapWatchdog = null;
    bootstrap.unmount();
    bootstrapScope?.dispose();
    bootstrapScope = null;
  };

  const reconcileBootstrap = () => {
    if (startupComplete) return;
    const policy = readPolicy();
    if (!policy.active) {
      stopBootstrap();
      return;
    }
    bootstrap.mount(policy);
    bootstrap.setTiming?.({ startedAt: fullLoadStartedAt, lastSuccessfulMs: loadTimingGateway.lastSuccessfulFullLoadMs });
    if (!bootstrapScope) {
      bootstrapScope = createTaskScope("bootstrap", performanceObserver);
      wakeLock.enable(bootstrapScope);
      suppressBootstrapSoftwareKeyboard(bootstrapScope, bootstrap.surface);
      bootstrapScope.listen(bootstrap.wakeControl, "click", () => {
        const enabled = bootstrap.wakeControl.getAttribute("aria-checked") !== "true";
        chooseBootstrapWake(enabled, { fromGesture: enabled });
      });
      bootstrapScope.listen(bootstrap.wakePromptYesControl, "click", () => {
        if (!bootstrap.resolveWakePrompt(true)) return;
        chooseBootstrapWake(true, { fromGesture: true });
      });
      bootstrapScope.listen(bootstrap.wakePromptChoiceControl, "click", () => {
        const checked = bootstrap.wakePromptChoiceControl.getAttribute("aria-checked") !== "true";
        bootstrap.setWakePromptChecked(checked);
        if (!checked) {
          chooseBootstrapWake(false);
          bootstrap.resolveWakePrompt(false);
        }
      });
      bootstrapScope.listen(bootstrap.recoveryControl, "click", () => window.location.reload());
      bootstrapWatchdog = createBootstrapWatchdog({
        scope: bootstrapScope,
        onStall: showBootstrapRecovery
      });
    }
    void updateBootstrapWake();
  };

  const finishBootstrap = ({ animate = true, reason = "initial-ready" } = {}) => {
    if (startupComplete || bootstrapFinishing) return;
    bootstrapFinishing = true;
    bootstrapWatchdog?.stop();
    bootstrapWatchdog = null;
    if (!bootstrap.mounted || !bootstrapScope) {
      bootstrapFinishing = false;
      return;
    }
    const finishingScope = bootstrapScope;
    diagnostics.record("debug", `Mode transition bootstrap completion requested: reason=${reason}; mode=${readPolicy().runtimeMode}; viewport=${Math.round(window.visualViewport?.width ?? window.innerWidth)}x${Math.round(window.visualViewport?.height ?? window.innerHeight)}`);
    void bootstrap.complete({
      immediate: !animate,
      beforeDismiss: () => {
        // A native request may succeed during loading. Only stop for a trusted
        // gesture when the enabled preference still lacks an active lock.
        if (reason === "desktop-recovery" || !readWakeEnabled() || !wakeLock.supported || wakeLock.active) return null;
        bootstrap.setWakePromptChecked(true);
        return bootstrap.promptForWakeChoice();
      }
    }).then((completed) => {
      if (!completed || !bootstrap.mounted || bootstrapScope !== finishingScope) {
        bootstrapFinishing = false;
        return;
      }
      const complete = () => {
        bootstrap.unmount();
        if (bootstrapScope === finishingScope) bootstrapScope = null;
        finishingScope.dispose();
        wakeStatusVersion += 1;
        startupComplete = true;
        kernel?.refreshControlsInvitation?.();
        bootstrapFinishing = false;
        if (readPolicy().active && (!readPolicy().canvasAvailable || (globalThis.canvas?.ready && globalThis.canvas?.scene))) {
          const durationMs = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - fullLoadStartedAt);
          loadTimingGateway.note({ checkpoint: "ready" });
          void loadTimingGateway.saveFullLoad(durationMs).catch((error) => diagnostics.record("warn", "Could not save successful full-load duration", error));
          diagnostics.record("info", `Full load ready after ${Math.round(durationMs)}ms`);
        }
        void bootstrapWakePreference.whenIdle().then(() => {
          // Do not release a gesture-acquired lock against an older stored
          // value while the final checkbox write is still in flight.
          wakePreferenceHandedOff = true;
          return wakeLock.reconcile();
        });
        diagnostics.record("info", `Mode transition bootstrap completed: reason=${reason}; mode=${readPolicy().runtimeMode}`);
      };
      if (animate) finishingScope.timeout(complete, 700);
      else complete();
    });
  };

  reconcileBootstrap();

  const store = createSignalStore(initialAppState, reduceAppState);
  const connectionGeneration = createConnectionGeneration();
  const cameraIntents = createSceneCameraIntentCoordinator({
    trace: (entry) => diagnostics.record("debug", `Scene camera intent ${JSON.stringify(entry)}`)
  });
  const commandGateway = createFoundryCommandGateway({ getConnectionGeneration: () => connectionGeneration.current });
  const actorEditorGateway = createActorEditorGateway({ isActive: () => readPolicy().active && mobileMutationReady,
    getConnectionGeneration: () => connectionGeneration.current });
  const biographyGateway = createFoundryBiographyGateway({ getConnectionGeneration: () => connectionGeneration.current });
  lowMemoryGateway = createLowMemoryCanvasGateway({ getGraphicsPolicy: baseGraphicsPolicy, mobileAuthority: mobilePerformanceAuthority, diagnostics });
  durableProfileHandoff = createDurableProfileHandoff({ gateway: lowMemoryGateway, mobileAuthority: mobilePerformanceAuthority, diagnostics });
  mobileAssetGateway = createFoundryMobileAssetGateway({
    getConnectionGeneration: () => connectionGeneration.current,
    performanceObserver,
    getPhysicalDeviceClass: () => physicalDeviceClass,
    getPresentationMode: () => mobilePerformanceAuthority.active() ? readPolicy().runtimeMode : "desktop",
    getGraphicsPolicy: resolvedGraphicsPolicy,
    getLowMemorySnapshot: () => lowMemoryGateway.snapshot(),
    getRecovery: graphicsDecisionRecovery,
    getPresentationContext: () => memoryPresentationContext(),
    diagnostics
  });
  scenePreflightGateway = createScenePreflightGateway({
    readActive: () => mobilePerformanceAuthority.active(),
    readBehavior: () => preferencesGateway.snapshot().memoryProtectionBehavior,
    readWarnings: () => preferencesGateway.snapshot().sceneMemoryWarnings,
    readTheme: () => preferencesGateway.snapshot().theme,
    getProfileSnapshot: () => durableProfileHandoff.snapshot(),
    previewProfile: (profile) => lowMemoryGateway.preview(profile),
    planProfile: (profile) => lowMemoryGateway.plan(profile),
    getSceneRisk: (sceneId) => mobileAssetGateway.riskForScene(sceneId),
    applyProfile: (profile, options) => durableProfileHandoff.apply(profile, options),
    setNoCanvas: value => lowMemoryGateway.setNoCanvas(value),
    onDrawStart: (scene) => graphicsJournal.recordRisk("scene-draw", String(scene?.id ?? "")),
    onDrawComplete: () => graphicsJournal.clearRisk("scene-draw"),
    diagnostics
  });
  let desktopOptimizer = null;
  let desktopControlsGuide = null;
  const openControlsGuide = () => {
    if (readPolicy().active) { kernel?.openControlsGuide?.(document.activeElement); return; }
    if (!desktopControlsGuide) {
      const owner = createTaskScope("desktop-controls-guide", performanceObserver);
      owner.listen(window, "pagehide", () => owner.dispose(), { once: true });
      const surface = createControlsGuide({ scope: owner,
        localize: key => preferencesGateway.localize(key),
        readContext: () => ({ presentation: "desktop", canvasAvailable: !readNoCanvas(), canPlaceActor: true, actionBarSource: preferencesGateway.actionMenu().quickbarSource }) });
      owner.own(() => { desktopControlsGuide = null; });
      document.body.append(surface.element);
      desktopControlsGuide = { owner, surface };
    }
    desktopControlsGuide.surface.element.dataset.theme = themeGateway.applicationTheme();
    desktopControlsGuide.surface.show(document.activeElement);
  };
  const openDesktopMobileAssetOptimizer = (sceneId = "", sceneName = "") => {
    if (!globalThis.game?.user?.isGM) throw new Error(localizeFoundry("VEMOBILE.Optimizer.GmOnly", "Only a GM may open the Mobile Asset Optimizer."));
    if (!desktopOptimizer) {
      const owner = createTaskScope("desktop-mobile-asset-optimizer", performanceObserver);
      const commands = Object.freeze({
        readMobileAssetOptimizer: () => mobileAssetGateway.snapshot(),
        scanMobileAssets: (options) => mobileAssetGateway.scan(options),
        generateMobileAssetDerivatives: (options) => mobileAssetGateway.generate(options),
        setMobileAssetMappingEnabled: (source, enabled) => mobileAssetGateway.setMappingEnabled(source, enabled),
        removeMobileAssetMapping: (source) => mobileAssetGateway.removeMapping(source)
      });
      const surface = createMobileAssetOptimizer(commands, owner);
      document.body.append(surface.element);
      owner.own(() => surface.element.remove());
      owner.listen(window, "pagehide", () => owner.dispose(), { once: true });
      desktopOptimizer = Object.freeze({ owner, surface });
    }
    // This is a Foundry application surface, so it follows Foundry's separate
    // Application Theme even though VE itself follows Interface Theme.
    desktopOptimizer.surface.element.dataset.theme = themeGateway.applicationTheme();
    desktopOptimizer.surface.show(document.activeElement, { sceneId, sceneName });
  };
  clientCapabilityGateway = createMobileClientCapabilityGateway({
    getPhysicalDeviceClass: () => physicalDeviceClass,
    getPresentationMode: () => mobilePerformanceAuthority.active() ? readPolicy().runtimeMode : "desktop",
    getGraphicsPolicy: resolvedGraphicsPolicy,
    getProfileSnapshot: () => lowMemoryGateway.snapshot(),
    getDerivativeStatus: () => mobileAssetGateway.aliasStatus(),
    getRecovery: () => graphicsJournal.recovery(),
    readDeviceIdentity: () => deviceIdentityGateway.read(),
    getSceneRisk: (sceneId) => mobileAssetGateway.riskForScene(sceneId, { assumeMobileDerivatives: true }),
    openOptimizer: openDesktopMobileAssetOptimizer,
    readTheme: () => preferencesGateway.snapshot().theme,
    diagnostics
  });
  graphicsRecoveryGateway = createGraphicsRecoveryGateway({
    journal: graphicsJournal,
    lowMemoryGateway: durableProfileHandoff,
    getGraphicsPolicy: resolvedGraphicsPolicy,
    getSceneRisk: (sceneId) => mobileAssetGateway.riskForScene(sceneId),
    getDerivativeStatus: () => mobileAssetGateway.aliasStatus(),
    getPresentationContext: () => memoryPresentationContext(),
    isMobileAuthorityActive: () => mobilePerformanceAuthority.active(),
    diagnostics
  });
  chatDomGateway = createChatDomGateway();
  const sceneGateway = createFoundrySceneGateway({
    getConnectionGeneration: () => connectionGeneration.current,
    getMode: () => readPolicy().runtimeMode,
    trace: (entry) => diagnostics.record("debug", `Scene camera ${JSON.stringify(entry)}`),
    riskForScene: (sceneId) => mobileAssetGateway.riskForScene(sceneId),
    risksForScenes: (sceneIds) => mobileAssetGateway.risksForScenes(sceneIds),
    readSceneMemoryWarnings: () => preferencesGateway.snapshot().sceneMemoryWarnings,
    confirmSceneRisk: (scene, risk) => mobileAssetGateway.confirmSceneRisk(scene, risk),
    preflightScene: (scene, options) => scenePreflightGateway.preflight(scene, options),
    onOpenMemorySettings: () => kernel?.open?.("settings")
  });
  const templatePlacementGateway = createFoundryTemplatePlacementGateway();
  const nativeTokenPlacementGateway = createNativeTokenPlacementGateway();
  const actorTokenPlacementGateway = createActorTokenPlacementGateway();
  const movementGateway = createFoundryTokenMovementGateway({
    getConnectionGeneration: () => connectionGeneration.current,
    readRecenterAfterMove: () => preferencesGateway.snapshot().recenterAfterMove,
    canApplyAutomaticCamera: (details) => cameraIntents.allowsAutomatic(details),
    trace: (entry) => diagnostics.record("debug", `Token touch ${JSON.stringify(entry)}`)
  });
  const nativeChatGateway = createFoundryNativeChatGateway({ chatDomGateway });
  const armorClassGateway = createArmorClassGateway({
    getConnectionGeneration: () => connectionGeneration.current,
    getMode: () => readPolicy().runtimeMode
  });
  const activeEffectContextGateway = createFoundryActiveEffectContextGateway({ diagnostics });
  const actionSessionGateway = createFoundryActionSessionGateway();
  const quickbarGateway = createFoundryQuickbarGateway({ isActive: () => kernel?.active === true && readPolicy().active });
  const hotbarGateway = createFoundryHotbarGateway({ isActive: () => kernel?.active === true && readPolicy().active });
  const actionBarPreferences = createActionBarPreferences();
  const metrics = createMobileMetrics();
  const sessionStatusGateway = createFoundrySessionStatusGateway({ metrics });
  const themeGateway = createFoundryThemeGateway();
  const combatGateway = createFoundryCombatGateway({
    getConnectionGeneration: () => connectionGeneration.current,
    trace: (entry) => diagnostics.record("debug", `Combat camera ${JSON.stringify(entry)}`)
  });
  const authoritativeGateway = createFoundryAuthoritativeSessionGateway({ diagnostics, performanceObserver });
  const canvasRecoveryGateway = createFoundryCanvasRecoveryGateway();
  const session = createFoundrySessionGateway({
    capabilitiesForActor: commandGateway.capabilitiesForActor,
    quickbarForActor: quickbarGateway.snapshotForActor,
    hotbarForSnapshot: hotbarGateway.snapshot,
    sceneForSnapshot: () => Object.freeze({ ...sceneGateway.snapshot(), movement: movementGateway.snapshot() }),
    combatForSnapshot: combatGateway.snapshot,
    performanceObserver
  });
  let mediaScope = null;
  let mediaPolicyKey = "";
  let graphicsSessionScope = null;
  const graphicsPolicyListeners = new Set();
  let publishedGraphicsPolicyKey = "";
  const reconcileMediaGuard = (force = false) => {
    const shouldRun = mobilePerformanceAuthority.active();
    if (!shouldRun) {
      mediaScope?.dispose();
      mediaScope = null;
      mediaPolicyKey = "";
      graphicsSessionScope?.dispose();
      graphicsSessionScope = null;
      return;
    }
    const policy = resolvedGraphicsPolicy();
    const policyKey = `${policy.effects}:${policy.dice}:${policy.diceReason}`;
    if (policyKey !== publishedGraphicsPolicyKey) {
      publishedGraphicsPolicyKey = policyKey;
      for (const listener of graphicsPolicyListeners) listener(policy);
    }
    if (!graphicsSessionScope) {
      graphicsSessionScope = createTaskScope("graphics-session", performanceObserver);
      graphicsJournal.begin(policy);
      graphicsSessionScope.listen(window, "pagehide", () => graphicsJournal.finish(), { once: true, passive: true });
      graphicsSessionScope.hook("canvasReady", () => reconcileMediaGuard());
      graphicsSessionScope.own(() => graphicsJournal.finish());
      const recovery = graphicsJournal.recovery();
      if (policy.recoveryRecommended) {
        const sources = recovery.recentContextLossSources.length ? ` Sources: ${recovery.recentContextLossSources.join(", ")}.` : "";
        diagnostics.record("warn", `Graphics recovery is active for this browser: ${policy.diceReason}. Confirmed losses: ${recovery.totalContextLosses}; recent bounded losses: ${recovery.recentContextLossCount}; ambiguous exit: ${recovery.ambiguousUncleanExit}.${sources}`);
      }
    }
    graphicsJournal.updatePolicy(policy);
    if (!force && mediaScope && mediaPolicyKey === policyKey) return;
    mediaScope?.dispose();
    const candidate = createTaskScope("mobile-media", performanceObserver);
    const onContextLoss = () => queueMicrotask(() => {
      reconcileMediaGuard(true);
      void clientCapabilityGateway?.publish("context-loss");
    });
    enableMobileMediaGuard(candidate, {
      policy,
      diagnostics,
      journal: graphicsJournal,
      onContextLoss,
      getContextLossDetails: (label) => graphicsRecoveryGateway.contextLossDetails(label)
    });
    enableMobileDiceGuard(candidate, { policy, diagnostics, journal: graphicsJournal });
    mediaScope = candidate;
    mediaPolicyKey = policyKey;
    diagnostics.record("info", `Graphics policy active: effects=${policy.effects}, dice=${policy.dice}, reason=${policy.diceReason}, device=${policy.device.family}/${policy.device.tier}`);
  };
  let kernel;
  kernel = createAppKernel({
    store,
    session,
    commandGateway,
    actorEditorGateway,
    biographyGateway,
    combatGateway,
    cameraIntents,
    authoritativeGateway,
    canvasRecoveryGateway,
    loadTimingGateway,
    connectionGeneration,
    sceneGateway,
    templatePlacementGateway,
    nativeTokenPlacementGateway,
    actorTokenPlacementGateway,
    movementGateway,
    quickbarGateway,
    hotbarGateway,
    actionBarPreferences,
    nativeChatGateway,
    armorClassGateway,
    diagnosticsJournalGateway,
    activeEffectContextGateway,
    actionSessionGateway,
    preferencesGateway,
    settingsCompatibilityGateway,
    moduleOverlayGateway,
    sessionStatusGateway,
    deviceIdentityGateway,
    controlsGuideGateway,
    isControlsUiReady: () => startupComplete,
    themeGateway,
    mobileBackGateway,
    mobileAssetGateway,
    lowMemoryGateway,
    graphicsProfileGateway: durableProfileHandoff,
    graphicsRecoveryGateway,
    metrics,
    diagnostics,
    performanceObserver,
    wakeLockController: wakeLock,
    readPolicy,
    readGraphicsPolicy: resolvedGraphicsPolicy,
    watchGraphicsPolicy: (scope, listener) => {
      graphicsPolicyListeners.add(listener);
      const unsubscribe = () => graphicsPolicyListeners.delete(listener);
      scope?.own?.(unsubscribe);
      listener(resolvedGraphicsPolicy());
      return unsubscribe;
    },
    disable: () => preferencesGateway.set({ key: KEYS.MODE, value: "desktop" }),
    preparePresentation: (scope) => {
      diagnostics.watch(scope);
      lowMemoryGateway.applyPresentationClass(scope);
      const nativeApplications = enableMobilePresentation(scope, {
        isPersistentOverlay: moduleOverlayGateway.isPersistentRoot,
        isActorEditor: actorEditorGateway.ownsApplication,
        isSettingsApplication: (application, element) => settingsCompatibilityGateway.ownsApplication(application, element),
        trace: (event) => diagnostics.record("debug", `Application admission ${JSON.stringify(event)}`)
      });
      const isolation = enableVeStyleAuthority(scope, {
        enabled: readProtectVeStyling(),
        trace: (state) => diagnostics.record("debug", `VE style authority ${JSON.stringify(state)}`)
      });
      visualIsolationController = isolation;
      scope.own(() => { if (visualIsolationController === isolation) visualIsolationController = null; });
      moduleOverlayGateway.enable(scope);
      settingsCompatibilityGateway.enable(scope);
      enableMobileJournalReader(scope, {
        isActive: () => kernel?.active === true && readPolicy().runtimeMode !== "desktop",
        openJournal: (journalId, target) => kernel.openJournalTarget(journalId, target),
        report: (error) => diagnostics.record("warn", "Mobile Journal presentation fell back to the native sheet", error)
      });
      enableMobileConnectionGrace(scope, {
        onDisconnect: ({ generation }) => kernel?.beginReconnect(generation),
        onTrustedResume: () => loadTimingGateway.note({ type: "trusted resume", checkpoint: "ready" }),
        onReconnect: ({ generation }) => {
          // A mobile browser may drop its wake-lock sentinel while the page is
          // suspended. Reassert the saved Keep Awake preference independently
          // of the authoritative session resynchronisation.
          void wakeLock.reconcile();
          void clientCapabilityGateway?.publish("reconnect");
          void kernel?.resync(generation);
        }
      });
      wakeLock.enable(scope);
      return Object.freeze({ ...nativeApplications, settings: settingsCompatibilityGateway });
    }
  });

  let modeReloadPending = false;
  const performanceLifecycle = createMobilePerformanceLifecycle({
    authority: mobilePerformanceAuthority,
    gateway: lowMemoryGateway,
    handoff: durableProfileHandoff,
    readEntryHandoff: () => globalThis.game?.settings?.get?.(MODULE_ID, KEYS.MOBILE_ENTRY_HANDOFF),
    clearEntryHandoff: () => globalThis.game.settings.set(MODULE_ID, KEYS.MOBILE_ENTRY_HANDOFF, {}),
    requestReload: () => {
      if (modeReloadPending) return;
      const reload = globalThis.foundry?.utils?.debouncedReload;
      if (typeof reload === "function") reload();
      else globalThis.window?.location?.reload?.();
    },
    onError: (error) => diagnostics.record("error", "Previous mobile performance transition failed", error)
  });
  const reconcilePerformanceMode = performanceLifecycle.reconcile;
  let themeScope = null;
  let lastSelectedRuntimeMode = null;
  const reloadForModeChange = () => {
    const reload = globalThis.foundry?.utils?.debouncedReload;
    if (typeof reload === "function") reload();
    else globalThis.window?.location?.reload?.();
  };
  const restoreDesktopSettings = async () => {
    themeScope?.dispose();
    themeScope = null;
    const graphics = await lowMemoryGateway.restoreForDesktop({ notify: false });
    await themeGateway.restoreForDesktop({ notify: false });
    await globalThis.game.settings.set(MODULE_ID, KEYS.PENDING_DESKTOP_RESTORE, {});
    return graphics;
  };

  let recoveryRecord = null;
  let recoveryScope = null;
  const startupGate = createMobileStartupGateway({
    graphics: lowMemoryGateway, theme: themeGateway,
    readMobile: () => isMobilePerformanceAuthorityActive(readRequestedPolicy),
    setMutationReady: value => { mobileMutationReady = value; mobilePerformanceAuthority.refresh(); },
    onError: error => diagnostics.record("error", "Desktop settings recovery is required", error),
    onRecovery: record => { startupBlocked = true; recoveryRecord = record; }
  });
  const showRestorationRecovery = () => {
    recoveryScope?.dispose();
    finishBootstrap({ animate: false, reason: "desktop-recovery" });
    recoveryScope = createTaskScope("desktop-restoration-recovery", performanceObserver);
    recoveryScope.listen(window, "pagehide", () => recoveryScope?.dispose(), { once: true });
    const keys = ["title", "detail", "pending", "saved", "retry", "working", "failed"];
    const labels = Object.fromEntries(keys.map(key => [key, game.i18n.localize(`VEMOBILE.RestorationRecovery.${key}`)]));
    showDesktopRestorationRecovery({ scope: recoveryScope, labels, keys: recoveryRecord?.keys ?? [], retry: async () => {
      const result = await startupGate.retry();
      if (result.state === "ready") reloadForModeChange();
      else { showRestorationRecovery(); throw new Error(localizeFoundry("VEMOBILE.Recovery.DesktopPending", "Desktop restoration remains pending.")); }
    } });
  };
  let modeTransitionQueue = Promise.resolve();

  Hooks.once("init", () => {
    const lightingScope = createTaskScope("native-lighting-precision", performanceObserver);
    lightingScope.listen(window, "pagehide", () => lightingScope.dispose(), { once: true, passive: true });
    lightingPrecision.install(lightingScope);
    // Foundry installs its Window popstate listener after init returns.
    // Only a mobile page registers VE's earlier Back listener.
    if (isMobilePerformanceAuthorityActive(readPolicy)) {
      const backScope = createTaskScope("mobile-back-page", performanceObserver);
      if (!mobileBackGateway.install(backScope)) diagnostics.record("warn", "Browser Back protection could not install before Foundry's history listener.");
      backScope.listen(window, "pagehide", () => backScope.dispose(), { once: true, passive: true });
    }
    advanceBootstrap("init");
    const reconcileApplicationPreference = ({ key, value } = {}) => {
      if (modeReloadPending || startupBlocked) return;
      if ((key === KEYS.SHOW_ACTION_SUMMARIES && value === false) || key === KEYS.COMPACT_ACTION_SUMMARIES) store.dispatch({ type: "dismiss-action-session" });
      performanceEnabled = readLoggingLevel() === "debug";
      mobilePerformanceAuthority.refresh();
      desktopSettingsVisibility.refresh();
      reconcileMediaGuard();
      kernel.reconcile();
      if (globalThis.game?.ready) void reconcilePerformanceMode().catch(() => {});
      // Foundry's ready hook is one-shot. If this page began in Desktop mode,
      // a later Phone/Tablet preference mounts VE after ready has already
      // fired, so that live activation owns its own authoritative completion.
      if (globalThis.game?.ready && readPolicy().active) {
        finishBootstrap({ animate: false, reason: "desktop-exit" });
      }
      void clientCapabilityGateway?.publish("settings");
    };
    registerPreferences({
      onApplicationChange: reconcileApplicationPreference,
      onPresentationChange: ({ key } = {}) => {
        const currentMode = readPolicy().runtimeMode;
        const priorMode = lastSelectedRuntimeMode;
        lastSelectedRuntimeMode = currentMode;
        if (key === KEYS.MODE && globalThis.game?.ready && priorMode !== null && priorMode !== currentMode) {
          modeReloadPending = true;
          mobileMutationReady = false;
          startupBlocked = true;
          mobilePerformanceAuthority.refresh();
          desktopSettingsVisibility.refresh();
          reconcileMediaGuard();
          kernel.stop();
          modeTransitionQueue = modeTransitionQueue.catch(() => {}).then(async () => {
            if (currentMode === "desktop") {
              await globalThis.game.settings.set(MODULE_ID, KEYS.PENDING_DESKTOP_RESTORE, { version: 1, attempts: 0 });
              await restoreDesktopSettings();
            } else if (priorMode === "desktop") {
              await globalThis.game.settings.set(MODULE_ID, KEYS.MOBILE_ENTRY_HANDOFF, {
                version: 1, token: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
              });
            }
            reloadForModeChange();
          }).catch(error => {
            diagnostics.record("error", "Mode transition requires Desktop restoration recovery", error);
            reloadForModeChange();
          });
          return;
        }
        reconcileBootstrap();
        reconcileApplicationPreference();
        if (key === KEYS.THEME && mobilePerformanceAuthority.active()) themeGateway.sync(readPolicy().theme);
      },
      onWakeChange: () => {
        // Wake preference changes are deliberately orthogonal to device mode.
        // During bootstrap the page-local choice remains authoritative; after
        // handoff only the wake controller needs to observe the saved setting.
        if (wakePreferenceHandedOff && mobilePerformanceAuthority.active()) void wakeLock.reconcile();
      },
      onVisualIsolationChange: ({ value }) => visualIsolationController?.setEnabled(value !== false),
      isMobilePresentation: () => mobilePerformanceAuthority.active(),
      openControlsGuide,
      openMobileAssetOptimizer: openDesktopMobileAssetOptimizer
    });
    lastSelectedRuntimeMode = readPolicy().runtimeMode;
    if (isMobilePerformanceAuthorityActive(readPolicy)) {
      installVeChatWindowClass();
      mobileAssetGateway.registerAliases();
    }
    preflightScope = createTaskScope("scene-preflight", performanceObserver);
    mobileAssetGateway.watch(preflightScope);
    preflightScope.listen(window, "pagehide", () => preflightScope?.dispose(), { once: true, passive: true });
    desktopSettingsVisibility.enable(preflightScope);
    if (isMobilePerformanceAuthorityActive(readPolicy)) {
      lowMemoryGateway.installAuthority(preflightScope);
      scenePreflightGateway.install(preflightScope);
    }
    void startupGate.install(preflightScope).then(() => reconcileMediaGuard());
    performanceEnabled = readLoggingLevel() === "debug";
    bootstrapWakePreference.adopt(readKeepScreenAwake());
    resolveSettingsReady();
    reconcileBootstrap();
    reconcileMediaGuard();
  });
  Hooks.once("setup", () => {
    advanceBootstrap("world");
    const artworkScope = createTaskScope("native-scene-artwork-progress", performanceObserver);
    artworkScope.listen(window, "pagehide", () => artworkScope.dispose(), { once: true, passive: true });
    observeNativeSceneArtworkProgress(artworkScope, { onProgress: (progress) => {
      if (!readPolicy().active) return;
      if (bootstrap.mounted) bootstrap.setPhase?.(progress);
      const reconnect = store.state.reconnect;
      if (reconnect?.phase === "resynchronising" && reconnect.checkpoint === "canvas") {
        store.dispatch({ type: "reconnect-progress", generation: reconnect.generation,
          checkpoint: "canvas", detail: progress.label, progress: Object.freeze({ pct: progress.pct }) });
      }
    } });
    const journalScope = createTaskScope("diagnostics-journal", performanceObserver);
    journalScope.listen(window, "pagehide", () => journalScope.dispose(), { once: true, passive: true });
    diagnosticsJournalGateway.start(journalScope);
    // Foundry 13.351 constructs persistent Scene context menus during
    // initializeUI, before ready. Register before either native menu is built.
    if (mobilePerformanceAuthority.active() || globalThis.game?.user?.isGM) {
      const capabilityScope = createTaskScope("mobile-client-capability", performanceObserver);
      capabilityScope.listen(window, "pagehide", () => capabilityScope.dispose(), { once: true, passive: true });
      clientCapabilityGateway.start(capabilityScope);
    }
  });
  Hooks.once("canvasInit", () => {
    lightingPrecision.measure();
    if (mobilePerformanceAuthority.active()) mobileAssetGateway.registerAliases();
    advanceBootstrap("canvas");
  });
  Hooks.once("ready", async () => {
    const startup = await startupGate.prepare();
    if (startup.state !== "ready") { showRestorationRecovery(); return; }
    advanceBootstrap("theme");
    if (mobilePerformanceAuthority.active()) {
      const entryHandoff = globalThis.game?.settings?.get?.(MODULE_ID, KEYS.MOBILE_ENTRY_HANDOFF);
      const entryToken = entryHandoff?.version === 1 ? String(entryHandoff.token ?? "") : "";
      await themeGateway.beginMobileSession({ fresh: Boolean(entryToken), entryToken });
      themeScope = createTaskScope("theme-sync", performanceObserver);
      themeScope.listen(window, "pagehide", () => themeScope.dispose(), { once: true, passive: true });
      themeGateway.start(themeScope, {
        readTheme: () => preferencesGateway.snapshot().theme,
        setTheme: (theme) => preferencesGateway.set({ key: KEYS.THEME, value: theme })
      });
      await themeGateway.whenIdle();
    }
    advanceBootstrap("recovery");
    void clientCapabilityGateway.publish("ready");
    const module = game.modules.get(MODULE_ID);
    if (module) {
      module.api = Object.freeze({
        version: module.version,
        get active() {
          return kernel.active;
        },
        open: (screen) => kernel.open(screen),
        snapshot: () => kernel.snapshot(),
        backDiagnosticSnapshot: () => mobileBackGateway.snapshot(),
        lightingPrecisionSnapshot: () => lightingPrecision.snapshot(),
        performanceSnapshot: () => performanceObserver.snapshot(),
        resetPerformance: () => performanceObserver.reset()
      });
    }
    const interruptedProfile = await durableProfileHandoff.resumeInterrupted();
    if (interruptedProfile.action === "reload") {
      diagnostics.record("warn", "An interrupted Memory Protection transaction was completed and requested its one document reload.");
      return;
    }
    const performanceMode = await reconcilePerformanceMode();
    if (performanceMode.action === "reload") return;
    const recoveryAction = await graphicsRecoveryGateway.startupAction();
    if (recoveryAction.action === "reload") {
      diagnostics.record("warn", "A confirmed prior graphics failure prepared the next Memory Protection profile and requested its one document reload.");
      return;
    }
    advanceBootstrap("session");
    if (mobilePerformanceAuthority.active()) {
      try {
        await scenePreflightGateway.resumePendingUserScene((sceneId) => sceneGateway.viewScene(sceneId));
      } catch (error) {
        diagnostics.record("error", "The pending user-selected Scene could not be resumed after Memory Protection reload", error);
      }
    }
    try {
      kernel.reconcile();
      advanceBootstrap("interface");
      finishBootstrap();
    } catch (error) {
      diagnostics.record("error", "VE Mobile startup failed", error);
      showBootstrapRecovery("startup-error");
      console.error("VE Mobile | Startup failed", error);
      return;
    }
    diagnostics.record("info", `VE Mobile v${module?.version ?? "0.1.0"} ready`);
    diagnosticsJournalGateway?.schedule?.();
    console.info(`VE Mobile | v${module?.version ?? "0.1.0"} ready`);
  });

  function mobileMemoryDiagnostics() {
    const canvasRef = globalThis.canvas;
    const scene = canvasRef?.scene ?? globalThis.game?.scenes?.current;
    const presentation = memoryPresentationContext();
    return Object.freeze({
      scene: scene ? Object.freeze({ id: String(scene.id ?? ""), name: String(scene.name ?? ""), risk: mobileAssetGateway?.riskForScene?.(scene.id) ?? null }) : null,
      assets: mobileAssetGateway?.aliasStatus?.() ?? null,
      lowMemory: durableProfileHandoff?.snapshot?.() ?? lowMemoryGateway?.snapshot?.() ?? null,
      recovery: graphicsRecoveryGateway?.snapshot?.() ?? null,
      preflight: scenePreflightGateway?.snapshot?.() ?? null,
      splitScreen: presentation.splitScreen,
      sceneViewport: presentation.sceneViewport,
      canvasBacking: presentation.canvasBacking,
      rendererResolution: Number(canvasRef?.app?.renderer?.resolution ?? 0),
      devicePixelRatio: Number(window.devicePixelRatio ?? 0)
    });
  }

  function memoryPresentationContext() {
    const canvasElement = globalThis.canvas?.app?.renderer?.canvas ?? globalThis.canvas?.app?.view ?? null;
    const root = globalThis.document?.querySelector?.(".ve-mobile-app");
    const splitScreen = root?.dataset?.splitScreen === "true";
    const viewport = splitScreen
      ? root?.querySelector?.(".ve-split-scene-viewport")
      : store.state.route === "scene"
        ? root?.querySelector?.(".ve-viewport")
        : globalThis.document?.querySelector?.("#board");
    const bounds = viewport?.getBoundingClientRect?.() ?? {};
    return Object.freeze({
      splitScreen,
      sceneViewport: Object.freeze({
        width: Math.max(0, Math.round(Number(bounds.width ?? viewport?.clientWidth ?? 0) || 0)),
        height: Math.max(0, Math.round(Number(bounds.height ?? viewport?.clientHeight ?? 0) || 0))
      }),
      canvasBacking: Object.freeze({
        width: Math.max(0, Math.round(Number(canvasElement?.width ?? 0) || 0)),
        height: Math.max(0, Math.round(Number(canvasElement?.height ?? 0) || 0))
      })
    });
  }
}

function readNoCanvas() {
  try { return globalThis.game?.settings?.get?.("core", "noCanvas") === true; } catch { return false; }
}
