const DEVICE_PREFERENCE = "ve-mobile.fullscreen";

/** Keep fullscreen intent in this browser profile and own only VE's request
 * to fullscreen the whole document, including the native Canvas and dialogs. */
export function createBrowserFullscreen({
  getDocument = () => globalThis.document,
  getStorage = () => globalThis.localStorage
} = {}) {
  let owner = null;
  let ownsFullscreen = false;
  let pending = null;
  let exiting = null;
  const listeners = new Set();

  // Capability checks include the browser's permissions policy.
  const supported = document => Boolean(document?.fullscreenEnabled
    && typeof document.documentElement?.requestFullscreen === "function"
    && typeof document.exitFullscreen === "function");

  // Read the device preference across logins even when the browser exited fullscreen.
  const snapshot = () => {
    const document = getDocument();
    let enabled = false;
    try { enabled = getStorage()?.getItem(DEVICE_PREFERENCE) === "true"; }
    catch { /* Browser storage may be blocked. */ }
    return Object.freeze({ enabled, supported: supported(document), active: Boolean(document?.fullscreenElement), pending: Boolean(pending || exiting) });
  };

  // Share native state changes only with currently mounted Settings consumers.
  const publish = () => {
    if (!listeners.size) return;
    const state = snapshot();
    for (const listener of listeners) listener(state);
  };

  // Escape or a browser gesture can end fullscreen without changing saved intent.
  const onFullscreenChange = () => {
    const document = getDocument();
    if (document?.fullscreenElement !== document?.documentElement) ownsFullscreen = false;
    publish();
  };

  // Leave only the full-document session VE opened. Other native fullscreen
  // surfaces, such as media viewers, retain their own lifecycle.
  const leaveOwnedFullscreen = async () => {
    const document = getDocument();
    if (exiting) return exiting;
    if (!ownsFullscreen || document.fullscreenElement !== document.documentElement) return true;
    let request;
    try { request = document.exitFullscreen(); }
    catch { return false; }
    exiting = Promise.resolve(request).then(() => {
      ownsFullscreen = false;
      return true;
    }, () => document.fullscreenElement !== document.documentElement).finally(() => {
      exiting = null;
      publish();
    });
    publish();
    return exiting;
  };

  // Call from a trusted click before awaiting settings or render updates.
  const enter = () => {
    const document = getDocument();
    const requestOwner = owner;
    if (!requestOwner || requestOwner.disposed || exiting || !supported(document)) return Promise.resolve(false);
    if (document.fullscreenElement) return Promise.resolve(true);
    if (pending) return pending;
    let request;
    try { request = document.documentElement.requestFullscreen({ navigationUI: "hide" }); }
    catch { return Promise.resolve(false); }
    pending = Promise.resolve(request).then(async () => {
      ownsFullscreen = document.fullscreenElement === document.documentElement;
      if (owner !== requestOwner || requestOwner.disposed || !snapshot().enabled) {
        await leaveOwnedFullscreen();
        return false;
      }
      return ownsFullscreen;
    }, () => false).finally(() => {
      pending = null;
      publish();
    });
    publish();
    return pending;
  };

  return Object.freeze({
    snapshot,
    // Register under the running mobile presentation and release on Desktop exit.
    enable(scope) {
      if (owner || scope.disposed) return;
      owner = scope;
      scope.listen(getDocument(), "fullscreenchange", onFullscreenChange);
      scope.own(() => {
        if (owner !== scope) return;
        owner = null;
        void leaveOwnedFullscreen();
      });
    },
    watch(scope, listener) {
      listeners.add(listener);
      scope.own(() => listeners.delete(listener));
      listener(snapshot());
    },
    // A reload restores the preference. The browser grants fullscreen on Continue.
    needsResume() {
      const { enabled, supported, active } = snapshot();
      return enabled && supported && !active;
    },
    resume() { return snapshot().enabled ? enter() : Promise.resolve(false); },
    async setEnabled(enabled) {
      if (!owner || owner.disposed || pending || exiting) return false;
      const storage = getStorage();
      if (!storage) return false;
      if (enabled) storage.setItem(DEVICE_PREFERENCE, "true");
      else storage.removeItem(DEVICE_PREFERENCE);
      const result = enabled ? enter() : leaveOwnedFullscreen();
      publish();
      return result;
    }
  });
}
