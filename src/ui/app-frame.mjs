import { localizedText, localizedNumber } from "./localized-text.mjs";
import { icon, node } from "./dom.mjs";
import { renderCharacters } from "../features/characters/presenter.mjs";
import { renderJournals } from "../features/journals/presenter.mjs";
import { renderChat } from "../features/chat/presenter.mjs";
import { renderScene, renderSceneChooser, updateSceneTargetPresentation } from "../features/scene/presenter.mjs";
import { renderSettings } from "../features/settings/presenter.mjs";
import { createCombatCarouselUiState, renderCombat, renderGmCombatControls } from "../features/combat/presenter.mjs";
import { sheetTabIcon } from "../features/characters/sheet-icons.mjs";
import { resolveCharacterThemeProfile } from "../kernel/character-theme.mjs";
import { renderActionSessionModal } from "./action-session-modal.mjs";
import { createSceneChoiceTransition } from "./scene-choice-transition.mjs";
import { createVeBackDispatcher } from "./ve-back-dispatcher.mjs";
import { createVeCloseWatcherBack, veCloseWatcherLayers } from "./ve-close-watcher-back.mjs";
import { createElapsedWorkerClock } from "./elapsed-worker-clock.mjs";
import { createLoadingCheckpoints } from "./loading-checkpoints.mjs";
import { bindCharacterHeaderScroll } from "./character-header-scroll.mjs";
import { createControlsGuide } from "./controls-guide.mjs";
import { createControlsInvitation } from "./controls-invitation.mjs";

const SCREENS = Object.freeze({
  characters: renderCharacters,
  journals: renderJournals,
  chat: renderChat,
  scene: renderScene,
  combat: renderCombat,
  settings: renderSettings
});
export const RECONNECT_BLOCKER_DELAY_MS = 120;

export function createAppFrame({ store, commands, policy, scope, mobileBackGateway = null, performanceObserver = null, nativeApplications = null }) {
  const root = node("div", { className: "ve-mobile-app", attrs: { role: "application", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.VEMobile", "VE Mobile") } });
  const viewport = node("main", { className: "ve-viewport" });
  const splitSceneViewport = node("main", { className: "ve-split-scene-viewport", attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.ScenePanel", "Scene panel") } });
  const panelOverlays = node("div", { className: "ve-panel-overlays", attrs: { "aria-live": "polite" } });
  const sceneActionOverlays = node("div", { className: "ve-panel-overlays ve-scene-action-overlays", attrs: { "aria-live": "polite" } });
  const sceneChooserOverlays = node("div", { className: "ve-scene-chooser-overlays", attrs: { id: "ve-scene-chooser-overlay", hidden: true } });
  const nav = node("nav", { className: "ve-bottom-nav", attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.Primary", "Primary") } });
  const navSideIcon = icon("fa-arrow-left");
  let screenScope = null;
  let combatControlsScope = null;
  let combatControlsRenderKey = "";
  let sceneContentOwner = null;
  let renderedSceneStructureKey = "";
  let renderedSceneFocusKey = "";
  let splitSceneScope = null;
  let splitSceneContentOwner = null;
  let renderedSplitSceneStructureKey = "";
  let renderedSplitSceneFocusKey = "";
  let splitActionSessionScope = null;
  let sceneChooserScope = null;
  const expandedSceneFolderIds = new Set();
  let renderedSceneChooserKey = "";
  let renderedSplitSceneKey = "";
  let renderedSplitActionSessionId = "";
  let renderedState = null;
  let activeSplitScreen = false;
  let activeTemplatePlacement = false;
  let sceneFocusTransitioning = false;
  let sceneFocusRequest = 0;
  let sceneLayoutAnchorScope = null;
  let metricsScope = null;
  let moduleOverlayContext = null;
  let mounted = true;
  let externalLayoutTransition = false;
  let characterScrollRestoreGeneration = 0;
  let characterScrollRestoreScope = null;
  let characterHeaderScroll = null;
  const characterScrollMemory = createCharacterScrollMemory();
  const sceneInteractionListeners = new Set();
  // Construction may fail before a frame object can be returned to the kernel.
  // Own DOM/body restoration before listeners, subscriptions, or first render.
  scope.own(unmount);
  const reconnectBlocker = createReconnectBlocker(scope, { localize: commands.localize, locale: commands.readLocale?.() ?? "en", onReload: () => commands.reloadApplication() });
  const modeTransitionBlocker = createModeTransitionBlocker(scope, { localize: commands.localize });
  const graphicsRecovery = createGraphicsRecoveryPrompt(commands, scope);
  const rotateSuggestion = tabletRotateSuggestion(commands.localize);
  const sceneChoiceTransition = createSceneChoiceTransition({
    trace: (entry) => commands.traceScenePickerEvent?.({
      ...entry,
      route: store.state.route,
      currentSceneId: store.state.snapshot?.scene?.id ?? "",
      chooserOpen: Boolean(store.state.sceneChooserOpen),
      splitPane: activeSplitScreen,
      reconnectGeneration: store.state.reconnect?.generation ?? null,
      historyLength: globalThis.history?.length ?? null,
      historyState: plainHistoryState(globalThis.history?.state)
    })
  });

  const authoritativeSceneViewport = () => {
    const host = activeSplitScreen ? splitSceneViewport : store.state.route === "scene" ? viewport : null;
    return host ? elementViewport(host) : null;
  };
  const characterScroller = () => viewport.querySelector(".ve-character-content-scroller") ?? viewport;
  const characterScrollTop = () => characterScroller().scrollTop;
  const syncSceneViewport = () => {
    if (!mounted) return;
    const bounds = authoritativeSceneViewport();
    if (bounds) applySceneViewportVariables(document.body, bounds);
    else clearSceneViewportVariables(document.body);
    if (moduleOverlayContext) commands.syncModuleOverlays?.({ ...moduleOverlayContext, viewport: bounds });
  };

  const restoreCharacterScroll = (state, desiredScrollTop) => {
    characterScrollRestoreScope?.dispose();
    characterScrollRestoreScope = scope.child("character-scroll-restore");
    const restoreScope = characterScrollRestoreScope;
    const controller = new AbortController();
    restoreScope.own(() => controller.abort());
    const context = characterScrollContext(state);
    if (!context) { restoreScope.dispose(); return; }
    const generation = ++characterScrollRestoreGeneration;
    const isCurrent = () => mounted
      && !restoreScope.disposed
      && store.state?.route === "characters"
      && generation === characterScrollRestoreGeneration
      && characterScrollContextKey(store.state?.selectedActorSourceUuid, store.state?.characterTab) === context.key;
    const apply = () => {
      if (!isCurrent()) return false;
      const scroller = characterScroller();
      if (!scroller) return false;
      restoreCharacterScrollPosition(scroller, desiredScrollTop, characterHeaderScroll, { clampContent: true });
      return true;
    };
    apply();
    queueMicrotask(apply);
    const scroller = characterScroller();
    if (scroller) {
      for (const type of ["wheel", "touchmove", "keydown"]) restoreScope.listen(scroller, type, () => restoreScope.dispose(), { passive: true });
      void waitForStableElementGeometry(scroller, { localize: commands.localize, signal: controller.signal, isCurrent, maxFrames: 12, includeScrollHeight: true }).then(apply).catch(() => {}).finally(() => restoreScope.dispose());
    }
  };

  const splitToggle = node("button", {
    className: "ve-split-screen-toggle",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.SplitScreen", "Split Screen"), "aria-pressed": "false" },
    on: { click: () => commands.toggleSplitScreen() },
    children: [icon("fa-table-columns"), node("span", { text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.SplitScreen", "Split Screen") })]
  }, scope);

  const navSideToggle = node("button", {
    className: "ve-tablet-nav-side-toggle",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.MoveNavigationToLeftSide", "Move navigation to left side"), title: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.MoveNavigationToLeftSide", "Move navigation to left side") },
    on: { click: () => commands.toggleTabletNavSide() },
    children: [navSideIcon]
  }, scope);
  const combatControlsHost = node("div", { className: "ve-gm-combat-control-host", attrs: { hidden: true } });

  const navItems = [
    ["characters", () => sheetTabIcon("overview"), "Character"],
    ["chat", "fa-comments", "Chat"],
    ["journals", () => sheetTabIcon("scroll-quill"), "Journals"],
    ["scene", "fa-map", "Scene"],
    ["combat", combatNavIcon, "Combat"],
    ["settings", "fa-gear", "Settings"]
  ];
  const navButtons = new Map(navItems.map(([route, createIcon, label]) => {
    const localizedLabel = commands.localize?.(`VEMOBILE.Navigation.${label}`, label) ?? label;
    const button = node("button", {
      className: "ve-main-nav-item",
      attrs: { type: "button" },
      dataset: { route },
      on: {
        click: () => {
          if (activeTemplatePlacement) return;
          if (route === "scene") {
            const action = sceneNavigationTapAction({ route: store.state.route, splitActive: activeSplitScreen });
            if (action === "open-full-scene") commands.openFullScene();
            else if (action === "open-split-scene-chooser") commands.openSplitSceneChooser();
            else if (action === "navigate-scene") commands.navigate("scene");
            else commands.toggleSceneChooser();
          } else if (activeSplitScreen && store.state.route === route) commands.openFullScene();
          else commands.navigate(route);
        }
      },
      children: [typeof createIcon === "function" ? createIcon() : icon(createIcon), node("span", { text: localizedLabel })]
    }, scope);
    return [route, button];
  }));
  const latencyValue = node("strong", { text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.Ms", "— ms") });
  const fpsValue = node("strong", { text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.FPS", "— FPS") });
  const metricsInfo = node("div", {
    className: "ve-tablet-metrics",
    attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.ConnectionAndRenderingStatus", "Connection and rendering status") },
    children: [
      node("span", { attrs: { title: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.RoundTripConnectionLatency", "Round-trip connection latency") }, children: [latencyValue] }),
      node("span", { attrs: { title: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.EstimatedDisplayFrameRate", "Estimated display frame rate") }, children: [fpsValue] })
    ]
  });
  const navRoutes = node("div", { className: "ve-nav-routes", children: [...navButtons.values(), metricsInfo] });
  nav.append(splitToggle, rotateSuggestion, navRoutes, navSideToggle);

  const backDispatcher = createVeBackDispatcher({
    getState: () => store.state,
    commands,
    nativeApplications: {
      topmost: () => nativeApplications?.settings?.topmost?.() ?? nativeApplications?.admissions?.topmost?.(),
      closeTopmost: () => nativeApplications?.settings?.topmost?.()
        ? nativeApplications.settings.closeTopmost() : nativeApplications?.admissions?.closeTopmost?.()
    },
    getRoot: () => root.ownerDocument ?? root,
    isSplitActive: () => activeSplitScreen
  });
  const nativeBackLayers = () => [...(nativeApplications?.admissions?.layers ?? []), ...(nativeApplications?.settings?.layers ?? []), ...(!controlsGuide.element.hidden ? ["controls-guide"] : [])];
  const closeWatcherBack = createVeCloseWatcherBack({
    scope,
    getLayers: () => veCloseWatcherLayers(store.state, { splitActive: activeSplitScreen, nativeLayers: nativeBackLayers() }),
    onBack: () => backDispatcher.back()
  });
  mobileBackGateway?.enable(scope, {
    onBack: () => backDispatcher.back(),
    getDiagnosticContext: () => ({
      route: store.state.route,
      routeDepth: store.state.routeHistory?.length ?? 0,
      topmostDismissible: backDispatcher.peek(),
      closeWatcher: closeWatcherBack.snapshot()
    })
  });

  root.append(
    splitSceneViewport,
    viewport,
    panelOverlays,
    sceneActionOverlays,
    sceneChooserOverlays,
    nav
  );
  root.append(combatControlsHost);
  root.append(reconnectBlocker.element);
  root.append(modeTransitionBlocker.element);
  root.append(graphicsRecovery.element);
  const controlsGuide = createControlsGuide({ scope, readContext: () => commands.readControlsContext(),
    localize: key => commands.localize(key), onVisibility: () => closeWatcherBack.sync() });
  const controlsInvitation = createControlsInvitation({ root, scope, commands, getState: () => store.state,
    isReady: () => commands.controlsUiReady?.(),
    isNativeOpen: () => nativeApplications?.settings?.topmost?.() ?? nativeApplications?.admissions?.topmost?.(),
    openGuide: anchor => controlsGuide.show(anchor) });
  root.append(controlsInvitation.element, controlsGuide.element);

  const render = (state) => {
    if (!mounted || scope.disposed) return;
    performanceObserver?.increment?.("render.frame");
    const latestPolicy = policy();
    const selectedActor = state.snapshot?.selectedActor
      ?? state.snapshot?.actors?.find((entry) => entry.id === state.selectedActorId)
      ?? state.snapshot?.actors?.[0]
      ?? null;
    const settings = commands.readFramePreferences();
    const themeProfile = resolveCharacterThemeProfile(
      selectedActor?.themeClassKeys ?? [selectedActor?.themeClassKey ?? "neutral"],
      settings.colorScheme
    );
    const characterTheme = themeProfile.theme;
    const previousSplitActive = activeSplitScreen;
    const previousSceneHost = previousSplitActive
      ? splitSceneViewport
      : renderedState?.route === "scene" ? viewport : null;
    const previousSceneBounds = elementViewport(previousSceneHost);
    const splitEnabled = latestPolicy.formFactor === "tablet" && latestPolicy.orientation === "landscape" && state.splitScreen;
    const splitActive = splitEnabled && (state.route !== "scene" || state.sceneChooserOpen);
    activeSplitScreen = splitActive;
    activeTemplatePlacement = Boolean(state.templatePlacement || state.nativeTokenPlacement);
    const reconnectActive = Boolean(state.reconnect);
    const modeTransitionActive = Boolean(state.modeTransition);
    reconnectBlocker.update(state.reconnect);
    modeTransitionBlocker.update(state.modeTransition);
    root.dataset.reconnectPhase = state.reconnect?.phase ?? "ready";
    root.dataset.modeTransitionPhase = state.modeTransition?.phase ?? "ready";
    viewport.inert = reconnectActive || modeTransitionActive || root.dataset.sceneFocus === "true";
    splitSceneViewport.inert = reconnectActive || modeTransitionActive;
    sceneChooserOverlays.inert = reconnectActive || modeTransitionActive;
    nav.inert = reconnectActive || modeTransitionActive;
    const tabletNavSide = state.tabletNavSide === "left" ? "left" : "right";
    const layoutKey = `${latestPolicy.formFactor}:${latestPolicy.orientation}:${splitActive ? "split" : "single"}:${tabletNavSide}`;
    if (renderedState?.layoutKey && renderedState.layoutKey !== layoutKey && previousSceneBounds && !externalLayoutTransition) {
      const fixedScreenPosition = previousSplitActive !== splitActive;
      const anchor = fixedScreenPosition
        ? commands.captureFixedSceneAnchor?.(previousSceneBounds)
        : commands.captureSceneViewportAnchor?.(previousSceneBounds);
      const nextSceneHost = splitActive ? splitSceneViewport : state.route === "scene" ? viewport : null;
      if (anchor && nextSceneHost) restoreSceneAnchorAfterLayout(anchor, nextSceneHost, { fixedScreenPosition });
    }
    commands.syncFoundryTheme?.(latestPolicy.theme);
    if (latestPolicy.formFactor === "tablet" && !metricsScope) {
      metricsScope = scope.child("tablet-metrics");
      commands.watchMetrics?.(metricsScope, ({ latency, fps }) => {
        latencyValue.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.Ms2", "{latency} ms", { latency: (latency ?? "—") });
        fpsValue.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.FPS2", "{fps} FPS", { fps: (fps ?? "—") });
      });
    } else if (latestPolicy.formFactor !== "tablet" && metricsScope) {
      metricsScope.dispose();
      metricsScope = null;
      latencyValue.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.Ms", "— ms");
      fpsValue.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.FPS", "— FPS");
    }
    root.dataset.theme = latestPolicy.theme;
    // The frame may mount after presentation preparation; each render also
    // reconciles the client preference without observing the whole document.
    if (settings.protectVeStyling) root.setAttribute("data-ve-style-authority", "");
    else root.removeAttribute("data-ve-style-authority");
    root.dataset.formFactor = latestPolicy.formFactor;
    root.dataset.orientation = latestPolicy.orientation;
    root.dataset.splitScreen = String(splitActive);
    root.dataset.navSide = tabletNavSide;
    root.dataset.joystickSide = settings.joystickResolvedSide;
    root.dataset.route = state.route;
    root.dataset.templatePlacement = state.templatePlacement?.phase ?? "inactive";
    root.dataset.sceneChooser = state.sceneChooserOpen ? "open" : "closed";
    root.dataset.characterTheme = characterTheme;
    root.dataset.characterThemeBlend = themeProfile.multiclass ? "multiclass" : "single";
    const artworkOpacity = Number(settings.headerArtworkOpacity);
    root.style.setProperty("--ve-class-art-opacity", String(Number.isFinite(artworkOpacity) ? Math.max(0, Math.min(1, artworkOpacity)) : 1));
    applyThemeBlend(root, themeProfile);
    root.classList.toggle("ve-has-roll-result", Boolean(state.rollResult));
    root.classList.toggle("ve-has-action-session", Boolean(state.actionSession));
    root.classList.toggle("ve-has-hp-editor", Boolean(state.hitPointEditor));
    root.classList.toggle("ve-has-rest-editor", Boolean(state.restEditor));
    root.classList.toggle("ve-has-spell-slot-editor", Boolean(state.spellSlotEditor));
    document.body.dataset.veMobileTheme = latestPolicy.theme;
    document.body.dataset.veMobileFormFactor = latestPolicy.formFactor;
    document.body.dataset.veMobileOrientation = latestPolicy.orientation;
    document.body.dataset.veMobileNavSide = tabletNavSide;
    document.body.dataset.veMobileCharacterTheme = characterTheme;
    document.body.dataset.veMobileCharacterThemeBlend = themeProfile.multiclass ? "multiclass" : "single";
    applyThemeBlend(document.body, themeProfile);
    document.body.classList.toggle("ve-mobile-scene-active", state.route === "scene" || splitActive);
    document.body.classList.toggle("ve-mobile-split-screen", splitActive);
    document.body.classList.toggle("ve-mobile-reconnecting", reconnectActive);
    document.body.classList.toggle("ve-mobile-mode-transitioning", modeTransitionActive);
    document.body.classList.toggle("ve-mobile-scene-chooser-open", Boolean(state.sceneChooserOpen && state.route === "scene"));
    moduleOverlayContext = {
      route: state.route,
      formFactor: latestPolicy.formFactor,
      splitScreen: splitActive,
      templatePlacement: Boolean(state.templatePlacement || state.nativeTokenPlacement),
      sceneChooserOpen: Boolean(state.sceneChooserOpen),
      reconnecting: reconnectActive
    };
    commands.syncModuleOverlays?.({ ...moduleOverlayContext, viewport: authoritativeSceneViewport() });
    queueMicrotask(syncSceneViewport);
    splitToggle.classList.toggle("is-active", splitEnabled);
    splitToggle.setAttribute("aria-pressed", String(splitEnabled));
    splitToggle.disabled = activeTemplatePlacement || state.canvasAvailable === false;
    navSideToggle.disabled = activeTemplatePlacement;
    const navSideDestination = tabletNavSide === "right" ? "left" : "right";
    const navSideLabel = navSideDestination === "left" ? localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.MoveNavigationToLeftSide", "Move navigation to left side") : localizedText(commands.localize, "VEMOBILE.Navigation.MoveRight", "Move navigation to right side");
    navSideToggle.setAttribute("aria-label", navSideLabel);
    navSideToggle.setAttribute("title", navSideLabel);
    navSideIcon.classList.toggle("fa-arrow-left", navSideDestination === "left");
    navSideIcon.classList.toggle("fa-arrow-right", navSideDestination === "right");

    const combatControls = state.snapshot?.combatControls;
    const combatControlsHidden = state.route !== "combat" || !combatControls?.isGM || state.status !== "ready";
    root.dataset.gmCombatControls = String(!combatControlsHidden);
    const combatControlsKey = `${combatControlsHidden}:${commands.readLocale?.() ?? "en"}:${JSON.stringify(combatControls ?? null)}`;
    combatControlsHost.hidden = combatControlsHidden;
    if (combatControlsKey !== combatControlsRenderKey) {
      combatControlsRenderKey = combatControlsKey;
      combatControlsScope?.dispose();
      combatControlsScope = null;
      combatControlsHost.replaceChildren();
      if (!combatControlsHidden) {
        combatControlsScope = scope.child("gm-combat-controls");
        combatControlsHost.append(renderGmCombatControls({ controls: combatControls, commands, scope: combatControlsScope }));
      }
      queueMicrotask(syncCombatControlGeometry);
    }

    for (const [route, button] of navButtons) {
      const active = state.route === route;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
      button.disabled = activeTemplatePlacement;
      if (route === "scene") {
        const chooserIntent = active;
        const chooserOpen = chooserIntent && state.sceneChooserOpen;
        const label = chooserOpen ? localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.CloseScenes", "Close Scenes") : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ChooseScene", "Choose Scene");
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
        button.setAttribute("aria-expanded", String(Boolean(chooserOpen)));
        button.setAttribute("aria-controls", splitActive ? "ve-scene-picker-pane" : "ve-scene-chooser-overlay");
      }
    }

    reconcileSceneChooser(state, splitActive);

    let sameScreen = renderedState?.route === state.route
      && renderedState?.status === state.status
      && renderedState?.error === state.error
      && renderedState?.layoutKey === layoutKey;
    const snapshotChanged = renderedState?.snapshot !== state.snapshot;
    const selectionChanged = renderedState?.selectedActorSourceUuid !== state.selectedActorSourceUuid
      || (state.route === "characters" && state.snapshot?.selectedActor === null && Boolean(viewport.firstElementChild?.__veUpdateCharacter));
    const characterTabChanged = renderedState?.characterTab !== state.characterTab;
    const rollResultChanged = renderedState?.rollResult !== state.rollResult;
    const actionSessionChanged = renderedState?.actionSession !== state.actionSession;
    const characterItemChanged = renderedState?.characterItemId !== state.characterItemId;
    const expandedCharacterItemChanged = renderedState?.expandedCharacterItemId !== state.expandedCharacterItemId;
    const hitPointEditorChanged = renderedState?.hitPointEditor !== state.hitPointEditor;
    const restEditorChanged = renderedState?.restEditor !== state.restEditor;
    const spellSlotEditorChanged = renderedState?.spellSlotEditor !== state.spellSlotEditor;
    const xpEditorChanged = renderedState?.xpEditor !== state.xpEditor;
    const portraitImageChanged = renderedState?.portraitImage !== state.portraitImage;
    const journalChanged = journalPresentationChanged(renderedState, state);
    const viewChanged = renderedState?.viewRevision !== state.viewRevision;
    const sceneChooserChanged = renderedState?.sceneChooserOpen !== state.sceneChooserOpen
      || renderedState?.sceneChooserRevision !== state.sceneChooserRevision;
    const stableTemplatePresentation = activeTemplatePresentationUnchanged(renderedState, state)
      && sameScreen && !viewChanged;

    if (splitActive) {
      const nextSceneKey = `${scenePresentationKey(state.snapshot)}:${settings.movementRepeatDelayMs}:${settings.quickbarEnabled}:${settings.quickbarSource}:${settings.joystickResolvedSide}:${settings.combatCarousel}:${state.quickbarCollapsed}:${JSON.stringify(state.templatePlacement)}:${JSON.stringify(state.nativeTokenPlacement)}:${JSON.stringify(state.actorTokenPlacement)}`;
      const nextStructureKey = sceneStructureKey(state.snapshot, layoutKey, true);
      const nextFocusKey = sceneFocusKey(state.snapshot);
      let newPresentation = false;
      if (!splitSceneScope || renderedSplitSceneStructureKey !== nextStructureKey) {
        splitSceneScope?.dispose();
        splitSceneScope = scope.child("screen:split-scene");
        const contentOwner = { current: null, carouselState: createCombatCarouselUiState() };
        splitSceneContentOwner = contentOwner;
        splitSceneScope.own(() => contentOwner.current?.dispose());
        renderedSplitSceneStructureKey = nextStructureKey;
        newPresentation = true;
      }
      if (newPresentation || (!stableTemplatePresentation && renderedSplitSceneKey !== nextSceneKey)) {
        const targetOnly = !newPresentation && sceneTargetsOnlyChanged(renderedState?.snapshot, state.snapshot);
        if (targetOnly && updateSceneTargetPresentation(splitSceneViewport.querySelector?.(".ve-scene-screen"), state.snapshot?.scene?.movement?.targetCount, activeTemplatePlacement, commands.localize, commands.readLocale?.() ?? "en")) {
          performanceObserver?.increment?.("render.patch.scene-targets");
        } else {
          splitSceneContentOwner.current?.dispose();
          splitSceneContentOwner.current = splitSceneScope.child("content");
          performanceObserver?.increment?.("dom.replace.split-scene-root");
          splitSceneViewport.replaceChildren(renderScene({
            state,
            commands,
            scope: splitSceneContentOwner.current,
            presentationScope: newPresentation ? splitSceneScope : null,
            focusSelectedToken: newPresentation || renderedSplitSceneFocusKey !== nextFocusKey,
            splitViewport: true,
            carouselState: splitSceneContentOwner.carouselState,
            performanceObserver
          }));
        }
        renderedSplitSceneKey = nextSceneKey;
        renderedSplitSceneFocusKey = nextFocusKey;
      }
      if (stableTemplatePresentation) renderedSplitSceneKey = nextSceneKey;
    } else {
      splitSceneScope?.dispose();
      splitSceneScope = null;
      splitSceneContentOwner = null;
      renderedSplitSceneKey = "";
      renderedSplitSceneStructureKey = "";
      renderedSplitSceneFocusKey = "";
      splitSceneViewport.replaceChildren();
      // A retained Settings presenter rehomes its owned surfaces below.
      if (!(state.route === "settings" && renderedState?.route === "settings")) panelOverlays.replaceChildren();
    }

    const splitActionSessionId = splitSceneActionSessionId(state, splitActive);
    if (splitActionSessionId && (!splitActionSessionScope || renderedSplitActionSessionId !== splitActionSessionId)) {
      splitActionSessionScope?.dispose();
      splitActionSessionScope = scope.child("screen:split-action-session");
      sceneActionOverlays.replaceChildren(renderActionSessionModal(state.actionSession, commands, splitActionSessionScope));
      renderedSplitActionSessionId = splitActionSessionId;
    } else if (!splitActionSessionId && (splitActionSessionScope || renderedSplitActionSessionId)) {
      splitActionSessionScope?.dispose();
      splitActionSessionScope = null;
      renderedSplitActionSessionId = "";
      sceneActionOverlays.replaceChildren();
    }

    // Native template targeting may change several times per second. Keep the
    // mounted Scene, active handle and hidden companion panel intact while the
    // placement phase itself is unchanged.
    if (stableTemplatePresentation) {
      renderedState = { ...screenState(state, layoutKey), sceneKey: renderedState?.sceneKey };
      return;
    }

    // Foundry owns and incrementally updates the live ChatLog. Snapshot hooks
    // must never tear it down or replace its focused native textarea.
    if (renderedState?.route === state.route && state.status === "ready" && state.snapshot && ["chat", "settings"].includes(state.route)) {
      if (state.route === "settings") viewport.firstElementChild?.syncOverlayHost?.(splitActive ? panelOverlays : null);
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Keep one native-canvas presentation owner for the life of the active
    // Scene. Combat, token-control, Actor-sync and Quickbar snapshots replace
    // only the VE HUD scope; they neither resize nor repaint Foundry's board.
    if (state.status === "ready" && state.snapshot && state.route === "scene" && !splitActive) {
      const settingsKey = `${settings.movementRepeatDelayMs}:${settings.quickbarEnabled}:${settings.quickbarSource}:${settings.joystickResolvedSide}:${settings.combatCarousel}:${state.quickbarCollapsed}`;
      const nextSceneKey = `${scenePresentationKey(state.snapshot)}:${settingsKey}:${state.actionSession?.rootMessageId ?? ""}:${JSON.stringify(state.templatePlacement)}:${JSON.stringify(state.nativeTokenPlacement)}:${JSON.stringify(state.actorTokenPlacement)}`;
      const nextStructureKey = sceneStructureKey(state.snapshot, layoutKey, false);
      const nextFocusKey = sceneFocusKey(state.snapshot);
      let newPresentation = false;
      if (!sameScreen || !screenScope || renderedSceneStructureKey !== nextStructureKey) {
        screenScope?.dispose();
        characterHeaderScroll = null;
        screenScope = scope.child("screen:scene");
        const contentOwner = { current: null, carouselState: createCombatCarouselUiState() };
        sceneContentOwner = contentOwner;
        screenScope.own(() => contentOwner.current?.dispose());
        renderedSceneStructureKey = nextStructureKey;
        newPresentation = true;
      }
      if (newPresentation || renderedState?.sceneKey !== nextSceneKey) {
        const targetOnly = !newPresentation && sceneTargetsOnlyChanged(renderedState?.snapshot, state.snapshot);
        if (targetOnly && updateSceneTargetPresentation(viewport.querySelector?.(".ve-scene-screen"), state.snapshot?.scene?.movement?.targetCount, activeTemplatePlacement)) {
          performanceObserver?.increment?.("render.patch.scene-targets");
        } else {
          sceneContentOwner.current?.dispose();
          sceneContentOwner.current = screenScope.child("content");
          panelOverlays.replaceChildren();
          performanceObserver?.increment?.("dom.replace.scene-root");
          viewport.replaceChildren(renderScene({
            state,
            commands,
            scope: sceneContentOwner.current,
            presentationScope: newPresentation ? screenScope : null,
            focusSelectedToken: newPresentation || renderedSceneFocusKey !== nextFocusKey,
            carouselState: sceneContentOwner.carouselState,
            performanceObserver
          }));
        }
        renderedSceneFocusKey = nextFocusKey;
      }
      renderedState = { ...screenState(state, layoutKey), sceneKey: nextSceneKey };
      return;
    }

    // Unrelated chat and actor hooks must not rebuild the Scene surface while
    // a finger is holding its joystick.
    // Scene-owned action sessions also stay mounted while Foundry publishes
    // each follow-up activity message; dismissing renders the latest Scene.
    if (sameScreen && state.status === "ready" && state.route === "scene" && !splitActive && state.actionSession && state.actionSessionOrigin === "scene"
      && !actionSessionChanged && renderedState?.actionSessionOrigin === "scene") {
      renderedState = screenState(state, layoutKey);
      return;
    }

    if (sameScreen && !viewChanged && !actionSessionChanged && !sceneChooserChanged && renderedState?.quickbarCollapsed === state.quickbarCollapsed && state.status === "ready" && state.route === "scene" && !splitActive
      && scenePresentationKey(renderedState?.snapshot) === scenePresentationKey(state.snapshot)) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Keep an open item detail surface and its momentum scroll intact while
    // background Foundry hooks or mobile browser chrome resize the viewport.
    // Closing it renders the latest snapshot and responsive layout immediately.
    // Refresh shared authoritative header data even while a form/item modal
    // deliberately retains its local edits and pane DOM.
    if (sameScreen && state.status === "ready" && state.route === "characters" && !selectionChanged
      && (snapshotChanged || viewChanged) && viewport.firstElementChild?.__veUpdateCharacterHeader) {
      try {
        const paneTop = characterScrollTop();
        if (viewport.firstElementChild.__veUpdateCharacterHeader({ state, commands })) {
          characterHeaderScroll?.refresh?.();
          restoreCharacterScroll(state, paneTop);
        }
      } catch (error) {
        console.error("VE Mobile | Could not refresh Character header", error);
        // Bypass preserved-form fast paths and dispose the partial owner in
        // the normal screen fallback below, keeping the presentation retryable.
        sameScreen = false;
      }
    }

    if (sameScreen && state.status === "ready" && state.route === "characters" && state.characterItemId
      && !selectionChanged && !characterTabChanged && !characterItemChanged && !actionSessionChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // The action-session gateway owns live, incremental ChatMessage updates.
    // Midi can publish several snapshots during one attack or damage roll; do
    // not dispose and remount the complete Character screen for those updates.
    // Dismissing the modal changes actionSession and renders the latest actor
    // snapshot immediately.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.actionSession
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Keep an in-progress HP edit stable while unrelated Foundry hooks publish
    // snapshots. Closing the editor renders the latest actor values.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.hitPointEditor
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Preserve the selected hit-die pool and in-modal feedback while actor
    // updates publish snapshots. Closing the editor renders current totals.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.restEditor
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Preserve local +/- edits while unrelated Actor hooks publish snapshots.
    // Confirm re-resolves and revalidates the resource before the modal closes.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.spellSlotEditor
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Keep an empty XP amount field and its validation feedback stable while
    // the resulting Actor update publishes snapshots.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.xpEditor
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // The portrait viewer is a temporary VE surface. Preserve it across
    // unrelated Actor hooks until the user dismisses it explicitly.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.portraitImage
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Settings controls reconcile their saved values, device/mode wording,
    // joystick helper and Session metrics in place. Preserve the presenter so
    // an ordinary client-setting invalidation cannot collapse open sections.
    if (sameScreen && state.status === "ready" && state.route === "settings"
      && !selectionChanged && !actionSessionChanged && !journalChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Item rows update their native <details> surface before recording the
    // expanded item in application state. Keep that DOM (and its surrounding
    // category/scroll position) intact while unrelated Foundry hooks publish.
    if (sameScreen && state.status === "ready" && state.route === "characters"
      && !selectionChanged && !characterTabChanged && !rollResultChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged
      && ((expandedCharacterItemChanged && !snapshotChanged && !viewChanged) || (state.expandedCharacterItemId && !expandedCharacterItemChanged && !viewChanged))) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    const routeSnapshotChanged = snapshotChanged && snapshotPresentationChangedForRoute(renderedState, state);
    if (sameScreen && !routeSnapshotChanged && !selectionChanged && !characterTabChanged && !rollResultChanged && !actionSessionChanged && !characterItemChanged && !expandedCharacterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged && !journalChanged && !viewChanged && !sceneChooserChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    const previousCharacterContext = characterScrollContext(renderedState);
    const previousCharacterScrollTop = characterScrollTop();
    if (previousCharacterContext) characterScrollMemory.remember(previousCharacterContext.sourceUuid, previousCharacterContext.tab, previousCharacterScrollTop);
    const nextCharacterContext = characterScrollContext(state);
    const desiredCharacterScrollTop = nextCharacterContext
      ? characterScrollMemory.resolve({
        sourceUuid: nextCharacterContext.sourceUuid,
        tab: nextCharacterContext.tab
      })
      : null;
    if (!nextCharacterContext) {
      characterScrollRestoreGeneration += 1;
      characterScrollRestoreScope?.dispose();
    }

    const characterScreen = viewport.firstElementChild;
    const selectedCharacter = state.route === "characters"
      ? (Object.hasOwn(state.snapshot ?? {}, "selectedActor") ? state.snapshot.selectedActor
        : state.snapshot?.actors?.find(actor => actor.id === state.selectedActorId)) : null;
    if (sameScreen && state.status === "ready" && state.route === "characters" && !selectionChanged
      && selectedCharacter && characterScreen?.__veUpdateCharacter) {
      try {
        characterScreen.__veUpdateCharacter({ state, commands });
        characterHeaderScroll?.refresh?.();
        performanceObserver?.increment?.("dom.replace.characterPane");
        restoreCharacterScroll(state, desiredCharacterScrollTop);
        renderedState = screenState(state, layoutKey);
        return;
      } catch (error) {
        console.error("VE Mobile | Could not update Character pane", error);
        // Dispose all partial pane/header resources through the normal fallback.
      }
    }

    screenScope?.dispose();
    characterHeaderScroll = null;
    sceneContentOwner = null;
    renderedSceneStructureKey = "";
    renderedSceneFocusKey = "";
    screenScope = scope.child(`screen:${state.route}`);
    if (state.status === "error") {
      performanceObserver?.increment?.("dom.replace.viewport");
      viewport.replaceChildren(node("section", { className: "ve-empty", children: [icon("fa-triangle-exclamation"), node("h2", { text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.VEMobileCouldNotStart", "VE Mobile could not start") }), node("p", { text: commands.localize?.(state.error, state.error) ?? state.error })] }));
      renderedState = screenState(state, layoutKey);
      return;
    }
    if (!state.snapshot) {
      performanceObserver?.increment?.("dom.replace.viewport");
      viewport.replaceChildren(node("section", { className: "ve-empty", children: [node("div", { className: "ve-loader" }), node("p", { text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.PreparingYourMobileSession", "Preparing your mobile session…") })] }));
      renderedState = screenState(state, layoutKey);
      return;
    }
    const presenter = splitActive && state.route === "scene" ? renderSplitScenePicker : (SCREENS[state.route] ?? SCREENS.characters);
    try {
      panelOverlays.replaceChildren();
      performanceObserver?.increment?.(`render.presenter.${state.route}`);
      performanceObserver?.increment?.("dom.replace.viewport");
      viewport.replaceChildren(presenter({
        state,
        commands,
        scope: screenScope,
        overlayHost: splitActive ? panelOverlays : null,
        expandedFolderIds: expandedSceneFolderIds,
        sceneChoiceTransition
      }));
      if (state.route === "characters") characterHeaderScroll = bindCharacterHeaderScroll({ scroller: characterScroller(), screen: viewport.firstElementChild, scope: screenScope, restorePosition: restoreCharacterScrollPosition });
      if (nextCharacterContext) restoreCharacterScroll(state, desiredCharacterScrollTop);
    } catch (error) {
      console.error(`VE Mobile | Could not render ${state.route}`, error);
      screenScope?.dispose();
      characterHeaderScroll = null;
      viewport.replaceChildren(node("section", {
        className: "ve-empty",
        children: [icon("fa-triangle-exclamation"), node("h2", { text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.ThisScreenCouldNotOpen", "This screen could not open") }), node("p", { text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.ReloadFoundryAndTryAgain", "Reload Foundry and try again.") })]
      }));
    }
    renderedState = screenState(state, layoutKey);
  };

  scope.own(store.subscribe(render, { immediate: false }));
  let controlsContextKey = "";
  scope.own(store.subscribe(state => {
    controlsInvitation.reconcile();
    const key = `${state.formFactor}:${state.orientation}:${state.splitScreen}:${state.canvasAvailable}:${state.selectedActorSourceUuid}`;
    if (key !== controlsContextKey) { controlsGuide.refresh(); controlsInvitation.refreshLabels?.(); }
    controlsContextKey = key;
  }, { immediate: false }));
  render(store.state);
  const syncCloseWatchers = (state) => closeWatcherBack.sync(veCloseWatcherLayers(state, { splitActive: activeSplitScreen, nativeLayers: nativeBackLayers() }));
  scope.own(store.subscribe(syncCloseWatchers, { immediate: false }));
  syncCloseWatchers(store.state);
  scope.own(nativeApplications?.admissions?.watch?.(() => closeWatcherBack.sync()) ?? (() => {}));
  scope.own(nativeApplications?.settings?.watch?.(() => closeWatcherBack.sync()) ?? (() => {}));
  function syncCombatControlGeometry() {
    if (!mounted) return;
    const navBounds = nav.getBoundingClientRect();
    // Forced Tablet can still use bottom navigation below the rail breakpoint.
    if (navBounds.width > navBounds.height && navBounds.height > 0) root.style.setProperty("--ve-nav-dock-height", `${navBounds.height}px`);
    const controlHeight = combatControlsHost.hidden ? 0 : combatControlsHost.getBoundingClientRect().height;
    root.style.setProperty("--ve-gm-combat-row-reservation", controlHeight > 0 ? `${controlHeight + 8}px` : "0px");
  }
  const syncFrameGeometry = () => { syncSceneViewport(); syncCombatControlGeometry(); };
  const sceneResizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(syncFrameGeometry) : null;
  let releaseSceneResizeObserver = null;
  scope.own(() => {
    try { sceneResizeObserver?.disconnect?.(); }
    finally { releaseSceneResizeObserver?.(); }
  });
  releaseSceneResizeObserver = sceneResizeObserver ? performanceObserver?.track?.("lifecycle.resize-observer") : null;
  sceneResizeObserver?.observe?.(viewport);
  sceneResizeObserver?.observe?.(splitSceneViewport);
  sceneResizeObserver?.observe?.(nav);
  sceneResizeObserver?.observe?.(combatControlsHost);
  syncFrameGeometry();
  if (globalThis.window) {
    scope.listen(globalThis.window, "resize", syncFrameGeometry, { passive: true });
    scope.listen(globalThis.window, "orientationchange", syncFrameGeometry, { passive: true });
  }
  const readSceneInteractionState = () => {
    const state = store.state;
    const latestPolicy = policy();
    const splitScreen = latestPolicy.formFactor === "tablet"
      && latestPolicy.orientation === "landscape"
      && state.splitScreen
      && (state.route !== "scene" || state.sceneChooserOpen);
    const sceneExposed = state.route === "scene" || splitScreen;
    const host = splitScreen ? splitSceneViewport : viewport;
    const surface = sceneExposed ? host.querySelector?.(".ve-scene-screen") : null;
    const rect = surface?.getBoundingClientRect?.();
    const style = surface && globalThis.getComputedStyle ? globalThis.getComputedStyle(surface) : null;
    const native = commands.readSceneInteractionState?.() ?? {};
    const rootVisible = Boolean(surface && !surface.hidden && style?.display !== "none" && style?.visibility !== "hidden");
    return Object.freeze({
      sceneExposed,
      splitScreen,
      rootConnected: Boolean(surface?.isConnected),
      rootVisible,
      geometryReady: Boolean(!sceneFocusTransitioning && rect && rect.width > 0 && rect.height > 0),
      canvasReady: Boolean(native.canvasReady),
      canvasGeometryReady: Boolean(native.canvasGeometryReady),
      interactionMounted: Boolean(surface && state.snapshot?.scene?.canvasReady),
      viewport: splitScreen ? elementViewport(splitSceneViewport) : null
    });
  };
  const publishSceneInteraction = () => {
    for (const listener of [...sceneInteractionListeners]) listener(readSceneInteractionState());
  };
  const watchSceneInteraction = (listener) => {
    if (!mounted || scope.disposed) return () => {};
    const owner = scope.child("scene-interaction-watch");
    try {
      sceneInteractionListeners.add(listener);
      owner.own(() => sceneInteractionListeners.delete(listener));
      let observed = null;
      const observer = typeof ResizeObserver === "function" ? new ResizeObserver(publishSceneInteraction) : null;
      let releaseObserver = null;
      owner.own(() => {
        try { observer?.disconnect?.(); }
        finally { releaseObserver?.(); }
      });
      releaseObserver = observer ? performanceObserver?.track?.("lifecycle.resize-observer") : null;
      const reconcile = () => {
        if (owner.disposed) return;
        const next = activeSplitScreen
          ? splitSceneViewport.querySelector?.(".ve-scene-screen")
          : store.state.route === "scene" ? viewport.querySelector?.(".ve-scene-screen") : null;
        if (next !== observed) {
          if (observed) observer?.unobserve?.(observed);
          observed = next;
          if (observed) observer?.observe?.(observed);
        }
        listener(readSceneInteractionState());
      };
      owner.own(store.subscribe(reconcile, { immediate: false }));
      reconcile();
      return () => owner.dispose();
    } catch (error) {
      owner.dispose();
      throw error;
    }
  };
  const setSceneFocusOverride = async (focused, { signal, immediate = false } = {}) => {
    if (!mounted || scope.disposed) return null;
    const request = ++sceneFocusRequest;
    const enabled = Boolean(focused && activeSplitScreen);
    sceneFocusTransitioning = !immediate && root.dataset.sceneFocus !== String(enabled);
    root.dataset.sceneFocus = String(enabled);
    document.body.classList.toggle("ve-mobile-template-scene-focus", enabled);
    viewport.inert = enabled || Boolean(store.state.reconnect);
    if (enabled) viewport.setAttribute("aria-hidden", "true");
    else viewport.removeAttribute("aria-hidden");
    publishSceneInteraction();
    if (immediate || !root.isConnected) {
      sceneFocusTransitioning = false;
      publishSceneInteraction();
      return elementViewport(splitSceneViewport);
    }
    try {
      const bounds = await waitForStableElementGeometry(splitSceneViewport, { localize: commands.localize, signal });
      if (request !== sceneFocusRequest) return elementViewport(splitSceneViewport);
      return bounds;
    } finally {
      if (request === sceneFocusRequest) {
        sceneFocusTransitioning = false;
        publishSceneInteraction();
      }
    }
  };
  return Object.freeze({
    mount() {
      if (!mounted || scope.disposed) return;
      for (const existing of document.querySelectorAll?.(".ve-mobile-app") ?? []) {
        if (existing !== root) existing.remove();
      }
      document.body.append(root);
      document.body.classList.add("ve-mobile-running");
      graphicsRecovery.present();
      controlsInvitation.reconcile();
      publishSceneInteraction();
    },
    unmount,
    openControlsGuide: anchor => controlsGuide.show(anchor),
    refreshControlsInvitation: () => controlsInvitation.reconcile(),
    readSceneInteractionState,
    watchSceneInteraction,
    setSceneFocusOverride,
    captureModeTransitionState() {
      externalLayoutTransition = true;
      const sceneBounds = elementViewport(authoritativeSceneViewportHost());
      const viewportBounds = elementViewport(viewport);
      const visualViewport = globalThis.window?.visualViewport;
      return Object.freeze({
        formFactor: store.state.formFactor,
        orientation: store.state.orientation,
        route: store.state.route,
        splitScreen: activeSplitScreen,
        rootMounted: root.isConnected,
        rootCount: root.ownerDocument?.querySelectorAll?.(".ve-mobile-app")?.length ?? 0,
        viewportBounds,
        sceneBounds,
        visualViewport: visualViewport ? Object.freeze({ width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale }) : null,
        viewportScrollTop: characterScrollTop(),
        viewportScrollLeft: viewport.scrollLeft,
        splitScrollTop: splitSceneViewport.scrollTop,
        splitScrollLeft: splitSceneViewport.scrollLeft,
        sceneAnchor: sceneBounds ? commands.captureSceneViewportAnchor?.(sceneBounds) ?? null : null
      });
    },
    modeTransitionDiagnosticSnapshot() {
      const visualViewport = globalThis.window?.visualViewport;
      return Object.freeze({
        formFactor: store.state.formFactor,
        orientation: store.state.orientation,
        route: store.state.route,
        splitScreen: activeSplitScreen,
        rootMounted: root.isConnected,
        rootCount: root.ownerDocument?.querySelectorAll?.(".ve-mobile-app")?.length ?? 0,
        viewportBounds: elementViewport(viewport),
        sceneBounds: elementViewport(authoritativeSceneViewportHost()),
        visualViewport: visualViewport ? Object.freeze({ width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale }) : null,
        interactionListeners: sceneInteractionListeners.size
      });
    },
    async settleModeTransition({ isCurrent = () => true } = {}) {
      const bounds = await waitForStableElementGeometry(viewport, { localize: commands.localize, isCurrent, maxFrames: 45 });
      if (!isCurrent()) return null;
      syncSceneViewport();
      publishSceneInteraction();
      return bounds;
    },
    async restoreModeTransitionState(preserved, bounds, { isCurrent = () => true } = {}) {
      if (!isCurrent()) return false;
      if (store.state.route === "characters") restoreCharacterScrollPosition(characterScroller(), Number(preserved?.viewportScrollTop) || 0, characterHeaderScroll, { clampContent: true });
      else viewport.scrollTop = Number(preserved?.viewportScrollTop) || 0;
      viewport.scrollLeft = Number(preserved?.viewportScrollLeft) || 0;
      characterHeaderScroll?.update(characterScroller().scrollTop);
      splitSceneViewport.scrollTop = Number(preserved?.splitScrollTop) || 0;
      splitSceneViewport.scrollLeft = Number(preserved?.splitScrollLeft) || 0;
      const sceneHost = authoritativeSceneViewportHost();
      const sceneBounds = elementViewport(sceneHost);
      if (preserved?.sceneAnchor && sceneBounds) await Promise.resolve(commands.restoreSceneViewportAnchor?.(preserved.sceneAnchor, sceneBounds));
      externalLayoutTransition = false;
      syncSceneViewport();
      publishSceneInteraction();
      return Boolean(bounds);
    },
    cancelModeTransitionRestore() {
      externalLayoutTransition = false;
    }
  });

  function unmount() {
    characterScrollMemory.clear();
    characterScrollRestoreScope?.dispose();
    characterScrollRestoreScope = null;
    if (!mounted) return;
    mounted = false;
    sceneFocusRequest += 1;
    characterScrollRestoreGeneration += 1;
    screenScope?.dispose();
    screenScope = null;
    characterHeaderScroll = null;
    splitSceneScope?.dispose();
    splitSceneScope = null;
    splitActionSessionScope?.dispose();
    splitActionSessionScope = null;
    sceneChooserScope?.dispose();
    sceneChooserScope = null;
    sceneLayoutAnchorScope?.dispose();
    sceneLayoutAnchorScope = null;
    metricsScope?.dispose();
    metricsScope = null;
    sceneInteractionListeners.clear();
    expandedSceneFolderIds.clear();
    renderedSceneChooserKey = "";
    renderedSplitSceneKey = "";
    renderedSplitActionSessionId = "";
    document.body.classList.remove("ve-mobile-running");
    document.body.classList.remove("ve-mobile-scene-active");
    document.body.classList.remove("ve-mobile-split-screen");
    document.body.classList.remove("ve-mobile-template-scene-focus");
    document.body.classList.remove("ve-mobile-reconnecting");
    document.body.classList.remove("ve-mobile-mode-transitioning");
    document.body.classList.remove("ve-mobile-scene-chooser-open");
    clearSceneViewportVariables(document.body);
    delete document.body.dataset.veMobileTheme;
    delete document.body.dataset.veMobileFormFactor;
    delete document.body.dataset.veMobileOrientation;
    delete document.body.dataset.veMobileNavSide;
    delete document.body.dataset.veMobileCharacterTheme;
    delete document.body.dataset.veMobileCharacterThemeBlend;
    clearThemeBlend(document.body);
    root.remove();
  }

  function authoritativeSceneViewportHost() {
    return activeSplitScreen ? splitSceneViewport : store.state.route === "scene" ? viewport : null;
  }

  function reconcileSceneChooser(state, splitActive) {
    const open = Boolean(state.sceneChooserOpen && state.route === "scene" && !state.templatePlacement && !splitActive);
    if (!open) {
      sceneChooserScope?.dispose();
      sceneChooserScope = null;
      renderedSceneChooserKey = "";
      sceneChooserOverlays.hidden = true;
      sceneChooserOverlays.replaceChildren();
      return;
    }
    let scenes = Object.freeze([]);
    try {
      scenes = commands.readSceneNavigation();
    } catch (error) {
      commands.reportSceneNavigationError?.(error);
    }
    const key = JSON.stringify(scenes);
    if (sceneChooserScope && renderedSceneChooserKey === key) return;
    sceneChooserScope?.dispose();
    sceneChooserScope = scope.child("scene-chooser");
    renderedSceneChooserKey = key;
    sceneChooserOverlays.hidden = false;
    sceneChooserOverlays.replaceChildren(renderSceneChooser({ scenes, commands, scope: sceneChooserScope, expandedFolderIds: expandedSceneFolderIds, sceneChoiceTransition }));
  }

  function restoreSceneAnchorAfterLayout(anchor, host, { fixedScreenPosition = false } = {}) {
    sceneLayoutAnchorScope?.dispose();
    sceneLayoutAnchorScope = scope.child("scene-layout-anchor");
    const owner = sceneLayoutAnchorScope;
    const controller = new AbortController();
    owner.own(() => controller.abort());
    queueMicrotask(() => {
      void waitForStableElementGeometry(host, { localize: commands.localize, signal: controller.signal })
        .then((bounds) => {
          if (!owner.disposed) {
            if (fixedScreenPosition) commands.restoreFixedSceneAnchor?.(anchor, bounds);
            else commands.restoreSceneViewportAnchor?.(anchor, bounds);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) console.warn("VE Mobile | Scene layout anchor restoration failed", error);
        });
    });
  }
}

export function createGraphicsRecoveryPrompt(commands, scope) {
  const title = node("h2", { text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.GraphicsRecovery", "Graphics recovery") });
  const message = node("p");
  const status = node("p", { attrs: { role: "status", "aria-live": "polite" } });
  const enable = node("button", { className: "ve-settings-reload-now", attrs: { type: "button" }, text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.UseBalancedReload", "Use Balanced & Reload") });
  const settings = node("button", { attrs: { type: "button" }, text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.GraphicsSettings", "Graphics Settings") });
  const continueNormally = node("button", { className: "ve-settings-reload-later", attrs: { type: "button" }, text: localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.ContinueWithNormal", "Continue with Normal") });
  const element = node("div", {
    className: "ve-graphics-recovery",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-graphics-recovery-title" },
    children: [node("section", { className: "ve-graphics-recovery-card", children: [
      icon("fa-triangle-exclamation"),
      title,
      message,
      status,
      node("div", { className: "ve-settings-reload-actions", children: [continueNormally, settings, enable] })
    ] })]
  });
  title.id = "ve-graphics-recovery-title";
  const dismiss = () => { element.hidden = true; };
  const lock = (value) => { enable.disabled = settings.disabled = continueNormally.disabled = value; };
  scope.listen(continueNormally, "click", async () => {
    lock(true);
    try { await commands.acknowledgeGraphicsRecovery?.(); dismiss(); }
    catch (error) { status.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.TheRecoveryChoiceCouldNotBeSaved", "The recovery choice could not be saved."); lock(false); }
  });
  scope.listen(settings, "click", async () => {
    lock(true);
    try {
      await commands.acknowledgeGraphicsRecovery?.();
      dismiss();
      commands.navigate("settings");
    } catch (error) {
      status.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.GraphicsSettingsCouldNotBeOpened", "Graphics settings could not be opened.");
      lock(false);
    }
  });
  scope.listen(enable, "click", async () => {
    lock(true);
    status.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.PreparingTheNextMemoryProtectionProfile", "Preparing the next Memory Protection profile…");
    try {
      const result = await commands.prepareGraphicsRecovery?.();
      if (result?.requiresReload) {
        if (!result.reloadTriggered) {
          status.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.TheRecoveryProfileWasPersistedButTheFullFoundry", "The recovery profile was persisted, but the full Foundry reload could not be started.");
          lock(false);
        }
      } else dismiss();
    } catch (error) {
      status.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.TheNextMemoryProtectionProfileCouldNotBePrepared", "The next Memory Protection profile could not be prepared.");
      lock(false);
    }
  });
  return Object.freeze({
    element,
    present() {
      const state = commands.readGraphicsRecovery?.();
      if (!state || state.behavior !== "ask" || !state.reliablePending) return false;
      title.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.SceneGraphicsProblem", "Scene graphics problem");
      const conflictedLowMemory = state.reliablePending && state.lowMemoryActive && !state.lowMemoryEffective;
      message.textContent = state.currentProfile === "maximum"
        ? localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.VEMobileDetectedAGraphicsProblemWhileLoadingThis", "VE Mobile detected a graphics problem while loading this scene. Maximum protection is already selected; review the scene images or graphics settings.")
        : conflictedLowMemory
        ? localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.VEMobileDetectedAGraphicsProblemMayHelpBut", "VE Mobile detected a graphics problem. {recommendedProfile} may help, but some graphics settings are controlled elsewhere. Review Graphics Settings for details.", { recommendedProfile: (profileName(state.recommendedProfile, commands.localize)) })
        : localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.VEMobileDetectedAGraphicsProblemWhileLoadingThis2", "VE Mobile detected a graphics problem while loading this scene. {recommendedProfile} may make Foundry more stable on this device. Continuing keeps your current profile and dismisses this warning for this incident.", { recommendedProfile: (profileName(state.recommendedProfile, commands.localize)) });
      enable.hidden = !state.reliablePending || state.currentProfile === "maximum";
      enable.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.UseReload", "Use {recommendedProfile} & Reload", { recommendedProfile: (profileName(state.recommendedProfile, commands.localize)) });
      continueNormally.textContent = localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.ContinueWith", "Continue with {currentProfile}", { currentProfile: (profileName(state.currentProfile, commands.localize)) });
      settings.textContent = conflictedLowMemory ? localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.ReviewGraphicsSettings", "Review Graphics Settings") : localizedText(commands.localize, "VEMOBILE.Interface.AppFrame.GraphicsSettings", "Graphics Settings");
      element.hidden = false;
      continueNormally.focus?.({ preventScroll: true });
      return true;
    }
  });
}

function profileName(value, localize) {
  const profile = ["normal", "balanced", "strong", "maximum"].includes(value) ? value : "normal";
  const fallback = { normal: "Normal", balanced: "Balanced", strong: "Strong", maximum: "Maximum" };
  return localizedText(localize, `VEMOBILE.MemoryProfile.${profile}.Label`, fallback[profile]);
}

export function sceneNavigationTapAction({ route, splitActive = false } = {}) {
  if (splitActive) return route === "scene" ? "open-full-scene" : "open-split-scene-chooser";
  if (route !== "scene") return "navigate-scene";
  return "toggle-chooser";
}

export function applySceneViewportVariables(element, bounds) {
  const values = {
    "--ve-scene-left": `${bounds.left}px`,
    "--ve-scene-top": `${bounds.top}px`,
    "--ve-scene-width": `${bounds.width}px`,
    "--ve-scene-height": `${bounds.height}px`,
    "--ve-scene-right": `${bounds.left + bounds.width}px`,
    "--ve-scene-bottom": `${bounds.top + bounds.height}px`
  };
  for (const [property, value] of Object.entries(values)) element?.style?.setProperty?.(property, value);
}

export function clearSceneViewportVariables(element) {
  for (const property of ["--ve-scene-left", "--ve-scene-top", "--ve-scene-width", "--ve-scene-height", "--ve-scene-right", "--ve-scene-bottom"]) {
    element?.style?.removeProperty?.(property);
  }
}

export function createReconnectBlocker(scope, {
  localize = null,
  locale = "en",
  onReload = () => {},
  delayMs = RECONNECT_BLOCKER_DELAY_MS,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  elapsedUpdateMs = 200
} = {}) {
  const checkpointDefinitions = Object.freeze([
    Object.freeze({ id: "connection", label: localizedText(localize, "VEMOBILE.Interface.AppFrame.RestoringConnection", "Restoring connection"), message: localizedText(localize, "VEMOBILE.Interface.AppFrame.RestoringConnection2", "Restoring connection…") }),
    Object.freeze({ id: "collections", label: localizedText(localize, "VEMOBILE.Interface.AppFrame.RefreshingWorldData", "Refreshing world data"), message: localizedText(localize, "VEMOBILE.Interface.AppFrame.RefreshingWorldData2", "Refreshing world data…") }),
    Object.freeze({ id: "foundry-session", label: localizedText(localize, "VEMOBILE.Interface.AppFrame.SynchronisingSceneData", "Synchronizing scene data"), message: localizedText(localize, "VEMOBILE.Interface.AppFrame.SynchronisingSceneData2", "Synchronizing scene data…") }),
    Object.freeze({ id: "canvas", label: localizedText(localize, "VEMOBILE.Interface.AppFrame.SynchronisingScene", "Synchronizing scene"), message: localizedText(localize, "VEMOBILE.Interface.CanvasRecoveryGateway.SynchronisingScene", "Synchronizing scene…") }),
    Object.freeze({ id: "mobile-session", label: localizedText(localize, "VEMOBILE.Interface.AppFrame.RestoringSession", "Restoring session"), message: localizedText(localize, "VEMOBILE.Interface.AppKernel.RestoringYourSession", "Restoring your session…") }),
    Object.freeze({ id: "presentation", label: localizedText(localize, "VEMOBILE.Interface.AppFrame.RestoringInterface", "Restoring interface"), message: localizedText(localize, "VEMOBILE.Interface.AppKernel.RestoringMobileInterface", "Restoring mobile interface…") }),
    Object.freeze({ id: "interactions", label: localizedText(localize, "VEMOBILE.Interface.AppFrame.RestoringControls", "Restoring controls"), message: localizedText(localize, "VEMOBILE.Interface.AppKernel.RestoringControls", "Restoring controls…") })
  ]);
  const title = node("h2", { text: localizedText(localize, "VEMOBILE.Interface.AppFrame.Reconnecting", "Reconnecting"), attrs: { id: "ve-reconnect-title" } });
  const message = node("p", {
    className: "ve-reconnect-phase",
    text: checkpointDefinitions[0].message,
    attrs: { "aria-live": "polite", "aria-atomic": "true" }
  });
  const progress = node("span", { className: "ve-reconnect-progress", attrs: { hidden: true } });
  const elapsed = node("span", { className: "ve-reconnect-elapsed", text: localizedText(localize, "VEMOBILE.Interface.AppFrame.ElapsedMs", "Elapsed · 0 ms") });
  const elapsedClock = createElapsedWorkerClock(elapsed, { now, elapsedLabel: localizedText(localize, "VEMOBILE.Timer.Elapsed", "Elapsed"), locale });
  const previous = node("span", { className: "ve-reconnect-previous", text: localizedText(localize, "VEMOBILE.Interface.AppFrame.LastResync", "Last resync · —") });
  const timing = node("div", { className: "ve-reconnect-timing", children: [elapsed, previous] });
  const checkpoints = createLoadingCheckpoints(document, checkpointDefinitions, { label: localizedText(localize, "VEMOBILE.Interface.AppFrame.ResynchronisationCheckpoints", "Resynchronization checkpoints") });
  const reload = node("button", {
    attrs: { type: "button", hidden: true },
    children: [icon("fa-rotate"), node("span", { text: localizedText(localize, "VEMOBILE.Interface.AppFrame.ReloadFoundry", "Reload Foundry") })]
  });
  const element = node("div", {
    className: "ve-reconnect-blocker",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-reconnect-title" },
    children: [node("section", { className: "ve-reconnect-card", children: [
      node("div", { className: "ve-reconnect-spinner", children: [icon("fa-arrows-rotate")] }),
      title,
      message,
      progress,
      checkpoints.element,
      timing,
      reload
    ] })]
  });
  let generation = null;
  let presentationScope = null;
  let activeState = null;

  const reveal = () => {
    element.dataset.visible = "true";
  };
  const formatTiming = (value) => {
    const milliseconds = Math.max(0, Number(value) || 0);
    if (milliseconds < 1_000) return `${localizedNumber(Math.round(milliseconds), locale)} ms`;
    return `${localizedNumber(milliseconds / 1_000, locale, 1)} s`;
  };
  const renderTiming = () => {
    const startedAt = Number(activeState?.startedAt);
    const current = Number(now());
    const running = activeState?.startedAt !== null
      && activeState?.startedAt !== undefined
      && Number.isFinite(startedAt) && Number.isFinite(current);
    const elapsedMs = running
      ? Math.max(0, current - startedAt)
      : 0;
    elapsed.hidden = !running;
    elapsed.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.Elapsed", "Elapsed · {formatTimingelapsedMs}", { formatTimingelapsedMs: (formatTiming(elapsedMs)) });
    if (running) elapsedClock.start(startedAt);
    const lastSuccessfulMs = Number(activeState?.lastSuccessfulMs);
    const hasPrevious = activeState?.lastSuccessfulMs !== null
      && activeState?.lastSuccessfulMs !== undefined
      && Number.isFinite(lastSuccessfulMs)
      && lastSuccessfulMs >= 0;
    previous.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.LastResync2", "Last resync · {hasPreviousformatTimin}", { hasPreviousformatTimin: (hasPrevious ? formatTiming(lastSuccessfulMs) : "—") });
  };
  const scheduleElapsed = (ownedScope, ownedGeneration) => {
    ownedScope.timeout(() => {
      if (generation !== ownedGeneration || presentationScope !== ownedScope || ownedScope.disposed) return;
      renderTiming();
      scheduleElapsed(ownedScope, ownedGeneration);
    }, elapsedUpdateMs);
  };
  const resetPresentation = (state) => {
    presentationScope?.dispose();
    elapsedClock.stop();
    presentationScope = scope.child("reconnect-presentation-delay");
    element.dataset.visible = "false";
    const ownedScope = presentationScope;
    const ownedGeneration = state.generation;
    if (state.phase === "reconnecting") ownedScope.timeout(() => {
      if (generation === ownedGeneration && presentationScope === ownedScope) reveal();
    }, delayMs);
    else reveal();
    scheduleElapsed(ownedScope, ownedGeneration);
  };
  scope.listen(reload, "click", onReload);
  scope.own(() => presentationScope?.dispose());
  scope.own(() => elapsedClock.stop());

  const updatePresentation = (state) => {
    const activeIndex = Math.max(0, checkpointDefinitions.findIndex(({ id }) => id === state.checkpoint));
    checkpoints.update(state.checkpoint, { failed: state.phase === "failed" });
    if (state.phase !== "failed" && state.phase !== "reloading") {
      message.textContent = state.detail || checkpointDefinitions[activeIndex].message;
      message.hidden = message.textContent === checkpointDefinitions[activeIndex].message;
    }
    const phaseProgress = state.progress ?? {};
    const parts = [];
    const pct = Number(phaseProgress.pct);
    const current = Number(phaseProgress.current);
    const total = Number(phaseProgress.total);
    if (phaseProgress.pct !== null && phaseProgress.pct !== undefined && Number.isFinite(pct)) {
      parts.push(`${Math.round(Math.max(0, Math.min(100, pct)))}%`);
    }
    if (phaseProgress.current !== null && phaseProgress.current !== undefined
      && phaseProgress.total !== null && phaseProgress.total !== undefined
      && Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      parts.push(localizedText(localize, "VEMOBILE.Recovery.Progress", "{current} of {total}", { current: localizedNumber(Math.max(0, current), locale), total: localizedNumber(Math.max(0, total), locale) }));
    }
    progress.textContent = parts.join(" · ");
    progress.hidden = parts.length === 0;
    element.dataset.progress = progress.hidden ? "indeterminate" : "determinate";
    renderTiming();
  };

  return Object.freeze({
    element,
    update(state) {
      if (!state) {
        presentationScope?.dispose();
        presentationScope = null;
        generation = null;
        activeState = null;
        elapsedClock.stop();
        element.hidden = true;
        element.dataset.visible = "false";
        return;
      }
      activeState = state;
      element.hidden = false;
      if (generation !== state.generation) {
        generation = state.generation;
        resetPresentation(state);
      }
      reload.hidden = state.phase !== "failed";
      updatePresentation(state);
      if (state.phase === "failed") {
        presentationScope?.dispose();
        presentationScope = null;
        title.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.ResynchronisationInterrupted", "Resynchronization interrupted");
        message.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.VEMobileCouldNotRestoreTheSessionReloadFoundry", "VE Mobile could not restore the session. Reload Foundry to recover safely.");
        message.hidden = false;
        reveal();
      } else if (state.phase === "reloading") {
        title.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.FinishingRecovery", "Finishing recovery");
        message.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.ReloadingFoundryToFinishRecovery", "Reloading Foundry to finish recovery…");
        message.hidden = false;
        reveal();
      } else if (state.phase === "resynchronising") {
        title.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.SynchronisingGame", "Synchronizing game…");
        reveal();
      } else {
        title.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.Reconnecting", "Reconnecting");
      }
    }
  });
}

export function createModeTransitionBlocker(scope, { localize = null, delayMs = RECONNECT_BLOCKER_DELAY_MS } = {}) {
  const title = node("h2", { text: localizedText(localize, "VEMOBILE.Interface.AppFrame.ChangingPresentation", "Changing presentation"), attrs: { id: "ve-mode-transition-title" } });
  const message = node("p", { text: localizedText(localize, "VEMOBILE.Interface.AppFrame.ApplyingTheRequestedMobilePresentation", "Applying the requested mobile presentation."), attrs: { "aria-live": "polite", "aria-atomic": "true" } });
  const phase = node("span", { className: "ve-mode-transition-phase", text: localizedText(localize, "VEMOBILE.Interface.AppFrame.ApplyingLayout", "Applying layout") });
  const element = node("div", {
    className: "ve-mode-transition-blocker",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-mode-transition-title" },
    children: [node("section", { className: "ve-mode-transition-card", children: [
      node("div", { className: "ve-mode-transition-spinner", children: [icon("fa-mobile-screen-button")] }),
      title,
      message,
      phase
    ] })]
  });
  let generation = null;
  let presentationScope = null;
  const reveal = () => { element.dataset.visible = "true"; };
  scope.own(() => presentationScope?.dispose());
  return Object.freeze({
    element,
    update(state) {
      if (!state) {
        presentationScope?.dispose();
        presentationScope = null;
        generation = null;
        element.hidden = true;
        element.dataset.visible = "false";
        return;
      }
      element.hidden = false;
      if (generation !== state.generation) {
        generation = state.generation;
        presentationScope?.dispose();
        presentationScope = scope.child("mode-transition-presentation-delay");
        element.dataset.visible = "false";
        presentationScope.timeout(reveal, delayMs);
      }
      title.textContent = localizedText(localize, "VEMOBILE.Interface.AppFrame.SwitchingTo", "Switching to {targetmobile}", { targetmobile: (state.target || "mobile") });
      message.textContent = state.detail || localizedText(localize, "VEMOBILE.Interface.AppFrame.ApplyingTheRequestedMobilePresentation", "Applying the requested mobile presentation.");
      phase.textContent = state.phase === "settling"
        ? localizedText(localize, "VEMOBILE.Interface.AppFrame.SettlingViewport", "Settling viewport")
        : state.phase === "restoring" ? localizedText(localize, "VEMOBILE.Interface.AppFrame.RestoringInteractions", "Restoring interactions") : localizedText(localize, "VEMOBILE.Interface.AppFrame.ApplyingLayout", "Applying layout");
    }
  });
}

function combatNavIcon() {
  return icon("fa-swords");
}

function applyThemeBlend(element, profile) {
  const [primary, secondary, tertiary] = profile.accents;
  element.style.setProperty("--ve-class-accent-primary", primary.bright);
  element.style.setProperty("--ve-class-accent-secondary", secondary.bright);
  element.style.setProperty("--ve-class-accent-tertiary", tertiary.bright);
  element.style.setProperty("--ve-class-deep-primary", primary.deep);
  element.style.setProperty("--ve-class-deep-secondary", secondary.deep);
  element.style.setProperty("--ve-class-deep-tertiary", tertiary.deep);
}

function clearThemeBlend(element) {
  for (const property of [
    "--ve-class-accent-primary", "--ve-class-accent-secondary", "--ve-class-accent-tertiary",
    "--ve-class-deep-primary", "--ve-class-deep-secondary", "--ve-class-deep-tertiary"
  ]) element.style.removeProperty(property);
}

export function scenePresentationKey(snapshot) {
  return JSON.stringify({ scene: snapshot?.scene ?? null, combat: snapshot?.combat ?? null });
}

export function sceneTargetsOnlyChanged(previous, current) {
  const previousCount = Number(previous?.scene?.movement?.targetCount ?? 0);
  const currentCount = Number(current?.scene?.movement?.targetCount ?? 0);
  return previousCount !== currentCount
    && sceneTargetIndependentKey(previous) === sceneTargetIndependentKey(current);
}

function sceneTargetIndependentKey(snapshot) {
  const movement = snapshot?.scene?.movement ?? null;
  const scene = snapshot?.scene ? {
    ...snapshot.scene,
    movement: movement ? { ...movement, targetCount: 0 } : movement
  } : null;
  return JSON.stringify({ scene, combat: snapshot?.combat ?? null });
}

export function snapshotPresentationChangedForRoute(previous, current) {
  if (!previous?.snapshot || !current?.snapshot) return previous?.snapshot !== current?.snapshot;
  if (current.route === "characters") {
    if (!previous.snapshot.selectedActor && !current.snapshot.selectedActor) {
      if (previous.snapshot.actors === current.snapshot.actors) return false;
      const actorId = current.selectedActorId;
      const previousActor = previous.snapshot.actors?.find((actor) => actor.id === actorId) ?? previous.snapshot.actors?.[0];
      const currentActor = current.snapshot.actors?.find((actor) => actor.id === actorId) ?? current.snapshot.actors?.[0];
      return previousActor !== currentActor || actorMenuSignature(previous.snapshot.actors) !== actorMenuSignature(current.snapshot.actors);
    }
    return previous.snapshot.selectedActor !== current.snapshot.selectedActor
      || actorMenuSignature(previous.snapshot.actors) !== actorMenuSignature(current.snapshot.actors);
  }
  if (current.route === "combat") return previous.snapshot.combat !== current.snapshot.combat;
  if (current.route === "journals") return previous.snapshot.journals !== current.snapshot.journals;
  if (current.route === "scene") return scenePresentationKey(previous.snapshot) !== scenePresentationKey(current.snapshot);
  return false;
}

function actorMenuSignature(actors = []) {
  return JSON.stringify(actors.map((actor) => ({
    id: actor.id,
    sourceUuid: actor.sourceUuid,
    name: actor.name,
    img: actor.img,
    type: actor.type,
    sort: actor.sort,
    folderPath: actor.folderPath,
    level: actor.level,
    classes: actor.classes,
    npc: actor.npc
  })));
}

export function activeTemplatePresentationUnchanged(previous, current) {
  return Boolean(current?.templatePlacement && previous?.templatePlacement === current.templatePlacement);
}

/** Split Scene results remain deferred while its native template surface owns
 * input. Character-origin results continue to belong to the companion pane. */
export function splitSceneActionSessionId(state, splitActive) {
  if (!splitActive || state?.templatePlacement || state?.nativeTokenPlacement || state?.actionSessionOrigin !== "scene") return "";
  return String(state?.actionSession?.rootMessageId ?? "");
}

function elementViewport(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  return Object.freeze({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
}

/** Resolve from actual rendered geometry, including reduced-motion layouts. */
export function waitForStableElementGeometry(element, {
  signal,
  localize = null,
  requestAnimationFrameFn = globalThis.requestAnimationFrame ?? ((callback) => setTimeout(callback, 0)),
  cancelAnimationFrameFn = globalThis.cancelAnimationFrame ?? clearTimeout,
  isCurrent = () => true,
  maxFrames = Number.POSITIVE_INFINITY,
  includeScrollHeight = false
} = {}) {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error(localizedText(localize, "VEMOBILE.Errors.LayoutCanceled", "Scene layout transition was canceled.")));
  return new Promise((resolve, reject) => {
    let frame = null;
    let previous = null;
    let stableFrames = 0;
    let sampledFrames = 0;
    let settled = false;
    const cleanup = () => {
      if (frame !== null) cancelAnimationFrameFn(frame);
      signal?.removeEventListener?.("abort", onAbort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () => finish(reject, signal.reason ?? new Error(localizedText(localize, "VEMOBILE.Errors.LayoutCanceled", "Scene layout transition was canceled.")));
    const sample = () => {
      frame = null;
      if (!isCurrent()) return finish(resolve, null);
      sampledFrames += 1;
      const bounds = elementViewport(element);
      const next = bounds && includeScrollHeight ? { ...bounds, scrollHeight: element.scrollHeight } : bounds;
      if (next && previous && sameViewport(next, previous) && next.scrollHeight === previous.scrollHeight) stableFrames += 1;
      else stableFrames = 0;
      previous = next;
      if (next && stableFrames >= 2) return finish(resolve, next);
      if (sampledFrames >= maxFrames) return finish(reject, new Error(localizedText(localize, "VEMOBILE.Errors.ViewportUnsettled", "The rendered viewport did not settle.")));
      frame = requestAnimationFrameFn(sample);
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
    frame = requestAnimationFrameFn(sample);
  });
}

function sameViewport(left, right) {
  return ["left", "top", "width", "height"].every((key) => Math.abs(left[key] - right[key]) < 0.25);
}

export function characterScrollContextKey(sourceUuid, tab) {
  const source = String(sourceUuid ?? "").trim();
  const page = String(tab ?? "").trim();
  return source && page ? `${source}\u0000${page}` : "";
}

export function clampCharacterScrollTop(scrollTop, scrollHeight, clientHeight) {
  const desired = Math.max(0, Number(scrollTop) || 0);
  const maximum = Math.max(0, (Number(scrollHeight) || 0) - (Number(clientHeight) || 0));
  return Math.min(desired, maximum);
}

export function restoreCharacterScrollPosition(scroller, targetScrollTop, characterHeaderScroll = null, { preserveOrigin = false, clampContent = false } = {}) {
  // A pinned header needs only enough tail to finish contracting. Preserving a
  // long tab's entire offset on a short tab can hide all its content behind it.
  if (!preserveOrigin) characterHeaderScroll?.prepareScrollRestore?.(targetScrollTop);
  const toNative = value => characterHeaderScroll?.toNativeScrollTop?.(value) ?? value;
  const fillerTarget = toNative(characterHeaderScroll
    ? Math.min(targetScrollTop, characterHeaderScroll.collapseDistance)
    : targetScrollTop);
  const spacer = scroller.querySelector?.(".ve-character-scroll-spacer");
  if (spacer) {
    let filler = 0;
    spacer.style.height = "0px";
    const requiredRange = Math.max(
      clampContent ? 0 : fillerTarget,
      characterHeaderScroll?.collapseDistance ?? 0
    );
    if (requiredRange > 0) {
      // scrollHeight is floored at clientHeight when content is shorter than
      // the pane. A temporary known tail reveals the real content extent so
      // the permanent filler can cover both that deficit and the target range.
      const requiredContentHeight = (characterHeaderScroll?.compactClientHeight ?? scroller.clientHeight) + requiredRange;
      const probe = Math.ceil(requiredContentHeight + 1);
      spacer.style.height = `${probe}px`;
      const contentExtent = Math.max(0, scroller.scrollHeight - probe);
      spacer.style.height = "0px";
      filler = Math.max(0, requiredContentHeight - contentExtent);
      if (filler) spacer.style.height = `${Math.ceil(filler)}px`;
    }
  }
  scroller.scrollTop = clampCharacterScrollTop(toNative(targetScrollTop), scroller.scrollHeight, scroller.clientHeight);
  characterHeaderScroll?.update(scroller.scrollTop);
}

export function characterTabScrollTarget(currentScrollTop, currentTabBarTop, desiredTabBarTop) {
  const currentScroll = Math.max(0, Number(currentScrollTop) || 0);
  const currentTop = Number(currentTabBarTop);
  const desiredTop = Number(desiredTabBarTop);
  if (!Number.isFinite(currentTop) || !Number.isFinite(desiredTop)) return currentScroll;
  return Math.max(0, currentScroll + currentTop - desiredTop);
}

export function requiredCharacterScrollFiller(scrollTop, scrollHeight, clientHeight) {
  const desired = Math.max(0, Number(scrollTop) || 0);
  const maximum = Math.max(0, (Number(scrollHeight) || 0) - (Number(clientHeight) || 0));
  return Math.max(0, desired - maximum);
}

export function nextCharacterScrollFiller(scrollTop, scrollHeight, clientHeight, currentFiller = 0) {
  const filler = Math.max(0, Number(currentFiller) || 0);
  return filler + requiredCharacterScrollFiller(scrollTop, scrollHeight, clientHeight);
}

export function createCharacterScrollMemory() {
  // Frame-owned, exact-source/subtab LRU; no durable preferences or documents.
  const limit = 128;
  const positions = new Map();
  return Object.freeze({
    remember(sourceUuid, tab, scrollTop) {
      const key = characterScrollContextKey(sourceUuid, tab);
      if (!key) return 0;
      const value = Number.isFinite(Number(scrollTop)) ? Math.max(0, Number(scrollTop)) : 0;
      positions.delete(key);
      positions.set(key, value);
      if (positions.size > limit) positions.delete(positions.keys().next().value);
      return value;
    },
    resolve({ sourceUuid, tab } = {}) {
      const key = characterScrollContextKey(sourceUuid, tab);
      if (!key) return 0;
      return positions.get(key) ?? 0;
    },
    read(sourceUuid, tab) {
      return positions.get(characterScrollContextKey(sourceUuid, tab));
    },
    clear() { positions.clear(); }
  });
}

function characterScrollContext(state) {
  if (state?.route !== "characters") return null;
  const sourceUuid = String(state.selectedActorSourceUuid ?? "").trim();
  const tab = String(state.characterTab ?? "").trim();
  const key = characterScrollContextKey(sourceUuid, tab);
  return key ? Object.freeze({ key, sourceUuid, tab }) : null;
}

export function sceneStructureKey(snapshot, layoutKey = "", splitViewport = false) {
  return JSON.stringify({
    sceneId: snapshot?.scene?.id ?? "",
    canvasReady: Boolean(snapshot?.scene?.canvasReady),
    layoutKey,
    splitViewport: Boolean(splitViewport)
  });
}

export function sceneFocusKey(snapshot) {
  const token = snapshot?.scene?.movement?.tokens?.find((entry) => entry.controlled);
  return token ? `${snapshot?.scene?.id ?? ""}:${token.id ?? ""}:${token.actorId ?? ""}` : "";
}

function screenState(state, layoutKey = "") {
  return {
    route: state.route,
    routeHistory: state.routeHistory,
    status: state.status,
    error: state.error,
    snapshot: state.snapshot,
    selectedActorId: state.selectedActorId,
    selectedActorSourceUuid: state.selectedActorSourceUuid,
    characterTab: state.characterTab,
    characterNavigation: state.characterNavigation,
    rollResult: state.rollResult,
    actionSession: state.actionSession,
    actionSessionOrigin: state.actionSessionOrigin,
    quickbarCollapsed: state.quickbarCollapsed,
    characterItemId: state.characterItemId,
    expandedCharacterItemId: state.expandedCharacterItemId,
    hitPointEditor: state.hitPointEditor,
    restEditor: state.restEditor,
    spellSlotEditor: state.spellSlotEditor,
    xpEditor: state.xpEditor,
    portraitImage: state.portraitImage,
    journal: state.journal,
    journalLoading: state.journalLoading,
    journalError: state.journalError,
    journalPageId: state.journalPageId,
    journalHeading: state.journalHeading,
    journalMenuOpen: state.journalMenuOpen,
    journalImage: state.journalImage,
    templatePlacement: state.templatePlacement,
    nativeTokenPlacement: state.nativeTokenPlacement,
    actorTokenPlacement: state.actorTokenPlacement,
    sceneChooserOpen: state.sceneChooserOpen,
    sceneChooserRevision: state.sceneChooserRevision,
    viewRevision: state.viewRevision,
    layoutKey
  };
}

export function journalPresentationChanged(previous, current) {
  return previous?.journal !== current?.journal
    || previous?.journalLoading !== current?.journalLoading
    || previous?.journalError !== current?.journalError
    || previous?.journalPageId !== current?.journalPageId
    || previous?.journalHeading !== current?.journalHeading
    || previous?.journalMenuOpen !== current?.journalMenuOpen
    || previous?.journalImage !== current?.journalImage;
}

function renderSplitScenePicker({ commands, scope, expandedFolderIds, sceneChoiceTransition }) {
  let scenes = Object.freeze([]);
  try {
    scenes = commands.readSceneNavigation();
  } catch (error) {
    commands.reportSceneNavigationError?.(error);
  }
  return renderSceneChooser({
    scenes,
    commands,
    scope,
    expandedFolderIds,
    host: "pane",
    sceneChoiceTransition
  });
}

function plainHistoryState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  try {
    return Object.freeze({
      keys: Object.keys(state).slice(0, 20),
      veMobileBackGuard: typeof state.__veMobileBackGuard === "string" ? state.__veMobileBackGuard.slice(0, 80) : null
    });
  } catch {
    return Object.freeze({ unavailable: true });
  }
}

function tabletRotateSuggestion(localize = null) {
  return node("div", {
    className: "ve-tablet-rotate-suggestion",
    attrs: {
      role: "img",
      title: localizedText(localize, "VEMOBILE.Interface.AppFrame.RotateToLandscapeForTheBestTabletExperience", "Rotate to landscape for the best tablet experience"),
      "aria-label": localizedText(localize, "VEMOBILE.Interface.AppFrame.RotateToLandscapeForTheBestTabletExperience", "Rotate to landscape for the best tablet experience")
    },
    children: [
      icon("fa-tablet-screen-button"),
      icon("fa-rotate-right")
    ]
  });
}
