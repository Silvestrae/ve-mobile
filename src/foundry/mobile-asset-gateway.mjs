import { classifyRuntimeMode } from "./activation-policy.mjs";
import { KEYS, MODULE_ID } from "./preferences.mjs";
import { localizeFoundry } from "./localization.mjs";
import {
  MOBILE_ASSET_CATALOG_VERSION,
  MOBILE_DERIVATIVE_SCHEMA_VERSION,
  activateDerivative,
  buildCatalog,
  buildSceneCatalog,
  canonicalAssetSource,
  collectSceneAssetReferences,
  deterministicDerivativeName,
  mappingIsStale,
  freezeCatalog,
  repairDerivativeStatuses,
  recommendSceneMemoryProfile,
  sceneRiskRecord,
  targetDimensions,
  updateDerivativeState
} from "../kernel/mobile-memory-risk.mjs";

const DEFAULT_QUALITY = 0.91;

export function shouldUseMobileDerivatives(setting, physicalDeviceClass) {
  const preference = ["auto", "on", "off"].includes(setting) ? setting : "auto";
  if (preference === "on") return true;
  if (preference === "off") return false;
  return ["phone", "tablet"].includes(physicalDeviceClass);
}

export function createFoundryMobileAssetGateway({
  getGame = () => globalThis.game,
  getPixi = () => globalThis.PIXI,
  getDocument = () => globalThis.document,
  getPhysicalDeviceClass = once(() => classifyRuntimeMode()),
  getPresentationMode = getPhysicalDeviceClass,
  getGraphicsPolicy = () => null,
  getLowMemorySnapshot = () => null,
  getRecovery = () => null,
  getPresentationContext = () => null,
  getConnectionGeneration = () => 0,
  performanceObserver = null,
  readMetadata = readImageMetadata,
  createDerivative = generateWebpDerivative,
  filePicker = () => globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker,
  now = () => Date.now(),
  diagnostics = null
} = {}) {
  const registeredAliases = new Map();
  const cachedOriginals = new Set();
  const reloadRequiredAliases = new Set();
  let activeScan = null;
  let lastAliasStatus = Object.freeze({
    status: "not-initialized",
    enabled: false,
    registered: 0,
    effectiveSources: Object.freeze([]),
    originalAlreadyCached: Object.freeze([]),
    physicalDeviceClass: String(getPhysicalDeviceClass())
  });

  // One owned catalogue and optimiser snapshot per session/revision. Setting
  // replacement is checked by identity; in-place changes invalidate via hooks.
  // No Documents, graph signatures, metadata fetches or policy keys are retained.
  let catalogInput = null;
  let catalogSnapshot = null;
  let optimizerSnapshot = null;
  let sessionKey = "";
  let ownerGeneration = 0;
  const publishedRisks = new Map();
  const count = name => performanceObserver?.increment?.(name);
  const currentSession = () => {
    const game = getGame();
    return `${game?.world?.id ?? ""}:${game?.user?.id ?? ""}:${getConnectionGeneration()}`;
  };
  const invalidateRisk = () => publishedRisks.clear();
  const invalidateCatalog = () => {
    catalogInput = catalogSnapshot = optimizerSnapshot = null;
    invalidateRisk();
  };
  const ensureSession = () => {
    const current = currentSession();
    if (current !== sessionKey) {
      sessionKey = current;
      ownerGeneration += 1;
      activeScan = null;
      invalidateCatalog();
    }
  };
  const readCatalog = () => {
    ensureSession();
    const input = safeSetting(getGame(), MODULE_ID, KEYS.MOBILE_ASSET_CATALOG);
    if (catalogSnapshot && input === catalogInput) return catalogSnapshot;
    invalidateCatalog();
    count("catalogue.read.changed");
    const normalized = normalizeCatalog(input);
    const repaired = repairDerivativeStatuses(normalized, count);
    if (repaired === normalized) count("catalogue.freeze");
    catalogSnapshot = repaired === normalized ? freezeCatalog(normalized) : repaired;
    catalogInput = input;
    return catalogSnapshot;
  };
  const captureOperation = (signal) => {
    ensureSession();
    const expectedSession = sessionKey;
    const generation = ownerGeneration;
    return () => {
      ensureSession();
      if (signal?.aborted || sessionKey !== expectedSession || generation !== ownerGeneration) {
        throw new Error(localizeFoundry("VEMOBILE.Assets.SessionExpired", "The asset operation belongs to an expired session."));
      }
      assertGm(getGame());
    };
  };
  const writeCatalog = async (catalog) => {
    assertGm(getGame());
    const checkCurrent = captureOperation();
    await getGame().settings.set(MODULE_ID, KEYS.MOBILE_ASSET_CATALOG, repairCatalogDerivativeStatuses(normalizeCatalog(catalog)));
    checkCurrent();
    return readCatalog();
  };
  const riskContext = ({ assumeMobileDerivatives = false, catalog = readCatalog() } = {}) => {
    const policy = getGraphicsPolicy?.() ?? {};
    const recovery = getRecovery?.() ?? {};
    const lowMemory = getLowMemorySnapshot?.() ?? {};
    const physicalDeviceClass = String(getPhysicalDeviceClass());
    return Object.freeze({
      catalog,
      policy,
      recovery,
      lowMemory,
      physicalDeviceClass,
      presentation: getPresentationContext?.() ?? {},
      // Auto deliberately disables local aliases on desktop hardware. A GM
      // warning describes connected mobile clients, so that advisory evaluates
      // valid catalog mappings independently from the GM's local alias state.
      substitution: assumeMobileDerivatives ? null : lastAliasStatus
    });
  };
  const withRecommendation = (record, context) => {
    const acknowledgedAt = Number(safeSetting(getGame(), MODULE_ID, KEYS.GRAPHICS_RECOVERY_ACKNOWLEDGED) ?? 0);
    const newLoss = Number(context.recovery.lastContextLossAt ?? 0) > acknowledgedAt;
    const decisionRecovery = newLoss ? { ...context.recovery, recentSceneDrawInterruption: false } : {
      ...context.recovery, contextLossThisSession: false, recentSceneDrawInterruption: false,
      recentContextLossCount: 0, repeatedRecentContextLoss: false, historicalContextLoss: false
    };
    const recommendation = adaptRecommendationForCapableAndroid(recommendSceneMemoryProfile(record, {
      device: context.policy.device,
      currentProfile: context.lowMemory.profile,
      priorReliableContextLoss: newLoss && Boolean(context.recovery.repeatedRecentContextLoss),
      historicalContextLoss: false,
      priorFailureProfile: context.recovery.lastContextLoss?.memoryProfile,
      devicePixelRatio: globalThis.window?.devicePixelRatio,
      pixelRatioResolutionScaling: context.lowMemory.current?.["core.pixelRatioResolutionScaling"] !== false,
      splitScreen: Boolean(context.presentation.splitScreen)
    }), context.policy.device, decisionRecovery);
    return Object.freeze({
      ...record,
      ...recommendation,
      recommendation,
      physicalDeviceClass: context.physicalDeviceClass,
      profileRecommendationApplicable: ["phone", "tablet"].includes(context.physicalDeviceClass)
    });
  };
  const risksForScenes = (sceneIds, options = {}) => {
    const ids = [...new Set((sceneIds ?? []).map((sceneId) => String(sceneId ?? "")).filter(Boolean))];
    if (!ids.length) return Object.freeze({});
    count("scene.risk.build");
    const context = riskContext(options);
    const requested = new Set(ids);
    const scenes = collectionValues(getGame()?.scenes).filter((scene) => requested.has(String(scene?.id ?? "")));
    const referenceScenes = collectSceneAssetReferences(scenes, { baseHref: getDocument()?.baseURI ?? "" }).scenes;
    // Live references can change after the last explicit asset scan. Derive only
    // requested Scenes, without rebuilding or repairing the stored catalogue.
    const liveScenes = buildSceneCatalog(referenceScenes, context.catalog.assets);
    const liveCatalog = { ...context.catalog, scenes: { ...context.catalog.scenes, ...liveScenes } };
    const referencesByScene = new Map(referenceScenes.map((scene) => [String(scene.id ?? ""), scene.references ?? []]));
    const result = Object.freeze(Object.fromEntries(ids.map((id) => {
      const risk = sceneRiskRecord(liveCatalog, id, {
        devicePolicy: context.policy.device,
        priorGraphicsLoss: Number(context.recovery.lastContextLossAt ?? 0)
          > Number(safeSetting(getGame(), MODULE_ID, KEYS.GRAPHICS_RECOVERY_ACKNOWLEDGED) ?? 0),
        lowMemory: Boolean(context.lowMemory.active),
        substitution: context.substitution
      });
      const references = referencesByScene.get(id);
      if (!references) return [id, withRecommendation(risk, context)];
      const raster = references.filter((entry) => entry.mediaKind === "raster");
      const video = references.filter((entry) => entry.mediaKind === "video");
      return [id, withRecommendation(Object.freeze({
        ...risk,
        rasterLayerCount: raster.length,
        visibleRasterCount: raster.filter((entry) => !entry.hidden).length,
        hiddenRasterCount: raster.filter((entry) => entry.hidden).length,
        videoCount: video.length,
        visibleVideoCount: video.filter((entry) => !entry.hidden).length,
        hiddenVideoCount: video.filter((entry) => entry.hidden).length,
        visibleVideoPixelCount: video.filter((entry) => !entry.hidden).reduce((total, entry) => total + (Number(entry.width) || 0) * (Number(entry.height) || 0), 0),
        largestVisibleVideoPixels: video.filter((entry) => !entry.hidden).reduce((maximum, entry) => Math.max(maximum, (Number(entry.width) || 0) * (Number(entry.height) || 0)), 0)
      }), context)];
    })));
    if (!options.assumeMobileDerivatives) {
      for (const [id, risk] of Object.entries(result)) {
        publishedRisks.delete(id);
        publishedRisks.set(id, risk);
        if (publishedRisks.size > 128) publishedRisks.delete(publishedRisks.keys().next().value);
      }
    }
    return result;
  };
  const riskForScene = (sceneId, options = {}) => risksForScenes([sceneId], options)[String(sceneId ?? "")];

  const api = {
    registerAliases() {
      const preference = safeSetting(getGame(), MODULE_ID, KEYS.MOBILE_OPTIMIZED_ASSETS) ?? "auto";
      const physicalDeviceClass = String(getPhysicalDeviceClass());
      const presentationMode = String(getPresentationMode());
      const enabled = ["phone", "tablet"].includes(presentationMode)
        && shouldUseMobileDerivatives(preference, presentationMode);
      if (!enabled) {
        lastAliasStatus = Object.freeze({
          status: registeredAliases.size || reloadRequiredAliases.size ? "reload-required" : "disabled",
          enabled: false,
          registered: registeredAliases.size,
          effectiveSources: Object.freeze([]),
          originalAlreadyCached: Object.freeze([...cachedOriginals]),
          reloadRequiredAliases: Object.freeze([...reloadRequiredAliases]),
          physicalDeviceClass,
          preference
        });
        return lastAliasStatus;
      }
      const pixi = getPixi();
      const catalog = readCatalog();
      if (!pixi?.Assets?.add || !catalog) {
        lastAliasStatus = Object.freeze({
          status: "unavailable",
          enabled: true,
          registered: registeredAliases.size,
          effectiveSources: Object.freeze([]),
          originalAlreadyCached: Object.freeze([...cachedOriginals]),
          physicalDeviceClass,
          preference
        });
        return lastAliasStatus;
      }
      const effectiveSources = [];
      for (const asset of Object.values(catalog.assets ?? {})) {
        const derivative = asset.derivative;
        if (!eligibleDerivative(asset, derivative)) continue;
        let effective = true;
        for (const [alias, src] of normalizedAliasPairs(asset.canonicalSource, derivative.source, getDocument()?.baseURI)) {
          if (registeredAliases.get(alias) === src) continue;
          if (registeredAliases.has(alias)) {
            reloadRequiredAliases.add(alias);
            effective = false;
            continue;
          }
          if (pixi.Assets.cache?.has?.(alias)) {
            cachedOriginals.add(alias);
            effective = false;
            continue;
          }
          try {
            pixi.Assets.add({ alias, src });
            registeredAliases.set(alias, src);
          } catch (error) {
            effective = false;
            diagnostics?.record?.("warn", `Mobile derivative alias could not be registered: ${alias}`, error);
          }
        }
        if (effective) effectiveSources.push(asset.canonicalSource);
      }
      const status = reloadRequiredAliases.size ? "reload-required" : cachedOriginals.size ? "reload-recommended" : "active";
      lastAliasStatus = Object.freeze({
        status,
        enabled: true,
        registered: registeredAliases.size,
        effectiveSources: Object.freeze(effectiveSources),
        originalAlreadyCached: Object.freeze([...cachedOriginals]),
        reloadRequiredAliases: Object.freeze([...reloadRequiredAliases]),
        physicalDeviceClass,
        preference
      });
      return lastAliasStatus;
    },

    aliasStatus: () => lastAliasStatus,
    catalog: readCatalog,
    riskForScene,
    risksForScenes,
    publishedRiskForScene(sceneId) {
      ensureSession();
      return publishedRisks.get(String(sceneId ?? "")) ?? null;
    },
    invalidateCatalog,
    invalidateRisk,
    watch(owner) {
      owner.hook("updateSetting", setting => {
        const key = String(setting?.key ?? setting?.id ?? "");
        if (key === `${MODULE_ID}.${KEYS.MOBILE_ASSET_CATALOG}`) invalidateCatalog();
        else invalidateRisk();
      });
      for (const hook of ["createScene", "updateScene", "deleteScene", "createTile", "updateTile", "deleteTile"]) {
        owner.hook(hook, () => invalidateRisk());
      }
      owner.own(() => {
        ownerGeneration += 1;
        activeScan = null;
        invalidateCatalog();
      });
    },

    snapshot({ catalog = readCatalog() } = {}) {
      const game = getGame();
      const physicalDeviceClass = String(getPhysicalDeviceClass());
      const isGm = Boolean(game?.user?.isGM);
      if (optimizerSnapshot?.catalog === catalog && optimizerSnapshot.value.aliasStatus === lastAliasStatus
        && optimizerSnapshot.value.scanning === Boolean(activeScan) && optimizerSnapshot.value.isGm === isGm
        && optimizerSnapshot.value.physicalDeviceClass === physicalDeviceClass) return optimizerSnapshot.value;
      const assets = Object.values(catalog?.assets ?? {}).map((asset) => optimizerAssetRow(asset, catalog));
      const scenes = Object.values(catalog?.scenes ?? {});
      const value = Object.freeze({
        schemaVersion: catalog?.schemaVersion ?? MOBILE_ASSET_CATALOG_VERSION,
        generatedAt: Number(catalog?.generatedAt ?? 0),
        isGm,
        physicalDeviceClass,
        assets: Object.freeze(assets),
        scenes: Object.freeze(scenes),
        aliasStatus: lastAliasStatus,
        scanning: Boolean(activeScan)
      });
      optimizerSnapshot = { catalog, value };
      return value;
    },
    diagnosticsForScene(sceneId) {
      const catalog = readCatalog();
      return Object.freeze({ assets: api.snapshot({ catalog }), risk: riskForScene(sceneId, { catalog }) });
    },

    async scan({ onProgress = () => {}, signal } = {}) {
      const game = getGame();
      assertGm(game);
      if (activeScan) throw new Error(localizeFoundry("VEMOBILE.Assets.ScanRunning", "A mobile asset scan is already running."));
      const checkCurrent = captureOperation(signal);
      const previous = readCatalog();
      const token = {};
      activeScan = token;
      try {
        const references = collectSceneAssetReferences(game.scenes, { baseHref: getDocument()?.baseURI ?? "" });
        const rasterAssets = references.assets.filter((asset) => asset.mediaKind === "raster");
        const metadata = new Map();
        for (let index = 0; index < rasterAssets.length; index += 1) {
          if (signal?.aborted || activeScan !== token) return Object.freeze({ cancelled: true, processed: index, total: rasterAssets.length });
          const asset = rasterAssets[index];
          onProgress(Object.freeze({ phase: "scan", index, total: rasterAssets.length, source: asset.canonicalSource }));
          try {
            const info = await readMetadata(resolveAssetUrl(asset.canonicalSource, getDocument()?.baseURI));
            metadata.set(asset.canonicalSource, info);
          } catch (error) {
            metadata.set(asset.canonicalSource, Object.freeze({ error: String(error?.message ?? error) }));
            diagnostics?.record?.("warn", `Could not inspect mobile asset ${asset.canonicalSource}`, error);
          }
        }
        if (signal?.aborted || activeScan !== token) return Object.freeze({ cancelled: true, processed: metadata.size, total: rasterAssets.length });
        checkCurrent();
        if (readCatalog() !== previous) throw new Error(localizeFoundry("VEMOBILE.Assets.CatalogChanged", "The catalog changed while the scan was running. Scan again."));
        const catalog = buildCatalog({ references, metadata, previous, generatedAt: now() });
        const stored = await writeCatalog(catalog);
        onProgress(Object.freeze({ phase: "complete", index: rasterAssets.length, total: rasterAssets.length }));
        return Object.freeze({ cancelled: false, catalog: stored, processed: rasterAssets.length, total: rasterAssets.length });
      } finally {
        if (activeScan === token) activeScan = null;
      }
    },

    cancelScan() {
      activeScan = null;
    },

    async generate({ sources, profile = "balanced", longEdge = null, quality = DEFAULT_QUALITY, onProgress = () => {}, signal } = {}) {
      const game = getGame();
      assertGm(game);
      const checkCurrent = captureOperation(signal);
      const selected = [...new Set((sources ?? []).map((source) => canonicalAssetSource(source, getDocument()?.baseURI)).filter(Boolean))];
      const results = [];
      for (let index = 0; index < selected.length; index += 1) {
        if (signal?.aborted) return Object.freeze({ cancelled: true, results: Object.freeze(results) });
        const source = selected[index];
        onProgress(Object.freeze({ phase: "generate", index, total: selected.length, source }));
        try {
          const result = await generateOne({ source, profile, longEdge, quality, game, getDocument, readCatalog, writeCatalog, readMetadata, createDerivative, filePicker, now, checkCurrent });
          checkCurrent();
          results.push(Object.freeze({ source, ok: true, ...result }));
          api.registerAliases();
        } catch (error) {
          diagnostics?.record?.("warn", `Mobile derivative generation failed for ${source}`, error);
          results.push(Object.freeze({ source, ok: false, error: String(error?.message ?? error) }));
        }
      }
      onProgress(Object.freeze({ phase: "complete", index: selected.length, total: selected.length }));
      return Object.freeze({ cancelled: false, results: Object.freeze(results) });
    },

    async setMappingEnabled(source, enabled) {
      assertGm(getGame());
      const canonical = canonicalAssetSource(source, getDocument()?.baseURI);
      const stored = await writeCatalog(updateDerivativeState(readCatalog(), canonical, { enabled, localize: localizeFoundry }));
      if (enabled) api.registerAliases();
      else {
        markAliasReloadRequired(canonical, registeredAliases, reloadRequiredAliases, getDocument()?.baseURI);
        api.registerAliases();
      }
      return stored;
    },

    async removeMapping(source) {
      assertGm(getGame());
      const canonical = canonicalAssetSource(source, getDocument()?.baseURI);
      const stored = await writeCatalog(updateDerivativeState(readCatalog(), canonical, { remove: true, localize: localizeFoundry }));
      markAliasReloadRequired(canonical, registeredAliases, reloadRequiredAliases, getDocument()?.baseURI);
      api.registerAliases();
      return stored;
    },

    async confirmSceneRisk(scene, risk = riskForScene(scene?.id)) {
      if (!risk?.warningRequired || (risk.profileRecommendationApplicable === false && !risk.priorGraphicsLoss)) return "open";
      const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
      const confirmText = localizeFoundry("VEMOBILE.Assets.SceneRiskConfirm", "This scene has many large images or effects, which may slow down a phone or tablet. Open it anyway?");
      if (!DialogV2?.wait) return globalThis.confirm?.(confirmText) ? "open" : "cancel";
      const visibleCount = Math.max(0, Number(risk.visibleRasterCount) || 0);
      const warningBody = localizeFoundry(visibleCount === 1 ? "VEMOBILE.Assets.SceneRiskWarningOne" : "VEMOBILE.Assets.SceneRiskWarningMany", visibleCount === 1
        ? "This scene has {count} visible image layer. Scenes with many large images or effects may run slowly on a phone or tablet. This is a precaution based on the scene, not a measurement of available hardware memory."
        : "This scene has {count} visible image layers. Scenes with many large images or effects may run slowly on a phone or tablet. This is a precaution based on the scene, not a measurement of available hardware memory.", { count: visibleCount });
      return DialogV2.wait({
        classes: ["ve-scene-memory-warning"],
        window: { title: localizeFoundry("VEMOBILE.Assets.PreflightTitle", "Check this scene before opening it") },
        content: `<div class="ve-scene-memory-warning-copy"><p>${escapeHtml(warningBody)}</p></div>`,
        buttons: [
          { action: "cancel", label: localizeFoundry("VEMOBILE.Assets.Cancel", "Cancel") },
          { action: "settings", label: localizeFoundry("VEMOBILE.Assets.GraphicsSettings", "Graphics settings") },
          { action: "open", label: localizeFoundry("VEMOBILE.Assets.OpenSceneAnyway", "Open scene anyway"), default: true }
        ],
        close: () => "cancel"
      });
    }
  };
  return Object.freeze(api);
}

async function generateOne({ source, profile, longEdge, quality, game, getDocument, readCatalog, writeCatalog, readMetadata, createDerivative, filePicker, now, checkCurrent }) {
  checkCurrent();
  const catalog = readCatalog();
  const asset = catalog?.assets?.[source];
  if (!asset || asset.mediaKind !== "raster") throw new Error(localizeFoundry("VEMOBILE.Assets.NotInCatalog", "That raster source is not in the current catalog."));
  const sourceUrl = resolveAssetUrl(source, getDocument()?.baseURI);
  const metadata = await readMetadata(sourceUrl, { includeBlob: true });
  if (!metadata?.sourceHash || !metadata?.blob) throw new Error(localizeFoundry("VEMOBILE.Assets.SourceUnverified", "The source could not be verified."));
  checkCurrent();
  const currentHash = String(asset.sourceHash ?? "");
  if (currentHash && currentHash !== metadata.sourceHash) throw new Error(localizeFoundry("VEMOBILE.Assets.SourceChanged", "The source changed after the last scan. Scan again before generating a derivative."));
  const sceneAggregate = Math.max(0, ...(asset.scenes ?? []).map((scene) => Number(catalog.scenes?.[scene.id]?.originalDecodedBytes ?? 0)));
  const dimensions = targetDimensions(metadata.width, metadata.height, { profile, longEdge, aggregateDecodedBytes: sceneAggregate, localize: localizeFoundry });
  const existing = asset.derivative;
  const picker = filePicker();
  if (!picker?.upload || !picker?.browse) throw new Error(localizeFoundry("VEMOBILE.Assets.StorageUnavailable", "Foundry file storage is unavailable."));
  if (eligibleDerivative({ ...asset, sourceHash: metadata.sourceHash, width: metadata.width, height: metadata.height }, existing)
    && existing.width === dimensions.width && existing.height === dimensions.height && existing.profile === profile
    && await fileExists(picker, existing.source)) {
      checkCurrent();
      return Object.freeze({ reused: true, derivative: existing });
  }
  const derivative = await createDerivative(metadata.blob, dimensions, { quality });
  checkCurrent();
  if (!derivative?.blob || derivative.width !== dimensions.width || derivative.height !== dimensions.height) {
    throw new Error(localizeFoundry("VEMOBILE.Assets.DimensionVerificationFailed", "The generated derivative failed dimension verification."));
  }
  const derivativeHash = await sha256Hex(await derivative.blob.arrayBuffer());
  checkCurrent();
  const worldId = safePathSegment(game?.world?.id);
  if (!worldId) throw new Error(localizeFoundry("VEMOBILE.Assets.WorldUnavailable", "The active world is unavailable."));
  const folder = `worlds/${worldId}/ve-mobile-optimized`;
  await ensureDirectory(picker, folder);
  checkCurrent();
  const fileName = deterministicDerivativeName(metadata.sourceHash, dimensions.width, dimensions.height, localizeFoundry);
  const file = new File([derivative.blob], fileName, { type: "image/webp" });
  const uploaded = await picker.upload("data", folder, file, {}, { notify: false });
  checkCurrent();
  const uploadedPath = canonicalAssetSource(uploaded?.path);
  if (!uploadedPath) throw new Error(localizeFoundry("VEMOBILE.Assets.UploadPathMissing", "Foundry did not return an uploaded derivative path."));
  const listing = await picker.browse("data", folder);
  const files = Array.isArray(listing?.files) ? listing.files.map((entry) => canonicalAssetSource(entry)) : [];
  if (!files.includes(uploadedPath)) throw new Error(localizeFoundry("VEMOBILE.Assets.UploadVerificationFailed", "The uploaded derivative could not be verified in Foundry storage."));
  checkCurrent();
  const mapping = Object.freeze({
    schemaVersion: MOBILE_DERIVATIVE_SCHEMA_VERSION,
    canonicalSource: source,
    sourceHash: metadata.sourceHash,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    source: uploadedPath,
    hash: derivativeHash,
    width: dimensions.width,
    height: dimensions.height,
    timestamp: Number(now()),
    profile,
    enabled: true,
    status: "active"
  });
  const latest = readCatalog();
  const latestAsset = latest?.assets?.[source];
  if (!latestAsset || latestAsset.derivative !== asset.derivative
    || mappingIsStale(mapping, { sourceHash: latestAsset.sourceHash, width: latestAsset.width, height: latestAsset.height })) throw new Error(localizeFoundry("VEMOBILE.Assets.CatalogChangedMapping", "The catalog changed before the mapping could be activated."));
  const stored = await writeCatalog(activateDerivative(latest, source, mapping, localizeFoundry));
  checkCurrent();
  return Object.freeze({ reused: false, derivative: stored.assets[source].derivative });
}

export async function readImageMetadata(url, {
  includeBlob = false,
  fetchFn = globalThis.fetch,
  createBitmap = globalThis.createImageBitmap
} = {}) {
  if (typeof fetchFn !== "function") throw new Error(localizeFoundry("VEMOBILE.Assets.ImageFetchUnavailable", "Image fetch is unavailable."));
  const response = await fetchFn(url, { credentials: "same-origin" });
  if (!response?.ok) throw new Error(localizeFoundry("VEMOBILE.Assets.ImageFetchFailed", "Image request failed ({status}).", { status: response?.status ?? "unknown" }));
  const blob = await response.blob();
  const sourceHash = await sha256Hex(await blob.arrayBuffer());
  let bitmap;
  try {
    if (typeof createBitmap === "function") bitmap = await createBitmap(blob);
    else bitmap = await loadImageElement(url);
    const width = Number(bitmap?.naturalWidth ?? bitmap?.width);
    const height = Number(bitmap?.naturalHeight ?? bitmap?.height);
    if (!(width > 0) || !(height > 0)) throw new Error(localizeFoundry("VEMOBILE.Assets.ImageDimensionsUnavailable", "The image dimensions are unavailable."));
    return Object.freeze({
      width: Math.round(width),
      height: Math.round(height),
      fileSize: Number(blob.size) || 0,
      sourceHash,
      transparency: /png|webp|avif/iu.test(blob.type) ? null : false,
      ...(includeBlob ? { blob } : {})
    });
  } finally {
    bitmap?.close?.();
    if (bitmap && "src" in bitmap) bitmap.src = "";
    bitmap = null;
  }
}

export async function generateWebpDerivative(blob, dimensions, {
  quality = DEFAULT_QUALITY,
  createBitmap = globalThis.createImageBitmap,
  createCanvas = () => globalThis.document?.createElement?.("canvas")
} = {}) {
  let bitmap;
  let verify;
  let objectUrl = null;
  const canvas = createCanvas();
  if (!canvas) throw new Error(localizeFoundry("VEMOBILE.Assets.CanvasUnavailable", "Image canvas generation is unavailable."));
  try {
    if (typeof createBitmap === "function") bitmap = await createBitmap(blob);
    else {
      objectUrl = URL.createObjectURL(blob);
      bitmap = await loadImageElement(objectUrl);
    }
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext?.("2d", { alpha: true });
    if (!context) throw new Error(localizeFoundry("VEMOBILE.Assets.ContextUnavailable", "A 2D image context is unavailable."));
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    const output = await canvasToBlob(canvas, "image/webp", clampQuality(quality));
    verify = typeof createBitmap === "function" ? await createBitmap(output) : null;
    if (verify && (verify.width !== dimensions.width || verify.height !== dimensions.height)) throw new Error(localizeFoundry("VEMOBILE.Assets.WebpDimensionsUnexpected", "The WebP derivative decoded at unexpected dimensions."));
    return Object.freeze({ blob: output, width: dimensions.width, height: dimensions.height });
  } finally {
    bitmap?.close?.();
    verify?.close?.();
    canvas.width = 1;
    canvas.height = 1;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    bitmap = verify = null;
  }
}

export function normalizedAliasPairs(source, derivative, baseHref = "") {
  const canonicalSource = canonicalAssetSource(source, baseHref);
  const canonicalDerivative = canonicalAssetSource(derivative, baseHref);
  if (!canonicalSource || !canonicalDerivative) return Object.freeze([]);
  const pairs = new Map([[canonicalSource, canonicalDerivative]]);
  try {
    const absoluteSource = new URL(canonicalSource, baseHref).href;
    const absoluteDerivative = new URL(canonicalDerivative, baseHref).href;
    pairs.set(absoluteSource, absoluteDerivative);
  } catch {
    // Relative aliases remain sufficient when the page base is unavailable.
  }
  return Object.freeze([...pairs].map(([alias, src]) => Object.freeze([alias, src])));
}

function optimizerAssetRow(asset, catalog) {
  const derivativeBytes = asset.derivative?.width && asset.derivative?.height ? asset.derivative.width * asset.derivative.height * 4 : null;
  const stale = asset.derivative ? mappingIsStale(asset.derivative, { sourceHash: asset.sourceHash, width: asset.width, height: asset.height }) : false;
  return Object.freeze({
    ...asset,
    dimensionFlags: Object.freeze({
      over2048: Math.max(Number(asset.width) || 0, Number(asset.height) || 0) > 2048,
      atLeast4096: Math.max(Number(asset.width) || 0, Number(asset.height) || 0) >= 4096,
      over4096: Math.max(Number(asset.width) || 0, Number(asset.height) || 0) > 4096
    }),
    stale,
    missingDerivative: !asset.derivative,
    expectedReductionBytes: Number.isFinite(asset.decodedBytes) && Number.isFinite(derivativeBytes) ? Math.max(0, asset.decodedBytes - derivativeBytes) : null,
    scenePressure: Math.max(0, ...(asset.scenes ?? []).map((scene) => Number(catalog.scenes?.[scene.id]?.originalDecodedBytes ?? 0)))
  });
}

function eligibleDerivative(asset, derivative) {
  return Boolean(derivative?.enabled !== false
    && derivative?.status === "active"
    && derivative?.source
    && !mappingIsStale(derivative, { sourceHash: asset?.sourceHash, width: asset?.width, height: asset?.height }));
}

export function repairCatalogDerivativeStatuses(catalog) {
  return repairDerivativeStatuses(normalizeCatalog(catalog));
}

function adaptRecommendationForCapableAndroid(recommendation, device, recovery) {
  const recentFailure = Boolean(
    recovery?.contextLossThisSession
    || recovery?.recentSceneDrawInterruption
    || Number(recovery?.recentContextLossCount) > 0
    || recovery?.repeatedRecentContextLoss
  );
  if (device?.family !== "android" || device?.tier !== "capable" || recentFailure || recommendation?.risk === "very-high") return recommendation;
  return Object.freeze({
    ...recommendation,
    recommendedMinimumProfile: "normal",
    exceedsMaximum: false,
    reasons: Object.freeze([...(recommendation?.reasons ?? []), localizeFoundry("VEMOBILE.Assets.CapableAndroidNoRecentFailure", "Capable Android device has no recent graphics interruption")])
  });
}

function normalizeCatalog(value) {
  if (!value || Number(value.schemaVersion) !== MOBILE_ASSET_CATALOG_VERSION || !value.assets || !value.scenes) {
    return Object.freeze({ schemaVersion: MOBILE_ASSET_CATALOG_VERSION, generatedAt: 0, assets: Object.freeze({}), scenes: Object.freeze({}) });
  }
  return value;
}

function resolveAssetUrl(source, baseHref = "") {
  try { return new URL(source, baseHref).href; } catch { return source; }
}

async function sha256Hex(buffer, cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.subtle?.digest) throw new Error(localizeFoundry("VEMOBILE.Assets.ShaUnavailable", "SHA-256 is unavailable in this browser."));
  const hash = await cryptoRef.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureDirectory(picker, folder) {
  try {
    await picker.browse("data", folder);
    return;
  } catch {
    // Create only the VE-owned child; the world directory already exists.
  }
  await picker.createDirectory("data", folder);
  await picker.browse("data", folder);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas?.toBlob !== "function") return reject(new Error(localizeFoundry("VEMOBILE.Assets.WebpUnavailable", "WebP encoding is unavailable.")));
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(localizeFoundry("VEMOBILE.Assets.WebpFailed", "WebP encoding failed."))), type, quality);
  });
}

async function fileExists(picker, source) {
  const canonical = canonicalAssetSource(source);
  const separator = canonical.lastIndexOf("/");
  if (!canonical || separator < 1) return false;
  try {
    const listing = await picker.browse("data", canonical.slice(0, separator));
    return (listing?.files ?? []).map((entry) => canonicalAssetSource(entry)).includes(canonical);
  } catch {
    return false;
  }
}

function markAliasReloadRequired(source, registeredAliases, reloadRequiredAliases, baseHref) {
  for (const [alias] of normalizedAliasPairs(source, source, baseHref)) {
    if (registeredAliases.has(alias)) reloadRequiredAliases.add(alias);
  }
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(localizeFoundry("VEMOBILE.Assets.ImageDecodeFailed", "The image could not be decoded.")));
    image.src = url;
  });
}

function safeSetting(game, namespace, key) {
  try { return game?.settings?.get?.(namespace, key); } catch { return undefined; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function collectionValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return typeof value.values === "function" ? [...value.values()] : [...value]; } catch { return []; }
}

function assertGm(game) {
  if (!game?.user?.isGM) throw new Error(localizeFoundry("VEMOBILE.Assets.GmOnly", "Only a GM may manage mobile asset derivatives."));
  if (!game?.settings?.set) throw new Error(localizeFoundry("VEMOBILE.Assets.SettingsUnavailable", "Foundry settings are unavailable."));
}

function safePathSegment(value) {
  const segment = String(value ?? "").trim();
  return /^[a-z0-9][a-z0-9_-]{0,127}$/iu.test(segment) ? segment : "";
}

function clampQuality(value) {
  const quality = Number(value);
  return Number.isFinite(quality) ? Math.min(0.98, Math.max(0.5, quality)) : DEFAULT_QUALITY;
}

function once(read) {
  let resolved = false;
  let value;
  return () => {
    if (!resolved) {
      value = read();
      resolved = true;
    }
    return value;
  };
}

export { sha256Hex };
