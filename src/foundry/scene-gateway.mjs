import { localizeFoundry } from "./localization.mjs";
import { captureFixedSceneAnchor, captureVisibleSceneAnchor, restoreFixedSceneAnchor, restoreVisibleSceneAnchor } from "./scene-viewport-anchor.mjs";

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
export const SCENE_GESTURE_MOVEMENT_THRESHOLD = 8;
const LONG_PRESS_MS = 500;

export class SceneNavigationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SceneNavigationError";
    this.code = code;
  }
}

/** Foundry 13.351 Scene Directory eligibility: WorldCollection contents whose Document.visible getter is true. */
export function isNativeSceneDirectoryEligible(scene) {
  return Boolean(scene?.visible);
}

/** Active Scenes are available to players through native Scene Navigation even without document visibility. */
export function isSceneViewEligible(scene) {
  return Boolean(scene?.active || isNativeSceneDirectoryEligible(scene));
}

/**
 * Project Foundry's native Scene Directory contents into serializable records.
 * Folder and entry ordering is applied by the presenter from the collection's
 * root sorting mode and each Folder's own sorting mode.
 */
export function nativeSceneDirectorySnapshot(game, riskForScene = () => null, risksForScenes = null) {
  const records = [];
  const scenes = collectionValues(game?.scenes).filter(isSceneViewEligible);
  const risks = typeof risksForScenes === "function" ? risksForScenes(scenes.map((scene) => scene.id)) : null;
  for (const scene of scenes) {
    const id = String(scene.id ?? "");
    const record = Object.freeze({
      id,
      name: String(scene.name || localizeFoundry("VEMOBILE.Scene.Unnamed", "Unnamed Scene")),
      viewed: Boolean(scene.isView),
      active: Boolean(scene.active),
      navigation: Boolean(scene.navigation),
      visible: Boolean(scene.visible),
      eligible: true,
      contextActions: Boolean(game?.user?.isGM),
      navOrder: Number(scene.navOrder) || 0,
      sort: Number(scene.sort) || 0,
      rootSorting: sortingMode(game?.scenes?.sortingMode),
      sortingLocale: String(game?.i18n?.lang || ""),
      folderPath: sceneFolderPath(scene),
      thumb: String(scene.thumb ?? scene.thumbnail ?? ""),
      memoryRisk: risks && Object.hasOwn(risks, id) ? risks[id] : riskForScene(scene.id)
    });
    records.push(record);
  }
  return Object.freeze(records);
}

/** Read-only control boundary for presenting Foundry's live canvas on mobile. */
export function createFoundrySceneGateway({
  getCanvas = () => globalThis.canvas,
  getGame = () => globalThis.game,
  getUi = () => globalThis.ui,
  getDocument = () => globalThis.document,
  getHooks = () => globalThis.Hooks,
  getWindow = () => globalThis.window,
  getConnectionGeneration = () => 0,
  getMode = () => "desktop",
  createPointerEvent = (type, init) => new PointerEvent(type, init),
  longPressMs = LONG_PRESS_MS,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  riskForScene = () => null,
  risksForScenes = null,
  readSceneMemoryWarnings = () => true,
  confirmSceneRisk = async () => "open",
  preflightScene = null,
  onOpenMemorySettings = () => {},
  trace = () => {}
} = {}) {
  let presentationGeneration = 0;
  let contextMenu = null;
  let contextMenuSequence = 0;
  return Object.freeze({
    snapshot() {
      const canvas = getCanvas();
      const scene = canvas?.scene ?? getGame()?.scenes?.current ?? null;
      const noCanvas = getGame()?.settings?.get?.("core", "noCanvas") === true;
      const canvasReady = Boolean(!noCanvas && canvas?.ready && canvas?.stage && scene);
      return Object.freeze({
        id: String(scene?.id ?? ""),
        name: String(scene?.name ?? localizeFoundry("VEMOBILE.Scene.NoActive", "No active scene")),
        canvasReady,
        canvasDisabled: noCanvas,
        canvasState: canvasReady ? "ready" : noCanvas || !canvas ? "unavailable" : "transitional",
        navigation: Boolean(scene?.navigation),
        background: scene?.background?.src ?? scene?.img ?? ""
      });
    },

    navigationSnapshot() {
      return nativeSceneDirectorySnapshot(getGame(), riskForScene, risksForScenes);
    },

    watchSceneNavigation(scope, onChange) {
      for (const hook of ["createScene", "updateScene", "deleteScene"]) scope?.hook?.(hook, () => onChange?.());
      for (const hook of ["createFolder", "updateFolder", "deleteFolder"]) {
        scope?.hook?.(hook, (folder) => {
          if (folder?.type === "Scene") onChange?.();
        });
      }
    },

    async openSceneContextMenu(request, expected = {}) {
      const id = sceneIdentifier(request?.sceneId);
      const game = getGame();
      assertSceneSession(game, expected);
      closeContextMenu();
      const scene = resolveScene(game, id);
      if (!scene || !isNativeSceneDirectoryEligible(scene)) return Object.freeze({ ok: true, action: "stale" });
      if (!game.user.isGM) return Object.freeze({ ok: true, action: "unavailable" });
      const bridge = createSceneContextBridge(id, getDocument());
      let descriptors;
      try {
        descriptors = nativeSceneContextDescriptors(getUi()?.nav, getHooks());
      } catch (error) {
        bridge.cleanup();
        throw error;
      }
      const options = descriptors.flatMap((descriptor, index) => nativeSceneContextEligible(descriptor, bridge.anchor)
        ? [Object.freeze({
          id: String(index),
          label: localizeSceneLabel(game, descriptor.name),
          icon: String(descriptor.icon ?? "")
        })]
        : []);
      if (!options.length) {
        bridge.cleanup();
        return Object.freeze({ ok: true, action: "unavailable" });
      }
      const menuId = `scene-menu-${++contextMenuSequence}`;
      contextMenu = { menuId, sceneId: id, bridge };
      return Object.freeze({
        ok: true,
        action: "opened",
        menu: Object.freeze({
          id: menuId,
          sceneId: id,
          clientX: finiteSceneCoordinate(request?.clientX),
          clientY: finiteSceneCoordinate(request?.clientY),
          options: Object.freeze(options)
        })
      });
    },

    async selectSceneContextOption(request, expected = {}) {
      const current = contextMenu;
      if (!current || String(request?.menuId ?? "") !== current.menuId) return Object.freeze({ ok: true, action: "stale" });
      const game = getGame();
      assertSceneSession(game, expected);
      const scene = resolveScene(game, current.sceneId);
      if (!scene || !isNativeSceneDirectoryEligible(scene)) {
        closeContextMenu();
        return Object.freeze({ ok: true, action: "stale" });
      }
      if (!game.user.isGM) {
        closeContextMenu();
        return Object.freeze({ ok: true, action: "unavailable" });
      }
      const descriptors = nativeSceneContextDescriptors(getUi()?.nav, getHooks());
      const index = Number.parseInt(String(request?.optionId ?? ""), 10);
      const descriptor = Number.isInteger(index) ? descriptors[index] : null;
      if (!descriptor || typeof descriptor.callback !== "function" || !nativeSceneContextEligible(descriptor, current.bridge.anchor)) {
        closeContextMenu();
        return Object.freeze({ ok: true, action: "unavailable" });
      }
      try {
        await Promise.resolve(descriptor.callback(current.bridge.anchor));
        return Object.freeze({ ok: true, action: "selected", sceneId: current.sceneId, optionId: String(index) });
      } finally {
        closeContextMenu();
      }
    },

    closeSceneContextMenu: closeContextMenu,

    async viewScene(sceneId, expected = {}) {
      const id = String(sceneId ?? "").trim();
      if (!id || id.length > 128) throw new SceneNavigationError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.SceneGateway.ChooseAValidScene", "Choose a valid Scene."));
      const game = getGame();
      if (!game?.user || !game?.scenes) throw new SceneNavigationError("SESSION_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.SceneGateway.TheFoundrySceneCollectionIsUnavailable", "The Foundry Scene collection is unavailable."));
      const session = { worldId: game.world?.id, userId: game.user.id, ...expected };
      if (expected.worldId && String(game.world?.id ?? "") !== String(expected.worldId)) {
        throw new SceneNavigationError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.SceneGateway.TheActiveWorldChangedBeforeTheSceneCouldOpen", "The active world changed before the Scene could open."));
      }
      if (expected.userId && String(game.user.id ?? "") !== String(expected.userId)) {
        throw new SceneNavigationError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.SceneGateway.TheActiveUserChangedBeforeTheSceneCouldOpen", "The active user changed before the Scene could open."));
      }
      const scene = game.scenes.get?.(id) ?? collectionValues(game.scenes).find((candidate) => String(candidate?.id ?? "") === id);
      if (!scene) throw new SceneNavigationError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.SceneGateway.ThatSceneIsNoLongerAvailable", "That Scene is no longer available."));
      if (!isSceneViewEligible(scene)) {
        throw new SceneNavigationError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.SceneGateway.YouNoLongerHaveAccessToThatSceneFrom", "You no longer have access to that Scene from the Scene Directory."));
      }
      if (typeof scene.view !== "function") throw new SceneNavigationError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.SceneGateway.FoundryCannotViewThatScene", "Foundry cannot view that Scene."));
      if (typeof preflightScene === "function") {
        const preflight = await preflightScene(scene, { source: "user", allowCancel: true });
        if (preflight?.action === "cancel") return Object.freeze({ sceneId: id, viewed: false, cancelled: true });
        if (preflight?.action === "reload") return Object.freeze({ sceneId: id, viewed: false, reloading: true });
      } else {
        const risk = riskForScene(id);
        if (readSceneMemoryWarnings() && risk?.warningRequired) {
          const decision = await confirmSceneRisk(scene, risk);
          if (decision === "settings") {
            onOpenMemorySettings();
            return Object.freeze({ sceneId: id, viewed: false, settings: true });
          }
          if (decision !== "open") return Object.freeze({ sceneId: id, viewed: false, cancelled: true });
        }
      }
      // A warning may outlive the world, the Scene, or the player's access.
      assertSceneSession(getGame(), session);
      const current = resolveScene(getGame(), id);
      if (!current) throw new SceneNavigationError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.SceneGateway.ThatSceneIsNoLongerAvailable", "That Scene is no longer available."));
      if (!isSceneViewEligible(current)) throw new SceneNavigationError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.SceneGateway.YouNoLongerHaveAccessToThatScene", "You no longer have access to that Scene."));
      if (typeof current.view !== "function") throw new SceneNavigationError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.SceneGateway.FoundryCannotViewThatScene", "Foundry cannot view that Scene."));
      await current.view();
      return Object.freeze({ sceneId: id, viewed: true });
    },

    interactionState() {
      const canvas = getCanvas();
      const geometry = canvasPresentationGeometry(canvas);
      return Object.freeze({
        canvasReady: Boolean(usableCanvas(canvas)),
        canvasGeometryReady: Boolean(geometry)
      });
    },

    captureViewportAnchor(bounds) {
      return captureVisibleSceneAnchor(usableCanvas(getCanvas()), bounds);
    },

    captureFixedViewportAnchor(bounds) {
      return captureFixedSceneAnchor(usableCanvas(getCanvas()), bounds);
    },

    restoreViewportAnchor(anchor, bounds) {
      try {
        return restoreVisibleSceneAnchor(usableCanvas(getCanvas()), anchor, bounds);
      } catch (error) {
        console.warn("VE Mobile | Scene camera anchor restoration failed", error);
        return false;
      }
    },

    restoreFixedViewportAnchor(anchor, bounds) {
      try {
        return restoreFixedSceneAnchor(usableCanvas(getCanvas()), anchor, bounds);
      } catch (error) {
        console.warn("VE Mobile | Scene screen position restoration failed", error);
        return false;
      }
    },

    refreshPresentation(scope) {
      if (!scope?.timeout) return false;
      const generation = ++presentationGeneration;
      scope.own?.(() => {
        if (presentationGeneration === generation) presentationGeneration += 1;
      });
      const refresh = () => {
        if (scope.disposed || presentationGeneration !== generation) return;
        const canvas = usableCanvas(getCanvas());
        if (!canvas) return;
        try {
          const current = {
            x: Number(canvas.stage?.pivot?.x),
            y: Number(canvas.stage?.pivot?.y),
            scale: Number(canvas.stage?.scale?.x)
          };
          if (typeof canvas._onResize === "function") {
            trace({
              operation: "_onResize",
              caller: "scene-gateway.refreshPresentation",
              reason: "scene-presentation-layout",
              target: current,
              presentationGeneration: generation,
              controlledTokenInvolved: false
            });
            canvas._onResize();
          }
          else {
            canvas.app?.renderer?.resize?.(getWindow()?.innerWidth ?? 0, getWindow()?.innerHeight ?? 0);
            trace({
              operation: "pan",
              caller: "scene-gateway.refreshPresentation",
              reason: "scene-presentation-layout-fallback",
              target: current,
              presentationGeneration: generation,
              controlledTokenInvolved: false
            });
            canvas.pan(canvas.stage?.pivot ?? {});
          }
          canvas.app?.render?.();
        } catch (error) {
          console.warn("VE Mobile | Canvas presentation refresh failed", error);
        }
      };
      scope.timeout(refresh, 0);
      scope.timeout(refresh, 160);
      return true;
    },

    bindGestures(surface, scope, onTap = () => {}, onLongPress = () => {}, onMovementAbort = null, options = {}) {
      const gestureTarget = surface;
      const gestureWindow = getWindow() ?? gestureTarget;
      const points = new Map();
      let gesture = null;
      let longPress = null;
      let longPressFired = false;
      let longPressReady = false;
      let doorTap = null;
      let multiPointerGesture = false;
      let selectionGestureActive = false;
      let lastTouchCompletion = null;

      const cancelLongPress = () => {
        if (longPress?.timer !== null && longPress?.timer !== undefined) clearTimeoutFn(longPress.timer);
        longPress = null;
        longPressReady = false;
      };

      const cancelDoorTap = () => {
        if (doorTap?.timer !== null && doorTap?.timer !== undefined) clearTimeoutFn(doorTap.timer);
        doorTap = null;
      };

      const armDoorTap = (pointerId, start, control) => {
        cancelDoorTap();
        const pending = { pointerId, start, control, expired: false, timer: null };
        pending.timer = setTimeoutFn(() => {
          if (doorTap === pending) pending.expired = true;
        }, Math.max(0, Number(longPressMs) || LONG_PRESS_MS));
        doorTap = pending;
      };

      const armLongPress = (pointerId, start) => {
        cancelLongPress();
        longPressFired = false;
        const press = { pointerId, start, timer: null };
        press.timer = setTimeoutFn(() => {
          if (longPress !== press || points.size !== 1 || !points.has(pointerId) || gesture?.started) return;
          longPressReady = true;
          longPress = null;
          if (options.longPressOnRelease !== true) {
            longPressFired = true;
            onLongPress(start);
          }
        }, Math.max(0, Number(longPressMs) || LONG_PRESS_MS));
        longPress = press;
      };

      const pan = (options) => {
        const canvas = usableCanvas(getCanvas());
        if (!canvas) return;
        try {
          canvas.pan(options);
        } catch (error) {
          console.warn("VE Mobile | Canvas pan failed", error);
        }
      };

      const beginGesture = () => {
        const canvas = usableCanvas(getCanvas());
        if (!canvas || points.size === 0) {
          gesture = null;
          return;
        }
        const active = Array.from(points.values());
        const view = canvasView(canvas);
        if (active.length === 1) {
          gesture = { kind: "pan", point: active[0], started: false, ...view };
          return;
        }
        const pinchMidpoint = midpoint(active[0], active[1]);
        const screenCenter = canvasScreenCenter(canvas);
        gesture = {
          kind: "pinch",
          midpoint: pinchMidpoint,
          distance: distance(active[0], active[1]),
          focus: {
            x: view.x + (pinchMidpoint.x - screenCenter.x) / view.scale,
            y: view.y + (pinchMidpoint.y - screenCenter.y) / view.scale
          },
          ...view
        };
      };

      const pointerDown = (event) => {
        if (event.target?.closest?.("button, select, [data-ve-scene-control], [data-ve-template-control]")) return;
        const canvas = usableCanvas(getCanvas());
        if (!canvas) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        selectionGestureActive = true;
        const start = point(event);
        points.set(event.pointerId, start);
        if (points.size === 1) {
          const door = options.allowDoors === false ? null : doorControlAtClientPoint(canvas, start);
          if (door) {
            cancelLongPress();
            armDoorTap(event.pointerId, start, door);
          } else if (options.allowLongPress !== false) armLongPress(event.pointerId, start);
        } else {
          multiPointerGesture = true;
          cancelLongPress();
          cancelDoorTap();
        }
        beginGesture();
      };

      const pointerMove = (event) => {
        if (!points.has(event.pointerId)) return;
        points.set(event.pointerId, point(event));
        if (doorTap?.pointerId === event.pointerId
          && distance(doorTap.start, points.get(event.pointerId)) >= SCENE_GESTURE_MOVEMENT_THRESHOLD) cancelDoorTap();
        const canvas = usableCanvas(getCanvas());
        if (!canvas || !gesture) return;
        const active = Array.from(points.values());
        if (gesture.kind === "pan" && active.length === 1) {
          const dx = active[0].x - gesture.point.x;
          const dy = active[0].y - gesture.point.y;
          if (!gesture.started && Math.hypot(dx, dy) < SCENE_GESTURE_MOVEMENT_THRESHOLD) return;
          cancelLongPress();
          gesture.started = true;
          pan({
            x: gesture.x - dx / gesture.scale,
            y: gesture.y - dy / gesture.scale
          });
        } else if (gesture.kind === "pinch" && active.length >= 2) {
          cancelLongPress();
          const currentMidpoint = midpoint(active[0], active[1]);
          const ratio = gesture.distance > 0 ? distance(active[0], active[1]) / gesture.distance : 1;
          const scale = clamp(gesture.scale * ratio, MIN_SCALE, MAX_SCALE);
          const screenCenter = canvasScreenCenter(canvas);
          pan({
            x: gesture.focus.x - (currentMidpoint.x - screenCenter.x) / scale,
            y: gesture.focus.y - (currentMidpoint.y - screenCenter.y) / scale,
            scale
          });
        }
      };

      const pointerEnd = (event, cancelled = false) => {
        if (!points.has(event.pointerId)) return;
        const validRelease = !cancelled && !event.defaultPrevented && !multiPointerGesture && points.size === 1 && gesture?.kind === "pan" && !gesture.started;
        const wasLongPress = validRelease && longPressReady && options.longPressOnRelease === true;
        const wasTap = validRelease && !longPressFired && !wasLongPress;
        const tapPoint = point(event);
        const pendingDoor = doorTap?.pointerId === event.pointerId ? doorTap : null;
        cancelLongPress();
        cancelDoorTap();
        points.delete(event.pointerId);
        beginGesture();
        if (wasTap && options.updateCursor !== false) updateFoundryCursorAtClientPoint(getCanvas(), tapPoint, createPointerEvent);
        if (wasLongPress) {
          longPressFired = true;
          onLongPress(tapPoint);
        } else if (wasTap && pendingDoor && !pendingDoor.expired) {
          Promise.resolve(invokeNativeDoorControl(pendingDoor.control)).catch((error) => {
            console.warn("VE Mobile | Native door interaction failed", error);
          });
        } else if (wasTap && !pendingDoor && options.allowTap !== false) onTap(tapPoint);
        if (points.size === 0) {
          longPressFired = false;
          multiPointerGesture = false;
          selectionGestureActive = false;
        }
      };

      const pointerEventsSupported = typeof gestureWindow?.PointerEvent === "function";
      if (!pointerEventsSupported) {
        const touchPoints = (event) => Array.from(event?.changedTouches ?? []);
        const touchPointer = (event, touch) => ({
          pointerId: Number(touch.identifier) || 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          clientX: Number(touch.clientX),
          clientY: Number(touch.clientY),
          target: event.target,
          get defaultPrevented() { return Boolean(event.defaultPrevented); },
          preventDefault() { event.preventDefault?.(); },
          stopPropagation() { event.stopPropagation?.(); }
        });
        scope.listen(gestureTarget, "touchstart", (event) => {
          for (const touch of touchPoints(event)) pointerDown(touchPointer(event, touch));
        }, { capture: true, passive: false });
        scope.listen(gestureWindow, "touchmove", (event) => {
          for (const touch of touchPoints(event)) pointerMove(touchPointer(event, touch));
        }, { passive: false });
        scope.listen(gestureWindow, "touchend", (event) => {
          let consumed = false;
          for (const touch of touchPoints(event)) {
            const adapted = touchPointer(event, touch);
            if (!points.has(adapted.pointerId)) continue;
            pointerEnd(adapted);
            lastTouchCompletion = { x: adapted.clientX, y: adapted.clientY, time: Date.now() };
            consumed = true;
          }
          // Prevent WebKit's compatibility click from repeating VE's native
          // pointer translation. The scene surface remains the only scope.
          if (consumed) event.preventDefault?.();
        }, { passive: false });
        scope.listen(gestureWindow, "touchcancel", (event) => {
          for (const touch of touchPoints(event)) pointerEnd(touchPointer(event, touch), true);
        }, { passive: false });
        scope.listen(gestureTarget, "click", (event) => {
          const completed = lastTouchCompletion;
          if (!completed || Date.now() - completed.time > 800
            || Math.hypot(Number(event.clientX) - completed.x, Number(event.clientY) - completed.y) > SCENE_GESTURE_MOVEMENT_THRESHOLD) return;
          lastTouchCompletion = null;
          event.preventDefault?.();
          event.stopPropagation?.();
        }, { capture: true });
      }

      scope.listen(gestureTarget, "pointerdown", pointerDown, { capture: true });
      scope.listen(gestureWindow, "pointermove", pointerMove, { passive: true });
      scope.listen(gestureWindow, "pointerup", pointerEnd);
      scope.listen(gestureWindow, "pointercancel", (event) => pointerEnd(event, true));
      const preventNativeHold = (event) => event.preventDefault();
      const preventActiveSelection = (event) => {
        if (!selectionGestureActive) return;
        event.preventDefault?.();
        event.stopPropagation?.();
      };
      scope.listen(gestureTarget, "contextmenu", preventNativeHold);
      scope.listen(gestureTarget, "selectstart", preventNativeHold);
      scope.listen(gestureTarget, "dragstart", preventNativeHold);
      const document = gestureTarget?.ownerDocument;
      if (document) {
        scope.listen(document, "selectstart", preventActiveSelection, { capture: true, passive: false });
        scope.listen(document, "dragstart", preventActiveSelection, { capture: true, passive: false });
      }
      scope.own(cancelLongPress);
      scope.own(cancelDoorTap);
      if (onMovementAbort) {
        const abortMovement = () => onMovementAbort();
        scope.hook("canvasTearDown", abortMovement);
        scope.hook("controlToken", abortMovement);
        scope.hook("deleteToken", abortMovement);
      }
    },

    nativeTileTap({ sceneId, clientX, clientY, button = 0, worldId, userId, connectionGeneration }) {
      const game = getGame();
      if (!game?.world || game.world.id !== worldId || !game.user || game.user.id !== userId
        || getConnectionGeneration() !== connectionGeneration || !["phone", "tablet"].includes(getMode())) return false;
      const canvas = usableCanvas(getCanvas());
      if (!canvas || String(canvas.scene?.id ?? "") !== String(sceneId ?? "")
        || canvas.activeLayer !== canvas.tokens) return false;
      const coordinates = canvas.canvasCoordinatesFromClient?.({ x: Number(clientX), y: Number(clientY) });
      if (![coordinates?.x, coordinates?.y].every(Number.isFinite)) return false;
      // Foundry's rendered hit target decides whether a visible Token or other
      // placeable sits above a Tile. The document bounds fallback is only for
      // Foundry/test surfaces that do not expose the renderer hit-test API.
      if (!nativeTileIsTopTarget(canvas, { x: Number(clientX), y: Number(clientY) }, coordinates)) return false;
      if (![0, 2].includes(Number(button))) return false;
      const target = canvas.app?.renderer?.events?.domElement ?? canvas.app?.renderer?.canvas
        ?? canvas.app?.canvas ?? canvas.app?.view;
      if (!target?.dispatchEvent) return false;
      const pointer = (type, buttons) => createPointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        pointerId: 1, pointerType: "mouse", isPrimary: true,
        clientX: Number(clientX), clientY: Number(clientY),
        button: Number(button), buttons
      });
      target.dispatchEvent(pointer("pointerdown", Number(button) === 2 ? 2 : 1));
      target.dispatchEvent(pointer("pointerup", 0));
      return true;
    },

    zoom(factor) {
      const canvas = usableCanvas(getCanvas());
      if (!canvas) return false;
      const scale = clamp(canvasView(canvas).scale * Number(factor || 1), MIN_SCALE, MAX_SCALE);
      try {
        moveCamera(canvas, { scale }, true);
        return true;
      } catch (error) {
        console.warn("VE Mobile | Canvas zoom failed", error);
        return false;
      }
    },

    recenter() {
      const canvas = usableCanvas(getCanvas());
      const dimensions = canvas?.scene?.dimensions;
      if (!canvas || !dimensions) return false;
      const width = Number(dimensions.sceneWidth ?? dimensions.width ?? 0);
      const height = Number(dimensions.sceneHeight ?? dimensions.height ?? 0);
      const x = Number(dimensions.sceneX ?? 0) + width / 2;
      const y = Number(dimensions.sceneY ?? 0) + height / 2;
      try {
        moveCamera(canvas, { x, y }, true);
        return true;
      } catch (error) {
        console.warn("VE Mobile | Canvas recenter failed", error);
        return false;
      }
    }
  });

  function closeContextMenu() {
    const current = contextMenu;
    contextMenu = null;
    current?.bridge?.cleanup?.();
  }
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
  return [];
}

function sceneFolderPath(scene) {
  const path = [];
  const seen = new Set();
  let folder = scene?.folder ?? null;
  while (folder) {
    const id = String(folder.id ?? folder._id ?? "").trim();
    if (!id || seen.has(id)) break;
    seen.add(id);
    path.unshift(Object.freeze({
      id,
      name: String(folder.name ?? localizeFoundry("VEMOBILE.Scene.UnnamedFolder", "Unnamed folder")),
      sort: Number(folder.sort) || 0,
      sorting: sortingMode(folder.sorting)
    }));
    folder = folder.folder ?? null;
  }
  return Object.freeze(path);
}

function sortingMode(value) {
  return value === "m" ? "m" : "a";
}

function sceneIdentifier(value) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new SceneNavigationError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.SceneGateway.ChooseAValidScene", "Choose a valid Scene."));
  return id;
}

function assertSceneSession(game, expected = {}) {
  if (!game?.user || !game?.scenes) throw new SceneNavigationError("SESSION_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.SceneGateway.TheFoundrySceneCollectionIsUnavailable", "The Foundry Scene collection is unavailable."));
  if (expected.worldId && String(game.world?.id ?? "") !== String(expected.worldId)) {
    throw new SceneNavigationError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.SceneGateway.TheActiveWorldChangedBeforeTheSceneActionCould", "The active world changed before the Scene action could run."));
  }
  if (expected.userId && String(game.user.id ?? "") !== String(expected.userId)) {
    throw new SceneNavigationError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.SceneGateway.TheActiveUserChangedBeforeTheSceneActionCould", "The active user changed before the Scene action could run."));
  }
}

function resolveScene(game, id) {
  return game?.scenes?.get?.(id) ?? collectionValues(game?.scenes).find((candidate) => String(candidate?.id ?? "") === id) ?? null;
}

function createSceneContextBridge(sceneId, document) {
  if (!document?.createElement) throw new SceneNavigationError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.SceneGateway.FoundrySSceneContextActionsAreUnavailable", "Foundry's Scene context actions are unavailable."));
  const host = document.createElement("div");
  host.className = "ve-native-scene-provider-bridge";
  host.hidden = true;
  host.setAttribute?.("aria-hidden", "true");
  const anchor = document.createElement("li");
  anchor.className = "scene";
  anchor.dataset.sceneId = sceneId;
  host.append(anchor);
  document.body?.append?.(host);
  let cleaned = false;
  return Object.freeze({
    anchor,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      host.remove?.();
    }
  });
}

/** Use Foundry 13.351 SceneNavigation's live provider and the same extension hook as its desktop ContextMenu. */
function nativeSceneContextDescriptors(navigation, hooks) {
  if (typeof navigation?._getContextMenuOptions !== "function") {
    throw new SceneNavigationError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.SceneGateway.FoundrySSceneContextActionsAreUnavailable", "Foundry's Scene context actions are unavailable."));
  }
  if (typeof navigation._doEvent === "function") {
    const descriptors = navigation._doEvent(navigation._getContextMenuOptions, {
      hookName: "getSceneContextOptions",
      parentClassHooks: false,
      hookResponse: true
    });
    return Array.isArray(descriptors) ? descriptors : [];
  }
  const descriptors = navigation._getContextMenuOptions.call(navigation);
  hooks?.callAll?.("getSceneContextOptions", navigation, descriptors);
  return Array.isArray(descriptors) ? descriptors : [];
}

function nativeSceneContextEligible(descriptor, anchor) {
  try {
    if (typeof descriptor?.condition === "function") return descriptor.condition(anchor) !== false;
    return descriptor?.condition !== false;
  } catch {
    return false;
  }
}

function localizeSceneLabel(game, key) {
  const value = typeof game?.i18n?.localize === "function" ? game.i18n.localize(key) : key;
  return String(value ?? key ?? "");
}

function finiteSceneCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Give a completed touch tap to PIXI's native DOM pointer-move entry point.
 * The stage updates local hover state and ControlsLayer broadcasts the user's
 * cursor through game.user.broadcastActivity, exactly as desktop movement does.
 */
export function updateFoundryCursorAtClientPoint(canvas, clientPoint, createPointerEvent = (type, init) => new PointerEvent(type, init)) {
  if (!canvas?.ready || typeof canvas.canvasCoordinatesFromClient !== "function") return false;
  const events = canvas.app?.renderer?.events;
  const target = events?.domElement ?? canvas.app?.renderer?.canvas ?? canvas.app?.canvas ?? canvas.app?.view;
  if (!target?.dispatchEvent) return false;
  const coordinates = canvas.canvasCoordinatesFromClient({ x: Number(clientPoint?.x), y: Number(clientPoint?.y) });
  if (![coordinates?.x, coordinates?.y].every(Number.isFinite)) return false;
  target.dispatchEvent(createPointerEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    composed: true,
    // PIXI keys hover boundaries by pointerId. Every VE tap represents the
    // same authoritative mouse cursor, even though Android assigns a fresh
    // touch pointerId to each contact.
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    clientX: Number(clientPoint.x),
    clientY: Number(clientPoint.y),
    buttons: 0,
    button: -1
  }));
  return true;
}

/** Broad Tile candidate test; PIXI and the Tile/module still decide the hit. */
export function tileAtCanvasPoint(canvas, point) {
  if ([...(canvas?.tiles?.placeables ?? [])].some(tile => tile?.bounds?.contains?.(point.x, point.y))) return true;
  const tiles = Array.from(canvas?.scene?.tiles ?? []);
  return tiles.some(tile => {
    const x = Number(tile?.x);
    const y = Number(tile?.y);
    const width = Number(tile?.width);
    const height = Number(tile?.height);
    return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
      && point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  });
}

function nativeTileIsTopTarget(canvas, clientPoint, canvasPoint) {
  const events = canvas?.app?.renderer?.events;
  const tiles = Array.from(canvas?.tiles?.placeables ?? []);
  if (typeof events?.mapPositionToPoint === "function" && typeof events?.rootBoundary?.hitTest === "function") {
    const mapped = { x: 0, y: 0 };
    events.mapPositionToPoint(mapped, clientPoint.x, clientPoint.y);
    const hit = events.rootBoundary.hitTest(mapped.x, mapped.y);
    if (hit) {
      const chain = [];
      for (let current = hit; current; current = current.parent) chain.push(current);
      const visibleTile = tiles.find((tile) => chain.includes(tile)
        && tile.visible !== false && tile.renderable !== false && tile._destroyed !== true);
      if (visibleTile) return true;
      const foregroundLayers = [canvas?.tokens, canvas?.drawings, canvas?.templates, canvas?.notes,
        canvas?.lighting, canvas?.sounds, canvas?.regions];
      const visiblePlaceable = foregroundLayers.some((layer) => Array.from(layer?.placeables ?? []).some((placeable) =>
        chain.includes(placeable) && placeable.visible !== false && placeable.renderable !== false
        && placeable._destroyed !== true));
      if (visiblePlaceable) return false;
    }
  }
  return tileAtCanvasPoint(canvas, canvasPoint);
}

/** Read the native renderer/display relationship without changing Foundry sizing. */
export function canvasPresentationGeometry(canvas) {
  const renderer = canvas?.app?.renderer;
  const view = renderer?.canvas ?? canvas?.app?.canvas ?? canvas?.app?.view;
  const rect = view?.getBoundingClientRect?.();
  const screen = renderer?.screen ?? canvas?.app?.screen;
  const screenWidth = Number(screen?.width);
  const screenHeight = Number(screen?.height);
  const backingWidth = Number(view?.width);
  const backingHeight = Number(view?.height);
  const resolution = Number(renderer?.resolution) || 1;
  if (!rect || ![rect.width, rect.height, screenWidth, screenHeight, backingWidth, backingHeight].every((value) => Number.isFinite(value) && value > 0)) return null;
  return Object.freeze({
    cssWidth: rect.width,
    cssHeight: rect.height,
    screenWidth,
    screenHeight,
    backingWidth,
    backingHeight,
    resolution,
    displayScaleX: rect.width / screenWidth,
    displayScaleY: rect.height / screenHeight,
    backingScaleX: backingWidth / screenWidth,
    backingScaleY: backingHeight / screenHeight
  });
}

export function doorControlAtClientPoint(canvas, clientPoint) {
  const controls = Array.from(canvas?.controls?.doors?.children ?? []);
  if (!controls.length) return null;
  const renderer = canvas?.app?.renderer;
  const events = renderer?.events;
  const globalPoint = { x: 0, y: 0 };
  if (typeof events?.mapPositionToPoint === "function") {
    events.mapPositionToPoint(globalPoint, clientPoint.x, clientPoint.y);
    const target = events.rootBoundary?.hitTest?.(globalPoint.x, globalPoint.y);
    const nativeHit = target ? doorAncestor(target, controls) : null;
    if (nativeHit) return nativeHit;
  } else {
    const view = renderer?.canvas ?? canvas?.app?.canvas ?? canvas?.app?.view;
    const rect = view?.getBoundingClientRect?.();
    const screen = renderer?.screen ?? canvas?.app?.screen;
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
    globalPoint.x = (clientPoint.x - rect.left) * Number(screen?.width ?? rect.width) / rect.width;
    globalPoint.y = (clientPoint.y - rect.top) * Number(screen?.height ?? rect.height) / rect.height;
  }
  for (const control of controls.toReversed?.() ?? [...controls].reverse()) {
    if (!visibleDoorControl(control)) continue;
    const local = control.worldTransform?.applyInverse?.(globalPoint, { x: 0, y: 0 });
    if (local && control.hitArea?.contains?.(local.x, local.y)) return control;
  }
  return null;
}

export function invokeNativeDoorControl(control) {
  if (!visibleDoorControl(control) || typeof control?._onMouseDown !== "function") return false;
  return control._onMouseDown({ button: 0, stopPropagation() {} });
}

function doorAncestor(target, controls) {
  for (let current = target; current; current = current.parent) {
    if (controls.includes(current)) return visibleDoorControl(current) ? current : null;
  }
  return null;
}

function visibleDoorControl(control) {
  if (!control || control.visible === false || control.renderable === false || control.destroyed) return false;
  for (let parent = control.parent; parent; parent = parent.parent) {
    if (parent.visible === false || parent.renderable === false) return false;
  }
  try {
    return control.isVisible !== false;
  } catch {
    return false;
  }
}

function moveCamera(canvas, options, animated = false) {
  if (animated && typeof canvas.animatePan === "function") {
    const movement = canvas.animatePan({ ...options, duration: 120 });
    movement?.catch?.((error) => console.warn("VE Mobile | Canvas camera animation failed", error));
    return;
  }
  canvas.pan(options);
}

function usableCanvas(canvas) {
  return canvas?.ready && canvas?.stage && typeof canvas.pan === "function" ? canvas : null;
}

function canvasView(canvas) {
  return {
    x: Number(canvas.stage.pivot?.x ?? 0),
    y: Number(canvas.stage.pivot?.y ?? 0),
    scale: Number(canvas.stage.scale?.x ?? 1) || 1
  };
}

function canvasScreenCenter(canvas) {
  const screen = canvas.app?.renderer?.screen;
  const width = Number(screen?.width ?? globalThis.innerWidth ?? 0);
  const height = Number(screen?.height ?? globalThis.innerHeight ?? 0);
  return { x: width / 2, y: height / 2 };
}

function point(event) {
  return { x: Number(event.clientX), y: Number(event.clientY) };
}

function midpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
