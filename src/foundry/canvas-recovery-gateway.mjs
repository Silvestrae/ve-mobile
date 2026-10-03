import { localizeFoundry } from "./localization.mjs";
/** Rebuild Foundry's Canvas from the authoritative Scene after missed socket events. */
export function createFoundryCanvasRecoveryGateway({
  getGame = () => globalThis.game,
  getCanvas = () => globalThis.canvas,
  getHooks = () => globalThis.Hooks,
  readNoCanvas = () => getGame()?.settings?.get?.("core", "noCanvas") === true,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (handle) => globalThis.clearTimeout(handle),
  timeoutMs = 30000
} = {}) {
  const capture = () => {
    const game = getGame();
    const canvas = getCanvas();
    const scene = canvas?.scene;
    const pivot = canvas?.stage?.pivot;
    const scale = canvas?.stage?.scale?.x;
    const camera = [pivot?.x, pivot?.y, scale].every(Number.isFinite)
      ? Object.freeze({ x: pivot.x, y: pivot.y, scale }) : null;
    return Object.freeze({
      sceneId: String(scene?.id ?? ""),
      activeSceneId: String(game?.scenes?.active?.id ?? ""),
      camera,
      controlled: Object.freeze((canvas?.tokens?.controlled ?? []).map(tokenIdentity).filter(Boolean)),
      targets: Object.freeze(Array.from(game?.user?.targets ?? []).map(tokenIdentity).filter(Boolean))
    });
  };

  return Object.freeze({
    capture,
    async reconcile({ before = capture(), isCurrent = () => true, onProgress = () => {} } = {}) {
      if (!isCurrent()) return Object.freeze({ applied: false, reason: "stale-generation" });
      if (readNoCanvas()) return Object.freeze({ applied: true, skipped: "no-canvas", durationMs: 0 });

      const game = getGame();
      const canvas = getCanvas();
      const scenes = game?.scenes;
      // A missed native activation hook leaves the old client-local _view flag
      // behind. A changed authoritative active Scene therefore takes priority.
      const active = scenes?.active ?? null;
      const activeChanged = Boolean(active && before.activeSceneId && active.id !== before.activeSceneId);
      const desired = activeChanged ? active : (scenes?.viewed ?? scenes?.current ?? active);
      if (!desired?.id || scenes?.get?.(desired.id) !== desired) {
        throw recoveryError("scene-data", localizeFoundry("VEMOBILE.Interface.CanvasRecoveryGateway.TheAuthoritativeSceneIsUnavailable", "The authoritative Scene is unavailable."));
      }
      if (!canvas?.initialized || !canvas?.stage || !canvas?.app?.renderer || typeof canvas.draw !== "function") {
        throw recoveryError("canvas", localizeFoundry("VEMOBILE.Interface.CanvasRecoveryGateway.TheCanvasRendererIsUnavailable", "The Canvas renderer is unavailable."));
      }
      const startedAt = now();
      onProgress(Object.freeze({ checkpoint: "canvas", detail: localizeFoundry("VEMOBILE.Interface.CanvasRecoveryGateway.SynchronisingScene", "Synchronizing scene…") }));
      // Canvas#draw queues native draws, tears down the prior Scene, loads
      // textures, and rebuilds every group. Scene#view skips same-Scene draws.
      const hooks = getHooks();
      let readySeen = false;
      const onReady = (readyCanvas) => {
        if (readyCanvas === canvas && readyCanvas.scene === desired) readySeen = true;
      };
      const hookId = hooks?.on?.("canvasReady", onReady);
      try {
        await withTimeout(Promise.resolve().then(() => canvas.draw(desired)), timeoutMs, setTimer, clearTimer);
      } finally {
        if (hookId !== undefined) hooks?.off?.("canvasReady", hookId);
      }
      if (!isCurrent()) return Object.freeze({ applied: false, reason: "stale-generation" });
      // Canvas#draw may resolve without throwing when native texture/group
      // construction failed. Its ready signal is therefore checked explicitly.
      if ((hooks?.on && !readySeen) || !canvas.ready || canvas.loading || canvas.scene !== desired || canvas.stage?.visible === false) {
        throw recoveryError("canvas", localizeFoundry("VEMOBILE.Interface.CanvasRecoveryGateway.TheCanvasDidNotBecomeReadyAfterDrawing", "The Canvas did not become ready after drawing."));
      }
      const sameScene = !activeChanged && before.sceneId === desired.id;
      if (sameScene) restoreClientState({ before, game, canvas, desired, isCurrent });
      if (!isCurrent()) return Object.freeze({ applied: false, reason: "stale-generation" });
      return Object.freeze({ applied: true, sceneId: desired.id, sameScene, durationMs: Math.max(0, now() - startedAt) });
    }
  });
}

function tokenIdentity(token) {
  const id = String(token?.id ?? token?.document?.id ?? "");
  const uuid = String(token?.document?.uuid ?? "");
  return id && uuid ? Object.freeze({ id, uuid }) : null;
}

function restoreClientState({ before, game, canvas, desired, isCurrent }) {
  if (!isCurrent() || canvas.scene !== desired || !canvas.ready) return;
  const tokens = canvas.tokens;
  const resolve = ({ id, uuid }) => {
    const token = tokens?.get?.(id);
    return token?.document?.uuid === uuid && token.document.parent === desired ? token : null;
  };
  if (before.camera && isCurrent()) canvas.pan(before.camera);
  if (!isCurrent()) return;
  const controlled = before.controlled.map(resolve).filter(Boolean);
  if (typeof tokens?.releaseAll === "function") tokens.releaseAll();
  for (const token of controlled) {
    if (!isCurrent()) return;
    token.control?.({ releaseOthers: false }); // Native control enforces current ownership.
  }
  if (!isCurrent()) return;
  const targetIds = before.targets.map(resolve).filter(Boolean).map(token => token.id);
  if (typeof tokens?.setTargets === "function") tokens.setTargets(targetIds, { mode: "replace" });
  else if (game?.user?.targets?.clear) game.user.targets.clear();
}

function recoveryError(checkpoint, message) {
  const error = new Error(message);
  error.reconnectCheckpoint = checkpoint;
  error.reconnectDetail = message;
  return error;
}

function withTimeout(operation, timeoutMs, setTimer, clearTimer) {
  let handle;
  const deadline = new Promise((_, reject) => {
    handle = setTimer(() => reject(recoveryError("canvas", localizeFoundry("VEMOBILE.Interface.CanvasRecoveryGateway.SceneSynchronisationTimedOut", "Scene synchronization timed out."))), timeoutMs);
  });
  return Promise.race([operation, deadline]).finally(() => clearTimer(handle));
}
