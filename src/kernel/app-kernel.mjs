import { localizedText } from "../ui/localized-text.mjs";
import { createTaskScope } from "./task-scope.mjs";
import { createAppFrame } from "../ui/app-frame.mjs";
import { createAuthoritativeResynchronizer } from "./authoritative-resync.mjs";
import { createSceneInteractionReadiness, sceneInteractionIsReady } from "./scene-interaction-readiness.mjs";
import { createCombatSceneActions } from "./combat-scene-actions.mjs";
import { createTemplatePlacementController } from "./template-placement-session.mjs";
import { createNativeTokenPlacementController } from "./native-token-placement-session.mjs";
import { ACTOR_COMMANDS } from "./command-names.mjs";
import { createModeTransitionCoordinator, presentationLabel } from "./mode-transition.mjs";

export function actorTokenSourceKnown(snapshot, sourceUuid) {
  return Boolean(sourceUuid && (snapshot?.selectedActor?.sourceUuid === sourceUuid
    || snapshot?.actors?.some((actor) => String(actor.sourceUuid ?? (actor.id ? `Actor.${actor.id}` : "")) === sourceUuid)));
}

export function nativeSceneTileTapAllowed({ active, state, presentation }) {
  return Boolean(active && !state?.reconnect && !state?.modeTransition
    && !state?.templatePlacement && !state?.nativeTokenPlacement && !state?.actorTokenPlacement
    && sceneInteractionIsReady(presentation));
}

export function createAppKernel({ store, session, commandGateway, biographyGateway, actorEditorGateway = null, combatGateway, cameraIntents, authoritativeGateway, canvasRecoveryGateway = null, loadTimingGateway = null, reloadApplication = () => globalThis.window?.location?.reload?.(), connectionGeneration, sceneGateway, templatePlacementGateway, nativeTokenPlacementGateway = null, actorTokenPlacementGateway = null, movementGateway, quickbarGateway, hotbarGateway = null, actionBarPreferences = null, nativeChatGateway, armorClassGateway = null, diagnosticsJournalGateway = null, activeEffectContextGateway, actionSessionGateway, preferencesGateway, settingsCompatibilityGateway, moduleOverlayGateway, sessionStatusGateway, deviceIdentityGateway, controlsGuideGateway = null, isControlsUiReady = () => false, themeGateway, mobileBackGateway = null, mobileAssetGateway = null, lowMemoryGateway = null, graphicsProfileGateway = lowMemoryGateway, graphicsRecoveryGateway = null, metrics, diagnostics, performanceObserver = null, wakeLockController, readPolicy, readGraphicsPolicy = () => null, watchGraphicsPolicy = () => () => {}, disable, preparePresentation = () => {}, createFrame = createAppFrame }) {
  const localize = (key, fallback, data) => localizedText((id, _fallback, values) => preferencesGateway?.localize?.(id, values), key, fallback, data);
  let runtimeScope = null;
  let activationCommitted = false;
  let starting = false;
  let stopping = false;
  let frame = null;
  let rollResultSequence = 0;
  let journalRequestSequence = 0;
  let resynchronizer = null;
  let sceneInteractionReadiness = null;
  let combatSceneActions = null;
  let templatePlacement = null;
  let nativeTokenPlacement = null;
  let tokenPlacementGeneration = 0;
  let placingActorToken = false;
  let modeTransition = null;
  const recoveryCaptures = new Map();

  const expectedSession = () => ({
    worldId: store.state.snapshot?.world?.id,
    userId: store.state.snapshot?.user?.id,
    connectionGeneration: connectionGeneration?.current ?? 0
  });
  const guardConnection = async (action) => {
    const generation = connectionGeneration?.current ?? 0;
    const result = await action({ ...expectedSession(), connectionGeneration: generation });
    if (connectionGeneration && !connectionGeneration.matches(generation)) throw new Error(localizedText(localize, "VEMOBILE.Interface.CombatGateway.TheConnectionChangedWhileThisActionWasRunning", "The connection changed while this action was running."));
    return result;
  };
  const guardActionBar = (source, action) => guardConnection((expected) => {
    const state = store.state;
    const preferences = preferencesGateway.actionMenu?.() ?? preferencesGateway.snapshot();
    if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active
      || state.reconnect || state.modeTransition || state.templatePlacement || state.nativeTokenPlacement || state.actorTokenPlacement
      || preferences.quickbarEnabled === false || (preferences.quickbarSource ?? "character") !== source) {
      throw new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.ThisActionBarIsNoLongerActive", "This action bar is no longer active."));
    }
    return action(expected);
  });
  const guardCombatControl = (request, action) => {
    const lifecycleToken = runtimeScope;
    return guardConnection((expected) => {
      const state = store.state;
      if (!activationCommitted || !lifecycleToken || runtimeScope !== lifecycleToken || lifecycleToken.disposed || !readPolicy().active
        || state.reconnect || state.modeTransition || state.route !== "combat") {
        throw new Error(localizedText(localize, "VEMOBILE.Interface.CombatGateway.MobileCombatControlsAreNoLongerActive", "Mobile combat controls are no longer active."));
      }
      return action({ ...request, ...expected, lifecycleToken });
    });
  };

  const cancelActorTokenPlacement = () => {
    tokenPlacementGeneration += 1;
    actorTokenPlacementGateway?.cancel();
    if (store.state.actorTokenPlacement) store.dispatch({ type: "actor-token-placement-changed", placement: null });
  };
  const requireCharacterView = (sourceUuid = store.state.selectedActorSourceUuid) => {
    if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active
      || store.state.route !== "characters" || store.state.reconnect || store.state.modeTransition
      || sourceUuid !== store.state.selectedActorSourceUuid) throw new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.ThisActorViewIsNoLongerActive", "This Actor view is no longer active."));
  };
  const actorTokenEligible = (sourceUuid) => {
    const state = store.state;
    const sceneId = String(state.snapshot?.scene?.id ?? "");
    const knownSource = actorTokenSourceKnown(state.snapshot, sourceUuid);
    return Boolean(runtimeScope && readPolicy()?.active && sceneId
      && knownSource
      && state.snapshot?.scene?.canvasReady && state.canvasAvailable !== false
      && !state.reconnect && !state.modeTransition && !state.templatePlacement && !state.nativeTokenPlacement
      && actorTokenPlacementGateway?.eligibility(sourceUuid, sceneId));
  };

  const commands = Object.freeze({
    navigate: (route) => store.dispatch({ type: "navigate", route }),
    navigateBack: () => store.dispatch({ type: "navigate-back" }),
    returnToCharacter: () => store.dispatch({ type: "return-to-character" }),
    openSceneChooser: () => store.dispatch({ type: "open-scene-chooser" }),
    openSplitSceneChooser: () => store.dispatch({ type: "open-split-scene-chooser" }),
    closeSceneChooser: () => {
      void sceneGateway.closeSceneContextMenu?.();
      store.dispatch({ type: "close-scene-chooser" });
    },
    toggleSceneChooser: () => store.dispatch({ type: "toggle-scene-chooser" }),
    readSceneNavigation: () => sceneGateway.navigationSnapshot(),
    viewScene: async (sceneId, { keepSceneChooserOpen = false } = {}) => {
      void sceneGateway.closeSceneContextMenu?.();
      const keepOpen = shouldKeepSceneChooserOpen(store.state, keepSceneChooserOpen);
      const result = await guardConnection((expected) => sceneGateway.viewScene(sceneId, expected));
      if (!keepOpen && result?.viewed) store.dispatch({ type: "close-scene-chooser" });
      return result;
    },
    openSceneContextMenu: (payload) => guardConnection((expected) => sceneGateway.openSceneContextMenu(payload, expected)),
    selectSceneContextOption: (payload) => guardConnection((expected) => sceneGateway.selectSceneContextOption(payload, expected)),
    closeSceneContextMenu: () => sceneGateway.closeSceneContextMenu(),
    reportSceneNavigationError: (error) => diagnostics?.record?.("warn", "Scene navigation was rejected", error),
    reportCharacterMutationError: (error) => {
      diagnostics?.record?.("warn", "Character mutation was rejected", error);
      commandGateway.notifyError?.(error);
    },
    traceScenePickerEvent: (entry) => diagnostics?.record?.("debug", `Scene picker ${JSON.stringify(entry)}`),
    selectActor: (sourceUuid) => {
      const snapshot = session.selectCharacterSource(sourceUuid, expectedSession());
      session.adopt?.(snapshot);
      store.dispatch({ type: "session-loaded", snapshot, characterNavigation: Object.freeze([]) });
      const actorId = snapshot.selectedActor?.id ?? "";
      const sceneId = store.state.snapshot?.scene?.id;
      if (!sceneId) return Promise.resolve(Object.freeze({ ok: true, action: "none", reason: "no-current-scene" }));
      const releaseCharacterSource = session.holdCharacterSource?.(sourceUuid) ?? (() => {});
      return guardConnection((expected) => movementGateway.controlActor({ sceneId, actorId }, expected)).catch((error) => {
        diagnostics?.record?.("warn", "The selected Actor has no controllable token on the current Scene", error);
        return Object.freeze({ ok: false, action: "none", reason: error?.message ?? "Token selection failed." });
      }).finally(releaseCharacterSource);
    },
    openReferencedActor: ({ originSourceUuid, targetSourceUuid }) => {
      requireCharacterView(originSourceUuid);
      const state = store.state;
      const history = Object.freeze([...(state.characterNavigation ?? []), Object.freeze({
        sourceUuid: originSourceUuid, tab: state.characterTab, name: state.snapshot.selectedActor?.name ?? ""
      })].slice(-8));
      const snapshot = session.selectReferencedCharacterSource({ originSourceUuid, targetSourceUuid }, expectedSession());
      store.dispatch({ type: "session-loaded", snapshot, characterNavigation: history });
    },
    returnToActorOrigin: () => {
      requireCharacterView();
      const history = store.state.characterNavigation ?? [];
      const origin = history.at(-1);
      if (!origin) return;
      try {
        const snapshot = session.selectCharacterSource(origin.sourceUuid, expectedSession());
        store.dispatch({ type: "session-loaded", snapshot, characterTab: origin.tab,
          characterNavigation: Object.freeze(history.slice(0, -1)) });
      } catch (error) {
        store.dispatch({ type: "discard-character-origin" });
        commandGateway.notifyError?.(error);
      }
    },
    openNativeActorEditor: request => {
      requireCharacterView(request.actorSourceUuid);
      return guardConnection(expected => actorEditorGateway.open(request, expected, runtimeScope));
    },
    selectCharacterTab: (tab) => store.dispatch({ type: "select-character-tab", tab }),
    showRollResult: (payload) => {
      if (store.state.route !== "characters") return;
      const label = String(payload?.label ?? "").trim().slice(0, 100);
      const total = Number(payload?.total);
      const formula = String(payload?.formula ?? "").trim().slice(0, 160);
      const breakdown = Array.isArray(payload?.breakdown)
        ? payload.breakdown.map((step) => {
          const kind = step?.kind === "die" ? "die" : "modifier";
          const label = String(step?.label ?? "").trim().slice(0, 24);
          const value = Number(step?.value);
          return label && (kind === "modifier" || Number.isFinite(value))
            ? Object.freeze({ kind, label, ...(kind === "die" ? { value } : {}) })
            : null;
        }).filter(Boolean).slice(0, 12)
        : [];
      if (!label || !Number.isFinite(total)) return;
      const id = ++rollResultSequence;
      store.dispatch({ type: "show-roll-result", result: Object.freeze({
        id,
        label,
        total,
        pending: Boolean(payload?.pending),
        ...(formula ? { formula } : {}),
        ...(breakdown.length ? { breakdown: Object.freeze(breakdown) } : {})
      }) });
      return id;
    },
    updateRollResult: (id, payload) => {
      if (store.state.route !== "characters" || store.state.rollResult?.id !== id) return;
      const label = String(payload?.label ?? store.state.rollResult.label).trim().slice(0, 100);
      const total = Number(payload?.total);
      if (!label || !Number.isFinite(total)) return;
      const formula = String(payload?.formula ?? "").trim().slice(0, 160);
      const breakdown = Array.isArray(payload?.breakdown)
        ? payload.breakdown.map((step) => {
          const kind = step?.kind === "die" ? "die" : "modifier";
          const label = String(step?.label ?? "").trim().slice(0, 24);
          const value = Number(step?.value);
          return label && (kind === "modifier" || Number.isFinite(value))
            ? Object.freeze({ kind, label, ...(kind === "die" ? { value } : {}) })
            : null;
        }).filter(Boolean).slice(0, 12)
        : [];
      store.dispatch({ type: "update-roll-result", result: Object.freeze({
        ...store.state.rollResult,
        label,
        total,
        pending: false,
        ...(formula ? { formula } : {}),
        ...(breakdown.length ? { breakdown: Object.freeze(breakdown) } : {})
      }) });
    },
    dismissRollResult: (id) => store.dispatch({ type: "dismiss-roll-result", id }),
    openActionSession: (session, origin = "character") => {
      if (!activationCommitted || !readPolicy()?.active) return;
      const preferences = preferencesGateway.snapshot();
      if (preferences.showActionSummaries === false) return;
      store.dispatch({ type: "show-action-session", session: Object.freeze({ ...session, compact: preferences.compactActionSummaries === true }), origin });
    },
    dismissActionSession: () => store.dispatch({ type: "dismiss-action-session" }),
    openCharacterItem: (itemId) => store.dispatch({ type: "open-character-item", itemId }),
    closeCharacterItem: () => store.dispatch({ type: "close-character-item" }),
    setExpandedCharacterItem: (itemId = "") => store.dispatch({ type: "set-expanded-character-item", itemId }),
    setCharacterSectionExpanded: (sectionId, expanded) => store.dispatch({ type: "set-character-section-expanded", sectionId, expanded }),
    setCharacterSectionsExpanded: (sectionIds = []) => store.dispatch({ type: "set-character-sections-expanded", sectionIds }),
    initializeCharacterSections: (sourceUuid, tab, sectionIds) => store.dispatch({ type: "initialize-character-sections", sourceUuid, tab, sectionIds }),
    openHitPointEditor: (editor = "hp") => store.dispatch({ type: "open-hit-point-editor", editor }),
    closeHitPointEditor: () => store.dispatch({ type: "close-hit-point-editor" }),
    openRestEditor: () => store.dispatch({ type: "open-rest-editor" }),
    closeRestEditor: () => store.dispatch({ type: "close-rest-editor" }),
    openSpellSlotEditor: (resourceId) => store.dispatch({
      type: "open-spell-slot-editor",
      resourceId,
      actorSourceUuid: store.state.selectedActorSourceUuid,
      connectionGeneration: connectionGeneration?.current ?? 0
    }),
    closeSpellSlotEditor: () => store.dispatch({ type: "close-spell-slot-editor" }),
    openExperienceEditor: () => store.dispatch({ type: "open-experience-editor" }),
    closeExperienceEditor: () => store.dispatch({ type: "close-experience-editor" }),
    openCharacterPortrait: (image) => store.dispatch({ type: "open-character-portrait", image }),
    closeCharacterPortrait: () => store.dispatch({ type: "close-character-portrait" }),
    openJournal: async (journalId, target = {}) => {
      const request = ++journalRequestSequence;
      const generation = connectionGeneration?.current ?? 0;
      store.dispatch({ type: "journal-loading" });
      try {
        const journal = await session.readJournal(journalId, expectedSession());
        if (request === journalRequestSequence && (!connectionGeneration || connectionGeneration.matches(generation))) store.dispatch({ type: "journal-loaded", journal, target });
        return journal;
      } catch (error) {
        if (request === journalRequestSequence && (!connectionGeneration || connectionGeneration.matches(generation))) {
          store.dispatch({ type: "journal-error", error });
        }
        throw error;
      }
    },
    closeJournal: () => {
      journalRequestSequence += 1;
      store.dispatch({ type: "close-journal" });
    },
    selectJournalPage: (pageId) => store.dispatch({ type: "select-journal-page", pageId }),
    selectJournalHeading: (pageId, heading) => store.dispatch({ type: "select-journal-heading", pageId, heading }),
    toggleJournalMenu: () => store.dispatch({ type: "toggle-journal-menu" }),
    closeJournalMenu: () => store.dispatch({ type: "close-journal-menu" }),
    openNativeJournalEditor: (journalId, pageId) => session.openNativeJournalEditor(journalId, pageId, expectedSession()),
    openJournalImage: (image) => store.dispatch({ type: "open-journal-image", image }),
    closeJournalImage: () => store.dispatch({ type: "close-journal-image" }),
    localize,
    readLocale: () => preferencesGateway?.readLocale?.() ?? "en",
    toggleSplitScreen: () => store.dispatch({ type: "toggle-split-screen" }),
    setQuickbarCollapsed: (collapsed) => { actionBarPreferences?.setCollapsed(collapsed); store.dispatch({ type: "set-quickbar-collapsed", collapsed }); },
    readActionBarPreferences: (source, actorSourceUuid) => actionBarPreferences?.read(source, actorSourceUuid) ?? {},
    setActionBarPage: (source, actorSourceUuid, page) => actionBarPreferences?.setPage(source, actorSourceUuid, page),
    openFullScene: () => store.dispatch({ type: "open-full-scene" }),
    toggleTabletNavSide: () => store.dispatch({ type: "toggle-tablet-nav-side" }),
    watchMetrics: (owner, onUpdate) => metrics?.watch(owner, onUpdate),
    syncFoundryTheme: (theme) => themeGateway?.sync(theme, runtimeScope),
    syncModuleOverlays: (context) => moduleOverlayGateway?.reconcile(context),
    refreshScenePresentation: (owner) => sceneGateway.refreshPresentation(owner),
    captureSceneViewportAnchor: (bounds) => sceneGateway.captureViewportAnchor(bounds),
    restoreSceneViewportAnchor: (anchor, bounds) => sceneGateway.restoreViewportAnchor(anchor, bounds),
    captureFixedSceneAnchor: (bounds) => sceneGateway.captureFixedViewportAnchor(bounds),
    restoreFixedSceneAnchor: (anchor, bounds) => sceneGateway.restoreFixedViewportAnchor(anchor, bounds),
    acknowledgeSceneCameraPresentation: (details) => cameraIntents?.acknowledgePresentation(details),
    readSceneInteractionState: () => sceneGateway.interactionState(),
    bindSceneGestures: (surface, owner, onTap, onLongPress, onMovementAbort, options) => sceneGateway.bindGestures(surface, owner, onTap, onLongPress, onMovementAbort, options),
    zoomScene: (factor) => sceneGateway.zoom(factor),
    recenterScene: () => sceneGateway.recenter(),
    bindTemplatePlacement: (surface, owner, onOverlay) => templatePlacement?.bindGestures(surface, owner, onOverlay),
    setInitialTemplatePosition: (clientPoint) => Promise.resolve(templatePlacement?.setInitialPosition(clientPoint) ?? false),
    placeTemplate: () => templatePlacement?.place() ?? Promise.resolve(false),
    cancelTemplatePlacement: () => templatePlacement?.cancel() ?? Promise.resolve(false),
    positionNativeToken: (point) => nativeTokenPlacement?.position(point) ?? false,
    placeNativeToken: () => nativeTokenPlacement?.place() ?? false,
    cancelNativeTokenPlacement: () => nativeTokenPlacement?.cancel() ?? false,
    canPlaceActorToken: (sourceUuid) => actorTokenEligible(sourceUuid),
    dropActorToken: (sourceUuid, point, expectedSelectedSource = store.state.snapshot?.selectedActor?.sourceUuid) => {
      const state = store.state;
      if (!actorTokenEligible(sourceUuid) || state.formFactor !== "tablet" || !state.splitScreen
        || state.route !== "characters" || state.actorTokenPlacement
        || state.snapshot?.selectedActor?.sourceUuid !== expectedSelectedSource) return Promise.resolve(false);
      const sceneId = state.snapshot.scene.id;
      return guardConnection(() => actorTokenPlacementGateway.drop(sourceUuid, sceneId, point, () =>
        actorTokenEligible(sourceUuid) && store.state.route === "characters"
        && store.state.formFactor === "tablet" && store.state.splitScreen
        && store.state.snapshot?.selectedActor?.sourceUuid === expectedSelectedSource));
    },
    beginActorTokenPlacement: async (sourceUuid, expectedSelectedSource = store.state.snapshot?.selectedActor?.sourceUuid) => {
      if (!actorTokenEligible(sourceUuid) || store.state.actorTokenPlacement || store.state.templatePlacement || store.state.nativeTokenPlacement
        || store.state.snapshot?.selectedActor?.sourceUuid !== expectedSelectedSource) return false;
      const id = ++tokenPlacementGeneration;
      const sceneId = String(store.state.snapshot.scene.id);
      const selectionCurrent = () => store.state.snapshot?.selectedActor?.sourceUuid === expectedSelectedSource;
      store.dispatch({ type: "navigate", route: "scene" });
      try {
        await sceneInteractionReadiness.ensure();
        if (id !== tokenPlacementGeneration || store.state.route !== "scene"
          || String(store.state.snapshot?.scene?.id) !== sceneId || !actorTokenEligible(sourceUuid)
          || !selectionCurrent()) return false;
        const appearance = await actorTokenPlacementGateway.prepare(sourceUuid, sceneId, () =>
          id === tokenPlacementGeneration && store.state.route === "scene" && actorTokenEligible(sourceUuid)
          && selectionCurrent());
        if (!appearance || id !== tokenPlacementGeneration || store.state.route !== "scene"
          || !actorTokenEligible(sourceUuid) || !selectionCurrent()) {
          if (id === tokenPlacementGeneration) actorTokenPlacementGateway.cancel();
          return false;
        }
        store.dispatch({ type: "actor-token-placement-changed", placement: Object.freeze({
          id, sourceUuid, sceneId, appearance, selectedSourceUuid: expectedSelectedSource,
          formFactor: store.state.formFactor, orientation: store.state.orientation,
          splitScreen: store.state.splitScreen, tabletNavSide: store.state.tabletNavSide
        }) });
        return true;
      } catch (error) {
        if (id === tokenPlacementGeneration) {
          actorTokenPlacementGateway?.cancel();
          diagnostics?.record?.("warn", "Actor Token placement could not start", error);
        }
        return false;
      }
    },
    actorTokenPreviewAt: (point) => actorTokenPlacementGateway?.previewAt(point) ?? null,
    placeActorToken: async () => {
      const placement = store.state.actorTokenPlacement;
      if (!placement || placingActorToken) return false;
      if (!actorTokenEligible(placement.sourceUuid) || store.state.route !== "scene"
        || String(store.state.snapshot?.scene?.id) !== placement.sceneId
        || store.state.snapshot?.selectedActor?.sourceUuid !== placement.selectedSourceUuid) {
        cancelActorTokenPlacement();
        throw new Error(commands.localize("VEMOBILE.Scene.ActorToken.Unavailable", "Token placement is no longer available."));
      }
      placingActorToken = true;
      try {
        const result = await guardConnection(() => actorTokenPlacementGateway.commit(placement.sourceUuid, placement.sceneId, () =>
          store.state.actorTokenPlacement?.id === placement.id && store.state.route === "scene"
          && actorTokenEligible(placement.sourceUuid)
          && store.state.snapshot?.selectedActor?.sourceUuid === placement.selectedSourceUuid));
        if (result) cancelActorTokenPlacement();
        return Boolean(result);
      } finally { placingActorToken = false; }
    },
    cancelActorTokenPlacement,
    focusSceneToken: (payload) => guardConnection((expected) => movementGateway.focus({
      ...payload,
      cameraReason: "controlled-token-presentation"
    }, expected)),
    stepSceneToken: (payload) => guardConnection((expected) => movementGateway.step(payload, expected)),
    previewSceneMovementHistory: (payload) => movementGateway.previewHistory(payload, {
      worldId: store.state.snapshot?.world?.id,
      userId: store.state.snapshot?.user?.id
    }),
    tapSceneToken: (payload) => guardConnection((expected) => movementGateway.tap(payload, expected, { deferSelection: true })),
    nativeSceneTileTap: (payload) => nativeSceneTileTapAllowed({
      active: activationCommitted && readPolicy().active,
      state: store.state,
      presentation: frame?.readSceneInteractionState?.()
    })
      ? sceneGateway.nativeTileTap({ ...payload, ...expectedSession() }) : false,
    bindSceneTokenTouch: (surface, owner, onResult, onError) => movementGateway.bindTouch(surface, owner, onResult, onError, {
      worldId: store.state.snapshot?.world?.id,
      userId: store.state.snapshot?.user?.id,
      connectionGeneration: connectionGeneration?.current
    }),
    releaseSceneToken: (payload) => guardConnection((expected) => movementGateway.release(payload, expected)),
    targetSceneToken: (payload) => guardConnection((expected) => movementGateway.target(payload, expected)),
    clearSceneTargets: () => guardConnection((expected) => movementGateway.clearTargets(expected)),
    endCombatTurn: (combatId) => guardConnection((expected) => combatGateway.endTurn({ combatId, ...expected })),
    startCombat: (request) => guardCombatControl(request, expected => combatGateway.startCombat(expected)),
    endCombat: (request) => guardCombatControl(request, expected => combatGateway.endCombat(expected)),
    previousCombatTurn: (request) => guardCombatControl(request, expected => combatGateway.previousTurn(expected)),
    nextCombatTurn: (request) => guardCombatControl(request, expected => combatGateway.nextTurn(expected)),
    rollCombatInitiative: (combatId, combatantId) => guardConnection((expected) => combatGateway.rollInitiative({ combatId, combatantId }, expected)),
    focusCombatant: (combatId, combatantId) => combatSceneActions.focus(combatId, combatantId),
    centerCombatant: (combatId, combatantId, viewport = null) => guardConnection((expected) => combatGateway.centerCombatant({ combatId, combatantId, viewport }, expected)),
    targetCombatant: (combatId, combatantId) => combatSceneActions.target(combatId, combatantId),
    addQuickbarAction: (actorSourceUuid, descriptor) => guardActionBar("character", (expected) => quickbarGateway.add({ actorSourceUuid, descriptor }, expected)),
    saveQuickbar: (actorSourceUuid, slots, expectedSlots) => guardActionBar("character", (expected) => quickbarGateway.save({ actorSourceUuid, slots, expectedSlots }, expected)),
    executeHotbarMacro: (request) => guardActionBar("foundry", expected => hotbarGateway.execute(request, expected)),
    assignHotbarMacro: (request) => guardActionBar("foundry", async expected => { const result = await hotbarGateway.assign(request, expected); if (activationCommitted) loadSnapshot(); return result; }),
    addHotbarItem: (request) => guardActionBar("foundry", async expected => { const result = await hotbarGateway.addItem(request, expected); if (activationCommitted) loadSnapshot(); return result; }),
    moveHotbarMacro: (request) => guardActionBar("foundry", async expected => { const result = await hotbarGateway.move(request, expected); if (activationCommitted) loadSnapshot(); return result; }),
    editHotbarMacro: (request) => guardActionBar("foundry", expected => hotbarGateway.edit(request, expected)),
    mountNativeChat: (host, owner) => nativeChatGateway.mount(host, owner),
    openActiveEffectContextMenu: (payload) => payload?.actorSourceUuid === store.state.selectedActorSourceUuid
      ? guardConnection((expected) => activeEffectContextGateway.open(payload, expected))
      : Promise.resolve(Object.freeze({ ok: true, action: "stale" })),
    selectActiveEffectContextOption: (payload) => guardConnection((expected) => activeEffectContextGateway.select({
      ...payload, actorSourceUuid: store.state.selectedActorSourceUuid
    }, expected)),
    closeActiveEffectContextMenu: () => activeEffectContextGateway.close(),
    traceActiveEffectHold: (entry) => diagnostics?.record?.("debug", `Active Effect hold ${JSON.stringify(entry)}`),
    mountActionSession: (host, actionSession, owner, options) => actionSessionGateway.mount(host, actionSession, owner, options),
    readFramePreferences: () => {
      const preferences = preferencesGateway.frame?.() ?? preferencesGateway.snapshot();
      return Object.freeze({ ...preferences, joystickResolvedSide: resolveJoystickSide(preferences.joystickSide, store.state) });
    },
    readCharacterPreferences: () => preferencesGateway.character?.() ?? preferencesGateway.snapshot(),
    readScenePreferences: () => {
      const preferences = preferencesGateway.scene?.() ?? preferencesGateway.snapshot();
      return Object.freeze({ ...preferences, joystickResolvedSide: resolveJoystickSide(preferences.joystickSide, store.state) });
    },
    readPresentationPreferences: () => {
      const preferences = preferencesGateway.presentation?.() ?? preferencesGateway.snapshot();
      return Object.freeze({ ...preferences, resolvedMode: store.state.formFactor,
        joystickResolvedSide: resolveJoystickSide(preferences.joystickSide, store.state), graphicsPolicy: readGraphicsPolicy() });
    },
    readCharacterItemMenu: (request) => {
      if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active
        || store.state.reconnect || store.state.modeTransition
        || request.actorSourceUuid !== store.state.selectedActorSourceUuid) throw new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.ThisCharacterMenuIsNoLongerActive", "This character menu is no longer active."));
      performanceObserver?.increment?.("character.menu.prepare");
      return Object.freeze({ ...commandGateway.readItemMenu(request, expectedSession()),
        preferences: preferencesGateway.actionMenu?.() ?? preferencesGateway.snapshot() });
    },
    controlsUiReady: () => activationCommitted && isControlsUiReady(),
    controlsInvitationSeen: () => controlsGuideGateway?.seen?.() ?? true,
    markControlsInvitationPresented: () => controlsGuideGateway?.markPresented?.(),
    openControlsGuide: anchor => frame?.openControlsGuide?.(anchor),
    readControlsContext: () => {
      const state = store.state;
      return Object.freeze({ presentation: state.formFactor, canvasAvailable: state.canvasAvailable !== false,
        split: state.formFactor === "tablet" && state.splitScreen && state.orientation === "landscape",
        collective: Boolean(state.snapshot?.selectedActor?.collective),
        canPlaceActor: actorTokenEligible(state.selectedActorSourceUuid),
        actionBarSource: (preferencesGateway.actionMenu?.() ?? {}).quickbarSource ?? "character" });
    },
    readActionSummaryPreferences: () => preferencesGateway.actionSummaries?.() ?? { showActionSummaries: true },
    readSettings: () => {
      performanceObserver?.increment?.("settings.read.broad");
      const preferences = preferencesGateway.snapshot();
      const sceneId = store.state.snapshot?.scene?.id ?? store.state.snapshot?.sceneId ?? null;
      const memory = mobileAssetGateway?.diagnosticsForScene?.(sceneId);
      const profile = graphicsProfileGateway?.snapshot?.() ?? null;
      return Object.freeze({
        ...preferences,
        resolvedMode: store.state.formFactor,
        joystickResolvedSide: resolveJoystickSide(preferences.joystickSide, store.state),
        graphicsPolicy: readGraphicsPolicy(),
        mobileMemory: Object.freeze({ lowMemory: profile, profile,
          assets: memory?.assets ?? mobileAssetGateway?.snapshot?.() ?? null,
          recovery: graphicsRecoveryGateway?.snapshot?.() ?? null,
          recommendation: memory?.risk?.recommendation ?? null }),
        nativeSettings: settingsCompatibilityGateway?.snapshot?.() ?? Object.freeze({})
      });
    },
    watchLayoutState: (owner, onUpdate) => {
      const publish = () => {
        const preferences = preferencesGateway.layout?.() ?? preferencesGateway.snapshot();
        onUpdate(Object.freeze({ mode: preferences.mode,
          resolvedMode: store.state.formFactor, formFactor: store.state.formFactor,
          orientation: store.state.orientation, splitScreen: store.state.splitScreen,
          tabletNavSide: store.state.tabletNavSide, joystickSide: preferences.joystickSide,
          joystickResolvedSide: resolveJoystickSide(preferences.joystickSide, store.state) }));
      };
      const unsubscribe = store.subscribe(publish, { immediate: false });
      owner?.own?.(unsubscribe);
      publish();
      return unsubscribe;
    },
    watchGraphicsPolicy: (owner, onUpdate) => watchGraphicsPolicy(owner, onUpdate),
    readDeviceIdentity: () => deviceIdentityGateway?.read?.() ?? Promise.resolve(Object.freeze({ label: localizedText(localize, "VEMOBILE.Interface.DeviceIdentity.DesktopBrowser", "Desktop browser"), precision: "family" })),
    readSessionStatus: () => sessionStatusGateway?.snapshot?.() ?? Object.freeze({ users: Object.freeze([]) }),
    watchSessionStatus: (owner, onUpdate) => sessionStatusGateway?.watch?.(owner, onUpdate),
    readModuleOverlays: () => moduleOverlayGateway?.snapshot?.() ?? Object.freeze({ scanned: false, entries: Object.freeze([]) }),
    scanModuleOverlays: () => guardConnection(() => moduleOverlayGateway.scan()),
    setModuleOverlayVisible: (id, visible) => guardConnection(() => moduleOverlayGateway.setVisible(id, visible)),
    setModuleOverlayOrder: (ids) => guardConnection(() => moduleOverlayGateway.setOrder(ids)),
    setModuleOverlayScale: (id, scale) => guardConnection(() => moduleOverlayGateway.setScale(id, scale)),
    readMobileAssetOptimizer: () => mobileAssetGateway?.snapshot?.() ?? Object.freeze({ isGm: false, assets: Object.freeze([]), scenes: Object.freeze([]) }),
    scanMobileAssets: (options) => guardConnection(() => mobileAssetGateway.scan(options)),
    generateMobileAssetDerivatives: (options) => guardConnection(() => mobileAssetGateway.generate(options)),
    setMobileAssetMappingEnabled: (source, enabled) => guardConnection(() => mobileAssetGateway.setMappingEnabled(source, enabled)),
    removeMobileAssetMapping: (source) => guardConnection(() => mobileAssetGateway.removeMapping(source)),
    previewLowMemoryCanvas: () => lowMemoryGateway?.previewEnable?.() ?? Object.freeze([]),
    enableLowMemoryCanvas: () => guardConnection(() => graphicsProfileGateway.enable({ source: "settings-legacy-enable" })),
    disableLowMemoryCanvas: () => guardConnection(() => graphicsProfileGateway.disable({ source: "settings-legacy-disable" })),
    previewMemoryProtectionProfile: (profile) => lowMemoryGateway?.preview?.(profile) ?? Object.freeze([]),
    applyMemoryProtectionProfile: (profile) => guardConnection(() => graphicsProfileGateway.apply(profile, { source: "settings" })),
    restorePreviousGraphicsSettings: () => guardConnection(() => graphicsProfileGateway.restorePrevious({ source: "settings-restore" })),
    readGraphicsRecovery: () => graphicsRecoveryGateway?.snapshot?.() ?? null,
    acknowledgeGraphicsRecovery: () => graphicsRecoveryGateway?.acknowledge?.(),
    prepareGraphicsRecovery: () => graphicsRecoveryGateway?.prepareLowMemory?.(),
    restoreSettingsDefaults: () => restoreVeSettingsDefaults({
      lowMemoryGateway,
      preferencesGateway,
      guardConnection,
      invalidate: () => store.dispatch({ type: "view-invalidated" })
    }),
    generateDiagnosticReport: () => diagnostics?.report?.() ?? "VE Mobile diagnostics are unavailable.",
    saveDiagnosticsNow: () => diagnosticsJournalGateway?.flush?.({ explicit: true }) ?? Promise.resolve(false),
    openArmorClass: (actorSourceUuid) => guardConnection(expected => armorClassGateway.open({ actorSourceUuid, ...expected })),
    copyDiagnostics: (report) => diagnostics?.copy?.(report) ?? Promise.resolve(Object.freeze({ ok: false, text: String(report ?? localizedText(localize, "VEMOBILE.Interface.AppKernel.VEMobileDiagnosticsAreUnavailable", "VE Mobile diagnostics are unavailable.")) })),
    updateSetting: async (payload) => {
      if ((payload?.namespace ?? "ve-mobile") === "ve-mobile" && payload?.key === "mode" && readPolicy().active) {
        try { await diagnosticsJournalGateway?.flush?.({ explicit: true }); }
        catch (error) { diagnostics?.record?.("warn", "Diagnostics Journal could not flush before mode change", error); }
      }
      const result = await guardConnection(() => preferencesGateway.set(payload));
      if (result.namespace === "ve-mobile" && ((result.key === "showActionSummaries" && result.value === false) || result.key === "compactActionSummaries")) {
        store.dispatch({ type: "dismiss-action-session" });
      }
      if (!result.requiresReload) store.dispatch({ type: "view-invalidated" });
      return result;
    },
    updateCharacterCollectionPreference: (key, value) => guardConnection(() => preferencesGateway.setCharacterCollectionPreference({ key, value })),
    reloadApplication: () => globalThis.window?.location?.reload?.(),
    openFoundrySettings: () => settingsCompatibilityGateway.openFoundrySettings(),
    logout: () => preferencesGateway.logout(),
    requestScreenWakeLock: () => wakeLockController.requestFromUserGesture(),
    sendChat: (content) => guardConnection(() => session.sendChat(content, store.state.selectedActorSourceUuid)),
    readCharacterBiography: async (actorSourceUuid) => {
      const sourceUuid = String(actorSourceUuid ?? "");
      if (store.state.route !== "characters" || store.state.characterTab !== "biography"
        || store.state.selectedActorSourceUuid !== sourceUuid) throw new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.TheSelectedBiographyIsNoLongerActive", "The selected biography is no longer active."));
      const result = await guardConnection((expected) => biographyGateway.read({ actorSourceUuid: sourceUuid }, expected));
      if (store.state.route !== "characters" || store.state.characterTab !== "biography"
        || store.state.selectedActorSourceUuid !== sourceUuid) throw new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.TheSelectedBiographyIsNoLongerActive", "The selected biography is no longer active."));
      return result;
    },
    rollCharacterBiographyInline: (payload) => {
      const sourceUuid = String(payload?.actorSourceUuid ?? "");
      if (store.state.route !== "characters" || store.state.characterTab !== "biography"
        || store.state.selectedActorSourceUuid !== sourceUuid) return Promise.reject(new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.TheSelectedBiographyIsNoLongerActive", "The selected biography is no longer active.")));
      return guardConnection((expected) => biographyGateway.roll(payload, expected));
    },
    execute: (name, payload, observer) => {
      if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active
        || store.state.reconnect || store.state.modeTransition) return Promise.reject(new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.ThisActorActionIsNoLongerActive", "This Actor action is no longer active.")));
      const sourceUuid = String(payload?.actorSourceUuid ?? "");
      const visibleSource = store.state.route === "characters" ? store.state.selectedActorSourceUuid
        : store.state.route === "scene" ? store.state.snapshot?.scene?.quickbarActorSourceUuid || store.state.selectedActorSourceUuid : "";
      if (sourceUuid && sourceUuid !== visibleSource) return Promise.reject(new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.TheSelectedActorSourceChangedBeforeThisActionCould", "The selected Actor source changed before this action could run.")));
      if ([ACTOR_COMMANDS.ADD_EXPERIENCE, ACTOR_COMMANDS.UPDATE_CURRENCY, ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE, ACTOR_COMMANDS.SET_ITEM_EQUIPPED, ACTOR_COMMANDS.SET_ITEM_ATTUNED, ACTOR_COMMANDS.SET_ITEM_FAVORITE, ACTOR_COMMANDS.SET_SPELL_PREPARED, ACTOR_COMMANDS.OPEN_ITEM_SHEET].includes(name)
        || name === ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION) {
        const sourceUuid = String(payload?.actorSourceUuid ?? "");
        if (store.state.route !== "characters" || store.state.selectedActorSourceUuid !== sourceUuid
          || (name === ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION && store.state.characterTab !== "biography")) {
          return Promise.reject(new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.TheSelectedCharacterSourceChangedBeforeThisActionCould", "The selected character source changed before this action could run.")));
        }
      }
      if (name === ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE) {
        const editor = store.state.spellSlotEditor;
        const resourceId = `spell-slot:${String(payload?.slotKey ?? "")}`;
        if (!editor || editor.actorSourceUuid !== payload.actorSourceUuid || editor.resourceId !== resourceId
          || editor.connectionGeneration !== payload.editorGeneration
          || editor.connectionGeneration !== (connectionGeneration?.current ?? 0)) {
          return Promise.reject(new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.ThisSpellSlotEditorIsStaleReopenItAnd", "This spell-slot editor is stale. Reopen it and try again.")));
        }
      }
      return guardConnection((expected) => commandGateway.execute(name, payload, expected, observer));
    },
    disable
  });

  const loadSnapshot = () => {
    try {
      const snapshot = session.read();
      session.adopt?.(snapshot);
      store.dispatch({ type: "session-loaded", snapshot });
      return snapshot;
    } catch (error) {
      diagnostics?.record?.("error", "Could not read the Foundry session", error);
      store.dispatch({ type: "session-error", error });
    }
  };

  const start = () => {
    if (runtimeScope || starting || stopping) return;
    starting = true;
    const cancelled = new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.VEMobileActivationWasCancelled", "VE Mobile activation was canceled."));
    try {
      // Commands need their provisional owner during initial rendering. Public
      // activation and reconnect access remain closed until every stage succeeds.
      runtimeScope = createTaskScope("application", performanceObserver);
      const owner = runtimeScope;
      const assertCurrent = () => { if (owner.disposed || runtimeScope !== owner) throw cancelled; };
      sceneGateway.watchSceneNavigation?.(runtimeScope, () => store.dispatch({ type: "scene-navigation-invalidated" }));
      assertCurrent();
      movementGateway.watchTokenTransforms?.(runtimeScope, () => store.state.selectedActorSourceUuid);
      assertCurrent();
      resynchronizer = createAuthoritativeResynchronizer({
        generation: connectionGeneration,
        fetchSnapshot: async (context) => {
          const result = await authoritativeGateway.resync({
            ...context,
            onProgress: ({ checkpoint, detail, timings }) => {
              if (!context.isCurrent()) return;
              loadTimingGateway?.note?.({ checkpoint });
              store.dispatch({ type: "reconnect-progress", generation: context.generation, checkpoint, detail, timings });
            }
          });
          if (!result.applied || !context.isCurrent()) return null;
          if (canvasRecoveryGateway) {
            const before = recoveryCaptures.get(context.generation) ?? canvasRecoveryGateway.capture();
            const canvasResult = await canvasRecoveryGateway.reconcile({
              before,
              isCurrent: context.isCurrent,
              onProgress: ({ checkpoint, detail }) => {
                if (!context.isCurrent()) return;
                loadTimingGateway?.note?.({ checkpoint });
                store.dispatch({ type: "reconnect-progress", generation: context.generation, checkpoint, detail });
              }
            });
            if (!canvasResult.applied || !context.isCurrent()) return null;
            loadTimingGateway?.note?.({ canvasDurationMs: canvasResult.skipped ? null : canvasResult.durationMs,
              canvasSucceeded: canvasResult.skipped ? null : true });
          }
          if (!context.isCurrent()) return null;
          loadTimingGateway?.note?.({ checkpoint: "mobile-session" });
          store.dispatch({ type: "reconnect-progress", generation: context.generation, checkpoint: "mobile-session", detail: localizedText(localize, "VEMOBILE.Interface.AppKernel.RestoringYourSession", "Restoring your session…"), timings: result.timings });
          return session.read();
        },
        applySnapshot: async (snapshot, generation, context) => {
          if (!context.isCurrent()) return;
          const journalId = store.state.journal?.id ?? "";
          const pageId = store.state.journalPageId;
          loadTimingGateway?.note?.({ checkpoint: "presentation" });
          store.dispatch({ type: "reconnect-progress", generation, checkpoint: "presentation", detail: localizedText(localize, "VEMOBILE.Interface.AppKernel.RestoringMobileInterface", "Restoring mobile interface…") });
          session.adopt?.(snapshot);
          store.dispatch({ type: "session-loaded", snapshot });
          if (journalId && snapshot.journals?.some((journal) => journal.id === journalId)) {
            void commands.openJournal(journalId).then((journal) => {
              if (context.isCurrent() && journal?.id === journalId && store.state.journal?.id === journalId) {
                commands.selectJournalPage(pageId);
              }
            }).catch(() => {});
          }
          await nextRenderedFrame();
          if (!context.isCurrent()) return;
          loadTimingGateway?.note?.({ checkpoint: "interactions" });
          store.dispatch({ type: "reconnect-progress", generation, checkpoint: "interactions", detail: localizedText(localize, "VEMOBILE.Interface.AppKernel.RestoringControls", "Restoring controls…") });
          await nextRenderedFrame();
        },
        onError: (error) => diagnostics?.record?.("error", "Authoritative reconnect resynchronisation failed", error)
      });
      const ownedResynchronizer = resynchronizer;
      runtimeScope.own(() => ownedResynchronizer.dispose());
      const nativeApplications = preparePresentation(runtimeScope);
      assertCurrent();
      frame = createFrame({ store, commands, policy: readPolicy, scope: runtimeScope, mobileBackGateway, performanceObserver, nativeApplications });
      assertCurrent();
      sceneInteractionReadiness = createSceneInteractionReadiness({
        localize,
        getNavigationState: () => store.state,
        navigate: (route) => store.dispatch({ type: "navigate", route }),
        inspect: () => frame?.readSceneInteractionState?.(),
        subscribe: (listener) => frame?.watchSceneInteraction?.(listener),
        scope: runtimeScope
      });
      templatePlacement = templatePlacementGateway ? createTemplatePlacementController({
        store,
        sceneReadiness: sceneInteractionReadiness,
        sceneGateway,
        presentation: frame,
        nativeGateway: templatePlacementGateway,
        sessionGateway: session,
        scope: runtimeScope,
        diagnostics
      }) : null;
      nativeTokenPlacement = nativeTokenPlacementGateway ? createNativeTokenPlacementController({
        store,
        sceneReadiness: sceneInteractionReadiness,
        sceneGateway,
        presentation: frame,
        nativeGateway: nativeTokenPlacementGateway,
        scope: runtimeScope,
        diagnostics
      }) : null;
      runtimeScope.own(store.subscribe((state) => {
        if (state.reconnect || state.modeTransition) actorEditorGateway?.closeAll?.();
        const placement = state.actorTokenPlacement;
        if (placement && (state.route !== "scene" || state.templatePlacement || state.reconnect || state.modeTransition
          || !state.snapshot?.scene?.canvasReady || String(state.snapshot.scene.id) !== placement.sceneId
          || state.snapshot?.selectedActor?.sourceUuid !== placement.selectedSourceUuid
          || state.formFactor !== placement.formFactor || state.orientation !== placement.orientation
          || state.splitScreen !== placement.splitScreen || state.tabletNavSide !== placement.tabletNavSide)) cancelActorTokenPlacement();
      }, { immediate: false }));
      assertCurrent();
      combatSceneActions = createCombatSceneActions({
        localize,
        getSnapshot: () => store.state.snapshot,
        getExpectedSession: expectedSession,
        getConnectionGeneration: () => connectionGeneration?.current ?? 0,
        sceneReadiness: sceneInteractionReadiness,
        combatGateway,
        cameraIntents
      });
      frame.mount();
      assertCurrent();
      const initialSnapshot = session.watch(runtimeScope, (snapshot) => store.dispatch({ type: "session-loaded", snapshot }), (error) => {
        diagnostics?.record?.("error", "The Foundry session stopped updating", error);
        store.dispatch({ type: "session-error", error });
      }, { onJournalChange: (journalId) => {
        const state = store.state;
        if (state.journal?.id !== journalId || state.route !== "journals") return;
        void commands.openJournal(journalId, { pageId: state.journalPageId }).catch((error) => {
          diagnostics?.record?.("error", "The open Journal could not be refreshed", error);
        });
      } });
      assertCurrent();
      store.dispatch({ type: "set-quickbar-collapsed", collapsed: actionBarPreferences?.read("foundry").collapsed ?? false });
      if (initialSnapshot) store.dispatch({ type: "session-loaded", snapshot: initialSnapshot });
      assertCurrent();
      modeTransition = createModeTransitionCoordinator({
    localize,
        readPolicy,
        capture: () => frame?.captureModeTransitionState?.(),
        apply: (policy) => {
          store.dispatch({ type: "layout-policy-changed", formFactor: policy.formFactor, orientation: policy.orientation, canvasAvailable: policy.canvasAvailable });
        },
        settle: ({ isCurrent }) => frame?.settleModeTransition?.({ isCurrent }),
        restore: (preserved, bounds, { isCurrent }) => frame?.restoreModeTransitionState?.(preserved, bounds, { isCurrent }),
        onStart: ({ generation, policy, preserved }) => {
          templatePlacement?.stop();
          nativeTokenPlacement?.stop();
          cancelActorTokenPlacement();
          activeEffectContextGateway?.close?.();
          moduleOverlayGateway?.cancelInteractions?.();
          performanceObserver?.increment?.("mode-transition.run");
          store.dispatch({ type: "mode-transition-started", generation, target: presentationLabel(policy, localize) });
          diagnostics?.record?.("debug", `MODE TRANSITION ${JSON.stringify({ event: "started", generation, from: preserved?.formFactor ?? "unknown", to: policy.formFactor, requested: policy.preference ?? policy.runtimeMode ?? policy.formFactor, viewportBefore: preserved?.visualViewport ?? preserved?.viewportBounds ?? null, sceneBoundsBefore: preserved?.sceneBounds ?? null, route: preserved?.route ?? store.state.route, splitScreen: Boolean(preserved?.splitScreen) })}`);
        },
        onProgress: ({ generation, phase, detail }) => store.dispatch({ type: "mode-transition-progress", generation, phase, detail }),
        onCheckpoint: ({ generation, checkpoint, state, elapsedMs, details }) => {
          const level = state === "stalled" || state === "failed" ? "warn" : "debug";
          diagnostics?.record?.(level, `MODE TRANSITION ${JSON.stringify({ event: state, generation, checkpoint, elapsedMs, ...details })}`);
        },
        onFinish: ({ generation, policy, timings }) => {
          store.dispatch({ type: "mode-transition-finished", generation });
          const after = frame?.modeTransitionDiagnosticSnapshot?.() ?? null;
          const slowest = Object.entries(timings ?? {}).filter(([name]) => name !== "total").sort((left, right) => right[1] - left[1])[0] ?? [];
          diagnostics?.record?.("info", `MODE TRANSITION ${JSON.stringify({ event: "completed", generation, to: policy.formFactor, orientation: policy.orientation, timings, slowestCheckpoint: slowest[0] ?? "unknown", totalMs: timings?.total ?? 0, viewportAfter: after?.visualViewport ?? after?.viewportBounds ?? null, sceneBoundsAfter: after?.sceneBounds ?? null, route: after?.route ?? store.state.route, splitScreen: Boolean(after?.splitScreen), rootCount: after?.rootCount ?? null, interactionListeners: after?.interactionListeners ?? null })}`);
        },
        onError: (error, { generation, checkpoint }) => {
          frame?.cancelModeTransitionRestore?.();
          store.dispatch({ type: "mode-transition-failed", generation });
          diagnostics?.record?.("error", `Mode change stalled at ${checkpoint}`, error);
        }
      });
      const ownedModeTransition = modeTransition;
      runtimeScope.own(() => ownedModeTransition.dispose());
      const invalidateView = ({ force = false } = {}) => {
        const policy = readPolicy();
        if (!force && shouldPreserveEditableSurfaceOnViewportResize({
          activeElement: window.document?.activeElement,
          currentFormFactor: store.state.formFactor,
          currentOrientation: store.state.orientation,
          nextPolicy: policy
        })) return;
        const presentationChanged = policy.formFactor !== store.state.formFactor || policy.orientation !== store.state.orientation;
        if (force || presentationChanged) modeTransition?.request();
      };
      runtimeScope.listen(window, "resize", () => invalidateView(), { passive: true });
      runtimeScope.listen(window.visualViewport, "resize", () => invalidateView(), { passive: true });
      runtimeScope.listen(window.screen?.orientation, "change", () => invalidateView({ force: true }), { passive: true });
      runtimeScope.listen(window.matchMedia("(prefers-color-scheme: light)"), "change", () => store.dispatch({ type: "view-invalidated" }));
      modeTransition.request();
      assertCurrent();
      activationCommitted = true;
      frame?.refreshControlsInvitation?.();
    } catch (error) {
      stop();
      if (error !== cancelled) throw error;
    } finally {
      starting = false;
    }
  };

  const stop = () => {
    if (stopping) return;
    stopping = true;
    activationCommitted = false;
    const owned = { scope: runtimeScope, frame, templatePlacement, nativeTokenPlacement, combatSceneActions, modeTransition, resynchronizer };
    cancelActorTokenPlacement();
    runtimeScope = null;
    frame = null;
    templatePlacement = null;
    nativeTokenPlacement = null;
    combatSceneActions = null;
    sceneInteractionReadiness = null;
    modeTransition = null;
    resynchronizer = null;
    recoveryCaptures.clear();
    journalRequestSequence += 1;
    try {
      // Each owner gets its cleanup even if another owner fails. Invalidate
      // asynchronous generations before removing their presentation targets.
      for (const cleanup of [
        () => owned.modeTransition?.dispose(),
        () => owned.resynchronizer?.dispose(),
        () => owned.templatePlacement?.stop(),
        () => owned.nativeTokenPlacement?.stop(),
        () => owned.combatSceneActions?.cancel("VE Mobile stopped."),
        () => owned.frame?.unmount(),
        () => owned.scope?.dispose(),
        () => store.dispatch({ type: "clear-character-presentation" }),
        () => store.dispatch({ type: "reconnect-cleared" }),
        () => store.dispatch({ type: "mode-transition-cleared" })
      ]) {
        try { cleanup(); }
        catch (error) {
          try { diagnostics?.record?.("warn", "Application cleanup failed", error); }
          catch { /* Cleanup reporting must not hide a startup failure. */ }
        }
      }
    } finally {
      stopping = false;
    }
  };

  return Object.freeze({
    get active() {
      return activationCommitted;
    },
    combatControlLifecycleToken() {
      return runtimeScope;
    },
    reconcile() {
      // The bootstrap surface owns startup. Session readers may only run once
      // Foundry has completed its first Canvas draw (or no-canvas startup).
      if (readPolicy().sessionReady === false) return;
      if (stopping) return;
      if (starting) {
        if (!readPolicy().active) stop();
        return;
      }
      if (readPolicy().active) {
        if (runtimeScope) {
          const policy = readPolicy();
          if (policy.formFactor !== store.state.formFactor || policy.orientation !== store.state.orientation) modeTransition?.request();
          else store.dispatch({ type: "view-invalidated" });
        }
        else start();
      } else stop();
    },
    stop,
    refresh() {
      if (activationCommitted) loadSnapshot();
    },
    beginReconnect(generation) {
      if (!activationCommitted) return false;
      const activeGeneration = Math.max(0, Number(generation) || 0);
      if (connectionGeneration && !connectionGeneration.matches(activeGeneration)) connectionGeneration.advance(activeGeneration);
      recoveryCaptures.clear();
      if (canvasRecoveryGateway) recoveryCaptures.set(activeGeneration, canvasRecoveryGateway.capture());
      templatePlacement?.stop();
      nativeTokenPlacement?.stop();
      cancelActorTokenPlacement();
      combatSceneActions?.cancel("Connection interrupted.");
      moduleOverlayGateway?.cancelInteractions?.();
      store.dispatch({ type: "reconnect-started", generation: activeGeneration });
      diagnostics?.record?.("debug", `Reconnect generation ${activeGeneration} is waiting for transport recovery`);
      return true;
    },
    async resync(generation) {
      if (!activationCommitted || !resynchronizer) return Object.freeze({ applied: false });
      const activeGeneration = Math.max(0, Number(generation) || 0);
      if (canvasRecoveryGateway && !recoveryCaptures.has(activeGeneration)) {
        recoveryCaptures.clear();
        recoveryCaptures.set(activeGeneration, canvasRecoveryGateway.capture());
      }
      if (store.state.reconnect?.generation !== activeGeneration) {
        store.dispatch({ type: "reconnect-started", generation: activeGeneration });
      }
      const startedAt = globalThis.performance?.now?.() ?? Date.now();
      store.dispatch({ type: "reconnect-resynchronising", generation: activeGeneration, startedAt, lastSuccessfulMs: loadTimingGateway?.lastSuccessfulResyncMs ?? null });
      loadTimingGateway?.note?.({ type: "resync", resyncDurationMs: null, canvasDurationMs: null,
        canvasSucceeded: null, hardReload: false, checkpoint: "collections" });
      const finishMeasurement = performanceObserver?.start?.("reconnect.total") ?? (() => {});
      performanceObserver?.increment?.("reconnect.run");
      diagnostics?.record?.("debug", `Reconnect generation ${activeGeneration} began authoritative resynchronisation`);
      const result = await resynchronizer.run(activeGeneration);
      finishMeasurement();
      if (!runtimeScope || store.state.reconnect?.generation !== activeGeneration || (connectionGeneration && !connectionGeneration.matches(activeGeneration))) return result;
      recoveryCaptures.delete(activeGeneration);
      if (result.applied) {
        const elapsed = Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt);
        loadTimingGateway?.note?.({ type: "resync", resyncDurationMs: elapsed, checkpoint: "ready" });
        try { await loadTimingGateway?.saveResync?.(elapsed); }
        catch (error) { diagnostics?.record?.("warn", "Could not save successful resync duration", error); }
        if (!runtimeScope || store.state.reconnect?.generation !== activeGeneration || (connectionGeneration && !connectionGeneration.matches(activeGeneration))) return Object.freeze({ applied: false, generation: activeGeneration });
        store.dispatch({ type: "reconnect-finished", generation: activeGeneration });
        diagnostics?.record?.("info", `Reconnect generation ${activeGeneration} became interactive after ${elapsed}ms`);
      } else {
        const failure = result.error ?? new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.RecoveryCouldNotReachATrustworthyReadyState", "Recovery could not reach a trustworthy ready state."));
        loadTimingGateway?.note?.({ type: "hard reload", hardReload: true, canvasSucceeded: false,
          checkpoint: failure.reconnectCheckpoint ?? "recovery" });
        store.dispatch({ type: "reconnect-reloading", generation: activeGeneration });
        runtimeScope.timeout(() => {
          if (runtimeScope && store.state.reconnect?.generation === activeGeneration && (!connectionGeneration || connectionGeneration.matches(activeGeneration))) reloadApplication();
        }, 450);
        diagnostics?.record?.("error", "Resync failed; reloading Foundry", failure);
      }
      return result;
    },
    open(route) {
      store.dispatch({ type: "navigate", route });
    },
    async openJournalTarget(journalId, target = {}) {
      if (!activationCommitted || readPolicy().runtimeMode === "desktop") throw new Error(localizedText(localize, "VEMOBILE.Interface.AppKernel.TheMobileJournalReaderIsInactive", "The mobile Journal reader is inactive."));
      const journal = await commands.openJournal(journalId, target);
      if (!activationCommitted || !journal || store.state.journal?.id !== journal.id) return journal;
      store.dispatch({ type: "navigate", route: "journals" });
      return journal;
    },
    openControlsGuide: anchor => frame?.openControlsGuide?.(anchor),
    refreshControlsInvitation: () => frame?.refreshControlsInvitation?.(),
    snapshot() {
      return store.state.snapshot ? structuredClone(store.state.snapshot) : null;
    }
  });
}

export function shouldKeepSceneChooserOpen(state, requested = false) {
  return Boolean(requested
    && state?.sceneChooserOpen
    && state?.route === "scene"
    && state?.splitScreen
    && state?.formFactor === "tablet"
    && state?.orientation === "landscape");
}

function nextRenderedFrame() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
    else queueMicrotask(resolve);
  });
}

export async function restoreVeSettingsDefaults({ lowMemoryGateway, preferencesGateway, guardConnection = (action) => action(), invalidate = () => {} }) {
  let memoryResult = null;
  if (lowMemoryGateway?.snapshot?.().active) memoryResult = await guardConnection(() => lowMemoryGateway.disable());
  const result = await guardConnection(() => preferencesGateway.restoreDefaults());
  invalidate();
  return Object.freeze({ ...result, requiresReload: Boolean(result.requiresReload || memoryResult?.requiresReload) });
}

/** Avoid destroying an active VE-owned editor when only the software keyboard changes the visual viewport. */
export function shouldPreserveEditableSurfaceOnViewportResize({ activeElement, currentFormFactor, currentOrientation, nextPolicy } = {}) {
  if (!activeElement?.closest?.(".ve-mobile-app")) return false;
  const editable = activeElement.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  return Boolean(editable
    && nextPolicy?.formFactor === currentFormFactor
    && nextPolicy?.orientation === currentOrientation);
}

export function resolveJoystickSide(preference, state = {}) {
  if (preference === "left" || preference === "right") return preference;
  if (state.formFactor !== "tablet") return "left";
  return state.tabletNavSide === "left" ? "right" : "left";
}
