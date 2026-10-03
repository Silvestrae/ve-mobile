import { isAppleTouchBrowser } from "./mobile-graphics-policy.mjs";

const VIDEO_SOURCE = /\.(?:webm|mp4|m4v)(?:[?#].*)?$/iu;
const JB2A_WEBM = /^(modules\/jb2a(?:_patreon|_free)?\/.*?)(?:_\d+x\d+)?\.webm([?#].*)?$/iu;
const VIDEO_DIMENSIONS = /_(\d+)x(\d+)\.(?:webm|mp4|m4v)(?:[?#].*)?$/iu;
const BALANCED_MAX_EDGE = 1024;

/**
 * Apply the resolved client-local graphics policy. The action itself is never
 * cancelled: only the optional visual media is substituted or suppressed.
 */
export function enableMobileMediaGuard(scope, {
  policy = Object.freeze({ effects: "strict" }),
  getCanvas = () => globalThis.canvas,
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getSequencer = () => globalThis.Sequencer,
  createImage = () => new globalThis.Image(),
  diagnostics = null,
  journal = null,
  onContextLoss = null,
  getContextLossDetails = () => null
} = {}) {
  const effectsMode = ["strict", "balanced", "off"].includes(policy?.effects) ? policy.effects : "strict";
  const report = createMediaReporter({ diagnostics, journal });

  if (effectsMode === "off") monitorSequencerRisks(scope, { getSequencer, report });
  else proxySequencerVisuals(scope, { createImage, effectsMode, getGame, getSequencer, report });
  watchGraphicsContexts(scope, { getCanvas, getGame, getDocument, diagnostics, journal, onContextLoss, getContextLossDetails });
  if (effectsMode === "strict") suppressDomVideoPlayback(scope, { getDocument, report });

  const protectedTiles = new Map();
  const tileFallbackDimensions = new Map();
  let canvasTornDown = false;
  const protectAllVideoTiles = () => {
    if (effectsMode === "off" || scope.disposed || canvasTornDown) return;
    const tiles = getCanvas()?.tiles?.placeables ?? [];
    return Promise.allSettled(tiles.map((tile) => protectVideoTile(tile, {
      createImage,
      effectsMode,
      fallbackDimensions: tileFallbackDimensions,
      protectedTiles,
      report,
      scope
    })));
  };
  const scheduleProtection = () => void protectAllVideoTiles();

  scope.hook("canvasReady", () => { canvasTornDown = false; scheduleProtection(); });
  scope.hook("canvasTearDown", () => {
    canvasTornDown = true;
    restoreTiles(protectedTiles, false);
  });
  scope.hook("destroyTile", (tile) => {
    const record = protectedTiles.get(tile);
    if (!record) return;
    restoreTile(tile, record, false);
    protectedTiles.delete(tile);
  });
  scope.hook("createTile", scheduleProtection);
  scope.hook("updateTile", scheduleProtection);
  scope.timeout(scheduleProtection, 0);
  scope.own(() => restoreTiles(protectedTiles));
  return true;
}

export { isAppleTouchBrowser };

export function staticFallbackForVideo(source) {
  const match = String(source ?? "").match(JB2A_WEBM);
  return match ? `${match[1]}_Thumb.webp${match[2] ?? ""}` : null;
}

/** Decide without fetching or decoding an asset. */
export function visualMediaDecision(source, data = null, effectsMode = "strict") {
  const value = String(source ?? "");
  if (!VIDEO_SOURCE.test(value) || effectsMode === "off") return Object.freeze({ action: "animate", source: value });

  const fallback = staticFallbackForVideo(value);
  if (effectsMode === "strict") {
    return Object.freeze({ action: fallback ? "static" : "block", source: value, fallback });
  }

  const dimensions = sourceVideoDimensions(value);
  const persistent = Boolean(
    data?.persist
    || data?.screenSpace
    || data?.attachTo
    || data?.tiedDocuments?.length
    || Number(data?.duration ?? 0) > 5000
    || Number(data?.loopOptions?.loops ?? 0) > 1
  );
  const largeOrUnknown = !dimensions
    || dimensions.width > BALANCED_MAX_EDGE
    || dimensions.height > BALANCED_MAX_EDGE;
  if (!persistent && !largeOrUnknown) return Object.freeze({ action: "animate", source: value });
  return Object.freeze({ action: fallback ? "static" : "block", source: value, fallback });
}

function monitorSequencerRisks(scope, { getSequencer, report }) {
  scope.hook("preCreateSequencerEffect", (data) => {
    const source = resolveSequencerVideoSource(data?.file, data?.forcedIndex, getSequencer());
    if (VIDEO_SOURCE.test(String(source ?? ""))) report.risk("sequencer-video", source);
    return true;
  });
}

function proxySequencerVisuals(scope, { createImage, effectsMode, getGame, getSequencer, report }) {
  let manager = null;
  let originalPlayEffect = null;
  let proxyPlayEffect = null;
  let preloader = null;
  let originalPreloadLocal = null;
  let proxyPreloadLocal = null;
  let generation = 0;
  const fallbackDimensions = new Map();

  scope.hook("preCreateSequencerEffect", (data) => {
    const sequencer = getSequencer();
    const source = resolveSequencerVideoSource(data?.file, data?.forcedIndex, sequencer);
    if (!source) return true;
    const decision = visualMediaDecision(source, data, effectsMode);
    if (decision.action === "animate") {
      report.risk("sequencer-video", source);
      return true;
    }
    report.intervention(decision.action, source);
    return decision.action !== "block";
  });

  const install = () => {
    if (scope.disposed || !getGame()?.modules?.get?.("sequencer")?.active) return;
    const sequencer = getSequencer();
    const candidate = sequencer?.EffectManager;
    if (!manager && candidate && typeof candidate._playEffect === "function") {
      manager = candidate;
      originalPlayEffect = candidate._playEffect;
      const playEffect = originalPlayEffect;
      const installedGeneration = ++generation;
      const current = () => !scope.disposed && generation === installedGeneration;
      proxyPlayEffect = async function (data, setFlags = true) {
        if (!current()) return emptyEffectResult();
        const source = resolveSequencerVideoSource(data?.file, data?.forcedIndex, sequencer);
        const decision = visualMediaDecision(source, data, effectsMode);
        if (decision.action === "animate") return playEffect.call(this, data, setFlags);
        if (decision.action === "block") return emptyEffectResult();

        const dimensions = await cachedImageDimensions(decision.fallback, createImage, fallbackDimensions);
        // An old policy generation must not resume playback after Desktop exit
        // or after a replacement media scope has taken over the same manager.
        if (!current()) return emptyEffectResult();
        if (!dimensions) {
          report.intervention("block", source);
          return emptyEffectResult();
        }
        const staticData = {
          ...data,
          file: decision.fallback,
          forcedIndex: false,
          customRange: false,
          // A fixed size, token-fit scale, stretch, or screen-fit effect
          // already owns its visible bounds. Applying a texture-dimension
          // ratio on top of that authored presentation makes thumbnails grow
          // beyond the animation they replace.
          scale: compensateStaticScale(source, data?.scale, dimensions, data)
        };
        return playEffect.call(this, staticData, false);
      };
      candidate._playEffect = proxyPlayEffect;
    }

    const preloadCandidate = sequencer?.Preloader;
    if (!preloader && preloadCandidate && typeof preloadCandidate._preloadLocal === "function") {
      preloader = preloadCandidate;
      originalPreloadLocal = preloadCandidate._preloadLocal;
      const preloadLocal = originalPreloadLocal;
      proxyPreloadLocal = function (sources, showProgressBar = false) {
        if (scope.disposed) return Promise.resolve(0);
        const filtered = filterPreloadSources(sources, effectsMode, report);
        if (!filtered.length) return Promise.resolve(0);
        return preloadLocal.call(this, filtered, showProgressBar);
      };
      preloadCandidate._preloadLocal = proxyPreloadLocal;
    }
  };

  install();
  scope.hook("sequencerReady", install);
  scope.hook("sequencer.ready", install);
  scope.timeout(install, 0);
  scope.own(() => {
    generation += 1;
    if (manager?._playEffect === proxyPlayEffect) manager._playEffect = originalPlayEffect;
    if (preloader?._preloadLocal === proxyPreloadLocal) preloader._preloadLocal = originalPreloadLocal;
    manager = originalPlayEffect = proxyPlayEffect = null;
    preloader = originalPreloadLocal = proxyPreloadLocal = null;
  });
}

function filterPreloadSources(sources, effectsMode, report) {
  const values = Array.isArray(sources) ? sources : [sources];
  const filtered = [];
  for (const source of values) {
    const decision = visualMediaDecision(source, null, effectsMode);
    if (decision.action === "animate") filtered.push(source);
    else if (decision.action === "static") filtered.push(decision.fallback);
    else report.intervention("block-preload", source);
  }
  return [...new Set(filtered.filter(Boolean))];
}

/** Preserve the animation's footprint when a JB2A video becomes its thumbnail. */
export function compensateStaticScale(source, scale, dimensions, effectData = null) {
  if (hasAuthoredDisplayBounds(effectData)) return scale;
  const sourceDimensions = sourceVideoDimensions(source);
  const staticWidth = Number(dimensions?.width);
  const staticHeight = Number(dimensions?.height);
  if (!sourceDimensions || !(staticWidth > 0) || !(staticHeight > 0)) return scale;

  const sourceScale = scale && typeof scale === "object" ? scale : {};
  const scaleX = Number.isFinite(Number(sourceScale.x)) ? Number(sourceScale.x) : 1;
  const scaleY = Number.isFinite(Number(sourceScale.y)) ? Number(sourceScale.y) : 1;
  return {
    ...sourceScale,
    x: scaleX * sourceDimensions.width / staticWidth,
    y: scaleY * sourceDimensions.height / staticHeight
  };
}

/**
 * These Sequencer presentation modes calculate their output bounds from scene
 * data rather than an asset's intrinsic pixels. Keep their scale untouched so
 * the replacement inherits the same anchor, offsets, and final dimensions.
 */
function hasAuthoredDisplayBounds(data) {
  if (!data || typeof data !== "object") return false;
  const size = data.size;
  const hasSize = Number(size?.width ?? size?.w ?? size) > 0
    || Number(size?.height ?? size?.h) > 0;
  return hasSize
    || Boolean(data.scaleToObject)
    || Boolean(data.stretchTo)
    || Boolean(data.screenSpaceScale?.fitX)
    || Boolean(data.screenSpaceScale?.fitY);
}

export function resolveSequencerVideoSource(file, forcedIndex, sequencer = globalThis.Sequencer) {
  if (VIDEO_SOURCE.test(String(file ?? ""))) return file;
  try {
    const entry = sequencer?.Database?.getEntry?.(file, { softFail: true });
    const selected = Array.isArray(entry) ? entry[0] : entry;
    const clone = selected?.clone?.() ?? selected;
    if (!clone || typeof clone.getFile !== "function") return null;
    clone.fileIndex = forcedIndex;
    return clone.getFile();
  } catch {
    return null;
  }
}

function sourceVideoDimensions(source) {
  const match = String(source ?? "").match(VIDEO_DIMENSIONS);
  if (!match) return null;
  return Object.freeze({ width: Number(match[1]), height: Number(match[2]) });
}

function emptyEffectResult() {
  return { duration: Promise.resolve(0), promise: Promise.resolve() };
}

async function cachedImageDimensions(source, createImage, cache) {
  if (!cache.has(source)) cache.set(source, imageDimensions(source, createImage));
  return cache.get(source);
}

async function imageDimensions(source, createImage) {
  if (!source || typeof createImage !== "function") return null;
  try {
    const image = createImage();
    if (!image) return null;
    return await new Promise((resolve) => {
      image.onload = () => resolve({
        width: Number(image.naturalWidth || image.width),
        height: Number(image.naturalHeight || image.height)
      });
      image.onerror = () => resolve(null);
      image.src = source;
    });
  } catch {
    return null;
  }
}

function protectVideoTile(tile, { createImage, effectsMode, fallbackDimensions, protectedTiles, report, scope }) {
  if (!tile || tile.destroyed || protectedTiles.has(tile)) return;
  const source = tile.document?.texture?.src;
  const decision = visualMediaDecision(source, { persist: true }, effectsMode);
  if (decision.action === "animate") return;

  const record = { source, renderable: tile.renderable, replaced: false, retired: false, drawing: null };
  protectedTiles.set(tile, record);
  // An outstanding thumbnail request must not keep a retired scene's Tile alive.
  return finishVideoTileProtection(new WeakRef(tile), record, {
    decision, createImage, fallbackDimensions, report, scope
  });
}

async function finishVideoTileProtection(reference, record, { decision, createImage, fallbackDimensions, report, scope }) {
  let tile;
  try {
    const dimensions = decision.fallback
      ? await cachedImageDimensions(decision.fallback, createImage, fallbackDimensions)
      : null;
    if (scope.disposed || record.retired) return;
    tile = reference.deref();
    if (!tile || tile.destroyed) return;

    if (!dimensions || typeof tile.document?.updateSource !== "function" || typeof tile.draw !== "function") {
      tile.renderable = false;
      pauseTileVideo(tile);
      report.intervention("block-tile", record.source);
      return;
    }

    tile.document.updateSource({ "texture.src": decision.fallback });
    record.replaced = true;
    record.drawing = Promise.resolve(tile.draw());
    await record.drawing;
    if (!record.retired && !scope.disposed && !tile.destroyed) report.intervention("static-tile", record.source);
  } catch (error) {
    if (!tile || record.retired || scope.disposed || tile.destroyed) return;
    tile.renderable = false;
    pauseTileVideo(tile);
    report.failure("Could not substitute a video tile", error);
  } finally {
    record.drawing = null;
  }
}

function pauseTileVideo(tile) {
  const source = tile.mesh?.texture?.baseTexture?.resource?.source;
  if (typeof source?.pause === "function") source.pause();
}

function restoreTile(tile, record, redraw) {
  record.retired = true;
  if (tile.destroyed) return;
  tile.renderable = record.renderable;
  if (!record.replaced || typeof tile.document?.updateSource !== "function") return;
  tile.document.updateSource({ "texture.src": record.source });
  if (!redraw || typeof tile.draw !== "function") return;
  const draw = () => {
    // A new policy or document edit may already have replaced this source again.
    if (tile.destroyed || tile.document?.texture?.src !== record.source) return;
    return tile.draw();
  };
  const pending = record.drawing;
  Promise.resolve(pending).catch(() => {}).then(draw)
    .catch((error) => console.warn("VE Mobile | Video tile restore failed", error));
}

function restoreTiles(protectedTiles, redraw = true) {
  for (const [tile, record] of protectedTiles) {
    restoreTile(tile, record, redraw);
  }
  protectedTiles.clear();
}

function suppressDomVideoPlayback(scope, { getDocument, report }) {
  const document = getDocument();
  const modifiedVideos = new WeakMap();
  const restorations = new Set();
  // Detached videos can be reinserted. Keep their original attributes without
  // rooting their decoder/DOM tree for the whole graphics-policy session.
  const finalized = new FinalizationRegistry((state) => restorations.delete(state));
  const protect = (video) => {
    if (!isVisualVideoElement(video) || modifiedVideos.has(video)) return;
    const state = { reference: new WeakRef(video), autoplay: Boolean(video.autoplay), preload: String(video.preload ?? "") };
    modifiedVideos.set(video, state);
    restorations.add(state);
    finalized.register(video, state, state);
    video.autoplay = false;
    video.preload = "none";
    try { video.pause?.(); } catch { /* A detached video may reject pause. */ }
  };
  const mediaPrototype = globalThis.HTMLMediaElement?.prototype;
  const originalPlay = mediaPrototype?.play;
  if (typeof originalPlay === "function") {
    const guardedPlay = function (...args) {
      if (!isVisualVideoElement(this)) return originalPlay.apply(this, args);
      try { this.pause?.(); } catch { /* Playback is already being refused. */ }
      report.intervention("block-dom-video", this?.currentSrc || this?.src || "video");
      return Promise.resolve();
    };
    try {
      mediaPrototype.play = guardedPlay;
      scope.own(() => {
        if (mediaPrototype.play === guardedPlay) mediaPrototype.play = originalPlay;
      });
    } catch {
      // Some WebKit builds expose a non-writable media prototype.
    }
  }

  const Observer = globalThis.MutationObserver;
  if (!document?.documentElement || typeof Observer !== "function") return;
  const observer = new Observer((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const target = String(record.target?.tagName ?? "").toUpperCase() === "SOURCE"
          ? record.target.parentElement
          : record.target;
        protect(target);
      }
      for (const added of record.addedNodes ?? []) {
        const videos = [
          ...(String(added?.tagName ?? "").toUpperCase() === "VIDEO" ? [added] : []),
          ...(added?.querySelectorAll?.("video") ?? [])
        ];
        for (const video of videos) protect(video);
      }
    }
  });
  try {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    for (const video of document.querySelectorAll?.("video") ?? []) protect(video);
    scope.own(() => observer.disconnect());
    scope.own(() => {
      for (const state of restorations) {
        finalized.unregister(state);
        const video = state.reference.deref();
        if (!video) continue;
        video.autoplay = state.autoplay;
        video.preload = state.preload;
      }
      restorations.clear();
    });
  } catch {
    observer.disconnect();
  }
}

function isVisualVideoElement(element) {
  if (String(element?.tagName ?? "").toUpperCase() !== "VIDEO" || element?.srcObject) return false;
  const source = String(element?.currentSrc || element?.src || element?.querySelector?.("source[src]")?.src || "");
  return VIDEO_SOURCE.test(source) || /^(?:blob:|data:video)/iu.test(source);
}

function watchGraphicsContexts(scope, { getCanvas, getGame, getDocument, diagnostics, journal, onContextLoss, getContextLossDetails }) {
  const watched = new Map();
  let canvasTornDown = false;
  let readyDiceInstance = null;
  const unwatch = (element) => {
    const record = watched.get(element);
    if (!record) return;
    element.removeEventListener("webglcontextlost", record.lossListener);
    element.removeEventListener("webglcontextrestored", record.restoreListener);
    watched.delete(element);
  };
  const watch = (element, label, isCurrent) => {
    if (!element?.addEventListener || watched.has(element)) return;
    const lossListener = () => {
      if (!watched.has(element) || !isCurrent()) return;
      journal?.recordContextLoss?.(label, getContextLossDetails?.(label));
      diagnostics?.record?.("error", `WebGL context lost (${label})`);
      onContextLoss?.(label);
    };
    const restoreListener = () => {
      if (!watched.has(element) || !isCurrent()) return;
      journal?.recordContextRestore?.(label);
      diagnostics?.record?.("info", `WebGL context restored (${label})`);
    };
    element.addEventListener("webglcontextlost", lossListener, { passive: true });
    element.addEventListener("webglcontextrestored", restoreListener, { passive: true });
    watched.set(element, { lossListener, restoreListener, label });
  };
  const foundryElement = () => {
    if (canvasTornDown) return null;
    const renderer = getCanvas()?.app?.renderer;
    return renderer?.canvas ?? renderer?.view ?? null;
  };
  const diceElement = (readyInstance = null) => {
    const game = getGame?.();
    if (readyInstance?.box) readyDiceInstance = readyInstance;
    const instance = readyInstance?.box ? readyInstance : game?.dice3d ?? readyDiceInstance;
    const renderer = instance?.box?.renderer ?? instance?.dice3dRenderers?.board;
    return renderer?.domElement ?? instance?.canvas?.[0]?.querySelector?.("canvas") ?? null;
  };
  const scan = (readyInstance = null) => {
    if (scope.disposed) return;
    const canvasElement = foundryElement();
    const liveDiceElement = diceElement(readyInstance);
    // The DSN instance is authoritative. The DOM fallback exists only while
    // DSN is still publishing its ready instance and excludes configuration
    // or showcase canvases that may be intentionally destroyed.
    const diceElements = liveDiceElement
      ? [liveDiceElement]
      : [...(getDocument()?.querySelectorAll?.("#dice-box-canvas canvas") ?? [])].filter((element) => element?.isConnected !== false);
    const current = new Set([canvasElement, ...diceElements].filter(Boolean));
    for (const element of watched.keys()) if (!current.has(element)) unwatch(element);
    watch(canvasElement, "Foundry canvas", () => foundryElement() === canvasElement);
    for (const element of diceElements) {
      watch(element, "Dice So Nice", () => {
        const authoritative = diceElement();
        return authoritative ? authoritative === element : element?.isConnected !== false;
      });
    }
  };
  scope.hook("canvasTearDown", () => {
    canvasTornDown = true;
    for (const [element, record] of watched) if (record.label === "Foundry canvas") unwatch(element);
  });
  scope.hook("canvasReady", () => { canvasTornDown = false; scan(); });
  scope.hook("diceSoNiceReady", scan);
  scope.timeout(scan, 0);
  scope.own(() => { for (const element of watched.keys()) unwatch(element); });
}

function createMediaReporter({ diagnostics, journal }) {
  const reported = new Set();
  const once = (level, key, message, error) => {
    if (reported.has(key)) return;
    reported.add(key);
    diagnostics?.record?.(level, message, error);
  };
  return Object.freeze({
    risk(kind, source) {
      journal?.recordRisk?.(kind, source);
    },
    intervention(action, source) {
      const value = String(source ?? "unknown media");
      once("info", `${action}:${value}`, `Graphics safety ${action}: ${value}`);
    },
    failure(message, error) {
      once("warn", `failure:${message}`, message, error);
    }
  });
}
