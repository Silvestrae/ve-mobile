const TEMPLATE_TYPES = new Set(["circle", "cone", "ray", "rect"]);
const REGION_TEMPLATE_TYPES = Object.freeze({ rectangle: "rect", line: "ray", circle: "circle", cone: "cone", ring: "circle", emanation: "circle" });
const DIRECT_ROTATION_INCREMENT = 1;

/**
 * Adapt D&D5e's live legacy and Region previews without reproducing activity
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
    const legacyAvailable = typeof original === "function";
    if (!legacyAvailable && typeof getCanvas()?.regions?.placeRegion !== "function") return false;
    const interactionStates = new WeakMap();
    enabled = true;

    const requestAdapter = (adapter) => {
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
        Promise.resolve().then(() => onRequest?.(adapter)).catch((error) => {
          console.warn("VE Mobile | Could not start mobile template placement", error);
          return adapter.cancel();
        });
      });
    };

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
      requestAdapter(adapter);
      return nativeResult;
    }

    if (legacyAvailable) {
      if (typeof originalDrawPreview === "function") prototype.drawPreview = drawPreview;
      prototype.activatePreviewListeners = activatePreviewListeners;
    }
    bindRegionTemplatePlacement({ scope, getCanvas, getGame, isEnabled: () => enabled,
      nextId: () => `region-template-${++sequence}`, onRequest: requestAdapter });
    scope?.own?.(() => {
      enabled = false;
      if (prototype?.drawPreview === drawPreview) prototype.drawPreview = originalDrawPreview;
      if (prototype?.activatePreviewListeners === activatePreviewListeners) prototype.activatePreviewListeners = original;
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

/** D&D5e 6 uses RegionLayer.placeRegion, not the deprecated AbilityTemplate.
 * Keep its native shape, callbacks, sequence and final Region creation intact.
 * Only measured-template requests enter VE's existing placement coordinator.
 */
function bindRegionTemplatePlacement({ scope, getCanvas, getGame, isEnabled, nextId, onRequest }) {
  let patch = null;
  const restore = () => {
    if (!patch) return;
    if (patch.layer.placeRegion === patch.wrapper) {
      if (patch.hadOwn) patch.layer.placeRegion = patch.original;
      else delete patch.layer.placeRegion;
    }
    patch = null;
  };
  const attach = () => {
    const canvas = getCanvas();
    const layer = canvas?.regions;
    if (!layer || layer === patch?.layer) return;
    restore();
    const original = layer.placeRegion;
    if (typeof original !== "function") return;
    const hadOwn = Object.hasOwn(layer, "placeRegion");
    function placeRegion(data, options = {}) {
      const measured = data?.flags?.core?.MeasuredTemplate === true || data?.["flags.core.MeasuredTemplate"] === true;
      if (!isEnabled() || this !== layer || getCanvas() !== canvas || !measured
        || data.shapes?.length !== 1 || !REGION_TEMPLATE_TYPES[data.shapes[0]?.type]) return original.call(this, data, options);
      const state = captureTemplateInteractionState(canvas, getGame());
      const beforeMove = stageListeners(canvas.stage, "pointermove");
      const beforeConfirm = stageListeners(canvas.stage, "pointerdown");
      const previous = layer._placementContext;
      const confirmation = { rejected: false, error: null };
      const preConfirm = options.preConfirm;
      const nativeResult = original.call(this, data, { ...options, preConfirm(args) {
        try {
          const allowed = preConfirm?.(args);
          confirmation.rejected = allowed === false;
          return allowed;
        } catch (error) {
          confirmation.error = error;
          return false;
        }
      } });
      // In 14.369 the context/listeners are installed synchronously, before the
      // native promise awaits user input. Do not intercept an unrelated preview.
      const context = layer._placementContext;
      if (!context || context === previous || context.shapes?.length !== 1) return nativeResult;
      const move = stageListeners(canvas.stage, "pointermove").filter((listener) => !beforeMove.includes(listener));
      const confirm = stageListeners(canvas.stage, "pointerdown").filter((listener) => !beforeConfirm.includes(listener));
      if (move.length !== 1 || confirm.length !== 1) return nativeResult;
      canvas.stage.off("pointermove", move[0]);
      canvas.stage.off("pointerdown", confirm[0]);
      restoreTemplateInteractionState(canvas, getGame(), state);
      onRequest(createRegionPreviewAdapter({ id: nextId(), canvas, layer, context, nativeResult,
        move: move[0], confirm: confirm[0], confirmation, getCanvas, getGame,
        interactionState: state, labels: templatePlacementLabels(getGame()) }));
      return nativeResult;
    }
    layer.placeRegion = placeRegion;
    patch = { layer, original, wrapper: placeRegion, hadOwn };
  };
  attach();
  scope?.hook?.("canvasReady", attach);
  scope?.own?.(restore);
}

function createRegionPreviewAdapter({ id, canvas, layer, context, nativeResult, move, confirm,
  confirmation, getCanvas, getGame, interactionState, labels }) {
  const shape = context.shape;
  const type = REGION_TEMPLATE_TYPES[shape.type];
  const rotatable = context.allowRotation !== false && ["cone", "line"].includes(shape?.type);
  const settle = Promise.resolve(nativeResult);
  const scene = canvas.scene;
  const world = getGame()?.world?.id;
  const user = getGame()?.user?.id;
  let operation = "active";
  const ownsPreview = () => getCanvas() === canvas && canvas.scene === scene && layer._placementContext === context;
  const previewAlive = () => operation === "active" && ownsPreview() && !context.preview?.destroyed
    && getGame()?.world?.id === world && getGame()?.user?.id === user;
  const eventAt = (point = { x: 0, y: 0 }) => ({
    x: point.x, y: point.y, clientX: point.x, clientY: point.y, button: 0, shiftKey: false,
    getLocalPosition: () => canvas.canvasCoordinatesFromClient(point),
    preventDefault() {}, stopPropagation() {}
  });
  const moveOrigin = (point) => {
    if (!previewAlive() || ![point?.x, point?.y].every(Number.isFinite)) return false;
    move(eventAt(point));
    context.preview?.applyRenderFlags?.();
    return true;
  };
  const directionAt = (point) => {
    const origin = shape.origin;
    const worldPoint = canvas.canvasCoordinatesFromClient(point);
    return [origin?.x, origin?.y, worldPoint?.x, worldPoint?.y].every(Number.isFinite)
      ? normalizeDegrees(Math.atan2(worldPoint.y - origin.y, worldPoint.x - origin.x) * 180 / Math.PI) : null;
  };
  const rotateBy = (degrees) => {
    if (!previewAlive() || !rotatable || !Number.isFinite(degrees)) return false;
    const args = { event: { delta: Math.sign(degrees), shiftKey: false }, preview: context.preview,
      document: context.preview.document, regionIndex: context.regionIndex, regionCount: context.regionCount,
      shape, shapeIndex: shape._index, shapeCount: context.shapes.length, precise: true };
    if (context.onRotate?.(args) !== false) shape.rotate(degrees);
    const document = context.preview.document;
    document.updateSource({ shapes: [...document.shapes.slice(0, -1), shape] });
    document.updateShapeConstraints();
    context.preview.renderFlags.set({ refreshShapes: true });
    context.preview.applyRenderFlags?.();
    context.onChange?.(args);
    return true;
  };
  const aimAt = (point, offset = 0) => {
    const direction = directionAt(point);
    return direction !== null && rotateBy(normalizeSignedDegrees(direction + offset - shape.rotation));
  };
  const snapshot = () => {
    // Native rays account for grid shape and snapping. The fallback is only
    // the UI handle of a shape without a directional ray, never placement data.
    const origin = shape.origin;
    const ray = shape._getRays?.();
    const endpoint = ray?.center?.B ?? ray?.axisX?.B ?? (rotatable && origin ? {
      x: origin.x + Math.cos(shape.rotation * Math.PI / 180) * shape.length,
      y: origin.y + Math.sin(shape.rotation * Math.PI / 180) * shape.length
    } : null);
    return Object.freeze({ id, type, supported: true, rotatable, labels,
      origin: finitePoint(origin && canvas.clientCoordinatesFromCanvas(origin)),
      direction: finitePoint(rotatable && endpoint && canvas.clientCoordinatesFromCanvas(endpoint)) });
  };
  return Object.freeze({ id, type, supported: true, rotatable, labels, settle, previewAlive,
    originalControlledTokenIdentity: interactionState.originalControlledTokenIdentity,
    establishInitialOrigin: moveOrigin, moveOrigin, aimAt, rotateBy, snapshot,
    beginAim(point) { const angle = directionAt(point); return angle === null ? 0 : normalizeSignedDegrees(shape.rotation - angle); },
    bindGestures(surface, scope, onOverlay) {
      return bindTemplatePointerGestures({ surface, scope, onOverlay, rotatable,
        adapter: { moveOrigin, aimAt, rotateBy, beginAim(point) {
          const angle = directionAt(point); return angle === null ? 0 : normalizeSignedDegrees(shape.rotation - angle);
        }, snapshot, previewAlive } });
    },
    async commit() {
      if (!previewAlive()) return false;
      operation = "committing";
      confirmation.rejected = false;
      confirmation.error = null;
      confirm(eventAt(snapshot().origin ?? { x: 0, y: 0 }));
      if (confirmation.rejected || confirmation.error) {
        operation = "cancelling";
        if (ownsPreview()) layer._cancelPlacement();
        throw confirmation.error ?? new Error(localized(getGame(), "VEMOBILE.Interface.Presenter.TemplatePlacementCouldNotFinish", "Template placement could not finish"));
      }
      return settle;
    },
    async cancel() {
      if (operation === "active" && ownsPreview()) {
        operation = "cancelling";
        layer._cancelPlacement();
      }
      return settle;
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
