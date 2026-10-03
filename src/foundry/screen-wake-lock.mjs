/** Share a browser Screen Wake Lock across overlapping VE Mobile lifetimes. */
export function createScreenWakeLockController({
  getDocument = () => globalThis.document,
  getNavigator = () => globalThis.navigator,
  readEnabled = () => false
} = {}) {
  const owners = new Set();
  let sentinel = null;
  let pending = null;
  let version = 0;

  const supported = () => typeof getNavigator()?.wakeLock?.request === "function";
  const shouldHold = () => Boolean(owners.size && readEnabled() && supported()
    && getDocument()?.visibilityState !== "hidden");

  const release = async () => {
    const current = sentinel;
    sentinel = null;
    if (!current || current.released) return;
    try {
      await current.release();
    } catch (error) {
      console.warn("VE Mobile | Could not release the screen wake lock", error);
    }
  };

  const acquire = (expectedVersion) => {
    if (sentinel && !sentinel.released) return Promise.resolve(true);
    if (pending) return pending;
    let request;
    try {
      request = getNavigator().wakeLock.request("screen");
    } catch (error) {
      console.warn("VE Mobile | Screen wake lock was not granted", error);
      return Promise.resolve(false);
    }
    pending = Promise.resolve(request)
      .then(async (candidate) => {
        if (expectedVersion !== version || !shouldHold()) {
          await candidate?.release?.();
          return false;
        }
        sentinel = candidate;
        candidate?.addEventListener?.("release", () => {
          if (sentinel !== candidate) return;
          sentinel = null;
          // Android may release a wake lock while suspending or restoring the
          // page. The release can arrive after visibility has already returned
          // to visible, so visibilitychange alone cannot reliably reacquire it.
          if (expectedVersion === version && shouldHold()) void reconcile();
        }, { once: true });
        return true;
      })
      .catch((error) => {
        console.warn("VE Mobile | Screen wake lock was not granted", error);
        return false;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };

  const reconcile = () => {
    if (shouldHold()) return acquire(version);
    version += 1;
    return release().then(() => false);
  };

  const requestFromUserGesture = () => {
    if (!owners.size || !supported() || getDocument()?.visibilityState === "hidden") return Promise.resolve(false);
    return acquire(version);
  };

  return Object.freeze({
    get supported() {
      return supported();
    },
    get active() {
      return Boolean(sentinel && !sentinel.released);
    },
    enable(scope) {
      if (!scope || owners.has(scope)) return;
      owners.add(scope);
      scope.listen(getDocument(), "visibilitychange", reconcile);
      scope.own(() => {
        if (!owners.delete(scope)) return;
        if (owners.size) {
          void reconcile();
          return;
        }
        version += 1;
        void release();
      });
      void reconcile();
    },
    requestFromUserGesture,
    reconcile
  });
}

/**
 * Page-local Keep Awake preference used while Foundry is starting.
 *
 * The current choice is authoritative immediately. Persistence is serialized
 * and coalesced so an older settings write can never become the final value
 * after a newer checkbox interaction.
 */
export function createBootstrapWakePreference({
  initialValue = false,
  persist = async () => {}
} = {}) {
  let enabled = Boolean(initialValue);
  let revision = 0;
  let persistedRevision = 0;
  let writeTask = null;

  const drain = async () => {
    while (persistedRevision < revision) {
      const targetRevision = revision;
      const targetValue = enabled;
      await persist(targetValue);
      persistedRevision = targetRevision;
    }
  };

  const schedulePersistence = () => {
    if (!writeTask) {
      writeTask = drain().finally(() => {
        writeTask = null;
        if (persistedRevision < revision) schedulePersistence();
      });
    }
    return writeTask;
  };

  return Object.freeze({
    get enabled() {
      return enabled;
    },
    get revision() {
      return revision;
    },
    adopt(value) {
      if (revision) return false;
      enabled = Boolean(value);
      return true;
    },
    choose(value) {
      const next = Boolean(value);
      if (next === enabled && persistedRevision === revision) return writeTask ?? Promise.resolve();
      enabled = next;
      revision += 1;
      return schedulePersistence();
    },
    whenIdle() {
      return writeTask ?? Promise.resolve();
    }
  });
}
