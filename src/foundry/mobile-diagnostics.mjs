import { localizeFoundry } from "./localization.mjs";
import { inspectDiceRuntime } from "./mobile-dice-guard.mjs";

const LEVEL_RANK = Object.freeze({ off: -1, error: 0, warn: 1, info: 2, debug: 3 });
const MAX_ENTRIES = 200;

/**
 * A bounded, serializable mobile diagnostic trail. It intentionally records
 * VE's important lifecycle failures and uncaught browser failures without
 * patching the browser console or collecting data remotely.
 */
export function createMobileDiagnostics({
  readLevel = () => "warn",
  getWindow = () => globalThis.window,
  getGame = () => globalThis.game,
  getNavigator = () => globalThis.navigator,
  getLocation = () => globalThis.location,
  getDiceRuntime = () => inspectDiceRuntime(globalThis.game?.dice3d),
  getGraphicsPolicy = () => null,
  getModuleOverlays = () => [],
  getMobileMemory = () => null,
  getChatDom = () => null,
  getMobileBack = () => null,
  getLightingPrecision = () => null,
  getLoadTiming = () => null,
  onRecord = () => {},
  now = () => new Date()
} = {}) {
  const entries = [];

  const record = (level, message, error) => {
    const normalizedLevel = normalizeLevel(level);
    if (!shouldRecord(normalizedLevel, readLevel())) return null;
    const entry = Object.freeze({
      at: safeTimestamp(now),
      level: normalizedLevel,
      message: String(message ?? localizeFoundry("VEMOBILE.Interface.MobileDiagnostics.VEMobileEvent", "VE Mobile event")).slice(0, 500),
      ...(error ? { error: errorText(error).slice(0, 1600) } : {})
    });
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    try { onRecord(entry); } catch {}
    return entry;
  };

  const report = () => formatReport(entries, { getGame, getNavigator, getLocation, getDiceRuntime, getGraphicsPolicy, getModuleOverlays, getMobileMemory, getChatDom, getMobileBack, getLightingPrecision, getLoadTiming, readLevel });

  return Object.freeze({
    record,
    snapshot: () => Object.freeze(entries.slice()),
    report,
    watch(scope) {
      const browser = getWindow();
      if (!browser?.addEventListener) return;
      scope.listen(browser, "error", (event) => {
        record("error", event?.message || "Uncaught browser error", event?.error);
      });
      scope.listen(browser, "unhandledrejection", (event) => {
        record("error", "Unhandled promise rejection", event?.reason);
      });
    },
    async copy(reportText = report()) {
      const text = String(reportText);
      const clipboard = getNavigator()?.clipboard;
      if (typeof clipboard?.writeText !== "function") return Object.freeze({ ok: false, text });
      try {
        await clipboard.writeText(text);
        return Object.freeze({ ok: true, text });
      } catch {
        return Object.freeze({ ok: false, text });
      }
    }
  });
}

function normalizeLevel(level) {
  const value = String(level ?? "warn").toLowerCase();
  return Object.hasOwn(LEVEL_RANK, value) ? value : "warn";
}

function shouldRecord(level, configuredLevel) {
  const configured = normalizeLevel(configuredLevel);
  return configured !== "off" && LEVEL_RANK[level] <= LEVEL_RANK[configured];
}

function safeTimestamp(now) {
  try {
    return now()?.toISOString?.() ?? new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function errorText(error) {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? "Unknown error");
  }
}

function formatReport(entries, { getGame, getNavigator, getLocation, getDiceRuntime, getGraphicsPolicy, getModuleOverlays, getMobileMemory, getChatDom, getMobileBack, getLightingPrecision, getLoadTiming, readLevel }) {
  const game = getGame();
  const navigator = getNavigator();
  const location = getLocation();
  const lines = [
    localizeFoundry("VEMOBILE.Report.VeMobileDiagnosticReport", "VE Mobile diagnostic report"),
    `${localizeFoundry("VEMOBILE.Report.Generated", "Generated")}: ${safeTimestamp(() => new Date())}`,
    `${localizeFoundry("VEMOBILE.Report.LoggingLevel", "Logging level")}: ${normalizeLevel(readLevel())}`,
    `${localizeFoundry("VEMOBILE.Report.Foundry", "Foundry")}: ${game?.version ?? "unknown"}`,
    `${localizeFoundry("VEMOBILE.Report.System", "System")}: ${game?.system?.id ?? "unknown"} ${game?.system?.version ?? ""}`.trim(),
    `${localizeFoundry("VEMOBILE.Report.World", "World")}: ${game?.world?.id ?? "unknown"}`,
    `${localizeFoundry("VEMOBILE.Report.Browser", "Browser")}: ${navigator?.userAgent ?? "unknown"}`,
    `${localizeFoundry("VEMOBILE.Report.Page", "Page")}: ${location?.href ?? "unknown"}`,
    ...graphicsPolicyLines(safeValue(getGraphicsPolicy)),
    ...diceRuntimeLines(safeDiceRuntime(getDiceRuntime)),
    ...overlayRuntimeLines(safeValue(getModuleOverlays)),
    ...mobileMemoryLines(safeValue(getMobileMemory)),
    ...chatDomLines(safeValue(getChatDom)),
    ...mobileBackLines(safeValue(getMobileBack)),
    ...lightingPrecisionLines(safeValue(getLightingPrecision)),
    ...loadTimingLines(safeValue(getLoadTiming)),
    "",
    entries.length ? localizeFoundry("VEMOBILE.Report.Events", "Events:") : localizeFoundry("VEMOBILE.Report.EventsNoneCaptured", "Events: none captured")
  ];
  for (const entry of entries) {
    lines.push(`[${entry.at}] ${entry.level.toUpperCase()} ${entry.message}${entry.error ? `\n${entry.error}` : ""}`);
  }
  return lines.join("\n");
}

function loadTimingLines(timing) {
  const duration = (value) => Number.isFinite(value) && value > 0 ? `${Math.round(value)} ms` : "none";
  return [
    "",
    localizeFoundry("VEMOBILE.Report.LoadAndRecovery", "LOAD AND RECOVERY"),
    `${localizeFoundry("VEMOBILE.Report.LastSuccessfulFullLoad", "Last successful full load")}: ${duration(timing?.lastSuccessfulFullLoadMs)}`,
    `${localizeFoundry("VEMOBILE.Report.LastSuccessfulResync", "Last successful resync")}: ${duration(timing?.lastSuccessfulResyncMs)}`,
    `${localizeFoundry("VEMOBILE.Report.RecentRecovery", "Recent recovery")}: ${value(timing?.type)}; last checkpoint=${value(timing?.checkpoint)}`,
    `${localizeFoundry("VEMOBILE.Report.RecentResyncTotal", "Recent resync total")}: ${duration(timing?.resyncDurationMs)}`,
    `${localizeFoundry("VEMOBILE.Report.CanvasReconciliation", "Canvas reconciliation")}: ${duration(timing?.canvasDurationMs)}; succeeded=${timing?.canvasSucceeded === null ? "not attempted" : yesNo(timing?.canvasSucceeded)}`,
    `${localizeFoundry("VEMOBILE.Report.HardReloadEscalation", "Hard reload escalation")}: ${yesNo(timing?.hardReload)}`
  ];
}

function lightingPrecisionLines(precision) {
  const format = (record) => record
    ? `precision=${record.precision} rangeMin=${record.rangeMin} rangeMax=${record.rangeMax}`
    : "unavailable";
  return [
    "",
    localizeFoundry("VEMOBILE.Report.NativeLightingPrecisionCompatibility", "NATIVE LIGHTING PRECISION COMPATIBILITY"),
    `${localizeFoundry("VEMOBILE.Report.WebGL", "WebGL")}: ${value(precision?.glVersion)}`,
    `${localizeFoundry("VEMOBILE.Report.FragmentMediump", "Fragment mediump")}: ${format(precision?.medium)}`,
    `${localizeFoundry("VEMOBILE.Report.FragmentHighp", "Fragment highp")}: ${format(precision?.high)}`,
    `${localizeFoundry("VEMOBILE.Report.Status", "Status")}: ${value(precision?.status)}; reason=${value(precision?.reason)}`,
    `${localizeFoundry("VEMOBILE.Report.NativeLightingProgramsPatched", "Native lighting programs patched")}: ${numberValue(precision?.patchedPrograms)}; types=${precision?.patchedTypes?.length ? precision.patchedTypes.join(", ") : "none"}`
  ];
}

function mobileBackLines(back) {
  return [
    "",
    localizeFoundry("VEMOBILE.Report.BrowserBack", "BROWSER BACK"),
    `${localizeFoundry("VEMOBILE.Report.Installed", "Installed")}: ${yesNo(back?.installed)}; active=${yesNo(back?.active)}; armed=${yesNo(back?.armed)}`,
    `${localizeFoundry("VEMOBILE.Report.History", "History")}: state=${value(back?.historyStateKind)} length=${numberValue(back?.historyLength)} currentHref=${value(back?.currentHref)} (query/fragment omitted)`,
    `${localizeFoundry("VEMOBILE.Report.VERoute", "VE route")}: ${value(back?.route)}; depth=${numberValue(back?.routeDepth)}; next=${value(back?.topmostDismissible)}`,
    `${localizeFoundry("VEMOBILE.Report.LastPopstate", "Last popstate")}: ${timestampValue(back?.lastPopstateAt)}; action=${value(back?.lastAction)}`,
    `${localizeFoundry("VEMOBILE.Report.LeaveNavigationAttempted", "Leave navigation attempted")}: ${yesNo(back?.leaveNavigationAttempted)}`,
    `${localizeFoundry("VEMOBILE.Report.LastError", "Last error")}: ${value(back?.lastError)}`
  ];
}

function mobileMemoryLines(memory) {
  const risk = memory?.scene?.risk ?? {};
  const aggregate = risk.aggregate ?? risk;
  const assets = memory?.assets ?? {};
  const low = memory?.lowMemory ?? {};
  const current = low.current ?? {};
  const fcs = low.forceClientSettings ?? {};
  const recovery = memory?.recovery ?? {};
  const preflight = memory?.preflight ?? {};
  const lastPreflight = preflight.last ?? {};
  const pending = preflight.pending ?? {};
  const transaction = low.transaction ?? {};
  const plan = lastPreflight.transactionPlan ?? {};
  const context = recovery.contextLoss ?? {};
  const derivativeDimensions = Array.isArray(risk.surfaces)
    ? risk.surfaces.filter((surface) => surface.derivative?.width && surface.derivative?.height)
      .map((surface) => `${surface.derivative.width}x${surface.derivative.height}`).join(",")
    : "";
  return [
    "",
    localizeFoundry("VEMOBILE.Report.MobileSceneMemory", "MOBILE SCENE MEMORY"),
    `${localizeFoundry("VEMOBILE.Report.Scene", "Scene")}: ${value(memory?.scene?.name)} (${value(memory?.scene?.id)})`,
    `${localizeFoundry("VEMOBILE.Report.Risk", "Risk")}: ${value(risk.classification ?? risk.risk)}; confidence=${value(risk.confidence)}`,
    `${localizeFoundry("VEMOBILE.Report.KnownStaticRasterSurfaces", "Known static raster surfaces")}: ${numberValue(risk.surfaceCount ?? aggregate.surfaceCount)}`,
    `${localizeFoundry("VEMOBILE.Report.OriginalDecodedEstimate", "Original decoded estimate")}: ${byteValue(risk.originalDecodedBytes ?? aggregate.originalDecodedBytes)}`,
    `${localizeFoundry("VEMOBILE.Report.OriginalMipmapEstimate", "Original mipmap estimate")}: ${byteValue(risk.originalMipmappedBytes ?? aggregate.originalMipmappedBytes)}`,
    `${localizeFoundry("VEMOBILE.Report.EffectiveDerivativeDecodedEstimate", "Effective derivative decoded estimate")}: ${byteValue(risk.effectiveDecodedBytes ?? aggregate.effectiveDecodedBytes)}`,
    `${localizeFoundry("VEMOBILE.Report.EffectiveDerivativeMipmapEstimate", "Effective derivative mipmap estimate")}: ${byteValue(risk.effectiveMipmappedBytes ?? aggregate.effectiveMipmappedBytes)}`,
    `${localizeFoundry("VEMOBILE.Report.RasterLayers", "Raster layers")}: visible=${numberValue(risk.visibleRasterCount)} hidden=${numberValue(risk.hiddenRasterCount)} total=${numberValue(risk.rasterLayerCount ?? risk.surfaceCount)}`,
    `${localizeFoundry("VEMOBILE.Report.VideoLayers", "Video layers")}: ${numberValue(risk.videoCount)}`,
    `${localizeFoundry("VEMOBILE.Report.DerivativeStatus", "Derivative status")}: ${value(risk.derivativeStatus ?? assets.status)}; derivative source dimensions=${derivativeDimensions || "none"}`,
    `${localizeFoundry("VEMOBILE.Report.MobileAssetSubstitution", "Mobile asset substitution")}: enabled=${Boolean(assets.enabled)} preference=${value(assets.preference)} physicalDevice=${value(assets.physicalDeviceClass)} aliases=${numberValue(assets.registered)}`,
    `${localizeFoundry("VEMOBILE.Report.OriginalAlreadyCached", "Original already cached")}: ${listValue(assets.originalAlreadyCached)}`,
    localizeFoundry("VEMOBILE.Report.MemoryPreflight", "MEMORY PREFLIGHT"),
    `${localizeFoundry("VEMOBILE.Report.ProfileDecision", "Profile decision")}: requested=${value(lastPreflight.requestedProfile)} configured=${value(lastPreflight.configuredProfile ?? low.profile)} recommended=${value(lastPreflight.recommendedProfile)} effective=${value(lastPreflight.effectiveProfile ?? low.effectiveProfile)} satisfied=${Boolean(lastPreflight.satisfied)} blocked=${numberValue(lastPreflight.blockedSettings?.length)}`,
    `${localizeFoundry("VEMOBILE.Report.TransactionPlan", "Transaction plan")}: changes=${listValue(plan.changes?.map?.((entry) => entry.key))} authority-adjustments=${listValue(plan.authorityAdjustments)} reloadRequired=${Boolean(plan.reloadRequired)}`,
    `${localizeFoundry("VEMOBILE.Report.ProfileTransaction", "Profile transaction")}: phase=${value(transaction.phase)} generation=${value(transaction.generation)} requested=${value(transaction.requestedProfile)} configured=${value(transaction.configuredProfile)} reloadRequired=${Boolean(transaction.reloadRequired)}`,
    `${localizeFoundry("VEMOBILE.Report.CurrentProfile", "Current profile")}: ${value(low.profile)}; status=${value(low.status)}; satisfied=${Boolean(low.profileSatisfied)}; behavior=${value(preflight.behavior)}`,
    `${localizeFoundry("VEMOBILE.Report.RecommendedMinimumProfile", "Recommended minimum profile")}: ${value(lastPreflight.recommendedMinimumProfile ?? risk.recommendedMinimumProfile)}`,
    `${localizeFoundry("VEMOBILE.Report.Recommendation", "Recommendation")}: risk=${value(lastPreflight.risk ?? risk.risk)} confidence=${value(lastPreflight.confidence ?? risk.confidence)} reasons=${listValue(lastPreflight.reasons ?? risk.reasons)}`,
    `${localizeFoundry("VEMOBILE.Report.PendingEscalation", "Pending escalation")}: scene=${value(pending.sceneName)} (${value(pending.sceneId)}) profile=${value(pending.profile)} generation=${value(pending.generation)} attempt=${numberValue(pending.attempt)} at=${timestampValue(pending.requestedAt)}`,
    `${localizeFoundry("VEMOBILE.Report.LastReliableFailureProfile", "Last reliable failure profile")}: ${value(context.memoryProfile)}; failureAtMaximum=${Boolean(recovery.failureAtMaximum)}`,
    `${localizeFoundry("VEMOBILE.Report.ProfileActive", "Profile active")}: ${Boolean(low.active)}; effective=${Boolean(low.effective)}; ineffectiveKeys=${listValue(low.ineffectiveKeys)}`,
    `${localizeFoundry("VEMOBILE.Report.UnmetGraphics", "Unmet graphics")}: ${JSON.stringify(low.unmetSettings ?? [])}`,
    `${localizeFoundry("VEMOBILE.Report.RequiredGraphics", "Required graphics")}: ${JSON.stringify(low.requiredSettings ?? {})}`,
    `${localizeFoundry("VEMOBILE.Report.RuntimeGraphics", "Runtime graphics")}: ${JSON.stringify(low.runtime ?? {})}`,
    `${localizeFoundry("VEMOBILE.Report.NativeGraphics", "Native graphics")}: performanceMode=${value(current["core.performanceMode"])} maxFPS=${value(current["core.maxFPS"])} resolutionScaling=${value(current["core.pixelRatioResolutionScaling"])} mipmap=${value(current["core.mipmap"])} lightAnimation=${value(current["core.lightAnimation"])}`,
    `${localizeFoundry("VEMOBILE.Report.ScenePresentation", "Scene presentation")}: splitScreen=${Boolean(memory?.splitScreen)} viewportCSS=${dimensions(memory?.sceneViewport?.width, memory?.sceneViewport?.height)} canvasBacking=${dimensions(memory?.canvasBacking?.width, memory?.canvasBacking?.height)}`,
    `${localizeFoundry("VEMOBILE.Report.Renderer", "Renderer")}: resolution=${value(memory?.rendererResolution)} DPR=${value(memory?.devicePixelRatio)}`,
    `${localizeFoundry("VEMOBILE.Report.ForceClientSettings", "Force Client Settings")}: present=${Boolean(fcs.present)} version=${value(fcs.version)} precedence=${Boolean(fcs.precedenceEnabled)} authorityInstalled=${Boolean(fcs.authorityInstalled)} softKeys=${listValue(fcs.softKeys)} hardKeys=${listValue(fcs.hardKeys)} managedUnlocks=${listValue(fcs.managedUnlockKeys)} conflicts=${Array.isArray(fcs.conflicts) ? fcs.conflicts.length : 0}`,
    ...((fcs.conflicts ?? []).map((conflict) => `FCS conflict ${value(conflict.key)}: forced=${value(conflict.forcedValue)} intended=${value(conflict.intendedValue)} mode=${value(conflict.mode)}`)),
    `${localizeFoundry("VEMOBILE.Report.PriorContextLoss", "Prior context loss")}: reliablePending=${Boolean(recovery.reliablePending)} ambiguousPending=${Boolean(recovery.ambiguousPending)} lastScene=${value(context.sceneName)} (${value(context.sceneId)}) lastTime=${timestampValue(context.at ?? context.timestamp ?? recovery.failureAt)} lowMemory=${Boolean(context.lowMemory)} effective=${Boolean(context.lowMemoryEffective)} splitScreen=${Boolean(context.splitScreen)} viewportCSS=${dimensions(context.sceneViewport?.width, context.sceneViewport?.height)} canvasBacking=${dimensions(context.canvasBacking?.width, context.canvasBacking?.height)}`
  ];
}

function chatDomLines(chat) {
  return [
    "",
    localizeFoundry("VEMOBILE.Report.ChatDom", "CHAT DOM"),
    `${localizeFoundry("VEMOBILE.Report.ChatLogPruneInstalled", "ChatLog Prune installed")}: ${yesNo(chat?.chatLogPruneInstalled)}`,
    `${localizeFoundry("VEMOBILE.Report.ChatLogPruneActive", "ChatLog Prune active")}: ${yesNo(chat?.chatLogPruneActive)}`,
    `${localizeFoundry("VEMOBILE.Report.MidiQOLLegacyChatPruningActive", "Midi-QOL legacy Chat pruning active")}: ${yesNo(chat?.midiQolLegacyPruningActive)}`,
    `${localizeFoundry("VEMOBILE.Report.NativeRenderedChatRowCount", "Native rendered Chat row count")}: ${numberValue(chat?.nativeRenderedRows)}`,
    `${localizeFoundry("VEMOBILE.Report.VERenderedChatRowCount", "VE rendered Chat row count")}: ${numberValue(chat?.veRenderedRows)}`,
    `${localizeFoundry("VEMOBILE.Report.VEChatWindowLimit", "VE Chat window limit")}: ${numberValue(chat?.veWindowLimit)}`,
    `${localizeFoundry("VEMOBILE.Report.NativePruningOwner", "Native pruning owner")}: ${value(chat?.nativePruningOwner)}`
  ];
}

function overlayRuntimeLines(overlays) {
  if (!Array.isArray(overlays) || !overlays.length) return [localizeFoundry("VEMOBILE.Report.EnabledModuleOverlaysNone", "Enabled module overlays: none")];
  return [
    `${localizeFoundry("VEMOBILE.Report.EnabledModuleOverlays", "Enabled module overlays")}: ${overlays.length}`,
    ...overlays.map((overlay) => {
      const rect = overlay.rect ?? {};
      const scene = overlay.sceneRect ?? {};
      const gate = overlay.moduleRenderGate;
      const gateText = gate ? ` moduleRenderEligible=${Boolean(gate.renderEligible)} userIsGM=${Boolean(gate.userIsGM)} allowPlayer=${Boolean(gate.allowPlayer)} moduleDisabled=${Boolean(gate.disabled)}` : "";
      return `Overlay ${value(overlay.id)}: capturedFor=${value(overlay.capturedFor)} module=${value(overlay.moduleId)} root=${value(overlay.rootId)} expected=${Boolean(overlay.rootExpected)} present=${Boolean(overlay.present)} connected=${Boolean(overlay.connected)} admitted=${Boolean(overlay.admitted)} admissionClass=${Boolean(overlay.admissionClass)} display=${value(overlay.display)} visibility=${value(overlay.visibility)} opacity=${value(overlay.opacity)} pointerEvents=${value(overlay.pointerEvents)} position=${value(overlay.position)} zIndex=${value(overlay.zIndex)} transform=${value(overlay.transform)} rect=${value(rect.left)},${value(rect.top)} ${dimensions(rect.width, rect.height)} scene=${value(scene.left)},${value(scene.top)} ${dimensions(scene.width, scene.height)} offscreen=${Boolean(overlay.offscreen)} hosts=${Array.isArray(overlay.hostClasses) ? overlay.hostClasses.join(",") : "unknown"} hiddenAncestor=${value(overlay.hiddenAncestor)}${gateText}`;
    })
  ];
}

function safeDiceRuntime(getDiceRuntime) {
  try { return getDiceRuntime?.() ?? null; } catch { return null; }
}

function safeValue(read) {
  try { return read?.() ?? null; } catch { return null; }
}

function graphicsPolicyLines(policy) {
  if (!policy) return [localizeFoundry("VEMOBILE.Report.VeDicePolicyUnavailable", "VE dice policy: unavailable")];
  const device = policy.device ?? {};
  const recovery = policy.recovery ?? {};
  const explicitDsnSettings = policy.requestedDice === "normal"
    && policy.dice === "normal"
    && policy.diceReason === "explicit";
  return [
    `${localizeFoundry("VEMOBILE.Report.VEDicePolicy", "VE dice policy")}: requested=${value(policy.requestedDice)}, resolved=${value(policy.dice)}, reason=${value(policy.diceReason)}`,
    ...(explicitDsnSettings ? [localizeFoundry("VEMOBILE.Report.VeDiceSoNiceModeVeLeavesDDiceSettingsUnchangedFinalVisualQualityIsControlledByDiceSoNiceAndFoundryPerformanceSettings", "VE Dice So Nice mode: VE leaves 3D dice settings unchanged; final visual quality is controlled by Dice So Nice and Foundry performance settings.")] : []),
    `${localizeFoundry("VEMOBILE.Report.VEDevicePolicy", "VE device policy")}: ${value(device.family)}/${value(device.tier)} (${value(device.tierReason)}), memory=${value(device.memoryGb)}GB, cores=${value(device.logicalCores)}, maxTexture=${value(device.maxTextureSize)}, nativePixels=${value(device.backingPixels)}`,
    `${localizeFoundry("VEMOBILE.Report.VEGraphicsRecovery", "VE graphics recovery")}: repeatedRecentLoss=${Boolean(recovery.repeatedRecentContextLoss)}, historicalLoss=${Boolean(recovery.historicalContextLoss)}, ambiguousExit=${Boolean(recovery.ambiguousUncleanExit)}`,
    `${localizeFoundry("VEMOBILE.Report.VEContextLosses", "VE context losses")}: total=${numberValue(recovery.totalContextLosses)}, legacy=${numberValue(recovery.legacyContextLosses)}, recent=${numberValue(recovery.recentContextLossCount)}, sources=${listValue(recovery.recentContextLossSources)}, last=${timestampValue(recovery.lastContextLossAt)}`,
    `VE clean 3D recovery: sessions=${numberValue(recovery.clean3dSessions)}, lastSuccess=${timestampValue(recovery.lastDiceSuccessAt)}, lastCleared=${timestampValue(recovery.lastRecoveryClearedAt)}`
  ];
}

function diceRuntimeLines(runtime) {
  if (!runtime) return [localizeFoundry("VEMOBILE.Report.DiceRuntimeUnavailable", "Dice runtime: unavailable")];
  const viewport = runtime.viewport ?? {};
  const host = runtime.host ?? {};
  const canvas = runtime.canvas ?? {};
  const quality = runtime.quality ?? {};
  return [
    `${localizeFoundry("VEMOBILE.Report.ViewportCSS", "Viewport CSS")}: ${dimensions(viewport.width, viewport.height)}; visual ${dimensions(viewport.visualWidth, viewport.visualHeight)}; DPR ${value(viewport.devicePixelRatio)}`,
    `${localizeFoundry("VEMOBILE.Report.ScreenCSS", "Screen CSS")}: ${dimensions(viewport.screenWidth, viewport.screenHeight)}`,
    `${localizeFoundry("VEMOBILE.Report.FoundryPerformanceMode", "Foundry performance mode")}: ${value(runtime.foundryPerformanceMode)}`,
    `${localizeFoundry("VEMOBILE.Report.DiceRuntime", "Dice runtime")}: ${runtime.available ? "available" : "unavailable"}`,
    `${localizeFoundry("VEMOBILE.Report.DiceHostCSS", "Dice host CSS")}: ${dimensions(host.cssWidth, host.cssHeight)}`,
    `${localizeFoundry("VEMOBILE.Report.DiceCanvasCSSBacking", "Dice canvas CSS/backing")}: ${dimensions(canvas.cssWidth, canvas.cssHeight)} / ${dimensions(canvas.backingWidth, canvas.backingHeight)}`,
    `${localizeFoundry("VEMOBILE.Report.DiceRendererDPREffective", "Dice renderer DPR/effective")}: ${value(canvas.rendererPixelRatio)} / ${value(canvas.effectivePixelRatioX)}x${value(canvas.effectivePixelRatioY)}`,
    `${localizeFoundry("VEMOBILE.Report.DiceQuality", "Dice quality")}: image=${value(quality.imageQuality)}, highDPI=${value(quality.useHighDPI)}, aa=${value(quality.antialiasing)}, shadows=${value(quality.shadowQuality)}, bump=${value(quality.bumpMapping)}, customRollingArea=${value(quality.customRollingArea)}`
  ];
}

function dimensions(width, height) {
  return `${value(width)}x${value(height)}`;
}

function value(input) {
  return input === null || input === undefined || input === "" ? "unknown" : String(input);
}

function numberValue(input) {
  const number = Number(input);
  return Number.isFinite(number) ? String(number) : "unknown";
}

function listValue(input) {
  return Array.isArray(input) && input.length ? input.join(",") : "none";
}

function timestampValue(input) {
  const timestamp = Number(input);
  if (!(timestamp > 0)) return "none";
  try { return new Date(timestamp).toISOString(); } catch { return String(timestamp); }
}

function byteValue(input) {
  const bytes = Number(input);
  return Number.isFinite(bytes) ? `${(bytes / (1024 * 1024)).toFixed(3)} MiB` : "unknown";
}

function yesNo(input) {
  return input ? "yes" : "no";
}
