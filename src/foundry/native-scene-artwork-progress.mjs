import { localizeFoundry } from "./localization.mjs";
/** Observe Foundry v13's actual Scene texture notification percentage. */
export function observeNativeSceneArtworkProgress(scope, {
  getUi = () => globalThis.ui,
  getCanvas = () => globalThis.canvas,
  onProgress = () => {}
} = {}) {
  const notifications = getUi()?.notifications;
  if (!notifications || typeof notifications.info !== "function") return false;
  const originalInfo = notifications.info;
  // Adapt the native Scene artwork progress callback to the mobile loading surface.
  const wrappedInfo = function(message, options = {}) {
    const bar = originalInfo.call(this, message, options);
    if (message !== "SCENE.Loading" || options?.localize !== true || options?.progress !== true
      || !getCanvas()?.loading || typeof bar?.update !== "function") return bar;
    const originalUpdate = bar.update;
    bar.update = function(update = {}) {
      const result = originalUpdate.call(this, update);
      const progressFraction = Number(update.pct);
      if (Number.isFinite(progressFraction) && progressFraction >= 0 && progressFraction <= 1) {
        // Native Notification uses [0, 1]; VE's phase display uses [0, 100].
        onProgress(Object.freeze({ label: localizeFoundry("VEMOBILE.Interface.NativeSceneArtworkProgress.LoadingSceneArtwork", "Loading scene artwork…"), pct: progressFraction * 100 }));
      }
      return result;
    };
    return bar;
  };
  notifications.info = wrappedInfo;
  scope.own(() => {
    if (notifications.info === wrappedInfo) notifications.info = originalInfo;
  });
  return true;
}
