import { localizedText } from "../ui/localized-text.mjs";
export const MOBILE_ASSET_CATALOG_VERSION = 1;
export const MOBILE_DERIVATIVE_SCHEMA_VERSION = 1;
export const MIPMAP_ESTIMATE_FACTOR = 1.33;

const RASTER_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mp4", "ogg", "ogv", "webm"]);

export function canonicalAssetSource(value, baseHref = globalThis.document?.baseURI ?? "") {
  const source = String(value ?? "").trim().replace(/\\/gu, "/");
  if (!source || source.startsWith("#") || /^(?:data|blob):/iu.test(source)) return "";
  try {
    const url = new URL(source, baseHref || "http://ve-mobile.invalid/");
    url.hash = "";
    url.search = "";
    if (!baseHref || url.origin === new URL(baseHref).origin) return url.pathname.replace(/^\/+/, "");
    return url.href;
  } catch {
    return source.split(/[?#]/u, 1)[0].replace(/^\.\//u, "").replace(/^\/+/, "");
  }
}

export function assetFileType(source) {
  const match = String(source ?? "").split(/[?#]/u, 1)[0].match(/\.([a-z0-9]+)$/iu);
  return match ? match[1].toLowerCase() : "";
}

export function assetMediaKind(source) {
  const type = assetFileType(source);
  if (RASTER_EXTENSIONS.has(type)) return "raster";
  if (VIDEO_EXTENSIONS.has(type)) return "video";
  return "unknown";
}

export function decodedRgbaBytes(width, height) {
  const w = Math.floor(Number(width));
  const h = Math.floor(Number(height));
  if (!(w > 0) || !(h > 0) || !Number.isSafeInteger(w) || !Number.isSafeInteger(h)) return null;
  const bytes = w * h * 4;
  return Number.isSafeInteger(bytes) ? bytes : null;
}

export function mipmappedBytes(decodedBytes) {
  const bytes = Number(decodedBytes);
  return Number.isFinite(bytes) && bytes >= 0 ? Math.round(bytes * MIPMAP_ESTIMATE_FACTOR) : null;
}

export function assetRiskBand(decodedBytes) {
  if (decodedBytes === null || decodedBytes === undefined) return "unknown";
  const mib = Number(decodedBytes) / 1048576;
  if (!Number.isFinite(mib) || mib < 0) return "unknown";
  if (mib < 16) return "low";
  if (mib < 32) return "moderate";
  if (mib <= 64) return "high";
  return "very-high";
}

export function collectSceneAssetReferences(scenes, { baseHref = "" } = {}) {
  const assets = new Map();
  const sceneRecords = [];
  for (const scene of collectionValues(scenes)) {
    const sceneId = String(scene?.id ?? "");
    if (!sceneId) continue;
    const sceneName = String(scene?.name || "Unnamed Scene");
    const references = [];
    const add = (value, role, extra = {}) => {
      const canonicalSource = canonicalAssetSource(value, baseHref);
      if (!canonicalSource) return;
      const mediaKind = assetMediaKind(canonicalSource);
      const reference = Object.freeze({ canonicalSource, role, mediaKind, ...extra });
      references.push(reference);
      let asset = assets.get(canonicalSource);
      if (!asset) {
        asset = { canonicalSource, fileType: assetFileType(canonicalSource), mediaKind, scenes: new Map(), roles: new Set() };
        assets.set(canonicalSource, asset);
      }
      asset.roles.add(role);
      asset.scenes.set(sceneId, sceneName);
    };
    add(scene?.background?.src ?? scene?.img, "background", { hidden: false });
    add(scene?.foreground, "foreground", { hidden: false });
    add(scene?.fog?.overlay, "fog-overlay", { hidden: false });
    for (const tile of collectionValues(scene?.tiles)) {
      add(tile?.texture?.src, assetMediaKind(tile?.texture?.src) === "video" ? "video-tile" : "tile", {
        tileId: String(tile?.id ?? ""),
        hidden: Boolean(tile?.hidden),
        width: positiveInteger(tile?.width),
        height: positiveInteger(tile?.height)
      });
    }
    sceneRecords.push(Object.freeze({ id: sceneId, name: sceneName, references: Object.freeze(references) }));
  }
  const assetRecords = [...assets.values()].map((asset) => Object.freeze({
    canonicalSource: asset.canonicalSource,
    fileType: asset.fileType,
    mediaKind: asset.mediaKind,
    scenes: Object.freeze([...asset.scenes].map(([id, name]) => Object.freeze({ id, name }))),
    roles: Object.freeze([...asset.roles].sort())
  })).sort((left, right) => left.canonicalSource.localeCompare(right.canonicalSource));
  return Object.freeze({ assets: Object.freeze(assetRecords), scenes: Object.freeze(sceneRecords) });
}

export function buildCatalog({ references, metadata = new Map(), previous = null, generatedAt = Date.now() } = {}) {
  const priorAssets = previous?.schemaVersion === MOBILE_ASSET_CATALOG_VERSION && previous?.assets && typeof previous.assets === "object"
    ? previous.assets
    : {};
  const assets = {};
  for (const reference of references?.assets ?? []) {
    const info = metadata instanceof Map ? metadata.get(reference.canonicalSource) : metadata?.[reference.canonicalSource];
    const width = positiveInteger(info?.width);
    const height = positiveInteger(info?.height);
    const decodedBytes = decodedRgbaBytes(width, height);
    const prior = priorAssets[reference.canonicalSource];
    const derivative = normalizeDerivative(prior?.derivative, {
      sourceHash: info?.sourceHash,
      sourceWidth: width,
      sourceHeight: height
    });
    assets[reference.canonicalSource] = {
      canonicalSource: reference.canonicalSource,
      fileType: reference.fileType,
      mediaKind: reference.mediaKind,
      width,
      height,
      fileSize: finiteNonNegative(info?.fileSize),
      transparency: normalizeTransparency(info?.transparency),
      decodedBytes,
      mipmappedBytes: mipmappedBytes(decodedBytes),
      risk: assetRiskBand(decodedBytes),
      sourceHash: normalizedHash(info?.sourceHash),
      scenes: reference.scenes,
      roles: reference.roles,
      ...(derivative ? { derivative } : {})
    };
  }
  const catalog = {
    schemaVersion: MOBILE_ASSET_CATALOG_VERSION,
    generatedAt: Number(generatedAt) || Date.now(),
    assets,
    scenes: buildSceneCatalog(references?.scenes ?? [], assets)
  };
  return freezeCatalog(catalog);
}

export function buildSceneCatalog(scenes, assets) {
  const result = {};
  for (const scene of scenes ?? []) {
    const rasterReferences = (scene.references ?? []).filter((entry) => entry.mediaKind === "raster");
    const videoReferences = (scene.references ?? []).filter((entry) => entry.mediaKind === "video");
    const sources = [...new Set(rasterReferences.map((entry) => entry.canonicalSource))];
    const original = sources.map((source) => assets[source]).filter(Boolean);
    const effective = original.map((asset) => effectiveAssetRecord(asset));
    const originalKnown = original.filter((asset) => Number.isFinite(asset.decodedBytes));
    const effectiveKnown = effective.filter((asset) => Number.isFinite(asset.decodedBytes));
    const originalDecodedBytes = sumKnown(originalKnown, "decodedBytes");
    const effectiveDecodedBytes = sumKnown(effectiveKnown, "decodedBytes");
    const unknownCount = original.length - originalKnown.length;
    result[scene.id] = {
      id: scene.id,
      name: scene.name,
      references: (scene.references ?? []).map((entry) => ({
        canonicalSource: entry.canonicalSource,
        mediaKind: entry.mediaKind,
        role: entry.role,
        hidden: Boolean(entry.hidden),
        ...(entry.width ? { width: entry.width } : {}),
        ...(entry.height ? { height: entry.height } : {}),
        ...(entry.tileId ? { tileId: entry.tileId } : {})
      })),
      sources,
      surfaceCount: sources.length,
      rasterLayerCount: rasterReferences.length,
      visibleRasterCount: rasterReferences.filter((entry) => !entry.hidden).length,
      hiddenRasterCount: rasterReferences.filter((entry) => entry.hidden).length,
      videoCount: videoReferences.length,
      visibleVideoCount: videoReferences.filter((entry) => !entry.hidden).length,
      hiddenVideoCount: videoReferences.filter((entry) => entry.hidden).length,
      visibleVideoPixelCount: videoReferences.filter((entry) => !entry.hidden).reduce((total, entry) => total + (Number(entry.width) || 0) * (Number(entry.height) || 0), 0),
      largestVisibleVideoPixels: videoReferences.filter((entry) => !entry.hidden).reduce((maximum, entry) => Math.max(maximum, (Number(entry.width) || 0) * (Number(entry.height) || 0)), 0),
      knownSurfaceCount: originalKnown.length,
      unknownSurfaceCount: unknownCount,
      originalDecodedBytes,
      originalMipmappedBytes: sumKnown(originalKnown, "mipmappedBytes"),
      effectiveDecodedBytes,
      effectiveMipmappedBytes: sumKnown(effectiveKnown, "mipmappedBytes"),
      highRiskCount: originalKnown.filter((asset) => ["high", "very-high"].includes(asset.risk)).length,
      multiLayerPressure: rasterReferences.length >= 3 && originalDecodedBytes >= 64 * 1048576,
      derivativeCount: effective.filter((asset) => asset.derivativeActive).length,
      confidence: unknownCount ? (originalKnown.length ? "estimated" : "unknown") : "known",
      originalRisk: aggregateRisk(originalDecodedBytes, original.length, originalKnown, unknownCount),
      effectiveRisk: aggregateRisk(effectiveDecodedBytes, effective.length, effectiveKnown, unknownCount)
    };
  }
  return result;
}

export function sceneRiskRecord(catalog, sceneId, {
  devicePolicy = null,
  priorGraphicsLoss = false,
  lowMemory = false,
  substitution = null
} = {}) {
  const scene = catalog?.schemaVersion === MOBILE_ASSET_CATALOG_VERSION ? catalog.scenes?.[sceneId] : null;
  if (!scene) return Object.freeze({
    sceneId: String(sceneId ?? ""),
    classification: "unknown",
    confidence: "unknown",
    surfaceCount: 0,
    derivativeStatus: "unknown",
    warningRequired: false,
    devicePolicy: plainDevicePolicy(devicePolicy),
    priorGraphicsLoss: Boolean(priorGraphicsLoss),
    lowMemory: Boolean(lowMemory),
    substitutionStatus: String(substitution?.status ?? "unavailable")
  });
  const substitutionEnabled = !substitution || substitution?.enabled !== false;
  const effectiveSources = Array.isArray(substitution?.effectiveSources) ? new Set(substitution.effectiveSources) : null;
  const cachedOriginals = new Set(substitution?.originalAlreadyCached ?? []);
  const reloadRequiredAliases = new Set(substitution?.reloadRequiredAliases ?? []);
  const surfaces = Object.freeze((scene.sources ?? []).map((source) => {
    const asset = catalog.assets?.[source];
    if (!asset) return null;
    const derivative = asset.derivative;
    const mapped = effectiveAssetRecord(asset);
    const aliasEffective = !substitution || (substitutionEnabled && (effectiveSources ? effectiveSources.has(source) : substitution?.status === "active"));
    const derivativeEffective = aliasEffective
      && mapped.derivativeActive
      && !cachedOriginals.has(source)
      && !reloadRequiredAliases.has(source);
    const effective = derivativeEffective ? mapped : effectiveAssetRecord({ ...asset, derivative: null });
    return Object.freeze({
      source: asset.canonicalSource,
      roles: Object.freeze([...(asset.roles ?? [])]),
      width: asset.width,
      height: asset.height,
      decodedBytes: asset.decodedBytes,
      mipmappedBytes: asset.mipmappedBytes,
      risk: asset.risk,
      effective: Object.freeze({
        width: effective.derivativeActive ? derivative.width : asset.width,
        height: effective.derivativeActive ? derivative.height : asset.height,
        decodedBytes: effective.decodedBytes,
        mipmappedBytes: effective.mipmappedBytes,
        derivativeActive: derivativeEffective
      }),
      derivative: derivative ? Object.freeze({
        source: derivative.source,
        width: derivative.width,
        height: derivative.height,
        enabled: derivative.enabled !== false,
        status: derivative.status,
        stale: mappingIsStale(derivative, {
          sourceHash: asset.sourceHash,
          width: asset.width,
          height: asset.height
        })
      }) : null
    });
  }).filter(Boolean));
  const effectiveKnown = surfaces.filter((surface) => Number.isFinite(surface.effective.decodedBytes));
  const effectiveDecodedBytes = sumKnown(effectiveKnown.map((surface) => surface.effective), "decodedBytes");
  const effectiveMipmappedBytes = sumKnown(effectiveKnown.map((surface) => surface.effective), "mipmappedBytes");
  const effectiveUnknownCount = surfaces.length - effectiveKnown.length;
  const effectiveAssets = effectiveKnown.map((surface) => ({ decodedBytes: surface.effective.decodedBytes, risk: assetRiskBand(surface.effective.decodedBytes) }));
  const classification = aggregateRisk(effectiveDecodedBytes, surfaces.length, effectiveAssets, effectiveUnknownCount);
  const effectiveDerivativeCount = surfaces.filter((surface) => surface.effective.derivativeActive).length;
  const derivativeStatus = effectiveDerivativeCount > 0
    ? effectiveDerivativeCount === scene.surfaceCount ? "complete" : "partial"
    : "missing";
  const materiallyHigh = ["high", "very-high"].includes(classification);
  return Object.freeze({
    sceneId: scene.id,
    sceneName: scene.name,
    classification,
    originalClassification: scene.originalRisk,
    confidence: scene.confidence,
    surfaceCount: scene.surfaceCount,
    rasterLayerCount: scene.rasterLayerCount ?? scene.surfaceCount,
    visibleRasterCount: scene.visibleRasterCount ?? scene.surfaceCount,
    hiddenRasterCount: scene.hiddenRasterCount ?? 0,
    videoCount: scene.videoCount ?? 0,
    visibleVideoCount: scene.visibleVideoCount ?? scene.videoCount ?? 0,
    hiddenVideoCount: scene.hiddenVideoCount ?? 0,
    visibleVideoPixelCount: scene.visibleVideoPixelCount ?? 0,
    largestVisibleVideoPixels: scene.largestVisibleVideoPixels ?? 0,
    knownSurfaceCount: scene.knownSurfaceCount,
    unknownSurfaceCount: scene.unknownSurfaceCount,
    originalDecodedBytes: scene.originalDecodedBytes,
    originalMipmappedBytes: scene.originalMipmappedBytes,
    effectiveDecodedBytes,
    effectiveMipmappedBytes,
    largestEffectiveRasterBytes: effectiveKnown.reduce((maximum, surface) => Math.max(maximum, Number(surface.effective.decodedBytes) || 0), 0),
    highRiskCount: scene.highRiskCount,
    multiLayerPressure: scene.multiLayerPressure,
    aggregatePressure: materiallyHigh ? "high" : classification === "moderate" ? "elevated" : classification,
    derivativeStatus,
    derivativeCount: effectiveDerivativeCount,
    surfaces,
    warningRequired: materiallyHigh,
    devicePolicy: plainDevicePolicy(devicePolicy),
    priorGraphicsLoss: Boolean(priorGraphicsLoss),
    lowMemory: Boolean(lowMemory),
    substitutionStatus: String(substitution?.status ?? "unavailable")
  });
}

/**
 * Recommend the minimum staged live-canvas profile from metadata which is
 * already known. This function never fetches or decodes an asset.
 */
export function recommendSceneMemoryProfile(sceneRisk, {
  device = null,
  currentProfile = "normal",
  priorReliableContextLoss = false,
  historicalContextLoss = false,
  priorFailureProfile = null,
  devicePixelRatio = 1,
  pixelRatioResolutionScaling = true,
  splitScreen = false
} = {}) {
  const scene = sceneRisk ?? {};
  const confidence = ["known", "estimated", "unknown"].includes(scene.confidence) ? scene.confidence : "unknown";
  const decodedMiB = finiteMib(scene.effectiveDecodedBytes);
  const mipmappedMiB = finiteMib(scene.effectiveMipmappedBytes);
  const largestMiB = finiteMib(scene.largestEffectiveRasterBytes);
  const visibleLayers = finiteCount(scene.visibleRasterCount ?? scene.rasterLayerCount);
  const hiddenLayers = finiteCount(scene.hiddenRasterCount);
  const videoCount = finiteCount(scene.visibleVideoCount ?? scene.videoCount);
  const visibleVideoPixels = finiteCount(scene.visibleVideoPixelCount);
  const largestVideoPixels = finiteCount(scene.largestVisibleVideoPixels);
  const dpr = Math.max(1, Number(devicePixelRatio) || Number(device?.pixelRatio) || 1);
  const backingPixels = finiteCount(device?.backingPixels);
  const appleTouch = device?.family === "apple-touch";
  const reasons = [];
  let risk = "low";
  let level = 0;

  if (decodedMiB === null) {
    risk = "unknown";
    level = appleTouch ? 1 : 0;
    reasons.push("Scene raster metadata is unavailable");
  } else {
    if (decodedMiB >= 160 || (visibleLayers >= 5 && decodedMiB >= 120)) {
      risk = "very-high";
      level = 3;
    } else if (decodedMiB >= 96 || (visibleLayers >= 4 && decodedMiB >= 64) || (largestMiB ?? 0) >= 64) {
      risk = "high";
      level = 2;
    } else if (decodedMiB >= 32 || visibleLayers >= 3 || (largestMiB ?? 0) >= 32) {
      risk = "moderate";
      level = 1;
    }
    if (decodedMiB >= 32) reasons.push(`Effective raster aggregate is approximately ${Math.round(decodedMiB)} MiB`);
    if ((mipmappedMiB ?? 0) >= 96) reasons.push(`Mipmapped-equivalent aggregate is approximately ${Math.round(mipmappedMiB)} MiB`);
    if ((largestMiB ?? 0) >= 32) reasons.push(`Largest effective raster is approximately ${Math.round(largestMiB)} MiB`);
  }
  if (visibleLayers >= 3) reasons.push(`${visibleLayers} visible raster layers create simultaneous pressure`);
  if (hiddenLayers > 0) reasons.push(`${hiddenLayers} hidden raster layer${hiddenLayers === 1 ? " is" : "s are"} catalogued`);
  if (videoCount > 0) {
    const megapixels = visibleVideoPixels > 0 ? ` (${roundOne(visibleVideoPixels / 1_000_000)} MP rendered)` : "";
    reasons.push(`${videoCount} visible video tile${videoCount === 1 ? "" : "s"}${megapixels}`);
    if (visibleVideoPixels >= 16_000_000 && (decodedMiB ?? 0) >= 32 && level < 3) {
      level += 1;
      if (risk === "low") risk = "moderate";
      reasons.push("Large simultaneous video surfaces add material rendering pressure");
    }
  }
  if (scene.derivativeStatus === "complete") reasons.push("Effective mobile derivatives are active");
  else if (["missing", "partial"].includes(scene.derivativeStatus)) reasons.push(`Mobile derivative coverage is ${scene.derivativeStatus}`);
  if (scene.substitutionStatus && scene.substitutionStatus !== "active") reasons.push(`Derivative aliases are ${scene.substitutionStatus}`);
  if (dpr > 1 && pixelRatioResolutionScaling) {
    reasons.push(`High-density backing pixels are enabled at DPR ${roundOne(dpr)}${backingPixels ? ` (${roundOne(backingPixels / 1_000_000)} MP)` : ""}`);
    if (backingPixels >= 14_000_000 && (decodedMiB ?? 0) >= 64 && level < 3) {
      level += 1;
      if (risk === "low") risk = "moderate";
    }
  }
  if (splitScreen && ["high", "very-high"].includes(risk)) reasons.push("Split Screen reduces remaining headroom");
  if (appleTouch) reasons.push("Apple touch/WebKit device family has constrained process headroom");
  if (historicalContextLoss && !priorReliableContextLoss) reasons.push("An older graphics context loss is recorded for this browser");
  if (priorReliableContextLoss) {
    reasons.push("A reliable graphics context loss was previously recorded");
    const failureLevel = priorFailureProfile ? memoryProfileLevel(priorFailureProfile) : memoryProfileLevel(currentProfile);
    level = Math.max(level, Math.min(3, failureLevel + 1));
    if (level >= 3) risk = "very-high";
  }
  level = Math.max(0, Math.min(3, level));
  const recommendedMinimumProfile = ["normal", "balanced", "strong", "maximum"][level];
  return Object.freeze({
    recommendedMinimumProfile,
    risk,
    confidence,
    reasons: Object.freeze(reasons),
    exceedsMaximum: recommendedMinimumProfile === "maximum" && risk === "very-high",
    inputs: Object.freeze({
      effectiveDecodedBytes: Number.isFinite(scene.effectiveDecodedBytes) ? Number(scene.effectiveDecodedBytes) : null,
      effectiveMipmappedBytes: Number.isFinite(scene.effectiveMipmappedBytes) ? Number(scene.effectiveMipmappedBytes) : null,
      originalDecodedBytes: Number.isFinite(scene.originalDecodedBytes) ? Number(scene.originalDecodedBytes) : null,
      largestEffectiveRasterBytes: Number.isFinite(scene.largestEffectiveRasterBytes) ? Number(scene.largestEffectiveRasterBytes) : null,
      visibleRasterCount: visibleLayers,
      hiddenRasterCount: hiddenLayers,
      videoCount,
      visibleVideoPixelCount: visibleVideoPixels,
      largestVisibleVideoPixels: largestVideoPixels,
      backingPixelCount: backingPixels,
      devicePixelRatio: dpr,
      pixelRatioResolutionScaling: Boolean(pixelRatioResolutionScaling),
      splitScreen: Boolean(splitScreen)
    })
  });
}

export function targetDimensions(width, height, { profile = "balanced", longEdge = null, aggregateDecodedBytes = 0, localize = null } = {}) {
  const sourceWidth = positiveInteger(width);
  const sourceHeight = positiveInteger(height);
  if (!sourceWidth || !sourceHeight) throw new Error(localizedText(localize, "VEMOBILE.Errors.Asset1", "Source dimensions are unavailable."));
  const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
  let targetLongEdge;
  if (profile === "custom") {
    targetLongEdge = positiveInteger(longEdge);
    if (!targetLongEdge) throw new Error(localizedText(localize, "VEMOBILE.Errors.Asset2", "Choose a valid custom long edge."));
  } else if (profile === "conservative") {
    targetLongEdge = Number(aggregateDecodedBytes) >= 192 * 1048576 ? 2048 : 2560;
  } else if (profile === "balanced") {
    targetLongEdge = Number(aggregateDecodedBytes) >= 256 * 1048576 ? 2560 : 3072;
  } else {
    throw new Error(localizedText(localize, "VEMOBILE.Errors.Asset3", "That optimization profile is not supported."));
  }
  targetLongEdge = Math.min(sourceLongEdge, targetLongEdge);
  const scale = targetLongEdge / sourceLongEdge;
  return Object.freeze({
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    longEdge: targetLongEdge,
    scaled: scale < 1,
    decodedBytes: decodedRgbaBytes(Math.max(1, Math.round(sourceWidth * scale)), Math.max(1, Math.round(sourceHeight * scale)))
  });
}

export function deterministicDerivativeName(sourceHash, width, height, localize = null) {
  const hash = normalizedHash(sourceHash);
  const w = positiveInteger(width);
  const h = positiveInteger(height);
  if (!hash || !w || !h) throw new Error(localizedText(localize, "VEMOBILE.Errors.Asset4", "Derivative identity is incomplete."));
  return `${hash.slice(0, 24)}-${w}x${h}.webp`;
}

export function mappingIsStale(mapping, { sourceHash, width, height } = {}) {
  if (!mapping || Number(mapping.schemaVersion) !== MOBILE_DERIVATIVE_SCHEMA_VERSION) return true;
  const hash = normalizedHash(sourceHash);
  return !hash
    || mapping.sourceHash !== hash
    || Number(mapping.sourceWidth) !== positiveInteger(width)
    || Number(mapping.sourceHeight) !== positiveInteger(height);
}

export function activateDerivative(catalog, canonicalSource, derivative, localize = null) {
  if (catalog?.schemaVersion !== MOBILE_ASSET_CATALOG_VERSION || !catalog.assets?.[canonicalSource]) {
    throw new Error(localizedText(localize, "VEMOBILE.Errors.Asset5", "The source asset is no longer present in the catalog."));
  }
  const current = catalog.assets[canonicalSource];
  if (mappingIsStale(derivative, { sourceHash: current.sourceHash, width: current.width, height: current.height })) {
    throw new Error(localizedText(localize, "VEMOBILE.Errors.Asset6", "The derivative does not match the current source asset."));
  }
  const assets = { ...catalog.assets, [canonicalSource]: { ...current, derivative: { ...derivative, status: "active", enabled: true } } };
  return freezeCatalog({ ...catalog, assets, scenes: buildSceneCatalog(sceneReferenceRecords(catalog, assets), assets) });
}

export function updateDerivativeState(catalog, canonicalSource, { enabled, remove = false, localize = null } = {}) {
  const current = catalog?.assets?.[canonicalSource];
  if (!current) throw new Error(localizedText(localize, "VEMOBILE.Errors.Asset7", "The source asset is no longer present in the catalog."));
  const assets = { ...catalog.assets };
  if (remove) {
    const { derivative, ...asset } = current;
    assets[canonicalSource] = asset;
  } else if (current.derivative) {
    assets[canonicalSource] = { ...current, derivative: { ...current.derivative, enabled: Boolean(enabled), status: enabled ? "active" : "disabled" } };
  }
  return freezeCatalog({ ...catalog, assets, scenes: buildSceneCatalog(sceneReferenceRecords(catalog, assets), assets) });
}

function effectiveAssetRecord(asset) {
  const derivative = asset?.derivative;
  const active = derivative?.enabled !== false && derivative?.status === "active" && !mappingIsStale(derivative, {
    sourceHash: asset?.sourceHash,
    width: asset?.width,
    height: asset?.height
  });
  const decodedBytes = active ? decodedRgbaBytes(derivative.width, derivative.height) : asset?.decodedBytes;
  return { decodedBytes, mipmappedBytes: mipmappedBytes(decodedBytes), derivativeActive: active };
}

function aggregateRisk(totalBytes, surfaceCount, known, unknownCount) {
  if (!known.length) return "unknown";
  if (unknownCount > 0 && totalBytes < 96 * 1048576) return "unknown";
  const veryHighAssets = known.filter((asset) => asset.risk === "very-high").length;
  const highAssets = known.filter((asset) => asset.risk === "high").length;
  if (totalBytes > 192 * 1048576 || veryHighAssets > 0 || highAssets >= 3) return "very-high";
  if (totalBytes >= 96 * 1048576 || highAssets > 0 || (surfaceCount >= 4 && totalBytes >= 64 * 1048576)) return "high";
  if (totalBytes >= 32 * 1048576) return "moderate";
  return "low";
}

function buildSceneReferenceAssets(scene, assets) {
  return (scene.sources ?? []).map((source) => assets[source]).filter(Boolean);
}

function sceneReferenceRecords(catalog, assets) {
  return Object.values(catalog.scenes ?? {}).map((scene) => ({
    id: scene.id,
    name: scene.name,
    references: Array.isArray(scene.references) && scene.references.length
      ? scene.references.map((entry) => ({ ...entry }))
      : buildSceneReferenceAssets(scene, assets).map((asset) => ({ canonicalSource: asset.canonicalSource, mediaKind: asset.mediaKind, hidden: false }))
  }));
}

function normalizeDerivative(value, source) {
  if (!value || typeof value !== "object") return null;
  const width = positiveInteger(value.width);
  const height = positiveInteger(value.height);
  const sourceHash = normalizedHash(value.sourceHash);
  const hash = normalizedHash(value.hash);
  const path = canonicalAssetSource(value.source);
  if (!width || !height || !sourceHash || !hash || !path) return null;
  const stale = mappingIsStale(value, source);
  return Object.freeze({
    schemaVersion: MOBILE_DERIVATIVE_SCHEMA_VERSION,
    canonicalSource: canonicalAssetSource(value.canonicalSource) || null,
    sourceHash,
    sourceWidth: positiveInteger(value.sourceWidth),
    sourceHeight: positiveInteger(value.sourceHeight),
    source: path,
    hash,
    width,
    height,
    timestamp: Number(value.timestamp) || 0,
    profile: String(value.profile ?? "unknown").slice(0, 40),
    enabled: value.enabled !== false,
    status: stale ? "stale" : value.enabled === false ? "disabled" : "active"
  });
}

/** Own plain catalogue data once; never freeze settings objects or Documents. */
export function freezeCatalog(catalog) {
  const assets = Object.fromEntries(Object.entries(catalog.assets ?? {}).map(([key, asset]) => [key, Object.freeze({
    ...asset,
    scenes: Object.freeze([...(asset.scenes ?? [])].map((scene) => Object.freeze({ ...scene }))),
    roles: Object.freeze([...(asset.roles ?? [])]),
    ...(asset.derivative ? { derivative: Object.freeze({ ...asset.derivative }) } : {})
  })]));
  const scenes = Object.fromEntries(Object.entries(catalog.scenes ?? {}).map(([key, scene]) => [key, Object.freeze({
    ...scene,
    sources: Object.freeze([...(scene.sources ?? [])]),
    references: Object.freeze([...(scene.references ?? [])].map((entry) => Object.freeze({ ...entry })))
  })]));
  return Object.freeze({ ...catalog, assets: Object.freeze(assets), scenes: Object.freeze(scenes) });
}

/** Repair matching stored-stale mappings in one immutable transaction. */
export function repairDerivativeStatuses(catalog, onWork = () => {}) {
  let assets = null;
  for (const [source, asset] of Object.entries(catalog.assets ?? {})) {
    const derivative = asset?.derivative;
    if (!derivative || derivative.status !== "stale" || mappingIsStale(derivative, {
      sourceHash: asset.sourceHash, width: asset.width, height: asset.height
    })) continue;
    assets ??= { ...catalog.assets };
    assets[source] = { ...asset, derivative: { ...derivative,
      status: derivative.enabled === false ? "disabled" : "active", enabled: derivative.enabled !== false } };
    onWork("catalogue.repair.record");
  }
  if (!assets) return catalog;
  onWork("catalogue.build");
  const scenes = buildSceneCatalog(sceneReferenceRecords(catalog, assets), assets);
  onWork("catalogue.freeze");
  return freezeCatalog({ ...catalog, assets, scenes });
}

function collectionValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return typeof value.values === "function" ? [...value.values()] : [...value]; } catch { return []; }
}

function sumKnown(values, key) {
  return values.reduce((sum, value) => sum + Number(value?.[key] ?? 0), 0);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function finiteMib(value) {
  if (value === null || value === undefined || value === "") return null;
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes / 1048576 : null;
}

function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

function memoryProfileLevel(profile) {
  const index = ["normal", "balanced", "strong", "maximum"].indexOf(String(profile ?? "").toLowerCase());
  return Math.max(0, index);
}

function roundOne(value) {
  return Math.round(Number(value) * 10) / 10;
}

function normalizedHash(value) {
  const hash = String(value ?? "").toLowerCase();
  return /^[a-f0-9]{64}$/u.test(hash) ? hash : "";
}

function normalizeTransparency(value) {
  return value === true ? "yes" : value === false ? "no" : "unknown";
}

function plainDevicePolicy(value) {
  return Object.freeze({
    family: String(value?.family ?? "unknown"),
    tier: String(value?.tier ?? "unknown"),
    tierReason: String(value?.tierReason ?? "unknown"),
    memoryGb: finiteOptionalNumber(value?.memoryGb),
    logicalCores: finiteOptionalNumber(value?.logicalCores),
    backingPixels: finiteOptionalNumber(value?.backingPixels)
  });
}

function finiteOptionalNumber(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
