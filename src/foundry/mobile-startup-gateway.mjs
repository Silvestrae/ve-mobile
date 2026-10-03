import { localizeFoundry } from "./localization.mjs";
import { KEYS, MODULE_ID } from "./preferences.mjs";

/** Foundry 13.351 does not await init hooks. It DOES await initializeCanvas.
 * Gate that instance method before its synchronous Canvas#initialize call, so
 * renderer construction, Scene preflight and noCanvas all see a safe baseline.
 */
export function createMobileStartupGateway({ getGame = () => globalThis.game, graphics, theme, readMobile,
  setMutationReady, onRecovery = () => {}, onError = () => {} }) {
  let boot = null;
  let state = "pending";
  const game = () => getGame();
  const read = key => game().settings.get(MODULE_ID, key);
  const write = (key, value) => game().settings.set(MODULE_ID, key, value);
  const hasCapturedState = () => Object.keys(read(KEYS.GRAPHICS_SETTINGS_SNAPSHOT) ?? {}).length > 0
    || read(KEYS.THEME_SETTINGS_SNAPSHOT)?.captured === true;
  const recover = error => {
    state = "recovery-required";
    setMutationReady(false);
    try { onError(error); } catch { /* Recovery must survive diagnostic failure. */ }
    let keys = [];
    try { keys = graphics.pendingRestoration(); } catch { /* Retain unreadable state for retry. */ }
    try { if (read(KEYS.THEME_SETTINGS_SNAPSHOT)?.captured) keys.push("core.uiConfig"); } catch {}
    onRecovery(Object.freeze({ keys: Object.freeze(keys), message: String(error?.message ?? "") }));
    return Object.freeze({ state });
  };
  const restore = async () => {
    await graphics.restoreForDesktop({ notify: false });
    await theme.restoreForDesktop({ notify: false });
    // No marker is retired until BOTH independently verified snapshots retire.
    await write(KEYS.PENDING_DESKTOP_RESTORE, {});
    await write(KEYS.GRAPHICS_PROFILE_TRANSACTION, {});
  };
  const run = async ({ manual = false } = {}) => {
    setMutationReady(false);
    try {
      const pending = read(KEYS.PENDING_DESKTOP_RESTORE);
      if (pending?.version === 1 || (!readMobile() && hasCapturedState())) {
        const attempts = Math.max(0, Number(pending?.attempts) || 0);
        if (!manual && attempts >= 2) return recover(new Error(localizeFoundry("VEMOBILE.Interface.MobileStartupGateway.AutomaticDesktopRestorationRetriesAreExhausted", "Automatic Desktop restoration retries are exhausted.")));
        await write(KEYS.PENDING_DESKTOP_RESTORE, { version: 1, attempts: attempts + 1 });
        await restore();
      }
      if (readMobile()) {
        const entry = read(KEYS.MOBILE_ENTRY_HANDOFF);
        const entryToken = entry?.version === 1 ? String(entry.token ?? "") : "";
        await graphics.beginMobileSession({ fresh: false, entryToken });
        await theme.beginMobileSession({ fresh: false, entryToken });
        // Captures are durable before read overrides or profile setters open.
        await write(KEYS.MOBILE_ENTRY_HANDOFF, {});
      }
      state = "ready";
      setMutationReady(true);
      return Object.freeze({ state });
    } catch (error) { return recover(error); }
  };
  return Object.freeze({
    get state() { return state; },
    prepare() { return boot ??= Promise.resolve().then(() => run()); },
    retry() {
      if (state !== "recovery-required") return boot;
      state = "pending";
      return boot = run({ manual: true });
    },
    install(scope) {
      const target = game();
      const original = target.initializeCanvas;
      if (typeof original !== "function") throw new Error(localizeFoundry("VEMOBILE.Interface.MobileStartupGateway.FoundrySPreCanvasStartupBoundaryIsUnavailable", "Foundry's pre-Canvas startup boundary is unavailable."));
      const prepare = () => boot ??= Promise.resolve().then(() => run());
      const wrapper = async function (...args) {
        await prepare();
        // Failed restoration keeps VE dormant; native Desktop can still load
        // and expose the recovery surface without any further mobile writes.
        return original.apply(this, args);
      };
      target.initializeCanvas = wrapper;
      scope.own(() => { if (target.initializeCanvas === wrapper) target.initializeCanvas = original; });
      return prepare();
    }
  });
}
