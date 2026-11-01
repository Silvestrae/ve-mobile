import { KEYS, MODULE_ID } from "./preferences.mjs";
import { nextMemoryProfile } from "./low-memory-canvas-gateway.mjs";
import { localizeFoundry } from "./localization.mjs";

/** Present observed graphics failures and route recovery through the owned
 * profile transaction. An ambiguous interrupted draw stays diagnostic only. */
export function createGraphicsRecoveryGateway({
  journal,
  lowMemoryGateway,
  getGame = () => globalThis.game,
  getCanvas = () => globalThis.canvas,
  getWindow = () => globalThis.window,
  getGraphicsPolicy = () => null,
  getSceneRisk = () => null,
  getDerivativeStatus = () => null,
  getPresentationContext = () => null,
  isMobileAuthorityActive = () => true,
  diagnostics = null
} = {}) {
  const previous = journal?.previous ?? null;

  const api = {
    // Expose the current graphics recovery transaction as an immutable diagnostic record.
    snapshot() {
      const game = getGame();
      const recovery = journal?.recovery?.() ?? {};
      const acknowledgedAt = Number(safeGet(game, MODULE_ID, KEYS.GRAPHICS_RECOVERY_ACKNOWLEDGED) ?? 0);
      // Only an observed context loss is a promptable incident. An interrupted
      // resync or suspended document remains diagnostic evidence, not a crash.
      const reliableLossAt = previous?.contextLossThisSession ? Number(previous.lastContextLossAt ?? 0) : 0;
      const reliablePending = reliableLossAt > acknowledgedAt;
      const ambiguousPending = false;
      const lowMemory = lowMemoryGateway?.snapshot?.() ?? {};
      return Object.freeze({
        behavior: normalizedBehavior(safeGet(game, MODULE_ID, KEYS.AFTER_GRAPHICS_FAILURE)),
        reliablePending,
        ambiguousPending,
        failureAt: reliableLossAt,
        contextLoss: previous?.lastContextLoss ?? recovery.lastContextLoss ?? null,
        acknowledgedAt,
        lowMemoryActive: Boolean(lowMemory.active),
        lowMemoryEffective: Boolean(lowMemory.effective),
        lowMemoryIneffectiveKeys: Object.freeze([...(lowMemory.ineffectiveKeys ?? [])]),
        lowMemoryConflicts: Object.freeze([...(lowMemory.forceClientSettings?.conflicts ?? [])]),
        currentProfile: String(lowMemory.profile ?? "normal"),
        effectiveProfile: String(lowMemory.effectiveProfile ?? lowMemory.profile ?? "normal"),
        recommendedProfile: nextMemoryProfile(lowMemory.effectiveProfile ?? lowMemory.profile ?? "normal"),
        failureAtMaximum: Boolean(reliablePending && String(previous?.lastContextLoss?.memoryProfile ?? "") === "maximum")
      });
    },

    // Normalize the browser's WebGL loss event into safe diagnostic details for this canvas label.
    contextLossDetails(label = "Foundry canvas") {
      const game = getGame();
      const canvas = getCanvas();
      const policy = getGraphicsPolicy();
      const lowMemory = lowMemoryGateway?.snapshot?.() ?? {};
      const presentation = getPresentationContext?.() ?? {};
      const scene = canvas?.scene ?? game?.scenes?.current;
      const risk = getSceneRisk(scene?.id);
      return Object.freeze({
        source: label,
        sceneId: String(scene?.id ?? ""),
        sceneName: String(scene?.name ?? ""),
        devicePolicy: `${policy?.device?.family ?? "unknown"}/${policy?.device?.tier ?? "unknown"}`,
        devicePixelRatio: Number(getWindow()?.devicePixelRatio ?? 0),
        rendererResolution: Number(canvas?.app?.renderer?.resolution ?? 0),
        performanceMode: safeGet(game, "core", "performanceMode"),
        maxFps: safeGet(game, "core", "maxFPS"),
        mipmap: safeGet(game, "core", "mipmap"),
        lightAnimation: safeGet(game, "core", "lightAnimation"),
        lowMemory: Boolean(lowMemory.active),
        lowMemoryEffective: Boolean(lowMemory.effective),
        lowMemoryIneffectiveKeys: Object.freeze([...(lowMemory.ineffectiveKeys ?? [])]),
        lowMemoryConflicts: Object.freeze([...(lowMemory.forceClientSettings?.conflicts ?? [])]),
        memoryProfile: String(lowMemory.profile ?? "normal"),
        effectiveMemoryProfile: String(lowMemory.effectiveProfile ?? lowMemory.profile ?? "normal"),
        splitScreen: Boolean(presentation.splitScreen),
        sceneViewport: plainDimensions(presentation.sceneViewport),
        canvasBacking: plainDimensions(presentation.canvasBacking),
        derivativeStatus: String(getDerivativeStatus()?.status ?? risk?.derivativeStatus ?? "unknown"),
        sceneRisk: risk
      });
    },

    async acknowledge() {
      // Persist acknowledgment so startup does not repeatedly prompt for the
      // same observed failure; it does not clear the underlying history.
      const state = api.snapshot();
      const timestamp = Math.max(state.failureAt, Date.now());
      await getGame()?.settings?.set?.(MODULE_ID, KEYS.GRAPHICS_RECOVERY_ACKNOWLEDGED, timestamp);
      return Object.freeze({ ok: true, acknowledgedAt: timestamp });
    },

    // Apply the chosen low-memory profile before returning the canvas to a memory-risk Scene.
    async prepareLowMemory() {
      if (!isMobileAuthorityActive()) throw new Error(localizeFoundry("VEMOBILE.Graphics.MobileInactive", "Mobile performance protection is inactive in Desktop mode."));
      const current = lowMemoryGateway.snapshot()?.profile ?? "normal";
      const result = typeof lowMemoryGateway.apply === "function"
        ? await lowMemoryGateway.apply(nextMemoryProfile(current), { source: "graphics-recovery" })
        : await lowMemoryGateway.enable({ source: "graphics-recovery" });
      await api.acknowledge();
      return result;
    },

    async prepareNextProfile() {
      return api.prepareLowMemory();
    },

    async startupAction() {
      // Automatic escalation is limited to a reliable unacknowledged context
      // loss and a non-maximum profile; uncertain interruption never writes.
      const state = api.snapshot();
      if (!isMobileAuthorityActive()) return Object.freeze({ action: "none", state });
      if (!state.reliablePending) return Object.freeze({ action: "none", state });
      if (state.currentProfile === "maximum" || state.failureAtMaximum) {
        await api.acknowledge();
        diagnostics?.record?.("warn", "Graphics failure occurred at Maximum protection; no further automatic escalation or reload was attempted.");
        return Object.freeze({ action: "none", state, acknowledged: true, maximum: true });
      }
      if (state.behavior !== "auto") return Object.freeze({ action: "none", state });
      try {
        const result = await api.prepareLowMemory();
        return Object.freeze({ action: result.requiresReload ? "reload" : "applied", result });
      } catch (error) {
        diagnostics?.record?.("error", "Automatic Memory Protection escalation failed", error);
        return Object.freeze({ action: "failed", error: String(error?.message ?? error) });
      }
    }
  };
  return Object.freeze(api);
}

// Convert renderer dimensions to a plain finite width/height record.
function plainDimensions(value) {
  const width = Number(value?.width ?? 0);
  const height = Number(value?.height ?? 0);
  return Object.freeze({
    width: Number.isFinite(width) && width >= 0 ? Math.round(width) : 0,
    height: Number.isFinite(height) && height >= 0 ? Math.round(height) : 0
  });
}

// Normalize the configured recovery behavior to the supported policy values.
function normalizedBehavior(value) {
  return ["ask", "auto", "nothing"].includes(value) ? value : "ask";
}

// Read one recovery setting with a fallback when Foundry does not expose it.
function safeGet(game, namespace, key) {
  try { return game?.settings?.get?.(namespace, key); } catch { return undefined; }
}
