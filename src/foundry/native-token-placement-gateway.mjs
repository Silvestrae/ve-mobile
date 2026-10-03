import { localizeFoundry } from "./localization.mjs";
/**
 * Bridge D&D5e 5.3.3 TokenPlacement's mouse-only request to a mobile Scene.
 * D&D5e still owns its previews, placement data, token creation, and hooks.
 * This adapter only invokes the listeners installed by that native request.
 */
export function createNativeTokenPlacementGateway({
  getPlacementClass = () => globalThis.game?.system?.canvas?.TokenPlacement,
  getCanvas = () => globalThis.canvas,
  getRequestFrame = () => globalThis.requestAnimationFrame,
  getCancelFrame = () => globalThis.cancelAnimationFrame
} = {}) {
  let enabled = false;
  let active = null;
  let sequence = 0;
  const stagePatches = new Set();

  const restoreStage = () => {
    for (const patch of stagePatches) {
      const { stage, original, observed, hadOwn } = patch;
      // TokenPlacement can temporarily wrap this observer. Its own finally
      // restores the observer first, then retries this restoration.
      if (stage.on !== observed) continue;
      if (hadOwn) stage.on = original;
      else delete stage.on;
      stagePatches.delete(patch);
    }
  };

  const enable = (scope, onRequest) => {
    if (enabled) return true;
    const prototype = getPlacementClass()?.prototype;
    const original = prototype?.place;
    if (typeof original !== "function") return false;
    enabled = true;

    // Some activity macros request a MeasuredTemplate crosshair after their
    // dialogs instead of using D&D5e TokenPlacement. Observe the native
    // preview's own canvas listener registration, then pass its listeners back
    // to the same mobile Scene handoff. No macro or summon mechanics are run
    // here. The match is based on the active preview and listener identity.
    const attachStage = () => {
      const canvas = getCanvas();
      const stage = canvas?.stage;
      if (!stage || [...stagePatches].some((patch) => patch.stage === stage)) return;
      restoreStage();
      const stageOn = stage.on;
      if (typeof stageOn !== "function") return;
      const hadOwn = Object.hasOwn(stage, "on");
      function observed(event, listener, ...rest) {
        const result = stageOn.call(this, event, listener, ...rest);
        if (!enabled || active || this !== stage || event !== "mousedown") return result;
        const preview = canvas.activeLayer?.preview?.children?.find?.((candidate) =>
          candidate?.inFlight === true && candidate?.activeLeftClickHandler === listener
          && typeof candidate.activeMoveHandler === "function"
          && typeof candidate.rightDownHandler === "function"
          && typeof candidate.rightUpHandler === "function"
          && typeof candidate.document?.updateSource === "function");
        if (!preview) return result;
        queueMicrotask(() => {
          if (!enabled || active || !preview.inFlight || preview._destroyed) return;
          const request = createCrosshairPlacementRequest({
            id: `native-crosshair-${++sequence}`,
            preview,
            canvas,
            getCanvas,
            onSettle: () => { if (active === request) active = null; }
          });
          active = request;
          Promise.resolve().then(() => onRequest(request)).then((ready) => {
            if (!ready || !enabled) request.cancel();
          }).catch((error) => {
            console.warn("VE Mobile | Native crosshair handoff failed", error);
            request.cancel();
          });
        });
        return result;
      }
      stage.on = observed;
      stagePatches.add({ stage, original: stageOn, observed, hadOwn });
    };
    attachStage();
    scope?.hook?.("canvasReady", attachStage);

    async function place(...args) {
      if (!enabled) return original.apply(this, args);
      if (active) throw new Error(localizeFoundry("VEMOBILE.Interface.NativeTokenPlacementGateway.ANativeTokenPlacementIsAlreadyInProgress", "A native token placement is already in progress."));
      const canvas = getCanvas();
      const stage = canvas?.stage;
      if (!stage || !canvas?.scene) return original.apply(this, args);
      const request = createPlacementRequest({
        id: `native-token-${++sequence}`,
        placement: this,
        canvas,
        getCanvas,
        getRequestFrame,
        getCancelFrame
      });
      active = request;
      try {
        const ready = await onRequest(request);
        if (!ready || !enabled || active !== request || request.cancelled) return [];
        return await request.run(() => original.apply(this, args));
      } finally {
        try { request.finish(); }
        catch (error) { console.warn("VE Mobile | Native placement cleanup failed", error); }
        finally {
          request.dispose();
          if (active === request) active = null;
          if (!enabled) restoreStage();
        }
      }
    }

    prototype.place = place;
    scope?.own?.(() => {
      enabled = false;
      if (prototype.place === place) prototype.place = original;
      active?.cancel();
      active = null;
      restoreStage();
    });
    return true;
  };

  return Object.freeze({ enable, get active() { return active; } });
}

/** Adapt an existing crosshair preview without deciding its summon result. */
export function createCrosshairPlacementRequest({ id, preview, canvas,
  getCanvas = () => canvas, onSettle = () => {} }) {
  let cancelled = false;
  let positioned = false;
  let finished = false;
  let chosenPosition = null;
  let onChange = () => {};
  let onFinish = () => {};
  const publish = () => onChange(Object.freeze({ id, count: 1,
    step: finished ? 1 : 0,
    phase: cancelled ? "cancelling" : positioned ? "adjusting" : "preparing" }));
  const finish = () => {
    if (finished) return;
    finished = true;
    publish();
    try { onFinish(); }
    finally { onSettle(); }
  };
  const live = () => !finished && preview.inFlight && !preview._destroyed;

  return Object.freeze({
    id,
    count: 1,
    get cancelled() { return cancelled; },
    get phase() { return cancelled ? "cancelling" : positioned ? "adjusting" : "preparing"; },
    onChange(callback) { onChange = typeof callback === "function" ? callback : () => {}; publish(); },
    onFinish(callback) { onFinish = typeof callback === "function" ? callback : () => {}; },
    position(clientPoint) {
      if (!live() || cancelled) return false;
      const world = getCanvas()?.canvasCoordinatesFromClient?.(clientPoint);
      if (![world?.x, world?.y].every(Number.isFinite)) return false;
      const originalEvent = typeof globalThis.MouseEvent === "function"
        ? new globalThis.MouseEvent("mousemove", { clientX: clientPoint.x, clientY: clientPoint.y })
        : { clientX: clientPoint.x, clientY: clientPoint.y };
      try {
        // CPR throttles native mouse movement for 20 ms. A deliberate Scene
        // tap must win even when another pointer event just moved the cursor.
        preview.moveTime = 0;
        preview.activeMoveHandler({
          data: { getLocalPosition: () => world, originalEvent },
          stopPropagation() {}, preventDefault() {}
        });
      } catch (error) {
        console.warn("VE Mobile | Native crosshair could not move", error);
        return false;
      }
      const { x, y } = preview.document ?? {};
      if (![x, y].every(Number.isFinite)) return false;
      chosenPosition = { x, y };
      positioned = true;
      publish();
      return true;
    },
    confirm() {
      if (!live() || cancelled || !positioned || !chosenPosition) return false;
      try {
        // Moving the pointer onto VE's Place button may move CPR's canvas
        // crosshair again. Reapply the last deliberate Scene position just
        // before CPR's own confirm handler samples the document.
        preview.document.updateSource(chosenPosition);
        preview.refresh?.();
        preview.activeLeftClickHandler({ preventDefault() {}, stopPropagation() {} });
      }
      catch (error) {
        console.warn("VE Mobile | Native crosshair could not confirm", error);
        this.cancel();
        return false;
      }
      if (!preview.inFlight) finish();
      return finished;
    },
    cancel() {
      if (finished || cancelled) return false;
      cancelled = true;
      publish();
      if (!live()) { finish(); return true; }
      const event = { button: 2, screenX: 0, screenY: 0,
        preventDefault() {}, stopPropagation() {} };
      try {
        preview.rightDownHandler(event);
        preview.rightUpHandler(event);
      } catch (error) {
        console.warn("VE Mobile | Native crosshair could not cancel normally", error);
        preview.clearHandlers?.(event);
      }
      if (!preview.inFlight) finish();
      return true;
    }
  });
}

export function createPlacementRequest({ id, placement, canvas, getCanvas = () => canvas,
  getRequestFrame = () => globalThis.requestAnimationFrame,
  getCancelFrame = () => globalThis.cancelAnimationFrame }) {
  const stage = canvas.stage;
  const hadOwnOn = Object.hasOwn(stage, "on");
  const originalOn = stage.on;
  const count = Math.max(0, Number(placement?.config?.tokens?.length) || 0);
  let move = null;
  let confirm = null;
  let skip = null;
  let step = 0;
  let cancelled = false;
  let disposed = false;
  let positioned = false;
  let frame = null;
  let onChange = () => {};
  let onFinish = () => {};

  const publish = () => onChange(Object.freeze({ id, step, count,
    phase: cancelled ? "cancelling" : confirm ? "adjusting" : "preparing" }));
  const nativeEvent = (world = null) => ({
    data: { getLocalPosition: () => world },
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {}
  });
  const skipCurrent = () => {
    if (!skip || !confirm) return false;
    const listener = skip;
    move = confirm = skip = null;
    positioned = false;
    step += 1;
    publish();
    void Promise.resolve(listener(nativeEvent())).catch(() => {});
    return true;
  };
  const observedOn = function(event, listener, ...rest) {
    const result = originalOn.call(this, event, listener, ...rest);
    if (this !== stage || disposed) return result;
    if (event === "mousemove") move = listener;
    if (event === "mousedown") {
      confirm = listener;
      // D&D5e assigns this after registering both stage listeners.
      queueMicrotask(() => {
        if (disposed || confirm !== listener) return;
        skip = getCanvas()?.app?.view?.oncontextmenu ?? null;
        if (cancelled) skipCurrent();
        else publish();
      });
    }
    return result;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frame != null) getCancelFrame()?.(frame);
    if (stage.on === observedOn) {
      if (hadOwnOn) stage.on = originalOn;
      else delete stage.on;
    }
    move = confirm = skip = null;
  };

  return Object.freeze({
    id,
    count,
    get cancelled() { return cancelled; },
    get phase() { return cancelled ? "cancelling" : confirm ? "adjusting" : "preparing"; },
    onChange(callback) { onChange = typeof callback === "function" ? callback : () => {}; publish(); },
    onFinish(callback) { onFinish = typeof callback === "function" ? callback : () => {}; },
    finish() { onFinish(); },
    async run(invoke) {
      stage.on = observedOn;
      try { return await invoke(); }
      finally { dispose(); }
    },
    position(clientPoint) {
      if (disposed || cancelled || !move || !confirm) return false;
      const world = getCanvas()?.canvasCoordinatesFromClient?.(clientPoint);
      if (![world?.x, world?.y].every(Number.isFinite)) return false;
      move(nativeEvent(world));
      positioned = true;
      // Native D&D5e throttles mousemove for one animation frame.
      if (frame != null) getCancelFrame()?.(frame);
      frame = getRequestFrame()?.(() => { frame = null; }) ?? null;
      return true;
    },
    confirm() {
      if (disposed || cancelled || !positioned || !confirm) return false;
      const listener = confirm;
      move = confirm = skip = null;
      positioned = false;
      step += 1;
      publish();
      void Promise.resolve(listener(nativeEvent())).catch(() => {});
      return true;
    },
    cancel() {
      if (disposed || cancelled) return false;
      cancelled = true;
      publish();
      skipCurrent();
      return true;
    },
    dispose
  });
}
