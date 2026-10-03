const TEMPLATE_TYPES = new Set(["circle", "cone", "ray", "rect"]);
const DIRECT_ROTATION_INCREMENT = 1;

/**
 * Adapt D&D5e's live AbilityTemplate preview without reproducing its activity
 * execution or final document creation. The patch exists only for VE's active
 * task scope and is restored verbatim on shutdown.
 */
export function createFoundryTemplatePlacementGateway({
  getCanvas = () => globalThis.canvas,
  getGame = () => globalThis.game,
  getAbilityTemplateClass = () => globalThis.game?.system?.canvas?.AbilityTemplate,
  queueMicrotaskFn = globalThis.queueMicrotask ?? ((callback) => Promise.resolve().then(callback))
} = {}) {
  let enabled = false;
  let current = null;
  let sequence = 0;

  const enable = (scope, onRequest) => {
    if (enabled) return true;
    const AbilityTemplate = getAbilityTemplateClass();
    const prototype = AbilityTemplate?.prototype;
    const original = prototype?.activatePreviewListeners;
    const originalDrawPreview = prototype?.drawPreview;
    if (!prototype || typeof original !== "function") return false;
    const interactionStates = new WeakMap();
    enabled = true;

    function drawPreview(...args) {
      interactionStates.set(this, captureTemplateInteractionState(getCanvas(), getGame()));
      try {
        return originalDrawPreview.apply(this, args);
      } catch (error) {
        interactionStates.delete(this);
        throw error;
      }
    }

    function activatePreviewListeners(initialLayer) {
      const type = String(this?.document?.t ?? "");
      const interactionState = interactionStates.get(this);
      interactionStates.delete(this);
      if (!TEMPLATE_TYPES.has(type)) return original.call(this, initialLayer);
      const canvas = getCanvas();
      const savedInteractionState = interactionState ?? captureTemplateInteractionState(canvas, getGame());
      const beforeMove = stageListeners(canvas?.stage, "mousemove");
      const beforeConfirm = stageListeners(canvas?.stage, "mouseup");
      const nativeResult = original.call(this, initialLayer);
      restoreTemplateInteractionState(canvas, getGame(), savedInteractionState);
      const attachedMove = detachAddedListeners(canvas?.stage, "mousemove", beforeMove);
      const attachedConfirm = detachAddedListeners(canvas?.stage, "mouseup", beforeConfirm);
      const contextmenu = canvas?.app?.view?.oncontextmenu;
      const wheel = canvas?.app?.view?.onwheel;
      if (canvas?.app?.view) {
        if (canvas.app.view.oncontextmenu === contextmenu) canvas.app.view.oncontextmenu = null;
        if (canvas.app.view.onwheel === wheel) canvas.app.view.onwheel = null;
      }
      const adapter = createNativePreviewAdapter({
        id: `template-${++sequence}`,
        template: this,
        nativeResult,
        canvas,
        attachedMove,
        attachedConfirm,
        contextmenu,
        wheel,
        getCanvas,
        interactionState: savedInteractionState,
        labels: templatePlacementLabels(getGame())
      });
      current = adapter;
      adapter.settle.then(() => {
        if (current === adapter) current = null;
      }, () => {
        if (current === adapter) current = null;
      });
      queueMicrotaskFn(() => {
        if (!enabled || current !== adapter) {
          void adapter.cancel().catch(() => {});
          return;
        }
        Promise.resolve(onRequest?.(adapter)).catch((error) => {
          console.warn("VE Mobile | Could not start mobile template placement", error);
          return adapter.cancel();
        });
      });
      return nativeResult;
    }

    if (typeof originalDrawPreview === "function") prototype.drawPreview = drawPreview;
    prototype.activatePreviewListeners = activatePreviewListeners;
    scope?.own?.(() => {
      enabled = false;
      if (prototype.drawPreview === drawPreview) prototype.drawPreview = originalDrawPreview;
      if (prototype.activatePreviewListeners === activatePreviewListeners) prototype.activatePreviewListeners = original;
      const active = current;
      current = null;
      void active?.cancel?.();
    });
    return true;
  };

  return Object.freeze({
    enable,
    restoreControlledToken(identity) {
      return restoreControlledToken(getCanvas(), getGame(), identity);
    },
    get active() {
      return current;
    }
  });
}

export function createNativePreviewAdapter({
  id,
  template,
  nativeResult,
  canvas,
  getCanvas = () => canvas,
  interactionState = null,
  labels = Object.freeze({})
}) {
  const type = String(template?.document?.t ?? "");
  const supported = TEMPLATE_TYPES.has(type);
  const rotatable = supported && !["circle", "rect"].includes(type);
  let operation = "active";
  const settle = Promise.resolve(nativeResult);

  const liveCanvas = () => getCanvas() ?? canvas;
  const nativeEvent = () => ({
    interactionData: {},
    preventDefault() {},
    stopPropagation() {}
  });
  const previewAlive = () => operation === "active"
    && !template?._destroyed
    && Boolean(template?.parent)
    && Boolean(liveCanvas()?.scene);

  const moveOrigin = (clientPoint) => {
    if (!previewAlive()) return false;
    const world = liveCanvas().canvasCoordinatesFromClient?.(clientPoint);
    if (![world?.x, world?.y].every(Number.isFinite)) return false;
    const nativePosition = template.getSnappedPosition?.(world) ?? world;
    if (!nativePosition || ![nativePosition.x, nativePosition.y].every(Number.isFinite)) return false;
    template.document.updateSource({ x: nativePosition.x, y: nativePosition.y });
    refreshNativeTemplateGeometry(template);
    return true;
  };

  const directionAt = (clientPoint) => {
    if (!rotatable || !previewAlive()) return false;
    const world = liveCanvas().canvasCoordinatesFromClient?.(clientPoint);
    const x = Number(template.document?.x);
    const y = Number(template.document?.y);
    if (![world?.x, world?.y, x, y].every(Number.isFinite)) return false;
    return normalizeDegrees(Math.atan2(world.y - y, world.x - x) * 180 / Math.PI);
  };

  const aimAt = (clientPoint, offsetDegrees = 0) => {
    const degrees = directionAt(clientPoint);
    if (!Number.isFinite(degrees)) return false;
    const increment = nativeRotationIncrement();
    const requested = normalizeDegrees(degrees + Number(offsetDegrees || 0));
    template.document.updateSource({ direction: normalizeDegrees(Math.round(requested / increment) * increment) });
    refreshNativeTemplateGeometry(template);
    return true;
  };

  const beginAim = (clientPoint) => {
    const pointerDirection = directionAt(clientPoint);
    const currentDirection = Number(template.document?.direction);
    return [pointerDirection, currentDirection].every(Number.isFinite)
      ? normalizeSignedDegrees(currentDirection - pointerDirection)
      : 0;
  };

  const rotateBy = (degrees) => {
    if (!rotatable || !previewAlive()) return false;
    const currentDirection = Number(template.document?.direction);
    if (!Number.isFinite(currentDirection)) return false;
    template.document.updateSource({ direction: normalizeDegrees(currentDirection + Number(degrees || 0)) });
    refreshNativeTemplateGeometry(template);
    return true;
  };

  const finish = async (kind) => {
    if (operation !== "active") return settle;
    operation = kind;
    try {
      if (kind === "committing") await template._onConfirmPlacement(nativeEvent());
      else await template._onCancelPlacement(nativeEvent());
    } catch (error) {
      if (kind === "committing") {
        operation = "cancelling";
        try { await template._onCancelPlacement(nativeEvent()); } catch {}
      }
      throw error;
    }
    return settle;
  };

  const snapshot = () => templateOverlaySnapshot(liveCanvas(), template, { id, type, supported, rotatable, labels });

  return Object.freeze({
    id,
    type,
    supported,
    rotatable,
    labels,
    originalControlledTokenIdentity: interactionState?.originalControlledTokenIdentity ?? null,
    settle,
    get active() { return operation === "active"; },
    establishInitialOrigin: moveOrigin,
    moveOrigin,
    aimAt,
    beginAim,
    rotateBy,
    snapshot,
    previewAlive,
    bindGestures(surface, scope, onOverlay) {
      return bindTemplatePointerGestures({
        surface,
        scope,
        adapter: { moveOrigin, aimAt, beginAim, rotateBy, snapshot, previewAlive },
        rotatable,
        onOverlay
      });
    },
    watchRemoval(scope, listener) {
      const container = template?.parent;
      if (typeof container?.on !== "function" || typeof container?.off !== "function") return false;
      const removed = (child) => {
        if (child === template && operation === "active") listener();
      };
      container.on("childRemoved", removed);
      scope?.own?.(() => container.off("childRemoved", removed));
      return true;
    },
    commit: () => finish("committing"),
    cancel: () => finish("cancelling")
  });
}

/** Flush Foundry's queued native render flags before projecting its live ray. */
export function refreshNativeTemplateGeometry(template) {
  template?.refresh?.();
  template?.applyRenderFlags?.();
}

export function bindTemplatePointerGestures({
  surface,
  scope,
  adapter,
  rotatable,
  onOverlay = () => {},
  requestFrame = globalThis.requestAnimationFrame ?? ((callback) => { callback(); return null; }),
  cancelFrame = globalThis.cancelAnimationFrame ?? (() => {})
}) {
  const gestureWindow = surface?.ownerDocument?.defaultView ?? globalThis.window ?? surface;
  let active = null;
  let pendingPoint = null;
  let frame = null;

  const emit = () => onOverlay(adapter.snapshot());
  const applyPending = () => {
    frame = null;
    if (!active || !pendingPoint) return;
    const point = pendingPoint;
    pendingPoint = null;
    const changed = active.kind === "direction"
      ? adapter.aimAt(point, active.angleOffset)
      : adapter.moveOrigin({ x: point.x + active.grabOffset.x, y: point.y + active.grabOffset.y });
    if (changed) emit();
  };
  const queuePoint = (point) => {
    pendingPoint = point;
    if (frame === null) frame = requestFrame(applyPending);
  };
  const reset = ({ releaseCapture = true } = {}) => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    pendingPoint = null;
    const prior = active;
    active = null;
    if (!releaseCapture || !prior?.captureTarget) return;
    try {
      if (prior.captureTarget.hasPointerCapture?.(prior.pointerId) !== false) {
        prior.captureTarget.releasePointerCapture?.(prior.pointerId);
      }
    } catch {}
  };

  const pointerDown = (event) => {
    if (active || !adapter.previewAlive()) return;
    if (event.button !== undefined && event.button !== 0) return;
    const captureTarget = event.target?.closest?.("[data-ve-template-handle]");
    const kind = captureTarget?.dataset?.veTemplateHandle;
    if (kind !== "origin" && !(kind === "direction" && rotatable)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    const point = clientPoint(event);
    const overlay = adapter.snapshot();
    active = {
      pointerId: event.pointerId,
      kind,
      captureTarget,
      grabOffset: kind === "origin" && overlay?.origin
        ? { x: overlay.origin.x - point.x, y: overlay.origin.y - point.y }
        : { x: 0, y: 0 },
      angleOffset: kind === "direction" ? adapter.beginAim?.(point) ?? 0 : 0
    };
    try { captureTarget.setPointerCapture?.(event.pointerId); } catch {}
  };

  const pointerMove = (event) => {
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    queuePoint(clientPoint(event));
  };

  const pointerEnd = (event, lostCapture = false) => {
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (!lostCapture) {
      pendingPoint = clientPoint(event);
      applyPending();
    }
    reset({ releaseCapture: !lostCapture });
  };

  const pointerCancel = (event, lostCapture = false) => {
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    reset({ releaseCapture: !lostCapture });
  };

  const keyDown = (event) => {
    const handle = event.target?.closest?.("[data-ve-template-handle='direction']");
    if (!handle || !rotatable || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (adapter.rotateBy?.(event.key === "ArrowLeft" ? -DIRECT_ROTATION_INCREMENT : DIRECT_ROTATION_INCREMENT)) emit();
  };

  scope.listen(surface, "pointerdown", pointerDown, { capture: true });
  scope.listen(gestureWindow, "pointermove", pointerMove, { passive: false });
  scope.listen(gestureWindow, "pointerup", (event) => pointerEnd(event));
  scope.listen(gestureWindow, "pointercancel", (event) => pointerCancel(event));
  scope.listen(surface, "lostpointercapture", (event) => pointerCancel(event, true));
  scope.listen(surface, "keydown", keyDown);
  scope.listen(gestureWindow, "blur", reset);
  scope.listen(gestureWindow, "pagehide", reset);
  scope.listen(gestureWindow?.screen?.orientation, "change", reset);
  scope.listen(gestureWindow, "resize", emit, { passive: true });
  scope.listen(gestureWindow?.visualViewport, "resize", emit, { passive: true });
  scope.hook?.("canvasPan", emit);
  scope.own(reset);
  emit();
  return Object.freeze({
    get ownership() { return active ? "template" : "idle"; },
    get handle() { return active?.kind ?? null; },
    cancel: reset
  });
}

export function templateOverlaySnapshot(canvas, template, state = {}) {
  const origin = canvas?.clientCoordinatesFromCanvas?.({
    x: Number(template?.document?.x),
    y: Number(template?.document?.y)
  });
  const endpoint = template?.ray?.B && state.rotatable
    ? canvas?.clientCoordinatesFromCanvas?.({ x: template.ray.B.x, y: template.ray.B.y })
    : null;
  return Object.freeze({
    ...state,
    origin: finitePoint(origin),
    direction: finitePoint(endpoint)
  });
}

export function nativeRotationIncrement() {
  return DIRECT_ROTATION_INCREMENT;
}

export function captureTemplateInteractionState(canvas, game) {
  const sceneId = String(canvas?.scene?.id ?? "");
  const controlled = Array.from(canvas?.tokens?.controlled ?? []);
  return Object.freeze({
    sceneId,
    userId: String(game?.user?.id ?? ""),
    originalControlledTokenIdentity: controlled.length === 1
      ? tokenIdentity(controlled[0], sceneId, game?.user?.id)
      : null
  });
}

export function restoreTemplateInteractionState(canvas, game, state) {
  if (!state || String(canvas?.scene?.id ?? "") !== state.sceneId || String(game?.user?.id ?? "") !== state.userId) return false;
  return restoreControlledToken(canvas, game, state.originalControlledTokenIdentity);
}

/** Re-resolve and restore the one token controlled when placement began. */
export function restoreControlledToken(canvas, game, identity) {
  if (!identity) return false;
  const sceneId = String(canvas?.scene?.id ?? "");
  const userId = String(game?.user?.id ?? "");
  if (sceneId !== identity.sceneId || userId !== identity.userId) return false;
  const currentlyControlled = Array.from(canvas?.tokens?.controlled ?? []).filter((token) => token?.controlled !== false);
  if (currentlyControlled.some((token) => tokenId(token) !== identity.tokenId)) return false;
  const token = resolveCanvasToken(canvas, identity.tokenId);
  if (!token || (identity.uuid && String(token?.document?.uuid ?? "") !== identity.uuid) || !canControlToken(token, game?.user)) return false;
  if (token.controlled) return true;
  try {
    const result = token.control({ releaseOthers: true });
    result?.catch?.(() => {});
    return true;
  } catch {
    return false;
  }
}

function detachAddedListeners(stage, eventName, before) {
  const added = stageListeners(stage, eventName).filter((listener) => !before.includes(listener));
  for (const listener of added) stage?.off?.(eventName, listener);
  return added;
}

function stageListeners(stage, eventName) {
  try {
    return [...(stage?.listeners?.(eventName) ?? [])];
  } catch {
    return [];
  }
}

function finitePoint(value) {
  return [value?.x, value?.y].every(Number.isFinite)
    ? Object.freeze({ x: Number(value.x), y: Number(value.y) })
    : null;
}

function clientPoint(event) {
  return { x: Number(event.clientX), y: Number(event.clientY) };
}

function tokenId(token) {
  return String(token?.document?.id ?? token?.id ?? "");
}

function tokenIdentity(token, sceneId, userId) {
  const id = tokenId(token);
  if (!id || !sceneId || !userId) return null;
  return Object.freeze({
    sceneId,
    tokenId: id,
    uuid: String(token?.document?.uuid ?? ""),
    userId: String(userId)
  });
}

function resolveCanvasToken(canvas, id) {
  return canvas?.tokens?.get?.(id)
    ?? Array.from(canvas?.tokens?.placeables ?? []).find((token) => tokenId(token) === id)
    ?? null;
}

function canControlToken(token, user) {
  if (!token || token.destroyed || token.document?.hidden) return false;
  if (token.document?.isOwner === true || token.isOwner === true) return typeof token.control === "function";
  try {
    return typeof token.control === "function" && Boolean(token.document?.testUserPermission?.(user, "OWNER"));
  } catch {
    return false;
  }
}

function templatePlacementLabels(game) {
  return Object.freeze({
    hint: localized(game, "VEMOBILE.Scene.Template.Hint", "Tap to place template"),
    adjust: localized(game, "VEMOBILE.Scene.Template.Adjust", "Adjust template"),
    preparing: localized(game, "VEMOBILE.Scene.Template.Preparing", "Preparing template"),
    toolbar: localized(game, "VEMOBILE.Scene.Template.Toolbar", "Template placement"),
    handles: localized(game, "VEMOBILE.Scene.Template.Handles", "Template adjustment handles"),
    origin: localized(game, "VEMOBILE.Scene.Template.Origin", "Move template origin"),
    direction: localized(game, "VEMOBILE.Scene.Template.Direction", "Aim template direction"),
    cancel: localized(game, "VEMOBILE.Scene.Template.Cancel", "Cancel"),
    cancelLabel: localized(game, "VEMOBILE.Scene.Template.CancelLabel", "Cancel template"),
    place: localized(game, "VEMOBILE.Scene.Template.Place", "Place"),
    placeLabel: localized(game, "VEMOBILE.Scene.Template.PlaceLabel", "Place template")
  });
}

function localized(game, key, fallback) {
  const value = game?.i18n?.localize?.(key);
  return !value || value === key ? fallback : value;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function normalizeSignedDegrees(value) {
  const normalized = normalizeDegrees(value);
  return normalized > 180 ? normalized - 360 : normalized;
}
