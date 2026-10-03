import { localizeFoundry } from "./localization.mjs";
import { updateFoundryCursorAtClientPoint } from "./scene-gateway.mjs";
import { pulseHoldHaptic } from "../ui/haptics.mjs";
import { actorSourceUuid } from "./character-source.mjs";

export class MovementError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "MovementError";
    this.code = code;
  }
}

export const TOKEN_DOUBLE_TAP_MS = 250;
export const TOKEN_DOUBLE_TAP_DISTANCE = 24;
export const TOKEN_HOLD_MS = 500;
export const TOKEN_HOLD_MOVE_THRESHOLD = 8;
const TOKEN_GHOST_CLICK_MS = 750;

/** Permission-checked boundary for native Foundry token movement. */
export function createFoundryTokenMovementGateway({
  getCanvas = () => globalThis.canvas,
  getConfig = () => globalThis.CONFIG,
  getConst = () => globalThis.CONST,
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getConnectionGeneration = () => 0,
  readRecenterAfterMove = () => false,
  canApplyAutomaticCamera = () => true,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  createPointerEvent = (type, init) => new PointerEvent(type, init),
  haptic = pulseHoldHaptic,
  trace = () => {}
} = {}) {
  const moving = new Set();
  const historyPreviews = new Map();
  let lastTokenTap = null;
  let pendingSelection = null;

  const cancelPendingSelection = () => {
    const pending = pendingSelection;
    if (!pending) return;
    pendingSelection = null;
    clearTimeoutFn(pending.timer);
    pending.resolve(Object.freeze({ ok: true, action: "none" }));
  };

  const selectTappedToken = async ({ sceneId, tokenId, actorId }, expectedSession) => {
    const game = getGame();
    const canvas = getCanvas();
    assertSession(game, expectedSession, getConnectionGeneration);
    if (!canvas?.ready || String(canvas.scene?.id ?? "") !== sceneId) {
      throw new MovementError("STALE_SCENE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheActiveSceneHasChanged", "The active scene has changed."));
    }
    const token = canvas.scene.tokens?.get?.(tokenId);
    const object = Array.from(canvas.tokens?.placeables ?? []).find((entry) => entry?.document === token);
    if (!token || String(token.actorId ?? token.actor?.id ?? "") !== actorId || !object || !tokenIsVisible(object, token, game.user)) {
      throw new MovementError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.ThatTokenIsNoLongerAvailable", "That token is no longer available."));
    }
    if (!canControlToken(token, game.user)) throw new MovementError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.YouNoLongerControlThisToken", "You no longer control this token."));
    if (typeof object.control !== "function") throw new MovementError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.ThisTokenCannotBeSelected", "This token cannot be selected."));
    if (!object.controlled) await Promise.resolve(object.control({ releaseOthers: true }));
    assertSession(game, expectedSession, getConnectionGeneration);
    return Object.freeze({ ok: true, action: "selected", tokenId });
  };

  const resolveRequest = (request, expectedSession = {}) => {
    const game = getGame();
    const canvas = getCanvas();
    assertSession(game, expectedSession, getConnectionGeneration);
    const sceneId = identifier(request.sceneId, "sceneId");
    const tokenId = identifier(request.tokenId, "tokenId");
    const actorId = identifier(request.actorId, "actorId");
    const scene = canvas?.scene ?? game?.scenes?.current ?? null;
    if (!scene || scene.id !== sceneId) throw new MovementError("STALE_SCENE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheActiveSceneHasChanged", "The active scene has changed."));
    const token = scene.tokens?.get?.(tokenId) ?? Array.from(scene.tokens ?? []).find((entry) => entry.id === tokenId);
    if (!token || token.actorId !== actorId) throw new MovementError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheSelectedTokenIsNoLongerAvailable", "The selected token is no longer available."));
    if (!canControlToken(token, game.user)) throw new MovementError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.YouNoLongerHavePermissionToMoveThisToken", "You no longer have permission to move this token."));
    if (game.paused && !game.user.isGM) throw new MovementError("PAUSED", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheGameIsPaused", "The game is paused."));
    return { canvas, game, scene, token, tokenId };
  };

  const tap = async (request, expectedSession = {}, { deferSelection = false } = {}) => {
    const game = getGame();
    const canvas = getCanvas();
    assertSession(game, expectedSession, getConnectionGeneration);
    const sceneId = identifier(request.sceneId, "sceneId");
    if (!canvas?.ready || String(canvas.scene?.id ?? "") !== sceneId) {
      throw new MovementError("STALE_SCENE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheActiveSceneHasChanged", "The active scene has changed."));
    }
    const clientX = coordinate(request.clientX, "clientX");
    const clientY = coordinate(request.clientY, "clientY");
    const object = tokenAtClientPoint(canvas, clientX, clientY, game.user);
    if (!object?.document) {
      cancelPendingSelection();
      lastTokenTap = null;
      await closeTokenHud(canvas);
      setNativeTokenHudActive(getDocument(), false);
      return Object.freeze({ ok: true, action: "none" });
    }
    const token = object.document;
    const tokenId = String(token.id);
    const hud = canvas.hud?.token;
    const owned = canControlToken(token, game.user);
    if (owned && (hud?.object === object || object.hasActiveHUD)) {
      cancelPendingSelection();
      lastTokenTap = null;
      await closeTokenHud(canvas);
      setNativeTokenHudActive(getDocument(), false);
      return Object.freeze({ ok: true, action: "hud-closed", tokenId });
    }
    if (owned && hud?.object && hud.object !== object) {
      await closeTokenHud(canvas);
      setNativeTokenHudActive(getDocument(), false);
    }

    const time = now();
    const repeated = lastTokenTap?.tokenId === tokenId
      && lastTokenTap.sceneId === sceneId
      && lastTokenTap.actorId === String(token.actorId ?? token.actor?.id ?? "")
      && lastTokenTap.worldId === String(game.world?.id ?? "")
      && lastTokenTap.userId === String(game.user?.id ?? "")
      && time - lastTokenTap.time <= TOKEN_DOUBLE_TAP_MS
      && Math.hypot(clientX - lastTokenTap.clientX, clientY - lastTokenTap.clientY) <= TOKEN_DOUBLE_TAP_DISTANCE;
    cancelPendingSelection();
    if (repeated) {
      lastTokenTap = null;
      return toggleTokenTarget(object, token, game.user);
    }
    lastTokenTap = Object.freeze({ sceneId, tokenId, actorId: String(token.actorId ?? token.actor?.id ?? ""),
      worldId: String(game.world?.id ?? ""), userId: String(game.user?.id ?? ""), time, clientX, clientY });
    if (!owned) return Object.freeze({ ok: true, action: "hovered", tokenId });
    const selection = { sceneId, tokenId, actorId: String(token.actorId ?? token.actor?.id ?? "") };
    if (!deferSelection || object.controlled) return selectTappedToken(selection, expectedSession);
    return new Promise((resolve, reject) => {
      const pending = { timer: null, resolve, reject, sceneId, tokenId, actorId: selection.actorId };
      pendingSelection = pending;
      pending.timer = setTimeoutFn(() => {
        if (pendingSelection !== pending) return;
        pendingSelection = null;
        if (lastTokenTap?.tokenId === tokenId && lastTokenTap.time === time) lastTokenTap = null;
        void selectTappedToken(selection, expectedSession).then(resolve, reject);
      }, TOKEN_DOUBLE_TAP_MS + 1);
    });
  };

  const bindTouch = (surface, scope, onResult = () => {}, onError = () => {}, expectedSession = {}) => {
    const eventWindow = surface?.ownerDocument?.defaultView ?? globalThis.window ?? surface;
    let active = null;
    let contextRelease = null;
    let suppressClickUntil = 0;
    let recoverContextUntil = 0;

    const own = (event) => {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      event.stopPropagation?.();
    };
    const clearTimer = (gesture = active) => {
      if (gesture?.timer === null || gesture?.timer === undefined) return;
      clearTimeoutFn(gesture.timer);
      gesture.timer = null;
    };
    const releaseCapture = (gesture) => {
      try {
        if (surface.hasPointerCapture?.(gesture.pointerId)) surface.releasePointerCapture(gesture.pointerId);
      } catch {}
    };
    const currentOwnedObject = (gesture) => {
      const game = getGame();
      const canvas = getCanvas();
      assertSession(game, expectedSession, getConnectionGeneration);
      if (!canvas?.ready || String(canvas.scene?.id ?? "") !== gesture.sceneId) return null;
      const object = Array.from(canvas.tokens?.placeables ?? []).find((entry) => String(entry?.document?.id ?? "") === gesture.tokenId);
      if (!object?.document || !tokenIsVisible(object, object.document, game.user) || !canControlToken(object.document, game.user)) return null;
      return object;
    };
    const report = (result) => {
      try { onResult(result); } catch {}
    };
    const fail = (error) => {
      try { onError(error); } catch {}
    };
    const record = (phase, gesture = active, extra = {}) => {
      try {
        trace(Object.freeze({
          phase,
          pointerId: gesture?.pointerId,
          tokenId: gesture?.tokenId,
          gesturePhase: gesture?.phase,
          ...extra
        }));
      } catch {}
    };
    const nativePointerTarget = () => {
      const canvas = getCanvas();
      return canvas?.app?.renderer?.events?.domElement ?? canvas?.app?.renderer?.canvas ?? canvas?.app?.canvas ?? canvas?.app?.view;
    };
    const arm = (gesture = active) => {
      if (!gesture || gesture !== active || gesture.phase !== "pending") return false;
      clearTimer(gesture);
      let object;
      try { object = currentOwnedObject(gesture); } catch (error) { fail(error); }
      if (!object) {
        gesture.phase = "cancelled";
        record("hold-rejected", gesture, { reason: "token-unavailable" });
        return false;
      }
      if (!object.controlled && typeof object.control === "function") object.control({ releaseOthers: true });
      gesture.phase = "armed";
      gesture.object = object;
      cancelPendingSelection();
      lastTokenTap = null;
      haptic?.();
      record("hold-armed", gesture);
      report(Object.freeze({ ok: true, action: "hold-armed", tokenId: gesture.tokenId }));
      return true;
    };
    const armIfElapsed = (gesture = active) => {
      if (gesture?.phase === "pending" && now() - gesture.startedAt >= TOKEN_HOLD_MS) arm(gesture);
      return gesture?.phase === "armed";
    };
    const dispatchNative = (type, point, buttons) => {
      const target = nativePointerTarget();
      if (!target?.dispatchEvent) return false;
      return target.dispatchEvent(createPointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: surface?.ownerDocument?.defaultView ?? globalThis.window,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        clientX: Number(point.clientX),
        clientY: Number(point.clientY),
        screenX: Number(point.screenX) || 0,
        screenY: Number(point.screenY) || 0,
        button: type === "pointermove" ? -1 : 0,
        buttons
      }));
    };
    const updateMovement = (gesture, point) => {
      gesture.last = point;
      const distance = Math.hypot(point.clientX - gesture.start.clientX, point.clientY - gesture.start.clientY);
      gesture.maxDistance = Math.max(gesture.maxDistance, distance);
      if (gesture.maxDistance >= TOKEN_HOLD_MOVE_THRESHOLD) gesture.movedBeyondThreshold = true;
      return distance;
    };
    const startDrag = (gesture = active) => {
      if (!gesture || gesture !== active || gesture.phase !== "armed" || !gesture.movedBeyondThreshold) return false;
      let object;
      try { object = currentOwnedObject(gesture); } catch (error) { fail(error); }
      if (!object) {
        cancelActive("token-unavailable");
        return false;
      }
      if (!nativePointerTarget()?.dispatchEvent) {
        fail(new MovementError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.FoundrySNativeTokenDragSurfaceIsUnavailable", "Foundry's native token drag surface is unavailable.")));
        cancelActive("drag-surface-unavailable");
        return false;
      }
      gesture.object = object;
      updateFoundryCursorAtClientPoint(getCanvas(), { x: gesture.start.clientX, y: gesture.start.clientY }, createPointerEvent);
      dispatchNative("pointerdown", gesture.start, 1);
      gesture.phase = "dragging";
      setNativeMeasurementActive(getDocument(), true);
      dispatchNative("pointermove", gesture.last, 1);
      record("drag-started", gesture, { maxDistance: gesture.maxDistance });
      report(Object.freeze({ ok: true, action: "drag-started", tokenId: gesture.tokenId }));
      return true;
    };
    const cancelActive = (reason = "cancelled") => {
      const gesture = active;
      if (!gesture) return;
      active = null;
      recoverContextUntil = gesture.owned && !gesture.movedBeyondThreshold
        && (gesture.phase === "pending" || gesture.phase === "armed")
        && (reason === "pointercancel" || reason === "lostpointercapture")
        ? now() + TOKEN_GHOST_CLICK_MS
        : 0;
      clearTimer(gesture);
      if (gesture.phase === "dragging") {
        try { gesture.object?.mouseInteractionManager?.cancel?.(); } catch {}
        setNativeMeasurementActive(getDocument(), false);
      }
      releaseCapture(gesture);
      cancelPendingSelection();
      lastTokenTap = null;
      suppressClickUntil = now() + TOKEN_GHOST_CLICK_MS;
      record("touch-cancelled", gesture, { reason });
      report(Object.freeze({ ok: true, action: "touch-cancelled", reason, tokenId: gesture.tokenId }));
    };
    const openHud = (gesture) => {
      cancelPendingSelection();
      record("hud-requested", gesture);
      void (async () => {
        const object = currentOwnedObject(gesture);
        setNativeTokenHudActive(getDocument(), true);
        let opened = false;
        try {
          opened = await openNativeTokenHud(getCanvas(), object);
          lastTokenTap = null;
        } finally {
          if (opened && scope?.disposed) {
            await closeTokenHud(getCanvas());
            opened = false;
          }
          setNativeTokenHudActive(getDocument(), opened);
        }
        record(opened ? "hud-opened" : "hud-closed", gesture);
        report(Object.freeze({ ok: true, action: opened ? "hud-opened" : "hud-closed", tokenId: gesture.tokenId }));
      })().catch((error) => {
        record("hud-error", gesture, { message: String(error?.message ?? error) });
        fail(error);
      });
    };

    const pointerDown = (event) => {
      if (active) {
        if (active.pointerId !== event.pointerId && active.phase === "pending") cancelActive("pinch-before-hold");
        else if (active.phase === "armed" || active.phase === "dragging") own(event);
        return;
      }
      if ((event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;
      if (event.target?.closest?.("button, select, [data-ve-scene-control], [data-ve-template-control]")) return;
      const canvas = getCanvas();
      const game = getGame();
      try { assertSession(game, expectedSession, getConnectionGeneration); } catch (error) { fail(error); return; }
      const object = tokenAtClientPoint(canvas, Number(event.clientX), Number(event.clientY), game.user);
      if (!object?.document) {
        cancelPendingSelection();
        record("pointerdown-missed", null, { clientX: Number(event.clientX), clientY: Number(event.clientY) });
        return;
      }
      // A second press can become a double tap, hold, or drag. None should
      // allow the first tap's deferred selection to fire in the meantime.
      cancelPendingSelection();
      // The token is only a candidate until the hold arms. Scene's listener on
      // this surface must receive the down event to establish a native camera
      // gesture, even when the pointer begins over a token.
      event.preventDefault?.();
      const owned = canControlToken(object.document, game.user);
      active = {
        pointerId: event.pointerId,
        pointerType: String(event.pointerType ?? ""),
        tokenId: String(object.document.id),
        sceneId: String(canvas.scene?.id ?? ""),
        actorId: String(object.document.actorId ?? object.document.actor?.id ?? ""),
        owned,
        phase: "pending",
        startedAt: now(),
        start: clientEventPoint(event),
        last: clientEventPoint(event),
        maxDistance: 0,
        movedBeyondThreshold: false,
        timer: null,
        object: null
      };
      recoverContextUntil = 0;
      contextRelease = null;
      record("pointerdown", active, { owned });
      try { surface.setPointerCapture?.(event.pointerId); } catch {}
      if (owned) {
        const gesture = active;
        active.timer = setTimeoutFn(() => {
          arm(gesture);
        }, TOKEN_HOLD_MS);
        record("timer-armed", active, { durationMs: TOKEN_HOLD_MS });
      }
    };
    const pointerMove = (event) => {
      if (!active || active.pointerId !== event.pointerId) return;
      const gesture = active;
      updateMovement(gesture, clientEventPoint(event));
      if (gesture.phase === "pending" && gesture.movedBeyondThreshold) {
        clearTimer(gesture);
        gesture.phase = "scene-pan";
        cancelPendingSelection();
        lastTokenTap = null;
        record("movement-before-hold", gesture, { maxDistance: gesture.maxDistance });
        return;
      }
      armIfElapsed(gesture);
      if (gesture.phase === "pending" || gesture.phase === "scene-pan") return;
      own(event);
      if (startDrag(gesture)) return;
      if (gesture.phase === "dragging") {
        try {
          if (!currentOwnedObject(gesture)) return cancelActive("token-unavailable");
        } catch (error) {
          fail(error);
          return cancelActive("session-changed");
        }
        dispatchNative("pointermove", gesture.last, 1);
      }
    };
    const pointerUp = (event) => {
      if (!active || active.pointerId !== event.pointerId) return;
      // Scene must see the release to clear its point and pinch state. A
      // consumed token tap is marked defaultPrevented so Scene skips its tap.
      event.preventDefault?.();
      const gesture = active;
      updateMovement(gesture, clientEventPoint(event));
      if (!gesture.movedBeyondThreshold) armIfElapsed(gesture);
      active = null;
      clearTimer(gesture);
      releaseCapture(gesture);
      suppressClickUntil = now() + TOKEN_GHOST_CLICK_MS;
      const point = gesture.last;
      if (gesture.phase === "dragging") {
        try {
          if (!currentOwnedObject(gesture)) {
            active = gesture;
            return cancelActive("token-unavailable");
          }
        } catch (error) {
          fail(error);
          active = gesture;
          return cancelActive("session-changed");
        }
        dispatchNative("pointerup", point, 0);
        setNativeMeasurementActive(getDocument(), false);
        cancelPendingSelection();
        lastTokenTap = null;
        report(Object.freeze({ ok: true, action: "drag-dropped", tokenId: gesture.tokenId }));
        return;
      }
      if (gesture.phase === "armed" && !gesture.movedBeyondThreshold) {
        contextRelease = null;
        openHud(gesture);
        return;
      }
      if (gesture.movedBeyondThreshold) {
        contextRelease = null;
        cancelPendingSelection();
        lastTokenTap = null;
        record("movement-released-unarmed", gesture, { maxDistance: gesture.maxDistance });
        return;
      }
      if (gesture.phase !== "pending") return;
      updateFoundryCursorAtClientPoint(getCanvas(), { x: point.clientX, y: point.clientY }, createPointerEvent);
      void tap({ sceneId: gesture.sceneId, clientX: point.clientX, clientY: point.clientY }, expectedSession, { deferSelection: true }).then(report, fail);
    };
    const contextMenu = (event) => {
      if (event.target?.closest?.("button, select, [data-ve-scene-control], [data-ve-template-control]")) return;
      let gesture = active;
      if (!gesture) {
        const time = now();
        if (time <= suppressClickUntil && time > recoverContextUntil) {
          own(event);
          return;
        }
        const canvas = getCanvas();
        const game = getGame();
        try { assertSession(game, expectedSession, getConnectionGeneration); } catch (error) { fail(error); return; }
        const object = tokenAtClientPoint(canvas, Number(event.clientX), Number(event.clientY), game.user);
        if (!object?.document || !canControlToken(object.document, game.user)) return;
        gesture = {
          pointerId: event.pointerId,
          pointerType: String(event.pointerType ?? ""),
          tokenId: String(object.document.id),
          sceneId: String(canvas.scene?.id ?? ""),
          actorId: String(object.document.actorId ?? object.document.actor?.id ?? ""),
          owned: true,
          phase: "pending",
          startedAt: now(),
          start: clientEventPoint(event),
          last: clientEventPoint(event),
          maxDistance: 0,
          movedBeyondThreshold: false,
          timer: null,
          object: null
        };
        active = gesture;
        recoverContextUntil = 0;
        record("contextmenu-recovered", gesture);
      }
      if (!gesture.owned || gesture.phase === "dragging") return;
      own(event);
      updateMovement(gesture, clientEventPoint(event));
      record("native-contextmenu", gesture);
      if (gesture.movedBeyondThreshold) {
        contextRelease = null;
        cancelActive("contextmenu-after-movement");
        return;
      }
      if (gesture.phase === "pending") arm(gesture);
      if (gesture.phase !== "armed") return;
      clearTimer(gesture);
      if (gesture.pointerType !== "touch" && event.pointerType !== "touch") {
        active = null;
        releaseCapture(gesture);
        suppressClickUntil = now() + TOKEN_GHOST_CLICK_MS;
        openHud(gesture);
        return;
      }
      gesture.nativeContextMenu = true;
      record("contextmenu-armed", gesture);
    };
    const pointerCancel = () => {
      const gesture = active;
      if (gesture?.phase === "armed" && gesture.nativeContextMenu && !gesture.movedBeyondThreshold) {
        active = null;
        clearTimer(gesture);
        releaseCapture(gesture);
        contextRelease = gesture;
        suppressClickUntil = now() + TOKEN_GHOST_CLICK_MS;
        record("contextmenu-awaiting-release", gesture);
        return;
      }
      cancelActive("pointercancel");
    };
    const touchEnd = (event) => {
      const gesture = contextRelease;
      if (!gesture) return;
      contextRelease = null;
      own(event);
      openHud(gesture);
    };
    const touchCancel = () => { contextRelease = null; };
    const suppressClick = (event) => {
      if (event.target?.closest?.("button, select, [data-ve-scene-control], [data-ve-template-control]")) return;
      if (now() > suppressClickUntil) return;
      own(event);
    };

    scope.listen(surface, "pointerdown", pointerDown, { capture: true, passive: false });
    scope.listen(eventWindow, "pointermove", pointerMove, { capture: true, passive: false });
    scope.listen(eventWindow, "pointerup", pointerUp, { capture: true, passive: false });
    scope.listen(eventWindow, "pointercancel", pointerCancel, { capture: true });
    scope.listen(eventWindow, "touchend", touchEnd, { capture: true, passive: false });
    scope.listen(eventWindow, "touchcancel", touchCancel, { capture: true, passive: true });
    scope.listen(surface, "lostpointercapture", () => cancelActive("lostpointercapture"), { capture: true });
    scope.listen(surface, "contextmenu", contextMenu, { capture: true, passive: false });
    scope.listen(surface, "click", suppressClick, { capture: true });
    scope.hook?.("canvasTearDown", () => { cancelActive("canvas-teardown"); cancelPendingSelection(); });
    scope.hook?.("renderTokenHUD", () => setNativeTokenHudActive(getDocument(), true));
    scope.hook?.("closeTokenHUD", () => setNativeTokenHudActive(getDocument(), false));
    scope.hook?.("canvasReady", (nextCanvas) => {
      if (pendingSelection && String(nextCanvas?.scene?.id ?? "") !== pendingSelection.sceneId) cancelPendingSelection();
      if (active && String(nextCanvas?.scene?.id ?? "") !== active.sceneId) cancelActive("scene-changed");
    });
    scope.hook?.("deleteToken", (document) => {
      if (pendingSelection?.tokenId === String(document?.id ?? "")) cancelPendingSelection();
      if (active?.tokenId === String(document?.id ?? "")) cancelActive("token-deleted");
    });
    scope.hook?.("controlToken", (object) => {
      if (pendingSelection) cancelPendingSelection();
      if (active?.phase === "dragging" || active?.tokenId !== String(object?.document?.id ?? "")) return;
      if (!canControlToken(object.document, getGame()?.user)) cancelActive("ownership-changed");
    });
    scope.hook?.("updateToken", (document) => {
      if (pendingSelection?.tokenId === String(document?.id ?? "") && !canControlToken(document, getGame()?.user)) cancelPendingSelection();
      if (active?.tokenId !== String(document?.id ?? "")) return;
      if (!canControlToken(document, getGame()?.user)) cancelActive("ownership-changed");
    });
    scope.hook?.("updateActor", (actor) => {
      if (!active?.actorId || active.actorId !== String(actor?.id ?? "")) return;
      try {
        if (!currentOwnedObject(active)) cancelActive("ownership-changed");
      } catch {
        cancelActive("session-changed");
      }
    });
    scope.own(() => {
      cancelActive("scope-disposed");
      cancelPendingSelection();
      contextRelease = null;
      setNativeMeasurementActive(getDocument(), false);
      setNativeTokenHudActive(getDocument(), false);
      void closeTokenHud(getCanvas()).catch((error) => {
        console.warn("VE Mobile | Native Token HUD could not be closed during Scene cleanup", error);
      });
    });
    return Object.freeze({ cancel: cancelActive, get phase() { return active?.phase ?? "idle"; } });
  };

  return Object.freeze({
    watchTokenTransforms(scope, selectedActorSourceUuid) {
      // Receiving clients never see another client's pre-operation hooks.
      // Remember local control provenance while the token still exists, using
      // exact scene/document UUIDs rather than actor IDs or prototype tokens.
      const provenance = new Map();
      let active = true;
      const userId = String(getGame()?.user?.id ?? "");
      const worldId = String(getGame()?.world?.id ?? "");
      const controlled = token => Array.from(getCanvas()?.tokens?.controlled ?? []).some(object => object.document === token);
      const remember = token => {
        if (!token?.uuid || !controlled(token) || !canControlToken(token, getGame()?.user)) return;
        provenance.set(token.uuid, { source: actorSourceUuid(token.actor), sceneId: String(token.parent?.id ?? "") });
      };
      for (const object of getCanvas()?.tokens?.controlled ?? []) remember(object.document);
      const restoreControl = (token, previousTokenUuid, previousSource) => {
        queueMicrotask(() => {
          const canvas = getCanvas();
          if (!active || !token || !canvas?.ready || String(canvas.scene?.id ?? "") !== String(token.parent?.id ?? "")) return;
          if (String(getGame()?.user?.id ?? "") !== userId || String(getGame()?.world?.id ?? "") !== worldId) return;
          if (!collectionValues(canvas.scene?.tokens).includes(token)) return;
          if (![previousSource, actorSourceUuid(token.actor)].includes(selectedActorSourceUuid())) return;
          const current = Array.from(canvas.tokens?.controlled ?? []);
          if (token.object?.controlled && current.some(object => object === token.object)) { remember(token); return; }
          if (current.some(object => object.document !== token && object.document?.uuid !== previousTokenUuid)) return;
          if (!canControlToken(token, getGame()?.user) || token.hidden || token.object?.visible === false) return;
          if (typeof token.object?.control !== "function") return;
          try {
            void Promise.resolve(token.object.control({ releaseOthers: true })).then(() => { if (active) remember(token); }).catch(error => {
              console.warn("VE Mobile | Could not restore transformed token control", error);
            });
          } catch (error) { console.warn("VE Mobile | Could not restore transformed token control", error); }
        });
      };
      scope.hook("controlToken", (object, isControlled) => {
        const token = object?.document;
        if (isControlled) { remember(token); return; }
        const previous = provenance.get(token?.uuid);
        // Native deletion releases the placeable AFTER removing its document.
        // Actor swaps may likewise release after changing the source. Preserve
        // just those event-order cases; an ordinary manual release revokes us.
        if (previous && collectionValues(token?.parent?.tokens).includes(token) && previous.source === actorSourceUuid(token.actor)) provenance.delete(token.uuid);
      });
      scope.hook("preUpdateToken", token => remember(token));
      scope.hook("updateToken", token => {
        const previous = provenance.get(token?.uuid);
        if (previous && previous.source !== actorSourceUuid(token.actor) && selectedActorSourceUuid() === previous.source) {
          restoreControl(token, token.uuid, previous.source);
        }
        remember(token);
      });
      scope.hook("preDeleteToken", token => remember(token));
      scope.hook("deleteToken", (token, options) => {
        const previous = provenance.get(token?.uuid);
        provenance.delete(token?.uuid);
        if (!previous || previous.source !== selectedActorSourceUuid() || previous.sceneId !== String(getCanvas()?.scene?.id ?? "")) return;
        const replacementUuid = String(options?.replacements?.[token.id] ?? "");
        const replacement = collectionValues(getCanvas()?.scene?.tokens).find(entry => entry.uuid === replacementUuid);
        if (replacement && replacement.parent?.id === token.parent?.id) restoreControl(replacement, token.uuid, previous.source);
      });
      scope.hook("canvasReady", () => { for (const object of getCanvas()?.tokens?.controlled ?? []) remember(object.document); });
      scope.hook("canvasTearDown", () => provenance.clear());
      scope.own(() => { active = false; provenance.clear(); });
    },
    snapshot() {
      const game = getGame();
      const scene = getCanvas()?.scene ?? game?.scenes?.current ?? null;
      const tokens = collectionValues(scene?.tokens)
        .filter((token) => canControlToken(token, game?.user))
        .map((token) => tokenRecord(token, game, getConfig(), getCanvas()?.tokens?.controlled))
        .sort((left, right) => left.name.localeCompare(right.name));
      return Object.freeze({
        tokens: Object.freeze(tokens),
        targetCount: targetCount(game?.user),
        releaseLabel: localize(game, "VEMOBILE.Scene.ReleaseToken", "Release token")
      });
    },

    async controlActor(request, expectedSession = {}) {
      const game = getGame();
      const canvas = getCanvas();
      assertSession(game, expectedSession, getConnectionGeneration);
      const sceneId = identifier(request.sceneId, "sceneId");
      const actorId = identifier(request.actorId, "actorId");
      const scene = canvas?.scene ?? game?.scenes?.current ?? null;
      if (!scene || String(scene.id ?? "") !== sceneId) {
        return Object.freeze({ ok: true, action: "none", reason: "no-current-scene" });
      }
      const candidates = collectionValues(scene.tokens)
        .filter((token) => String(token?.actorId ?? "") === actorId && !token?.hidden && canControlToken(token, game.user) && token.object?.visible !== false)
        .sort((left, right) => Number(Boolean(right.object?.controlled)) - Number(Boolean(left.object?.controlled))
          || String(left.id ?? "").localeCompare(String(right.id ?? "")));
      const token = candidates[0];
      if (!token?.object || typeof token.object.control !== "function") {
        return Object.freeze({ ok: true, action: "none", reason: "no-controllable-token" });
      }
      if (!token.object.controlled) await Promise.resolve(token.object.control({ releaseOthers: true }));
      assertSession(game, expectedSession, getConnectionGeneration);
      return Object.freeze({ ok: true, action: token.object.controlled ? "selected" : "requested", tokenId: String(token.id ?? "") });
    },

    async focus(request, expectedSession = {}) {
      const cameraDetails = {
        kind: request.cameraReason ?? "token-focus",
        sceneId: String(request.sceneId ?? ""),
        tokenId: String(request.tokenId ?? ""),
        connectionGeneration: expectedSession.connectionGeneration
      };
      if (!canApplyAutomaticCamera(cameraDetails)) {
        trace({ action: "camera-suppressed", caller: "token-movement-gateway.focus", reason: "explicit-camera-intent", ...cameraDetails });
        return Object.freeze({ ok: true, action: "suppressed", reason: "explicit-camera-intent" });
      }
      const { canvas, token } = resolveRequest(request, expectedSession);
      const object = token.object;
      if (object && !object.controlled && typeof object.control === "function") {
        trace({
          action: "control",
          caller: "token-movement-gateway.focus",
          reason: request.cameraReason ?? "token-focus",
          tokenId: String(token.id ?? ""),
          connectionGeneration: expectedSession.connectionGeneration
        });
        await Promise.resolve(object.control({ releaseOthers: true }));
      }
      if (!canApplyAutomaticCamera(cameraDetails)) {
        trace({ action: "camera-suppressed", caller: "token-movement-gateway.focus", reason: "explicit-camera-intent", ...cameraDetails });
        return Object.freeze({ ok: true, action: "suppressed", reason: "explicit-camera-intent" });
      }
      const target = cameraTargetForToken(canvas, token, viewportBounds(request.viewport));
      trace({
        action: typeof canvas?.animatePan === "function" ? "animatePan" : "pan",
        caller: "token-movement-gateway.focus",
        reason: request.cameraReason ?? "token-focus",
        tokenId: String(token.id ?? ""),
        target,
        duration: 150,
        preservesZoom: true,
        connectionGeneration: expectedSession.connectionGeneration,
        controlled: Boolean(object?.controlled)
      });
      return focusToken(canvas, token, true, viewportBounds(request.viewport));
    },

    tap,
    bindTouch,

    async release(request, expectedSession = {}) {
      const game = getGame();
      const canvas = getCanvas();
      assertSession(game, expectedSession, getConnectionGeneration);
      const sceneId = identifier(request.sceneId, "sceneId");
      const tokenId = identifier(request.tokenId, "tokenId");
      const actorId = identifier(request.actorId, "actorId");
      const scene = canvas?.scene ?? game?.scenes?.current ?? null;
      if (!canvas?.ready || !scene || String(scene.id ?? "") !== sceneId) {
        throw new MovementError("STALE_SCENE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheActiveSceneHasChanged", "The active scene has changed."));
      }
      const token = scene.tokens?.get?.(tokenId) ?? collectionValues(scene.tokens).find((entry) => String(entry?.id ?? "") === tokenId);
      if (!token || String(token.actorId ?? token.actor?.id ?? "") !== actorId) {
        throw new MovementError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheSelectedTokenIsNoLongerAvailable", "The selected token is no longer available."));
      }
      if (!canControlToken(token, game.user)) {
        throw new MovementError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.YouNoLongerHavePermissionToControlThisToken", "You no longer have permission to control this token."));
      }
      const object = token.object;
      if (!object?.controlled) return Object.freeze({ ok: true, action: "none", tokenId });
      if (typeof object.release !== "function") {
        throw new MovementError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.ThisTokenCannotBeReleased", "This token cannot be released."));
      }
      await Promise.resolve(object.release());
      assertSession(game, expectedSession, getConnectionGeneration);
      return Object.freeze({ ok: true, action: object.controlled ? "requested" : "released", tokenId });
    },

    async target(request, expectedSession = {}) {
      const game = getGame();
      const canvas = getCanvas();
      assertSession(game, expectedSession, getConnectionGeneration);
      const sceneId = identifier(request.sceneId, "sceneId");
      if (!canvas?.ready || canvas.scene?.id !== sceneId) {
        throw new MovementError("STALE_SCENE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheActiveSceneHasChanged", "The active scene has changed."));
      }
      const object = tokenAtClientPoint(canvas, coordinate(request.clientX, "clientX"), coordinate(request.clientY, "clientY"), game.user);
      if (!object?.document) return Object.freeze({ ok: true, action: "none" });
      return toggleTokenTarget(object, object.document, game.user);
    },

    async clearTargets(expectedSession = {}) {
      const game = getGame();
      assertSession(game, expectedSession, getConnectionGeneration);
      const targets = Array.from(game.user?.targets ?? []);
      await Promise.all(targets.map(async (object) => {
        if (typeof object?.setTarget === "function") await Promise.resolve(object.setTarget(false, { releaseOthers: false }));
      }));
      return Object.freeze({ ok: true, cleared: targets.length });
    },

    previewHistory(request, expectedSession = {}) {
      const tokenId = identifier(request.tokenId, "tokenId");
      if (!request.active) {
        const preview = historyPreviews.get(tokenId);
        historyPreviews.delete(tokenId);
        if (preview?.applied && preview.object?.hover && typeof preview.object._onHoverOut === "function") {
          preview.object._onHoverOut({ type: "pointerout" });
        }
        return Object.freeze({ ok: true, shown: false });
      }

      const { game, scene, token } = resolveRequest(request, expectedSession);
      const combat = game.combat;
      const combatant = combat?.combatant;
      const combatSceneId = foundryCombatSceneId(combat);
      const isCurrentTurn = Boolean(combat?.started && combatant)
        && String(combatant.tokenId ?? combatant.token?.id ?? "") === tokenId
        && (!combatSceneId || combatSceneId === String(scene.id));
      if (!isCurrentTurn) return Object.freeze({ ok: true, shown: false, reason: "not-current-combatant" });

      const object = token.object;
      if (!object || typeof object._onHoverIn !== "function") {
        throw new MovementError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.ThisFoundryVersionCannotDisplayTokenMovementHistory", "This Foundry version cannot display token movement history."));
      }
      const wasHovered = Boolean(object.hover);
      object._onHoverIn({ type: "pointerover", buttons: 0 }, { hoverOutOthers: true });
      historyPreviews.set(tokenId, { object, applied: !wasHovered && Boolean(object.hover) });
      return Object.freeze({ ok: true, shown: true });
    },

    async step(request, expectedSession = {}) {
      const dx = direction(request.dx, "dx");
      const dy = direction(request.dy, "dy");
      if (!dx && !dy) throw new MovementError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.AMovementDirectionIsRequired", "A movement direction is required."));
      const viewport = viewportBounds(request.viewport);
      const resolved = resolveRequest(request, expectedSession);
      if (moving.has(resolved.tokenId)) throw new MovementError("MOVEMENT_BUSY", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheTokenIsAlreadyMoving", "The token is already moving."));

      moving.add(resolved.tokenId);
      try {
        const directions = getConst()?.MOVEMENT_DIRECTIONS;
        const target = resolveStepTarget(resolved.token, dx, dy, directions, resolved.scene.grid);
        if (!target) return Object.freeze({ ok: true, moved: false, reason: "blocked" });
        if (typeof resolved.token.move !== "function") {
          throw new MovementError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.ThisFoundryVersionCannotPerformNativeTokenMovement", "This Foundry version cannot perform native token movement."));
        }

        const before = tokenPosition(resolved.token);
        await resolved.token.move({
          ...target,
          action: resolved.token.movementAction,
          snapped: !resolved.scene.grid?.isGridless,
          explicit: false,
          checkpoint: true
        }, { method: "keyboard", pan: false });

        const after = tokenPosition(resolved.token);
        const moved = before.x !== after.x || before.y !== after.y;
        if (moved) {
          const recenterAfterMove = readRecenterAfterMove();
          const cameraAllowed = canApplyAutomaticCamera({
            kind: recenterAfterMove ? "recenter-after-move" : "keep-moved-token-visible",
            sceneId: String(resolved.scene.id ?? ""),
            tokenId: resolved.tokenId,
            connectionGeneration: expectedSession.connectionGeneration
          });
          if (!cameraAllowed) {
            trace({ action: "camera-suppressed", reason: "explicit-camera-intent", tokenId: resolved.tokenId });
          } else if (recenterAfterMove) {
            await settleMovementAnimation(resolved.token.object);
            if (!canApplyAutomaticCamera({
              kind: "recenter-after-move",
              sceneId: String(resolved.scene.id ?? ""),
              tokenId: resolved.tokenId,
              connectionGeneration: expectedSession.connectionGeneration
            })) {
              trace({ action: "camera-suppressed", reason: "explicit-camera-intent", tokenId: resolved.tokenId });
              return Object.freeze({ ok: true, moved, reason: "moved", x: after.x, y: after.y });
            }
            await smoothlyRecenterToken(resolved.canvas, resolved.token, viewport);
          }
          else keepTokenVisible(resolved.canvas, resolved.token, viewport);
        }
        return Object.freeze({ ok: true, moved, reason: moved ? "moved" : "blocked", x: after.x, y: after.y });
      } catch (error) {
        if (error instanceof MovementError) throw error;
        throw new MovementError("MOVEMENT_FAILED", error?.message ?? localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.FoundryRefusedTheTokenMovement", "Foundry refused the token movement."), { cause: error });
      } finally {
        moving.delete(resolved.tokenId);
      }
    }
  });
}

export async function openNativeTokenHud(canvas, object) {
  const hud = canvas?.hud?.token;
  if (!object?.controlled || typeof hud?.bind !== "function") {
    throw new MovementError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.FoundrySTokenHUDIsUnavailable", "Foundry's Token HUD is unavailable."));
  }
  await Promise.resolve(hud.bind(object));
  return hud.object === object || object.hasActiveHUD === true;
}

/** Admit only the native HUD sub-surface currently owned by VE's token gesture. */
export function setNativeTokenHudActive(document, active) {
  document?.body?.classList?.toggle?.("ve-mobile-native-token-hud-active", Boolean(active));
  updateNativeHudHost(document);
}

/** Foundry's TokenRuler owns both its PIXI path and HTML distance labels. */
export function setNativeMeasurementActive(document, active) {
  document?.body?.classList?.toggle?.("ve-mobile-native-measurement-active", Boolean(active));
  updateNativeHudHost(document);
}

function updateNativeHudHost(document) {
  const active = document?.body?.classList?.contains?.("ve-mobile-native-token-hud-active")
    || document?.body?.classList?.contains?.("ve-mobile-native-measurement-active");
  document?.getElementById?.("hud")?.classList?.toggle?.("ve-mobile-native-hud-host", Boolean(active));
}

async function closeTokenHud(canvas) {
  const hud = canvas?.hud?.token;
  if (!hud?.object || typeof hud.close !== "function") return false;
  await Promise.resolve(hud.close());
  return true;
}

/** Resolve one square/hex step through the scene's own grid implementation. */
export function resolveStepTarget(token, dx, dy, directions, suppliedGrid = null) {
  const grid = suppliedGrid ?? token?.parent?.grid;
  if (!token || !directions || !grid || typeof grid.getShiftedPoint !== "function") return null;
  const source = token._source ?? token;
  const position = { x: Number(source.x), y: Number(source.y) };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const snapped = typeof token.getSnappedPosition === "function"
    ? token.getSnappedPosition({
      ...position,
      elevation: token.elevation,
      width: token.width,
      height: token.height,
      shape: token.shape
    })
    : position;
  const mask = directionAxis(dx, position.x, snapped.x, directions.LEFT, directions.RIGHT)
    | directionAxis(dy, position.y, snapped.y, directions.UP, directions.DOWN);
  const biasX = grid.isHexagonal && !grid.columns ? 1 : 0;
  const biasY = grid.isHexagonal && grid.columns ? 1 : 0;
  const shifted = grid.getShiftedPoint({ x: snapped.x + biasX, y: snapped.y + biasY }, mask);
  const x = Math.round(Number(shifted?.x) - biasX);
  const y = Math.round(Number(shifted?.y) - biasY);
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === position.x && y === position.y)) return null;
  return Object.freeze({ x, y });
}

function directionAxis(delta, value, snapped, negative, positive) {
  if (delta < 0) return value <= snapped + 0.5 ? negative : 0;
  if (delta > 0) return value >= snapped - 0.5 ? positive : 0;
  return 0;
}

function direction(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < -1 || parsed > 1) {
    throw new MovementError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.MustBeOr", "{field} must be -1, 0, or 1.", { field: (field) }));
  }
  return parsed;
}

function coordinate(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new MovementError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.MustBeAFiniteNumber", "{field} must be a finite number.", { field: (field) }));
  return parsed;
}

function clientEventPoint(event) {
  return Object.freeze({
    clientX: Number(event?.clientX) || 0,
    clientY: Number(event?.clientY) || 0,
    screenX: Number(event?.screenX) || 0,
    screenY: Number(event?.screenY) || 0
  });
}

function tokenRecord(token, game, config, controlled = []) {
  const action = String(token.movementAction ?? "");
  const configured = config?.Token?.movement?.actions?.[action];
  const labelKey = configured?.label ?? configured?.name ?? action;
  const localized = labelKey && typeof game?.i18n?.localize === "function" ? game.i18n.localize(labelKey) : labelKey;
  return Object.freeze({
    id: String(token.id ?? ""),
    actorId: String(token.actorId ?? token.actor?.id ?? ""),
    ...(actorSourceUuid(token.actor) ? { actorSourceUuid: actorSourceUuid(token.actor) } : {}),
    name: String(token.name ?? token.actor?.name ?? "Token"),
    // Foundry 13 animates prepared TokenDocument.texture through the previous
    // frame after updateToken. Read committed source so this serializable HUD
    // record cannot retain old art until another document/control hook occurs.
    img: String(token._source?.texture?.src ?? token.texture?.src ?? token.actor?.img ?? ""),
    movementAction: action,
    movementLabel: String(localized || action || "Movement"),
    // TokenDocument.object lazily constructs a Token. Reading a plain record
    // must never construct placeables before Canvas dimensions are available.
    controlled: controlled.some((object) => object.document === token)
  });
}

function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Array.from(collection);
}

function targetCount(user) {
  return Number(user?.targets?.size ?? collectionValues(user?.targets).length) || 0;
}

function localize(game, key, fallback) {
  const value = typeof game?.i18n?.localize === "function" ? String(game.i18n.localize(key) ?? "") : "";
  return value && value !== key ? value : fallback;
}

/** Native Foundry targeting shared by Scene long-press and Combat controls. */
export async function toggleTokenTarget(object, token, user) {
  if (!tokenIsVisible(object, token, user) || typeof object.setTarget !== "function") {
    return Object.freeze({ ok: true, action: "none" });
  }
  const targeted = Boolean(user?.targets?.has?.(object) ?? object.isTargeted);
  await Promise.resolve(object.setTarget(!targeted, { releaseOthers: false }));
  return Object.freeze({ ok: true, action: targeted ? "untargeted" : "targeted", tokenId: String(token.id) });
}

function canControlToken(token, user) {
  if (!token || !user) return false;
  try {
    if (user.isGM) return true;
    if (token.hidden) return false;
    if (typeof token.testUserPermission === "function") return token.testUserPermission(user, "OWNER");
    if (typeof token.actor?.testUserPermission === "function") return token.actor.testUserPermission(user, "OWNER");
    return Boolean(token.isOwner);
  } catch {
    return false;
  }
}

function tokenAtClientPoint(canvas, clientX, clientY, user) {
  const renderer = canvas.app?.renderer;
  const view = renderer?.canvas ?? canvas.app?.canvas ?? canvas.app?.view;
  const rect = view?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: globalThis.innerWidth, height: globalThis.innerHeight };
  const screen = renderer?.screen ?? canvas.app?.screen;
  const screenWidth = Number(screen?.width ?? rect.width);
  const screenHeight = Number(screen?.height ?? rect.height);
  if (!(rect.width > 0) || !(rect.height > 0) || !(screenWidth > 0) || !(screenHeight > 0)) return null;
  const screenX = (clientX - rect.left) * screenWidth / rect.width;
  const screenY = (clientY - rect.top) * screenHeight / rect.height;
  const scale = Number(canvas.stage?.scale?.x) || 1;
  const pivotX = Number(canvas.stage?.pivot?.x) || 0;
  const pivotY = Number(canvas.stage?.pivot?.y) || 0;
  const world = {
    x: pivotX + (screenX - screenWidth / 2) / scale,
    y: pivotY + (screenY - screenHeight / 2) / scale
  };
  const placeables = Array.from(canvas.tokens?.placeables ?? []).reverse();
  return placeables.find((object) => tokenIsVisible(object, object?.document, user) && tokenContains(object, world)) ?? null;
}

function tokenIsVisible(object, token, user) {
  if (!object || !token) return false;
  if (user?.isGM) return true;
  return !token.hidden && object.visible !== false;
}

function tokenContains(object, point) {
  if (typeof object.bounds?.contains === "function") return object.bounds.contains(point.x, point.y);
  const token = object.document;
  const gridSize = Number(token?.parent?.grid?.size ?? 100);
  const left = Number(token?.x ?? token?._source?.x);
  const top = Number(token?.y ?? token?._source?.y);
  const width = Number(token?.width ?? 1) * gridSize;
  const height = Number(token?.height ?? 1) * gridSize;
  return [left, top, width, height].every(Number.isFinite)
    && point.x >= left && point.x <= left + width && point.y >= top && point.y <= top + height;
}

function assertSession(game, expected, getConnectionGeneration = () => 0) {
  if (!game?.user || !game?.world) throw new MovementError("SESSION_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
  if (expected.worldId && expected.worldId !== game.world.id) throw new MovementError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheActiveWorldHasChanged", "The active world has changed."));
  if (expected.userId && expected.userId !== game.user.id) throw new MovementError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.TokenMovementGateway.TheActiveUserHasChanged", "The active user has changed."));
  if (expected.connectionGeneration !== undefined && expected.connectionGeneration !== getConnectionGeneration()) {
    throw new MovementError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheConnectionChangedWhileThisActionWasRunning", "The connection changed while this action was running."));
  }
}

function identifier(value, field) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new MovementError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.CharacterSource.IsRequired", "{field} is required.", { field: (field) }));
  return id;
}

function foundryCombatSceneId(combat) {
  const scene = combat?.scene;
  return String((typeof scene === "string" ? scene : scene?.id) ?? combat?.sceneId ?? "");
}

function tokenPosition(token) {
  const source = token?._source ?? token;
  return { x: Number(source?.x), y: Number(source?.y) };
}

function focusToken(canvas, token, animated, viewport = null) {
  if (!canvas?.ready) return false;
  const center = cameraTargetForToken(canvas, token, viewport);
  if (!center) return false;
  if (animated && typeof canvas.animatePan === "function") {
    Promise.resolve(canvas.animatePan({ ...center, duration: 150 })).catch(() => {});
  } else if (typeof canvas.pan === "function") canvas.pan(center);
  return true;
}

async function settleMovementAnimation(object) {
  const movement = object?.movementAnimationPromise;
  if (!movement || typeof movement.then !== "function") return;
  try {
    await movement;
  } catch { /* camera recentering should survive a cancelled token animation */ }
}

async function smoothlyRecenterToken(canvas, token, viewport = null, duration = 220) {
  if (!canvas?.ready) return false;
  const center = cameraTargetForToken(canvas, token, viewport);
  if (!center) return false;
  if (typeof canvas.animatePan === "function") {
    try {
      await canvas.animatePan({ ...center, duration });
      return true;
    } catch { /* use a deterministic camera fallback */ }
  }
  if (typeof canvas.pan !== "function") return false;
  canvas.pan(center);
  return true;
}

function keepTokenVisible(canvas, token, viewport = null, margin = 0.64) {
  if (!canvas?.ready) return;
  const center = tokenCenter(token);
  const pivot = canvas.stage?.pivot;
  if (!center || !pivot) return;
  const scale = Number(canvas.stage?.scale?.x) || 1;
  if (viewport) {
    const metrics = rendererMetrics(canvas);
    if (!metrics) return;
    const screenX = metrics.screenWidth / 2 + (center.x - Number(pivot.x ?? 0)) * scale;
    const screenY = metrics.screenHeight / 2 + (center.y - Number(pivot.y ?? 0)) * scale;
    const clientX = metrics.rect.left + screenX * metrics.rect.width / metrics.screenWidth;
    const clientY = metrics.rect.top + screenY * metrics.rect.height / metrics.screenHeight;
    const safeHalfWidth = viewport.width * margin / 2;
    const safeHalfHeight = viewport.height * margin / 2;
    const viewportCenterX = viewport.left + viewport.width / 2;
    const viewportCenterY = viewport.top + viewport.height / 2;
    if (Math.abs(clientX - viewportCenterX) > safeHalfWidth || Math.abs(clientY - viewportCenterY) > safeHalfHeight) {
      focusToken(canvas, token, true, viewport);
    }
    return;
  }
  const screen = canvas.app?.renderer?.screen ?? canvas.app?.screen;
  const halfWidth = Number(screen?.width ?? globalThis.innerWidth ?? 0) / 2 / scale;
  const halfHeight = Number(screen?.height ?? globalThis.innerHeight ?? 0) / 2 / scale;
  if (Math.abs(center.x - pivot.x) > halfWidth * margin || Math.abs(center.y - pivot.y) > halfHeight * margin) {
    focusToken(canvas, token, true);
  }
}

export function cameraTargetForToken(canvas, token, viewport = null) {
  const center = tokenCenter(token);
  if (!center || !viewport) return center;
  const metrics = rendererMetrics(canvas);
  if (!metrics) return center;
  const scale = Number(canvas.stage?.scale?.x) || 1;
  const visibleScreenX = (viewport.left + viewport.width / 2 - metrics.rect.left) * metrics.screenWidth / metrics.rect.width;
  const visibleScreenY = (viewport.top + viewport.height / 2 - metrics.rect.top) * metrics.screenHeight / metrics.rect.height;
  return {
    x: center.x - (visibleScreenX - metrics.screenWidth / 2) / scale,
    y: center.y - (visibleScreenY - metrics.screenHeight / 2) / scale
  };
}

function rendererMetrics(canvas) {
  const renderer = canvas.app?.renderer;
  const view = renderer?.canvas ?? canvas.app?.canvas ?? canvas.app?.view;
  const rect = view?.getBoundingClientRect?.();
  const screen = renderer?.screen ?? canvas.app?.screen;
  const screenWidth = Number(screen?.width ?? rect?.width);
  const screenHeight = Number(screen?.height ?? rect?.height);
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !(screenWidth > 0) || !(screenHeight > 0)) return null;
  return { rect, screenWidth, screenHeight };
}

function viewportBounds(value) {
  if (value === null || value === undefined) return null;
  const viewport = {
    left: Number(value.left),
    top: Number(value.top),
    width: Number(value.width),
    height: Number(value.height)
  };
  if (![viewport.left, viewport.top, viewport.width, viewport.height].every(Number.isFinite)
    || viewport.width <= 0 || viewport.height <= 0
    || viewport.width > 10000 || viewport.height > 10000
    || Math.abs(viewport.left) > 100000 || Math.abs(viewport.top) > 100000) {
    throw new MovementError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.CombatGateway.ViewportMustDescribeAFiniteVisibleSceneRegion", "viewport must describe a finite visible Scene region."));
  }
  return viewport;
}

/** Return a token's native canvas centre without converting it to viewport coordinates. */
export function tokenCenter(token) {
  const objectX = Number(token?.object?.center?.x);
  const objectY = Number(token?.object?.center?.y);
  if (Number.isFinite(objectX) && Number.isFinite(objectY)) return { x: objectX, y: objectY };
  const gridSize = Number(token?.parent?.grid?.size ?? 100);
  const x = Number(token?.x ?? token?._source?.x);
  const y = Number(token?.y ?? token?._source?.y);
  if (![gridSize, x, y].every(Number.isFinite)) return null;
  return {
    x: x + Number(token.width ?? 1) * gridSize / 2,
    y: y + Number(token.height ?? 1) * gridSize / 2
  };
}
