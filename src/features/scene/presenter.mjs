import { localizedText, localizedCount } from "../../ui/localized-text.mjs";
import { icon, node } from "../../ui/dom.mjs";
import { bindJoystickReleaseControl, createJoystickController, createDpadController } from "./joystick-controller.mjs";
import { renderActionBar, bindActionBarLayout } from "./action-bar.mjs";
import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";
import { actionResultsDeferred, renderActionSessionModal } from "../../ui/action-session-modal.mjs";
import { renderRollResultOverlay } from "../../ui/roll-result-overlay.mjs";
import { renderSceneCombatCarousel } from "../combat/presenter.mjs";
import { sceneCombat } from "../combat/model.mjs";
import { bindDetailsDisclosure } from "../../ui/disclosure.mjs";
import { bindLongPress } from "../../ui/long-press.mjs";
import { createSceneChoiceTransition } from "../../ui/scene-choice-transition.mjs";
import { fitJoystickPortrait, joystickPortraitStyle } from "../../ui/token-portrait.mjs";


export function renderScene({
  state,
  commands,
  scope,
  presentationScope = scope,
  focusSelectedToken = true,
  splitViewport = false,
  carouselState = null,
  performanceObserver = null
}) {
  performanceObserver?.increment?.("render.presenter.scene");
  performanceObserver?.increment?.("render.component.scene-root");
  const scene = state.snapshot?.scene;
  const statusCopy = sceneStatusCopy(scene, (key, fallback) => commands.localize?.(key, fallback) ?? fallback);
  const placement = state.templatePlacement;
  const nativePlacement = state.nativeTokenPlacement;
  const actorPlacement = state.actorTokenPlacement;
  const awaitingInitialPlacement = placement?.phase === "awaiting-initial-placement";
  const placementAdjusting = placement?.phase === "adjusting";
  const placementLocked = Boolean(placement || nativePlacement || actorPlacement);
  const combat = sceneCombat(state.snapshot?.combat, scene?.id);
  const preferences = commands.readScenePreferences();
  const combatCarouselEnabled = shouldRenderCombatCarousel(combat, preferences);
  if (!combatCarouselEnabled) carouselState?.synchronize(null);
  const tokens = scene?.movement?.tokens ?? [];
  const targetCount = Number(scene?.movement?.targetCount ?? 0);
  const hasTargets = targetCount > 0;
  const selectedToken = tokens.find((token) => token.controlled) ?? null;
  const controlGeometry = scene?.movement?.controlGeometry ?? { shape: "round", directions:
    [[1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1], [0,-1], [1,-1]].map(([dx, dy]) => ({ dx, dy, angle: Math.atan2(dy, dx) })) };
  const dpad = preferences.movementControl === "dpad";
  const legacyQuickbarActor = selectedToken
    ? state.snapshot?.actors?.find((actor) => actor.id === selectedToken.actorId) ?? null
    : null;
  const quickbarActor = selectedToken
    ? selectedToken.actorSourceUuid && selectedToken.actorSourceUuid === state.snapshot?.scene?.quickbarActorSourceUuid
      ? Object.freeze({
        id: selectedToken.actorId,
        sourceUuid: selectedToken.actorSourceUuid,
        quickbar: state.snapshot.scene.quickbar
      })
      : state.snapshot?.selectedActor?.sourceUuid === selectedToken.actorSourceUuid
        ? state.snapshot.selectedActor
        : legacyQuickbarActor
          ? Object.freeze({ ...legacyQuickbarActor, sourceUuid: legacyQuickbarActor.sourceUuid ?? `Actor.${selectedToken.actorId}` })
          : null
    : null;
  const liveStatus = node("div", { className: "ve-scene-live", attrs: { role: "status", "aria-live": "polite" } });
  const joystickImage = !placementLocked && selectedToken?.img ? node("img", { attrs: { src: selectedToken.img, alt: "", draggable: "false" } }) : null;
  if (joystickImage) fitJoystickPortrait(joystickImage, selectedToken.portrait, scope);
  const joystickKnob = placementLocked ? null : node("span", {
    className: "ve-joystick-knob",
    children: selectedToken?.img ? node("span", {
      className: "ve-token-portrait-footprint",
      attrs: { style: joystickPortraitStyle(selectedToken.portrait), "data-token-fit": "contain" },
      children: [joystickImage]
    }) : icon("fa-hand-pointer")
  });
  const releaseLabel = scene?.movement?.releaseLabel ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ReleaseToken", "Release token");
  const releaseControl = !placementLocked && selectedToken ? node("button", {
    className: "ve-joystick-release",
    attrs: {
      type: "button",
      title: releaseLabel,
      "aria-label": releaseLabel,
      "data-ve-scene-control": true
    },
    children: [icon("fa-xmark")]
  }) : null;
  const tokenIndicator = placementLocked ? null : node("div", {
    className: "ve-joystick-token",
    attrs: selectedToken ? {} : { "aria-hidden": "true" },
    ...(selectedToken ? {
      children: [
        node("span", {
          className: "ve-joystick-token-name",
          attrs: { title: selectedToken.name, "aria-label": selectedToken.name },
          text: selectedToken.name
        }),
        releaseControl
      ]
    } : { text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.SelectToken", "Select Token") })
  });
  const directionNames = ["East", "SouthEast", "South", "SouthWest", "West", "NorthWest", "North", "NorthEast"];
  const directionFallbacks = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
  const movementPad = placementLocked ? null : node("div", {
    className: "ve-movement-pad",
    children: [node("span", { className: "ve-joystick-ring" }), joystickKnob,
      ...(dpad ? controlGeometry.directions.map(({ dx, dy, angle }) => {
        const index = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
        const directionLabel = localizedText(commands.localize, `VEMOBILE.Scene.Movement.${directionNames[index]}`, directionFallbacks[index]);
        return node("button", {
          className: "ve-dpad-direction",
          attrs: { type: "button", "data-direction": `${dx},${dy}`, "data-angle": angle,
            "aria-label": localizedText(commands.localize, "VEMOBILE.Scene.Movement.Step", "Move {direction}", { direction: directionLabel }),
            disabled: !selectedToken,
            style: dpadSegmentStyle(controlGeometry.shape, controlGeometry.directions.length, angle) },
          children: [icon("fa-chevron-right")]
        });
      }) : [])]
  });
  const joystickBase = placementLocked ? null : node("div", {
    className: `ve-joystick-base${selectedToken ? "" : " is-idle"}`,
    attrs: {
      role: "application",
      "aria-label": selectedToken ? localizedText(commands.localize, "VEMOBILE.Scene.Movement.Label", "Move {name} in {count} directions", { name: selectedToken.name, count: controlGeometry.directions.length }) : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.SelectATokenToUseTheMovementJoystick", "Select a token to use the movement joystick"),
      "aria-disabled": String(!selectedToken),
      "data-side": preferences.joystickResolvedSide === "right" ? "right" : "left",
      "data-control": dpad ? "dpad" : "joystick",
      "data-shape": controlGeometry.shape,
      "data-ve-scene-control": true
    },
    children: [tokenIndicator, movementPad]
  });
  const clearTargets = node("button", {
    className: "ve-scene-clear-targets",
    attrs: {
      type: "button",
      "data-ve-scene-control": true,
      "aria-label": localizedCount(commands.localize, "VEMOBILE.Scene.ClearTargets", { one: "Clear {count} target", other: "Clear {count} targets" }, targetCount, commands.readLocale?.() ?? "en"),
      disabled: placementLocked,
      hidden: !hasTargets
    },
    on: {
      click: () => {
        void commands.clearSceneTargets().then(() => {
          globalThis.navigator?.vibrate?.(5);
        }).catch((error) => {
          liveStatus.textContent = movementMessage(error, commands);
        });
      }
    },
    children: [node("span", { text: localizedCount(commands.localize, "VEMOBILE.Scene.TargetCount", { one: "{count} Target", other: "{count} Targets" }, targetCount, commands.readLocale?.() ?? "en") }), icon("fa-xmark")]
  }, scope);
  let surface = null;
  const quickbar = shouldRenderQuickbar(preferences, placement || nativePlacement || actorPlacement)
    ? renderActionBar({
      actor: quickbarActor,
      commands,
      scope,
      source: preferences.quickbarSource,
      hotbar: state.snapshot?.scene?.hotbar,
      collapsed: state.quickbarCollapsed,

      onCollapsedVisualChange: (value) => surface?.classList.toggle("quickbar-collapsed", value)
    })
    : null;
  const actionModal = shouldRenderSceneActionSession(state, splitViewport)
    ? renderActionSessionModal(state.actionSession, commands, scope)
    : null;
  const rollModal = !actionResultsDeferred(state) && !splitViewport && state.rollResult?.sceneReturn
    ? renderRollResultOverlay(state.rollResult, commands, scope) : null;
  const templateUi = placement ? renderTemplatePlacement({ placement, commands, scope, liveStatus }) : null;
  const nativeTokenUi = nativePlacement ? renderNativeTokenPlacement({ placement: nativePlacement, commands, scope }) : null;
  const actorTokenUi = actorPlacement ? renderActorTokenPlacement({ placement: actorPlacement, commands, scope, liveStatus }) : null;
  const combatCarousel = combatCarouselEnabled
    ? renderSceneCombatCarousel({ combat, commands, scope, carouselState, getSceneViewport: () => visibleSceneViewport(surface, splitViewport) })
    : null;
  performanceObserver?.increment?.("render.component.scene-target-control");
  if (joystickBase) performanceObserver?.increment?.("render.component.joystick");
  if (quickbar) performanceObserver?.increment?.("render.component.quickbar");
  if (combatCarousel) performanceObserver?.increment?.("render.component.combat-carousel");
  if (placementLocked && combatCarousel) combatCarousel.inert = true;

  surface = node("section", {
    className: `ve-scene-screen${combatCarousel ? " has-combat" : ""}${quickbar ? " has-quickbar" : ""}${state.quickbarCollapsed && quickbar ? " quickbar-collapsed" : ""}${placementLocked ? " is-template-placement" : ""}`,
    attrs: {
      "aria-label": scene?.canvasReady ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.SceneCanvas", "Scene canvas: {name}", { name: (scene.name) }) : statusCopy.title,
      "data-quickbar-rows": 2
    },
    children: scene?.canvasReady ? [
      liveStatus,
      combatCarousel,
      clearTargets,
      joystickBase,
      quickbar,
      templateUi?.overlay,
      templateUi?.hud,
      nativeTokenUi,
      actorTokenUi?.overlay,
      actorTokenUi?.hud,
      actionModal,
      rollModal
    ] : [
      scene?.canvasState === "transitional"
        ? node("div", { className: "ve-scene-unavailable ve-scene-loading", children: [icon("fa-arrows-rotate"), node("h2", { text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.PreparingScene", "Preparing scene…") })] })
        : node("div", { className: "ve-scene-unavailable", children: [icon("fa-map-location-dot"), node("h2", { text: statusCopy.title }), node("p", { text: statusCopy.hint }),
          node("button", { attrs: { type: "button" }, text: !scene?.id && !scene?.canvasDisabled ? (commands.localize?.("VEMOBILE.Controls.Status.Chooser", "Choose Scene") ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ChooseScene", "Choose Scene")) : (commands.localize?.("VEMOBILE.Controls.Status.Settings", "Settings") ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Settings", "Settings")), on: { click: () => !scene?.id && !scene?.canvasDisabled ? commands.openSceneChooser() : commands.navigate("settings") } }, scope)] }),
      joystickBase,
      quickbar,
      actionModal,
      rollModal
    ]
  });

  bindActionBarLayout(surface, quickbar, scope);
  if (!scene?.canvasReady) return surface;
  // The Foundry canvas is a global surface behind this reactive HUD. Only a
  // Scene presentation owner may resize it; combat/token HUD refreshes pass no
  // presentationScope and must never restart the native canvas lifecycle.
  if (presentationScope) commands.refreshScenePresentation?.(presentationScope);
  let joystick = null;
  let tileTapEpoch = 0;
  scope.listen(surface, "pointerdown", () => { tileTapEpoch += 1; }, { capture: true });
  if (!placementLocked) {
    commands.bindSceneTokenTouch?.(surface, scope, () => {}, (error) => {
      liveStatus.textContent = movementMessage(error, commands);
    });
  }
  commands.bindSceneGestures(surface, scope, ({ x, y }) => {
    if (awaitingInitialPlacement) {
      void commands.setInitialTemplatePosition?.({ x, y }).catch((error) => {
        liveStatus.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.TemplateOriginCouldNotBePositioned", "Template origin could not be positioned");
      });
      return;
    }
    if (placementLocked) return;
    const completedEpoch = tileTapEpoch;
    // Let Foundry's native TokenLayer/MATT path receive an eligible Tile tap
    // before the asynchronous token action pipeline. The gateway rejects a
    // visible Token above the Tile, so native token priority is preserved.
    if (commands.nativeSceneTileTap?.({ sceneId: scene.id, clientX: x, clientY: y })) return;
    void commands.tapSceneToken({ sceneId: scene.id, clientX: x, clientY: y }).catch((error) => {
      if (!scope.disposed && surface.isConnected && completedEpoch === tileTapEpoch) {
        liveStatus.textContent = movementMessage(error, commands);
      }
    });
  }, ({ x, y }) => {
    if (!placementLocked) commands.nativeSceneTileTap?.({ sceneId: scene.id, clientX: x, clientY: y, button: 2 });
  }, () => joystick?.reset(), placementLocked
    ? { allowTap: awaitingInitialPlacement, allowLongPress: false, allowDoors: false, updateCursor: false }
    : { allowLongPress: true, longPressOnRelease: true });
  if (placementAdjusting) {
    commands.bindTemplatePlacement?.(surface, scope, (overlay) => updateTemplateOverlay(surface, templateUi, overlay));
  }
  if (nativePlacement) bindNativeTokenPlacementPointer(surface, scope, commands);
  if (focusSelectedToken && !placementLocked) scope.timeout(async () => {
    if (!surface.isConnected) return;
    // Token control changes update VE's presentation, not the user's camera.
    // Explicit Combat focus and Joystick Follow own their camera movements.
    commands.acknowledgeSceneCameraPresentation?.({
      sceneId: scene.id,
      splitScreen: Boolean(splitViewport),
      controlledTokenId: selectedToken?.id ?? null
    });
  }, 0);
  if (placementLocked) return surface;
  if (!selectedToken) return surface;
  joystick = (dpad ? createDpadController : createJoystickController)({
    base: movementPad,
    knob: joystickKnob,
    scope,
    directions: controlGeometry.directions,
    repeatDelayMs: preferences.movementRepeatDelayMs,
    onTouchChange: (active) => {
      try {
        commands.previewSceneMovementHistory({
          sceneId: scene.id,
          tokenId: selectedToken.id,
          actorId: selectedToken.actorId,
          active
        });
      } catch (error) {
        if (active) liveStatus.textContent = movementMessage(error, commands);
      }
    },
    onStep: async (dx, dy, movementAngle) => {
      try {
        const result = await commands.stepSceneToken({
          sceneId: scene.id,
          tokenId: selectedToken.id,
          actorId: selectedToken.actorId,
          dx,
          dy,
          movementAngle,
          viewport: visibleSceneViewport(surface, splitViewport)
        });
        liveStatus.textContent = result.moved ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Moved", "{name} moved", { name: (selectedToken.name) }) : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ThatStepIsBlocked", "That step is blocked");
        return result;
      } catch (error) {
        liveStatus.textContent = movementMessage(error, commands);
        throw error;
      }
    }
  });
  bindJoystickReleaseControl({
    control: releaseControl,
    scope,
    isJoystickActive: () => joystick?.isActive() ?? false,
    onRelease: () => {
      releaseControl.disabled = true;
      releaseControl.setAttribute("aria-busy", "true");
      void commands.releaseSceneToken({
        sceneId: scene.id,
        tokenId: selectedToken.id,
        actorId: selectedToken.actorId
      }).catch((error) => {
        liveStatus.textContent = movementMessage(error, commands);
      }).finally(() => {
        if (!releaseControl.isConnected) return;
        releaseControl.disabled = false;
        releaseControl.removeAttribute("aria-busy");
      });
    }
  });
  return surface;
}

/** Build the Scene Directory-eligible folder tree from authoritative folder paths. */
export function buildSceneNavigationTree(scenes = []) {
  const root = sceneBranch(null, scenes[0]?.rootSorting, scenes[0]?.sortingLocale);
  for (const scene of scenes) {
    let current = root;
    for (const folder of scene.folderPath ?? []) {
      if (!current.folders.has(folder.id)) current.folders.set(folder.id, sceneBranch(folder, folder.sorting, scene.sortingLocale));
      current = current.folders.get(folder.id);
    }
    current.scenes.push(scene);
  }
  sortSceneBranch(root);
  return root;
}

function sceneBranch(folder, sorting = "a", locale = "") {
  return { folder, sorting: sorting === "m" ? "m" : "a", locale: String(locale || "") || undefined, folders: new Map(), scenes: [] };
}

function sortSceneBranch(branch) {
  branch.folders = new Map(Array.from(branch.folders.entries()).sort(([, left], [, right]) => compareFolderEntries(left.folder, right.folder, branch.sorting, branch.locale)));
  branch.scenes.sort((left, right) => compareSceneDirectoryEntries(left, right, branch.sorting, branch.locale));
  for (const child of branch.folders.values()) sortSceneBranch(child);
}

function compareFolderEntries(left, right, sorting, locale) {
  if (sorting === "a") return String(left?.name ?? "").localeCompare(String(right?.name ?? ""), locale);
  return Number(left?.sort ?? 0) - Number(right?.sort ?? 0);
}

function compareSceneDirectoryEntries(left, right, sorting, locale) {
  if (sorting === "a") return String(left?.name ?? "").localeCompare(String(right?.name ?? ""), locale);
  return Number(left?.sort ?? 0) - Number(right?.sort ?? 0);
}

export function sceneFolderCount(branch) {
  return branch.scenes.length + Array.from(branch.folders.values()).reduce((total, child) => total + sceneFolderCount(child), 0);
}

/** Render the Scene chooser only while it is open; its owner disposes the full subtree on close. */
export function renderSceneChooser({ scenes = [], commands, scope, expandedFolderIds = new Set(), expandedLevelSceneIds = new Set(), host = "modal", sceneChoiceTransition = createSceneChoiceTransition() }) {
  const pane = host === "pane";
  const close = () => commands.closeSceneChooser();
  const headingId = pane ? "ve-scene-picker-title" : "ve-scene-chooser-title";
  const current = scenes.find((scene) => scene.viewed) ?? null;
  const alternatives = scenes.filter((scene) => !scene.viewed);
  for (const folder of current?.folderPath ?? []) expandedFolderIds.add(String(folder.id));
  const tree = buildSceneNavigationTree(scenes);
  let layer = null;
  let activeMenuCleanup = null;
  let contextRequest = 0;
  for (const id of expandedLevelSceneIds) if (!scenes.some(scene => scene.id === id && scene.levels?.length)) expandedLevelSceneIds.delete(id);
  const openContext = (anchor, event, scene, ownerScope = scope) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const request = ++contextRequest;
    void Promise.resolve(commands.openSceneContextMenu?.({
      sceneId: scene.id,
      clientX: Number(event?.clientX) || anchor.getBoundingClientRect?.().left || 0,
      clientY: Number(event?.clientY) || anchor.getBoundingClientRect?.().bottom || 0
    })).then((result) => {
      if (result?.action !== "opened" || !result.menu || request !== contextRequest || ownerScope.disposed || anchor.isConnected === false) {
        if (result?.action === "opened") commands.closeSceneContextMenu?.({ menuId: result.menu.id });
        return;
      }
      activeMenuCleanup?.();
      activeMenuCleanup = renderSceneContextMenu(layer, anchor, result.menu, commands, ownerScope);
    }).catch((error) => commands.reportSceneNavigationError?.(error));
  };
  const context = { commands, close, expandedFolderIds, expandedLevelSceneIds, openContext, keepOpenOnView: pane, sceneChoiceTransition };
  const list = node("div", {
    className: "ve-scene-choice-list",
    attrs: { role: "list", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.AvailableScenes", "Available Scenes") },
    children: [
      ...renderSceneNavigationBranch(tree, context, scope),
      !scenes.length
        ? node("p", { className: "ve-scene-choice-empty", text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.NoScenesAreAvailableFromFoundrySSceneDirectory", "No Scenes are available from Foundry's Scene Directory.") })
        : !alternatives.length
          ? node("p", { className: "ve-scene-choice-empty", text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.NoOtherScenesAreAvailable", "No other Scenes are available.") })
          : null
    ]
  });
  const closeControl = node("button", {
    className: "ve-scene-chooser-close",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CloseSceneChooser", "Close Scene chooser") },
    on: { click: close },
    children: [icon("fa-xmark")]
  }, scope);
  const dialog = node("section", {
    className: `ve-scene-chooser${pane ? " ve-scene-picker-pane" : ""}`,
    attrs: pane
      ? { role: "region", "aria-labelledby": headingId }
      : { role: "dialog", "aria-modal": "true", "aria-labelledby": headingId },
    children: [
      node("header", { className: "ve-scene-chooser-header", children: [
        node("span", { className: "ve-scene-chooser-heading-icon", children: [icon("fa-map-location-dot")] }),
        node("div", { children: [
          node("h2", { attrs: { id: headingId }, text: pane ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Scenes", "Scenes") : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ChooseScene", "Choose Scene") }),
          node("p", { text: current ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Viewing", "Viewing {name}", { name: (current.name) }) : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ChooseAPermittedFoundryScene", "Choose a permitted Foundry Scene") })
        ] }),
        closeControl
      ] }),
      list
    ]
  });
  layer = node("div", {
    className: `ve-scene-chooser-layer${pane ? " is-pane" : ""}`,
    attrs: pane ? { id: "ve-scene-picker-pane" } : {},
    on: pane ? {} : { pointerdown: (event) => { if (event.target === event.currentTarget) close(); } },
    children: [dialog]
  }, scope);
  scope.own(() => {
    activeMenuCleanup?.();
    commands.closeSceneContextMenu?.();
  });
  scope.listen(document, "keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  });
  afterSceneChooserLayout(scope, () => {
    if (scope.disposed) return;
    const selected = dialog.querySelector?.('[aria-current="page"]');
    selected?.focus?.({ preventScroll: true });
    if (selected?.scrollIntoView) selected.scrollIntoView({ block: "center", inline: "nearest" });
    else if (!selected) closeControl.focus?.();
  });
  return layer;
}

function afterSceneChooserLayout(scope, callback) {
  let cancelled = false;
  if (typeof globalThis.requestAnimationFrame === "function") {
    const frame = globalThis.requestAnimationFrame(() => {
      if (!cancelled && !scope.disposed) callback();
    });
    scope.own(() => {
      cancelled = true;
      globalThis.cancelAnimationFrame?.(frame);
    });
    return;
  }
  scope.own(() => { cancelled = true; });
  queueMicrotask(() => {
    if (!cancelled && !scope.disposed) callback();
  });
}

function renderSceneNavigationBranch(branch, context, scope) {
  return [
    ...Array.from(branch.folders.values()).map((child) => renderSceneFolder(child, context, scope)),
    ...branch.scenes.map((scene) => renderSceneChoice(scene, context, scope))
  ];
}

function renderSceneFolder(branch, context, scope) {
  const commands = context.commands;
  const folderId = String(branch.folder.id);
  const folderScope = scope.child(`scene-folder:${folderId}`);
  const initiallyOpen = context.expandedFolderIds.has(folderId);
  const summary = node("summary", {
    attrs: { role: "button", "aria-expanded": String(initiallyOpen), "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Scenes2", "{name}, {sceneFolderCountbranch} Scenes", { name: (branch.folder.name), sceneFolderCountbranch: (sceneFolderCount(branch)) }) },
    children: [icon("fa-chevron-right"), icon("fa-folder"), node("strong", { text: branch.folder.name }), node("small", { text: sceneFolderCount(branch), attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.EligibleScenes", "{sceneFolderCountbranch} eligible Scenes", { sceneFolderCountbranch: (sceneFolderCount(branch)) }) } })]
  });
  const details = node("details", {
    className: "ve-scene-folder",
    attrs: { open: initiallyOpen, "data-folder-id": folderId },
    children: [summary]
  });
  details.open = initiallyOpen;
  let body = null;
  let bodyScope = null;
  const disposeBody = () => {
    bodyScope?.dispose();
    bodyScope = null;
    body?.remove?.();
    body = null;
  };
  const renderBody = () => {
    if (body || folderScope.disposed) return;
    bodyScope = folderScope.child("body");
    body = node("div", { className: "ve-scene-folder-body", children: renderSceneNavigationBranch(branch, context, bodyScope) });
    details.append(body);
  };
  folderScope.own(disposeBody);
  bindDetailsDisclosure(details, summary, (expanded) => {
    if (expanded) {
      context.expandedFolderIds.add(folderId);
      renderBody();
    } else {
      context.expandedFolderIds.delete(folderId);
      disposeBody();
    }
  }, folderScope);
  if (initiallyOpen) renderBody();
  return details;
}

function renderSceneChoice(scene, context, scope) {
  const commands = context.commands;
  const view = node("button", {
    className: "ve-scene-choice-main",
    attrs: {
      type: "button",
      "data-scene-id": scene.id,
      "aria-current": scene.viewed ? "page" : undefined,
      "aria-label": sceneChoiceLabel(scene, commands)
    },
    children: [
      node("span", {
        className: "ve-scene-choice-preview",
        children: scene.thumb
          ? [node("img", { attrs: { src: scene.thumb, alt: "", loading: "lazy", decoding: "async" } })]
          : [icon("fa-map")]
      }),
      node("span", { className: "ve-scene-choice-copy", children: [
        node("strong", { text: scene.name }),
        node("span", { className: "ve-scene-choice-state", children: [
          scene.viewed ? node("small", { className: "is-viewed", text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Viewing2", "Viewing") }) : null,
          scene.active ? node("small", { className: "is-active", text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.WorldActive", "World active") }) : null,
          sceneRiskBadge(scene.memoryRisk, commands)
        ] })
      ] })
    ]
  });
  context.sceneChoiceTransition.bind(view, scene.id, () => {
    return Promise.resolve(context.commands.viewScene(scene.id, { keepSceneChooserOpen: context.keepOpenOnView }))
      .catch((error) => {
        context.commands.reportSceneNavigationError?.(error);
        throw error;
      });
  }, scope);
  const actions = node("div", { className: "ve-scene-choice-actions" });
  const header = node("div", { className: "ve-scene-choice-header", children: [view, actions] });
  const row = node("div", {
    className: `ve-scene-choice${scene.viewed ? " is-viewed" : ""}${scene.active ? " is-active" : ""}`,
    attrs: { role: "listitem" },
    children: [header]
  });
  if (scene.levels?.length) {
    const id = `ve-scene-levels-${scene.id}`;
    const levels = node("div", { className: "ve-scene-level-list", attrs: { id, role: "group",
      "aria-label": localizedText(commands.localize, "VEMOBILE.Scene.Levels.List", "Levels in {name}", { name: scene.name }) } });
    let levelsScope = null;
    const label = expanded => localizedText(commands.localize, expanded ? "VEMOBILE.Scene.Levels.Hide" : "VEMOBILE.Scene.Levels.Show",
      expanded ? "Hide levels for {name}" : "Show levels for {name}", { name: scene.name });
    const expander = node("button", { className: "ve-scene-level-toggle", attrs: { type: "button", "aria-controls": id }, children: [icon("fa-chevron-right")] });
    const show = expanded => {
      expander.setAttribute("aria-expanded", String(expanded));
      expander.setAttribute("aria-label", label(expanded));
      levels.hidden = !expanded;
      levelsScope?.dispose();
      levelsScope = null;
      levels.replaceChildren();
      if (!expanded) return;
      levelsScope = scope.child(`scene-levels:${scene.id}`);
      for (const level of scene.levels) {
        const button = node("button", { className: `ve-scene-level-option${level.viewed ? " is-viewed" : ""}`,
          attrs: { type: "button", "data-level-id": level.id, "aria-current": level.viewed ? "true" : undefined,
            disabled: scene.levelSelectionAvailable === false,
            title: scene.levelSelectionAvailable === false ? localizedText(commands.localize, "VEMOBILE.Scene.Levels.CanvasUnavailable", "Open the map and wait for it to load before choosing a level.") : undefined },
          children: [node("span", { text: level.name }), node("span", { className: "ve-scene-level-check", children: level.viewed ? [icon("fa-check")] : [] })] });
        if (scene.levelSelectionAvailable !== false) context.sceneChoiceTransition.bind(button, `${scene.id}:${level.id}`, () => Promise.resolve(commands.viewSceneLevel?.({ sceneId: scene.id, levelId: level.id }, { keepSceneChooserOpen: context.keepOpenOnView }))
          .catch(error => { commands.reportSceneNavigationError?.(error); throw error; }), levelsScope);
        levels.append(button);
      }
    };
    scope.listen(expander, "click", event => {
      event.stopPropagation();
      const expanded = !context.expandedLevelSceneIds.has(scene.id);
      if (expanded) context.expandedLevelSceneIds.add(scene.id);
      else context.expandedLevelSceneIds.delete(scene.id);
      show(expanded);
    });
    actions.append(expander);
    row.append(levels);
    show(context.expandedLevelSceneIds.has(scene.id));
  }
  if (scene.contextActions) {
    const menuButton = node("button", {
      className: "ve-scene-choice-menu-button",
      attrs: { type: "button", "aria-haspopup": "menu", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.MoreActionsFor", "More actions for {name}", { name: (scene.name) }) },
      on: { click: (event) => context.openContext(menuButton, event, scene, scope) },
      children: [icon("fa-ellipsis-vertical")]
    }, scope);
    actions.append(menuButton);
    bindLongPress(view, scope, (event) => context.openContext(view, event, scene, scope), { invokeOnRelease: true });
    scope.listen(view, "contextmenu", (event) => {
      if (event.pointerType === "touch" || (event.button !== undefined && event.button !== 2)) return;
      context.openContext(view, event, scene, scope);
    });
  }
  return row;
}

function renderSceneContextMenu(host, anchor, record, commands, scope) {
  if (!host) return () => {};
  const menuScope = scope.child(`scene-context:${record.id}`);
  const menu = node("nav", { className: "ve-scene-context-menu", attrs: { role: "menu", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.SceneActions", "Scene actions") } });
  const previousExpanded = anchor.getAttribute?.("aria-expanded");
  anchor.setAttribute?.("aria-expanded", "true");
  let closed = false;
  const close = (closeGateway = true, restoreFocus = true) => {
    if (closed) return;
    closed = true;
    menu.remove?.();
    menuScope.dispose();
    if (restoreFocus && !scope.disposed && anchor.isConnected) anchor.focus?.({ preventScroll: true });
    if (closeGateway) void commands.closeSceneContextMenu?.({ menuId: record.id });
  };
  for (const option of record.options ?? []) {
    const button = node("button", {
      className: "ve-scene-context-option",
      attrs: { type: "button", role: "menuitem" },
      on: { click: () => {
        for (const item of menu.querySelectorAll("button")) item.disabled = true;
        void Promise.resolve(commands.selectSceneContextOption?.({ menuId: record.id, optionId: option.id }))
          .catch((error) => commands.reportSceneNavigationError?.(error))
          .finally(() => close(false, false));
      } },
      children: [node("span", { className: "ve-scene-context-icon", attrs: { "aria-hidden": "true" }, children: option.icon ? [node("i", { className: option.icon })] : [] }),
        node("span", { className: "ve-scene-context-label", text: option.label })]
    }, menuScope);
    menu.append(button);
  }
  host.append(menu);
  const position = () => { if (!menuScope.disposed) positionSceneContextMenu(menu, host, anchor, record); };
  position();
  menuScope.listen(globalThis.window, "resize", position, { passive: true });
  menuScope.listen(globalThis.visualViewport, "resize", position, { passive: true });
  menuScope.listen(globalThis.visualViewport, "scroll", position, { passive: true });
  menuScope.listen(host, "scroll", event => { if (!menu.contains(event.target)) close(); }, { capture: true, passive: true });
  menuScope.listen(anchor.ownerDocument ?? document, "pointerdown", (event) => {
    if (!menu.contains?.(event.target) && event.target !== anchor && !anchor.contains?.(event.target)) close();
  }, { capture: true, passive: true });
  menuScope.listen(anchor.ownerDocument ?? document, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation?.(); close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation?.();
      const items = [...menu.querySelectorAll("button:not(:disabled)")];
      const index = items.indexOf(anchor.ownerDocument?.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      items[next]?.focus?.();
    }
  }, { capture: true });
  menuScope.own(() => {
    menu.remove?.();
    if (previousExpanded === null) anchor.removeAttribute?.("aria-expanded");
    else if (previousExpanded !== undefined) anchor.setAttribute?.("aria-expanded", previousExpanded);
    if (!closed) {
      closed = true;
      void commands.closeSceneContextMenu?.({ menuId: record.id });
    }
  });
  menu.querySelector?.("button")?.focus?.({ preventScroll: true });
  return close;
}

function positionSceneContextMenu(menu, host, anchor, record) {
  const hostBounds = host.getBoundingClientRect?.() ?? { left: 0, top: 0, right: globalThis.innerWidth ?? 360, bottom: globalThis.innerHeight ?? 640 };
  const viewport = globalThis.visualViewport;
  const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
  const bounds = { left: Math.max(left, hostBounds.left), top: Math.max(top, hostBounds.top),
    right: Math.min(left + (viewport?.width ?? globalThis.innerWidth ?? 360), hostBounds.right),
    bottom: Math.min(top + (viewport?.height ?? globalThis.innerHeight ?? 640), hostBounds.bottom) };
  menu.style.maxWidth = `${Math.max(1, bounds.right - bounds.left - 16)}px`;
  menu.style.maxHeight = `${Math.max(1, Math.min(420, bounds.bottom - bounds.top - 16))}px`;
  const rect = menu.getBoundingClientRect?.() ?? { width: 240, height: 240 };
  const anchorRect = anchor.getBoundingClientRect?.() ?? { left: bounds.left, bottom: bounds.top };
  const x = Number(record.clientX) || anchorRect.left;
  const y = Number(record.clientY) || anchorRect.bottom;
  const margin = 8;
  menu.style.left = `${Math.max(bounds.left + margin, Math.min(x, bounds.right - rect.width - margin)) - hostBounds.left}px`;
  menu.style.top = `${Math.max(bounds.top + margin, Math.min(y, bounds.bottom - rect.height - margin)) - hostBounds.top}px`;
}

function sceneChoiceLabel(scene, commands) {
  const viewing = scene.viewed ? localizedText(commands.localize, "VEMOBILE.Scene.CurrentlyViewed", "Currently viewed") : "";
  const active = scene.active ? localizedText(commands.localize, "VEMOBILE.Scene.WorldActive", "World active") : "";
  const risk = sceneRiskDescription(scene.memoryRisk, commands);
  return [scene.name, viewing, active, risk].filter(Boolean).join(", ");
}

function sceneRiskBadge(risk, commands) {
  if (!materiallyHighRisk(risk)) return null;
  const classification = String(risk.risk ?? risk.classification).toLowerCase();
  const recommendation = visibleSceneRiskRecommendation(risk);
  const label = sceneRiskDescription(risk, commands);
  return node("small", {
    className: `ve-scene-memory-risk is-${classification}`,
    attrs: { title: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.RiskEstimate", "{label} risk estimate", { label: (label) }), "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.RiskEstimate", "{label} risk estimate", { label: (label) }) },
    children: [icon("fa-triangle-exclamation"), node("span", { text: label })]
  });
}

function sceneRiskDescription(risk, commands) {
  if (!materiallyHighRisk(risk)) return "";
  const veryHigh = String(risk.risk ?? risk.classification) === "very-high";
  const recommendation = visibleSceneRiskRecommendation(risk);
  const profile = recommendation ? localizedText(commands.localize, `VEMOBILE.MemoryProfile.${recommendation}.Label`, ({ normal: "Normal", balanced: "Balanced", strong: "Strong", maximum: "Maximum" })[recommendation] ?? recommendation) : "";
  return recommendation ? (veryHigh ? localizedText(commands.localize, "VEMOBILE.Scene.VeryHighRiskRecommended", "Very high risk · Recommended: {profile}", { profile }) : localizedText(commands.localize, "VEMOBILE.Scene.HighRiskRecommended", "High risk · Recommended: {profile}", { profile })) : (veryHigh ? localizedText(commands.localize, "VEMOBILE.Scene.VeryHighRisk", "Very high risk") : localizedText(commands.localize, "VEMOBILE.Scene.HighRisk", "High risk"));
}

function visibleSceneRiskRecommendation(risk) {
  if (risk?.profileRecommendationApplicable === false) return "";
  return String(risk?.recommendedMinimumProfile ?? "");
}

function materiallyHighRisk(risk) {
  return ["high", "very-high"].includes(String(risk?.risk ?? risk?.classification ?? "").toLowerCase());
}

/** Patch target truth without replacing the Scene surface or its gesture owners. */
export function updateSceneTargetPresentation(surface, targetCount, placementLocked = false, localize = null, locale = "en") {
  const button = surface?.querySelector?.(".ve-scene-clear-targets");
  if (!button) return false;
  const count = Math.max(0, Number(targetCount) || 0);
  button.hidden = count <= 0;
  button.disabled = Boolean(placementLocked);
  button.setAttribute?.("aria-label", localizedCount(localize, "VEMOBILE.Scene.ClearTargets", { one: "Clear {count} target", other: "Clear {count} targets" }, count, locale));
  const label = button.querySelector?.("span");
  if (label) label.textContent = localizedCount(localize, "VEMOBILE.Scene.TargetCount", { one: "{count} Target", other: "{count} Targets" }, count, locale);
  return true;
}

export function shouldRenderCombatCarousel(combat, preferences = {}) {
  return Boolean(combat && preferences.combatCarousel !== false);
}

export function shouldRenderQuickbar(preferences, placement) {
  return Boolean(preferences?.quickbarEnabled && !placement);
}

/** Full-screen Scene owns the result surface after native template placement,
 * regardless of whether the action began in Character or the Quickbar. */
export function shouldRenderSceneActionSession(state, splitViewport = false) {
  return Boolean(state?.actionSession && !actionResultsDeferred(state) && !splitViewport);
}

function renderNativeTokenPlacement({ placement, commands, scope }) {
  const remaining = Math.max(0, placement.count - placement.step);
  const label = placement.phase === "preparing" ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.PreparingTokenPlacement", "Preparing token placement…")
    : placement.phase === "cancelling" ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CancellingTokenPlacement", "Canceling token placement…")
      : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.PositionTokenOf", "Position token {count} of {count2}", { count: (Math.min(placement.step + 1, placement.count)), count2: (placement.count) });
  const cancel = node("button", { className: "ve-template-control",
    attrs: { type: "button", "data-ve-scene-control": true, disabled: placement.phase === "cancelling" },
    on: { click: () => commands.cancelNativeTokenPlacement() },
    children: [icon("fa-xmark"), node("span", { text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Cancel", "Cancel") })]
  }, scope);
  const place = node("button", { className: "ve-template-control is-place",
    attrs: { type: "button", "data-ve-scene-control": true, disabled: placement.phase !== "adjusting" },
    on: { click: () => { if (!commands.placeNativeToken()) place.focus(); } },
    children: [icon("fa-check"), node("span", { text: remaining > 1 ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.PlaceNext", "Place next") : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Place", "Place") })]
  }, scope);
  return node("div", { className: "ve-template-placement-hud ve-native-token-placement-hud",
    attrs: { role: "toolbar", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.TokenPlacement", "Token placement"), "data-ve-template-control": true },
    children: [node("strong", { className: "ve-template-mode-label", text: label }),
      node("div", { className: "ve-template-placement-controls", children: [cancel, place] })]
  });
}

export function bindNativeTokenPlacementPointer(surface, scope, commands) {
  const pointers = new Set();
  let active = null;
  const eligible = (event) => !event.target?.closest?.("[data-ve-scene-control], [data-ve-template-control]");
  const position = (event) => {
    const bounds = surface.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    commands.positionNativeToken({ x: event.clientX, y: event.clientY });
  };
  scope.listen(surface, "pointerdown", (event) => {
    if (!eligible(event)) return;
    pointers.add(event.pointerId);
    if (pointers.size > 1) { active = null; return; }
    active = event.pointerId;
    position(event);
  }, { capture: true });
  const view = surface.ownerDocument?.defaultView ?? globalThis.window ?? surface;
  scope.listen(view, "pointermove", (event) => {
    if (active === event.pointerId && pointers.size === 1) {
      position(event);
    }
  }, { capture: true });
  const finish = (event) => {
    if (event.type === "pointerup" && active === event.pointerId && pointers.size === 1) position(event);
    pointers.delete(event.pointerId);
    active = null;
  };
  scope.listen(view, "pointerup", finish, { capture: true });
  scope.listen(view, "pointercancel", finish, { capture: true });
}

function renderActorTokenPlacement({ placement, commands, scope, liveStatus }) {
  const localize = (key, fallback) => commands.localize?.(key, fallback) ?? fallback;
  const ghost = node("div", { className: "ve-actor-token-preview", attrs: { role: "img",
    hidden: true, "aria-label": localize("VEMOBILE.Scene.ActorToken.Preview", "Token placement preview") },
    children: [node("img", { attrs: { src: placement.appearance.img, alt: "", draggable: "false" } })] });
  const overlay = node("div", { className: "ve-actor-token-placement-overlay",
    attrs: { "data-ve-scene-control": true }, children: [ghost] });
  const place = node("button", { className: "ve-template-control is-place", attrs: { type: "button" },
    on: { click: async () => {
      if (place.disabled) return;
      place.disabled = true;
      try { await commands.placeActorToken(); }
      catch (error) { liveStatus.textContent = error?.message ?? localize("VEMOBILE.Scene.ActorToken.PlaceFailed", "Token could not be placed."); }
      finally { if (!scope.disposed) place.disabled = false; }
    } }, children: [icon("fa-check"), node("span", { text: localize("VEMOBILE.Scene.ActorToken.Place", "Place") })] }, scope);
  const cancel = node("button", { className: "ve-template-control", attrs: { type: "button" },
    on: { click: () => commands.cancelActorTokenPlacement() },
    children: [icon("fa-xmark"), node("span", { text: localize("VEMOBILE.Scene.ActorToken.Cancel", "Cancel") })] }, scope);
  const hud = node("div", { className: "ve-template-placement-hud ve-actor-token-placement-hud",
    attrs: { role: "toolbar", "aria-label": localize("VEMOBILE.Scene.ActorToken.Toolbar", "Token placement") },
    children: [node("strong", { className: "ve-template-mode-label", text: localize("VEMOBILE.Scene.ActorToken.Adjust", "Move the token preview") }),
      node("div", { className: "ve-template-placement-controls", children: [cancel, place] })] });
  const draw = (clientPoint) => {
    if (!overlay.isConnected) return false;
    const geometry = commands.actorTokenPreviewAt(clientPoint);
    if (!geometry) return false;
    const bounds = overlay.getBoundingClientRect();
    ghost.style.left = `${geometry.x - bounds.left}px`;
    ghost.style.top = `${geometry.y - bounds.top}px`;
    ghost.style.width = `${geometry.width}px`;
    ghost.style.height = `${geometry.height}px`;
    ghost.hidden = false;
    return true;
  };
  bindActorTokenPreviewGesture(overlay, scope, draw);
  scope.timeout(() => {
    const bounds = overlay.getBoundingClientRect();
    if (!draw()) draw({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
  }, 0);
  let frame = 0;
  const refresh = () => {
    if (scope.disposed || !overlay.isConnected) return;
    draw();
    frame = globalThis.requestAnimationFrame?.(refresh) ?? 0;
  };
  frame = globalThis.requestAnimationFrame?.(refresh) ?? 0;
  scope.own(() => globalThis.cancelAnimationFrame?.(frame));
  return { overlay, hud };
}

export function bindActorTokenPreviewGesture(overlay, scope, draw) {
  let pointerId = null;
  const release = () => {
    if (pointerId === null) return;
    if (overlay.hasPointerCapture?.(pointerId)) overlay.releasePointerCapture(pointerId);
    pointerId = null;
  };
  scope.listen(overlay, "pointerdown", (event) => {
    if (pointerId !== null || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation();
    pointerId = event.pointerId;
    draw({ x: event.clientX, y: event.clientY });
    overlay.setPointerCapture?.(pointerId);
  });
  scope.listen(overlay, "pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    draw({ x: event.clientX, y: event.clientY });
  });
  scope.listen(overlay, "pointerup", (event) => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    draw({ x: event.clientX, y: event.clientY });
    release();
  });
  scope.listen(overlay, "pointercancel", (event) => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    release();
  });
  scope.listen(overlay, "lostpointercapture", (event) => {
    if (pointerId === event.pointerId) pointerId = null;
  });
  scope.own(release);
}

function renderTemplatePlacement({ placement, commands, scope, liveStatus }) {
  const labels = placement.labels ?? {};
  const origin = node("button", {
    className: "ve-template-handle ve-template-origin-handle",
    attrs: {
      type: "button",
      "aria-label": labels.origin ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.MoveTemplateOrigin", "Move template origin"),
      "data-ve-template-control": true,
      "data-ve-template-handle": "origin",
      hidden: true
    },
    children: [node("span", { attrs: { "aria-hidden": "true" } })]
  });
  const direction = placement.rotatable ? node("button", {
    className: "ve-template-handle ve-template-direction-handle",
    attrs: {
      type: "button",
      "aria-label": labels.direction ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.AimTemplateDirection", "Aim template direction"),
      "data-ve-template-control": true,
      "data-ve-template-handle": "direction",
      hidden: true
    },
    children: [icon("fa-up-right-and-down-left-from-center")]
  }) : null;
  const overlay = node("div", {
    className: "ve-template-handles",
    attrs: { "aria-label": labels.handles ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.TemplateAdjustmentHandles", "Template adjustment handles"), "data-ve-template-control": true },
    children: [origin, direction]
  });
  const controls = [];
  let pending = false;
  let hud = null;
  const run = async (action) => {
    if (pending) return;
    pending = true;
    for (const button of controls) button.disabled = true;
    hud?.setAttribute("aria-busy", "true");
    try {
      await action();
    } catch (error) {
      liveStatus.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.TemplatePlacementCouldNotFinish", "Template placement could not finish");
      pending = false;
      hud?.removeAttribute("aria-busy");
      for (const button of controls) button.disabled = placement.phase !== "active" && button.dataset.action !== "cancel";
    }
  };
  const control = ({ className = "", label, action, iconName, text, disabled = false }) => {
    const button = node("button", {
      className: `ve-template-control ${className}`,
      attrs: {
        type: "button",
        "aria-label": label,
        title: label,
        "data-ve-template-control": true,
        "data-action": action,
        disabled
      },
      children: [iconName ? icon(iconName) : null, text ? node("span", { text }) : null]
    });
    bindDeliberateTemplateControl(button, scope, () => {
      if (action === "cancel") void run(() => commands.cancelTemplatePlacement());
      else if (action === "place") void run(() => commands.placeTemplate());
    });
    controls.push(button);
    return button;
  };
  const adjusting = placement.phase === "adjusting";
  const cancel = control({ label: labels.cancelLabel ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CancelTemplate", "Cancel template"), action: "cancel", iconName: "fa-xmark", text: labels.cancel ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Cancel", "Cancel"), disabled: ["placing", "cancelling"].includes(placement.phase) });
  const place = control({ className: "is-place", label: labels.placeLabel ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.PlaceTemplate", "Place template"), action: "place", iconName: "fa-check", text: labels.place ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Place", "Place"), disabled: !adjusting });
  const instruction = placement.phase === "preparing"
    ? (labels.preparing ?? localizedText(commands.localize, "VEMOBILE.Scene.PreparingTemplate", "Preparing template"))
    : placement.phase === "awaiting-initial-placement"
      ? (labels.hint ?? localizedText(commands.localize, "VEMOBILE.Scene.TapPlaceTemplate", "Tap to place template"))
      : (labels.adjust ?? localizedText(commands.localize, "VEMOBILE.Scene.AdjustTemplate", "Adjust template"));
  hud = node("div", {
    className: "ve-template-placement-hud",
    attrs: { role: "toolbar", "aria-label": labels.toolbar ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.TemplatePlacement", "Template placement"), "data-ve-template-control": true },
    children: [
      node("strong", { className: "ve-template-mode-label", text: instruction }),
      node("div", { className: "ve-template-placement-controls", children: [cancel, place] })
    ]
  });
  return { overlay, hud, origin, direction };
}

function bindDeliberateTemplateControl(button, scope, activate, movementThreshold = 10) {
  const view = button.ownerDocument?.defaultView ?? globalThis.window;
  let pointer = null;
  let suppressPointerClick = false;
  scope.listen(button, "pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    suppressPointerClick = false;
  });
  scope.listen(view, "pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > movementThreshold) pointer.moved = true;
  }, { passive: true });
  const finish = (event, cancelled = false) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    suppressPointerClick = cancelled || pointer.moved;
    pointer = null;
  };
  scope.listen(view, "pointerup", (event) => finish(event));
  scope.listen(view, "pointercancel", (event) => finish(event, true));
  scope.listen(button, "click", (event) => {
    const pointerClick = Number(event.detail) > 0;
    if (pointerClick && suppressPointerClick) {
      suppressPointerClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    suppressPointerClick = false;
    activate();
  });
}

function updateTemplateOverlay(surface, templateUi, overlay) {
  if (!templateUi) return;
  const rect = surface.getBoundingClientRect();
  positionTemplateHandle(templateUi.origin, overlay?.origin, rect);
  positionTemplateHandle(templateUi.direction, overlay?.direction, rect);
}

function positionTemplateHandle(element, point, surfaceRect) {
  if (!element) return;
  element.hidden = !point;
  if (!point) return;
  element.style.transform = `translate3d(${point.x - surfaceRect.left}px, ${point.y - surfaceRect.top}px, 0) translate(-50%, -50%)`;
}

function visibleSceneViewport(surface, enabled) {
  if (!enabled) return null;
  const rect = surface.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return Object.freeze({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
}

/** Equal annular sectors: the painted face and browser hit region are identical.
 * Pixel radii keep a 3px gap around the 52px portrait in either hex footprint.
 * The hex pad's existing outer clip supplies its native six-sided boundary. */
function dpadSegmentStyle(shape, count, angle) {
  const width = shape === "hex-rows" ? 132 * Math.sqrt(3) / 2 : 132;
  const height = shape === "hex-columns" ? 132 * Math.sqrt(3) / 2 : 132;
  const half = Math.PI / count - 0.006;
  const point = (radius, theta) => `${50 + 100 * radius * Math.cos(theta) / width}% ${50 + 100 * radius * Math.sin(theta) / height}%`;
  const arc = (radius, reverse = false) => Array.from({ length: 13 }, (_, i) =>
    point(radius, angle + (reverse ? 1 : -1) * half * (1 - i / 6)));
  const polygon = [...arc(shape === "round" ? 66 : 94), ...arc(29, true)].join(",");
  return `--ve-direction-angle:${angle}rad;--ve-direction-x:${50 + 100 * 47 * Math.cos(angle) / width}%;--ve-direction-y:${50 + 100 * 47 * Math.sin(angle) / height}%;clip-path:polygon(${polygon})`;
}

function movementMessage(error, commands) {
  const messages = {
    PAUSED: localizedText(commands.localize, "VEMOBILE.Scene.Movement.PAUSED", "The game is paused"),
    FORBIDDEN: localizedText(commands.localize, "VEMOBILE.Scene.Movement.FORBIDDEN", "You no longer control this token"),
    STALE_SCENE: localizedText(commands.localize, "VEMOBILE.Scene.Movement.STALE_SCENE", "The active scene changed"),
    TARGET_MISSING: localizedText(commands.localize, "VEMOBILE.Scene.Movement.TARGET_MISSING", "That token is no longer available"),
    MOVEMENT_BUSY: localizedText(commands.localize, "VEMOBILE.Scene.Movement.MOVEMENT_BUSY", "Wait for the current step to finish")
  };
  return messages[error?.code] ?? error?.message ?? localizedText(commands.localize, "VEMOBILE.Scene.Movement.Failed", "Token movement failed");
}

/** Distinguish intentional map disablement from expected loading and failure. */
export function sceneStatusCopy(scene, localize = (_key, fallback) => fallback) {
  const prefix = "VEMOBILE.Controls.Status.";
  if (scene?.canvasDisabled) return { title: localize(prefix + "MapOff", "Live map disabled"), hint: localize(prefix + "MapOffHint", "The game canvas is disabled in this browser. Change it in Settings; Foundry will ask you to reload.") };
  if (scene?.canvasState === "transitional") return { title: localizedText(localize, "VEMOBILE.Interface.Presenter.PreparingScene", "Preparing scene…"), hint: "" };
  if (!scene?.id) return { title: localize(prefix + "Empty", "No active Scene"), hint: localize(prefix + "EmptyHint", "Open the Scene chooser to view an available Scene.") };
  return { title: localize(prefix + "Failed", "Live map unavailable"), hint: localize(prefix + "FailedHint", "Foundry’s canvas is unavailable. Check Settings or reload Foundry to try again.") };
}
