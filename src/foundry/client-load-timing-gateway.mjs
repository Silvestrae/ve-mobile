import { localizeFoundry } from "./localization.mjs";
import { MODULE_ID, LOAD_TIMING_KEYS } from "./preferences.mjs";
const RECOVERY_SESSION_KEY = "ve-mobile:last-recovery:v1";

/** Browser-specific successful timings and bounded recovery diagnostics. */
export function createClientLoadTimingGateway({
  getGame = () => globalThis.game,
  getStorage = () => globalThis.sessionStorage
} = {}) {
  const initial = { type: "none", resyncDurationMs: null, canvasDurationMs: null,
    canvasSucceeded: null, hardReload: false, checkpoint: "none" };
  let prior = null;
  try { prior = JSON.parse(getStorage()?.getItem?.(RECOVERY_SESSION_KEY) ?? "null"); } catch { /* Storage is optional. */ }
  let recent = Object.freeze(prior && typeof prior === "object"
    ? Object.fromEntries(Object.keys(initial).map(key => [key, prior[key] ?? initial[key]])) : initial);
  const isForced = (game, key) => {
    if (!game?.modules?.get?.("force-client-settings")?.active) return false;
    try {
      return Boolean(game.settings.get("force-client-settings", "forced")?.[`${MODULE_ID}.${key}`]);
    } catch { return true; }
  };
  const read = (key) => {
    try {
      const game = getGame();
      if (isForced(game, key)) return null;
      const value = Number(game?.settings?.get?.(MODULE_ID, key));
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch { return null; }
  };
  const write = async (key, milliseconds) => {
    const value = Math.round(Number(milliseconds));
    if (!Number.isFinite(value) || value <= 0) return false;
    const game = getGame();
    const registration = game?.settings?.settings?.get?.(`${MODULE_ID}.${key}`);
    if (registration?.scope !== "client") throw new Error(localizeFoundry("VEMOBILE.Interface.ClientLoadTimingGateway.LoadTimingStorageIsNotClientScoped", "Load timing storage is not client-scoped."));
    // FCS 2.6 routes a forced client-setting write by a GM through a world
    // mirror. A device timing must never change that shared value.
    if (isForced(game, key)) return false;
    await game.settings.set(MODULE_ID, key, value);
    return true;
  };
  return Object.freeze({
    get lastSuccessfulFullLoadMs() { return read(LOAD_TIMING_KEYS.FULL); },
    get lastSuccessfulResyncMs() { return read(LOAD_TIMING_KEYS.RESYNC); },
    saveFullLoad: (milliseconds) => write(LOAD_TIMING_KEYS.FULL, milliseconds),
    saveResync: (milliseconds) => write(LOAD_TIMING_KEYS.RESYNC, milliseconds),
    note(patch) {
      recent = Object.freeze({ ...recent, ...patch });
      try { getStorage()?.setItem?.(RECOVERY_SESSION_KEY, JSON.stringify(recent)); }
      catch { /* In-memory Support diagnostics remain available. */ }
    },
    snapshot() { return Object.freeze({
      lastSuccessfulFullLoadMs: read(LOAD_TIMING_KEYS.FULL),
      lastSuccessfulResyncMs: read(LOAD_TIMING_KEYS.RESYNC),
      ...recent
    }); }
  });
}
