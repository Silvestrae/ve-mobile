export const GRAPHICS_SAFETY_MODES = Object.freeze(["auto", "strict", "balanced", "off"]);
export const DICE_RENDERING_MODES = Object.freeze(["auto", "static", "reduced", "normal"]);
export const GRAPHICS_SAFETY_STORAGE_KEY = "ve-mobile:graphics-safety:v1";

const JOURNAL_VERSION = 2;
const RECENT_RISK_WINDOW_MS = 30 * 60 * 1000;
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const HISTORICAL_LOSS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DUPLICATE_LOSS_WINDOW_MS = 1000;
const MAX_RECENT_LOSSES = 8;

/**
 * Resolve a lightweight, device-local graphics policy. This deliberately uses
 * browser capability hints and Foundry's existing WebGL context; it does not
 * run a benchmark, create another context, or scan/load media at startup.
 */
export function resolveMobileGraphicsPolicy({
  graphicsSafety = "auto",
  diceRendering = "auto",
  navigatorRef = globalThis.navigator,
  screenRef = globalThis.screen,
  getCanvas = () => globalThis.canvas,
  recovery = null,
  // Retained for callers upgrading from the v1 journal API.
  recoveryRecommended = false,
  contextLossRecoveryRecommended = false
} = {}) {
  const device = inspectGraphicsDevice({ navigatorRef, screenRef, getCanvas });
  const requestedEffects = GRAPHICS_SAFETY_MODES.includes(graphicsSafety) ? graphicsSafety : "auto";
  const requestedDice = DICE_RENDERING_MODES.includes(diceRendering) ? diceRendering : "auto";
  const recoveryState = normalizeRecoveryState(recovery, { recoveryRecommended, contextLossRecoveryRecommended });
  const anyRecovery = recoveryState.ambiguousUncleanExit
    || recoveryState.historicalContextLoss
    || recoveryState.repeatedRecentContextLoss;

  let effects = requestedEffects;
  if (effects === "auto") {
    if (device.family === "apple-touch" || anyRecovery || device.tier === "constrained") effects = "strict";
    else if (device.tier === "balanced") effects = "balanced";
    else effects = "off";
  }

  let dice = requestedDice;
  let diceReason = "explicit";
  if (dice === "auto") {
    if (recoveryState.repeatedRecentContextLoss || device.tier === "constrained") {
      dice = "static";
      diceReason = recoveryState.repeatedRecentContextLoss
        ? "repeated-current-webgl-context-loss"
        : `device-${device.tier}:${device.tierReason}`;
    } else if (recoveryState.historicalContextLoss) {
      dice = "reduced";
      diceReason = "historical-context-loss-recovery";
    } else if (recoveryState.ambiguousUncleanExit || device.tier === "balanced") {
      dice = "reduced";
      diceReason = recoveryState.ambiguousUncleanExit
        ? "ambiguous-unclean-graphics-session"
        : `device-${device.tier}:${device.tierReason}`;
    } else {
      dice = "normal";
      diceReason = `device-${device.tier}:${device.tierReason}`;
    }
  }

  return Object.freeze({
    effects,
    dice,
    requestedEffects,
    requestedDice,
    recoveryRecommended: anyRecovery,
    contextLossRecoveryRecommended: recoveryState.repeatedRecentContextLoss,
    recovery: recoveryState,
    diceReason,
    device
  });
}

export function inspectGraphicsDevice({
  navigatorRef = globalThis.navigator,
  screenRef = globalThis.screen,
  getCanvas = () => globalThis.canvas,
  getPixelRatio = () => globalThis.devicePixelRatio
} = {}) {
  const family = isAppleTouchBrowser(navigatorRef)
    ? "apple-touch"
    : isAndroidBrowser(navigatorRef) ? "android" : "other";
  const memoryGb = finitePositive(navigatorRef?.deviceMemory);
  const logicalCores = finitePositive(navigatorRef?.hardwareConcurrency);
  const maxTextureSize = existingMaxTextureSize(getCanvas);
  const width = finitePositive(screenRef?.width) ?? 0;
  const height = finitePositive(screenRef?.height) ?? 0;
  const pixelRatio = Math.max(1, finitePositive(getPixelRatio?.()) ?? 1);
  const backingPixels = width * height * pixelRatio * pixelRatio;

  let tier = "capable";
  let tierReason = "desktop-default";
  if (family === "apple-touch" || family === "android") {
    const hardGpuLimit = maxTextureSize !== null && maxTextureSize <= 4096;
    const combinedLowResources = memoryGb !== null && memoryGb <= 4
      && logicalCores !== null && logicalCores <= 4;
    const capableEvidence = (memoryGb !== null && memoryGb >= 8)
      || (logicalCores !== null && logicalCores >= 8)
      || (maxTextureSize !== null && maxTextureSize >= 8192);
    const capable = capableEvidence
      && (logicalCores === null || logicalCores >= 6)
      && (maxTextureSize === null || maxTextureSize >= 8192)
      && backingPixels <= 14_000_000;
    if (hardGpuLimit || combinedLowResources) {
      tier = "constrained";
      tierReason = hardGpuLimit ? "webgl-max-texture-4096" : "combined-low-memory-and-cpu";
    } else if (capable) {
      tier = "capable";
      tierReason = "strong-capability-signals";
    } else {
      tier = "balanced";
      tierReason = backingPixels > 14_000_000 ? "large-native-backing-surface" : "incomplete-capability-signals";
    }
  }

  return Object.freeze({
    family,
    tier,
    tierReason,
    memoryGb,
    logicalCores,
    maxTextureSize,
    screenWidth: width,
    screenHeight: height,
    pixelRatio,
    backingPixels: Math.round(backingPixels)
  });
}

export function isAppleTouchBrowser(navigatorRef = {}) {
  const userAgent = String(navigatorRef.userAgent ?? "");
  const platform = String(navigatorRef.platform ?? "");
  const touchPoints = Number(navigatorRef.maxTouchPoints ?? 0);
  return /iPad|iPhone|iPod/iu.test(userAgent)
    || (/Mac/iu.test(platform) && touchPoints > 1);
}

export function isAndroidBrowser(navigatorRef = {}) {
  return /Android/iu.test(String(navigatorRef.userAgent ?? ""));
}

/**
 * Store a bounded, source-specific browser-local recovery history. Two genuine
 * losses inside the same 30-minute risk window justify Static. A lone or legacy
 * loss receives a Reduced 3D trial for at most seven days. A clean shutdown
 * after a successful 3D roll clears that recovery evidence.
 */
export function createGraphicsSafetyJournal({
  getStorage = () => globalThis.localStorage,
  now = () => Date.now()
} = {}) {
  const timestamp = Number(now());
  const stored = readJournal(getStorage);
  const previous = migrateJournal(stored);
  const unexpectedPreviousExit = isUnexpectedExit(previous, timestamp);
  const interruptedSceneDrawAt = unexpectedPreviousExit && previous?.lastRisk?.kind === "scene-draw" ? timestamp : 0;
  let current = previous ? cloneJournal(previous) : emptyJournal();
  let lastRiskSignature = "";

  const write = (patch) => {
    current = { ...current, ...patch, version: JOURNAL_VERSION };
    try {
      getStorage()?.setItem?.(GRAPHICS_SAFETY_STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Graphics protection remains active when local storage is unavailable.
    }
  };
  const recovery = () => recoveryFor(current, Number(now()), unexpectedPreviousExit, interruptedSceneDrawAt);

  const api = {
    get recoveryRecommended() {
      const state = recovery();
      return state.ambiguousUncleanExit || state.historicalContextLoss || state.repeatedRecentContextLoss;
    },
    get contextLossRecoveryRecommended() {
      return recovery().repeatedRecentContextLoss;
    },
    recovery,
    previous: serializableJournal(previous),
    begin(policy) {
      const beganAt = Number(now());
      const recentContextLosses = recentLosses(current.recentContextLosses, beganAt);
      write({
        active: true,
        startedAt: beganAt,
        finishedAt: 0,
        lastRiskAt: 0,
        lastRisk: null,
        recentContextLosses,
        contextLossThisSession: false,
        successful3dThisSession: false,
        ambiguousExits: Number(current.ambiguousExits ?? 0) + (unexpectedPreviousExit ? 1 : 0),
        lastAmbiguousExitAt: unexpectedPreviousExit ? beganAt : Number(current.lastAmbiguousExitAt ?? 0),
        lastSceneDrawInterruptionAt: interruptedSceneDrawAt > 0 ? beganAt : Number(current.lastSceneDrawInterruptionAt ?? 0),
        effects: String(policy?.effects ?? "off"),
        dice: String(policy?.dice ?? "normal")
      });
    },
    recordRisk(kind, detail = null) {
      if (!current?.active) return;
      const riskAt = Number(now());
      const signature = `${String(kind ?? "graphics")}:${String(detail ?? "")}`;
      if (signature === lastRiskSignature && riskAt - Number(current.lastRiskAt ?? 0) < DUPLICATE_LOSS_WINDOW_MS) return;
      lastRiskSignature = signature;
      write({
        lastRiskAt: riskAt,
        lastRisk: {
          kind: String(kind ?? "graphics").slice(0, 80),
          detail: detail == null ? null : String(detail).slice(0, 300)
        }
      });
    },
    clearRisk(kind = null) {
      if (!current?.active) return;
      if (kind && String(current.lastRisk?.kind ?? "") !== String(kind)) return;
      write({ lastRiskAt: 0, lastRisk: null });
    },
    recordContextLoss(source = null, details = null) {
      if (!current?.active) return;
      const lossAt = Number(now());
      const normalizedSource = source == null ? "unknown" : String(source).slice(0, 80);
      const recent = recentLosses(current.recentContextLosses, lossAt);
      const duplicate = recent.some((loss) => loss.source === normalizedSource && lossAt - loss.at < DUPLICATE_LOSS_WINDOW_MS);
      if (duplicate) return;
      const nextLosses = [...recent, { at: lossAt, source: normalizedSource }].slice(-MAX_RECENT_LOSSES);
      write({
        lastRiskAt: lossAt,
        lastRisk: { kind: "webgl-context-lost", detail: normalizedSource },
        totalContextLosses: Number(current.totalContextLosses ?? 0) + 1,
        lastContextLossAt: lossAt,
        recentContextLosses: nextLosses,
        contextLossThisSession: true,
        lastContextLoss: serializableContextLoss(details, { at: lossAt, source: normalizedSource })
      });
    },
    recordContextRestore(source = null) {
      if (!current?.active) return;
      write({
        lastContextRestoreAt: Number(now()),
        lastContextRestoreSource: source == null ? "unknown" : String(source).slice(0, 80)
      });
    },
    recordDiceSuccess() {
      if (!current?.active || current.contextLossThisSession) return;
      write({ successful3dThisSession: true, lastDiceSuccessAt: Number(now()) });
    },
    updatePolicy(policy) {
      if (!current?.active) return;
      write({ effects: String(policy?.effects ?? "off"), dice: String(policy?.dice ?? "normal") });
    },
    finish() {
      if (!current?.active) return;
      const finishedAt = Number(now());
      const clean3d = Boolean(current.successful3dThisSession && !current.contextLossThisSession);
      write({
        active: false,
        finishedAt,
        lastRiskAt: 0,
        lastRisk: null,
        ...(clean3d ? {
          recentContextLosses: [],
          lastContextLossAt: 0,
          lastAmbiguousExitAt: 0,
          clean3dSessions: Number(current.clean3dSessions ?? 0) + 1,
          lastRecoveryClearedAt: finishedAt
        } : {})
      });
    },
    snapshot: () => serializableJournal(current)
  };
  return Object.freeze(api);
}

function existingMaxTextureSize(getCanvas) {
  try {
    const renderer = getCanvas?.()?.app?.renderer;
    const value = Number(renderer?.texture?.maxTextureSize ?? renderer?.gl?.getParameter?.(renderer.gl.MAX_TEXTURE_SIZE));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function readJournal(getStorage) {
  try {
    const parsed = JSON.parse(getStorage()?.getItem?.(GRAPHICS_SAFETY_STORAGE_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function emptyJournal() {
  return {
    version: JOURNAL_VERSION,
    active: false,
    startedAt: 0,
    finishedAt: 0,
    lastRiskAt: 0,
    lastRisk: null,
    totalContextLosses: 0,
    legacyContextLosses: 0,
    lastContextLossAt: 0,
    lastContextLoss: null,
    recentContextLosses: [],
    contextLossThisSession: false,
    successful3dThisSession: false,
    lastDiceSuccessAt: 0,
    clean3dSessions: 0,
    ambiguousExits: 0,
    lastAmbiguousExitAt: 0,
    lastSceneDrawInterruptionAt: 0,
    lastContextRestoreAt: 0,
    lastContextRestoreSource: null,
    lastRecoveryClearedAt: 0,
    effects: "off",
    dice: "normal"
  };
}

function migrateJournal(value) {
  if (!value || typeof value !== "object") return null;
  if (Number(value.version) >= JOURNAL_VERSION) return { ...emptyJournal(), ...cloneJournal(value) };
  const legacyLosses = Math.max(0, Number(value.contextLosses ?? 0));
  const recoveryUntil = Number(value.recoveryUntil ?? 0);
  const lastContextLossAt = recoveryUntil > 0
    ? Math.max(0, recoveryUntil - HISTORICAL_LOSS_WINDOW_MS)
    : value.lastRisk?.kind === "webgl-context-lost" ? Number(value.lastRiskAt ?? 0) : 0;
  return {
    ...emptyJournal(),
    active: Boolean(value.active),
    startedAt: Number(value.startedAt ?? 0),
    finishedAt: Number(value.finishedAt ?? 0),
    lastRiskAt: Number(value.lastRiskAt ?? 0),
    lastRisk: normalizeRisk(value.lastRisk),
    totalContextLosses: legacyLosses,
    legacyContextLosses: legacyLosses,
    lastContextLossAt,
    lastContextLoss: value?.lastContextLoss ? serializableContextLoss(value.lastContextLoss) : null,
    effects: String(value.effects ?? "off"),
    dice: String(value.dice ?? "normal")
  };
}

function recoveryFor(value, timestamp, unexpectedPreviousExit = false, interruptedSceneDrawAt = 0) {
  const losses = recentLosses(value?.recentContextLosses, timestamp);
  const lastContextLossAt = Number(value?.lastContextLossAt ?? 0);
  const historicalContextLoss = lastContextLossAt > 0
    && timestamp - lastContextLossAt >= 0
    && timestamp - lastContextLossAt <= HISTORICAL_LOSS_WINDOW_MS;
  const ambiguousAt = Number(value?.lastAmbiguousExitAt ?? 0);
  const ambiguousUncleanExit = unexpectedPreviousExit || (ambiguousAt > 0
    && timestamp - ambiguousAt >= 0
    && timestamp - ambiguousAt <= RECENT_RISK_WINDOW_MS);
  const sceneDrawInterruptionAt = Math.max(Number(value?.lastSceneDrawInterruptionAt ?? 0), Number(interruptedSceneDrawAt) || 0);
  const recentSceneDrawInterruption = sceneDrawInterruptionAt > 0
    && timestamp - sceneDrawInterruptionAt >= 0
    && timestamp - sceneDrawInterruptionAt <= RECENT_RISK_WINDOW_MS;
  return Object.freeze({
    ambiguousUncleanExit,
    recentSceneDrawInterruption,
    historicalContextLoss,
    contextLossThisSession: Boolean(value?.active && value?.contextLossThisSession),
    repeatedRecentContextLoss: losses.length >= 2,
    recentContextLossCount: losses.length,
    recentContextLossSources: Object.freeze([...new Set(losses.map((loss) => loss.source))]),
    totalContextLosses: Number(value?.totalContextLosses ?? 0),
    legacyContextLosses: Number(value?.legacyContextLosses ?? 0),
    lastContextLossAt,
    lastContextLoss: value?.lastContextLoss ? serializableContextLoss(value.lastContextLoss) : null,
    clean3dSessions: Number(value?.clean3dSessions ?? 0),
    lastDiceSuccessAt: Number(value?.lastDiceSuccessAt ?? 0),
    lastRecoveryClearedAt: Number(value?.lastRecoveryClearedAt ?? 0)
  });
}

function normalizeRecoveryState(value, legacy) {
  if (!value || typeof value !== "object") {
    return Object.freeze({
      ambiguousUncleanExit: Boolean(legacy.recoveryRecommended && !legacy.contextLossRecoveryRecommended),
      historicalContextLoss: false,
      contextLossThisSession: false,
      repeatedRecentContextLoss: Boolean(legacy.contextLossRecoveryRecommended),
      recentContextLossCount: legacy.contextLossRecoveryRecommended ? 2 : 0,
      recentContextLossSources: Object.freeze([]),
      totalContextLosses: 0,
      legacyContextLosses: 0,
      lastContextLossAt: 0,
      lastContextLoss: null,
      clean3dSessions: 0,
      lastDiceSuccessAt: 0,
      lastRecoveryClearedAt: 0
    });
  }
  return Object.freeze({
    ambiguousUncleanExit: Boolean(value.ambiguousUncleanExit),
    historicalContextLoss: Boolean(value.historicalContextLoss),
    contextLossThisSession: Boolean(value.contextLossThisSession),
    repeatedRecentContextLoss: Boolean(value.repeatedRecentContextLoss),
    recentContextLossCount: Number(value.recentContextLossCount ?? 0),
    recentContextLossSources: Object.freeze(Array.isArray(value.recentContextLossSources) ? value.recentContextLossSources.map(String) : []),
    totalContextLosses: Number(value.totalContextLosses ?? 0),
    legacyContextLosses: Number(value.legacyContextLosses ?? 0),
    lastContextLossAt: Number(value.lastContextLossAt ?? 0),
    lastContextLoss: value.lastContextLoss ? serializableContextLoss(value.lastContextLoss) : null,
    clean3dSessions: Number(value.clean3dSessions ?? 0),
    lastDiceSuccessAt: Number(value.lastDiceSuccessAt ?? 0),
    lastRecoveryClearedAt: Number(value.lastRecoveryClearedAt ?? 0)
  });
}

function isUnexpectedExit(value, timestamp) {
  if (!value?.active) return false;
  const startedAt = Number(value.startedAt ?? 0);
  const lastRiskAt = Number(value.lastRiskAt ?? 0);
  return startedAt > 0
    && lastRiskAt > 0
    && timestamp - startedAt >= 0
    && timestamp - startedAt <= SESSION_MAX_AGE_MS
    && timestamp - lastRiskAt >= 0
    && timestamp - lastRiskAt <= RECENT_RISK_WINDOW_MS;
}

function recentLosses(values, timestamp) {
  if (!Array.isArray(values)) return [];
  return values
    .map((loss) => ({ at: Number(loss?.at ?? 0), source: String(loss?.source ?? "unknown").slice(0, 80) }))
    .filter((loss) => loss.at > 0 && timestamp - loss.at >= 0 && timestamp - loss.at <= RECENT_RISK_WINDOW_MS)
    .slice(-MAX_RECENT_LOSSES);
}

function cloneJournal(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ...value,
    lastRisk: normalizeRisk(value.lastRisk),
    recentContextLosses: Array.isArray(value.recentContextLosses)
      ? value.recentContextLosses.map((loss) => ({ at: Number(loss?.at ?? 0), source: String(loss?.source ?? "unknown").slice(0, 80) }))
      : [],
    lastContextLoss: value.lastContextLoss ? serializableContextLoss(value.lastContextLoss) : null
  };
}

function normalizeRisk(value) {
  if (!value || typeof value !== "object") return null;
  return { kind: String(value.kind ?? ""), detail: value.detail == null ? null : String(value.detail) };
}

function serializableJournal(value) {
  if (!value || typeof value !== "object") return null;
  const copy = cloneJournal(value);
  return Object.freeze({
    ...copy,
    active: Boolean(copy.active),
    lastRisk: copy.lastRisk ? Object.freeze(copy.lastRisk) : null,
    recentContextLosses: Object.freeze(copy.recentContextLosses.map((loss) => Object.freeze(loss)))
  });
}

function serializableContextLoss(value, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const risk = source.sceneRisk && typeof source.sceneRisk === "object" ? source.sceneRisk : {};
  return Object.freeze({
    at: Number(source.at ?? fallback.at ?? 0),
    source: String(source.source ?? fallback.source ?? "unknown").slice(0, 80),
    sceneId: String(source.sceneId ?? "").slice(0, 128),
    sceneName: String(source.sceneName ?? "").slice(0, 200),
    devicePolicy: String(source.devicePolicy ?? "unknown").slice(0, 120),
    devicePixelRatio: finitePositive(source.devicePixelRatio),
    rendererResolution: finitePositive(source.rendererResolution),
    performanceMode: Number.isFinite(Number(source.performanceMode)) ? Number(source.performanceMode) : null,
    maxFps: Number.isFinite(Number(source.maxFps)) ? Number(source.maxFps) : null,
    mipmap: typeof source.mipmap === "boolean" ? source.mipmap : null,
    lowMemory: Boolean(source.lowMemory),
    derivativeStatus: String(source.derivativeStatus ?? "unknown").slice(0, 80),
    sceneRisk: Object.freeze({
      classification: String(risk.classification ?? "unknown").slice(0, 40),
      confidence: String(risk.confidence ?? "unknown").slice(0, 40),
      surfaceCount: Number(risk.surfaceCount ?? 0),
      originalDecodedBytes: Number(risk.originalDecodedBytes ?? 0),
      effectiveDecodedBytes: Number(risk.effectiveDecodedBytes ?? 0)
    })
  });
}
