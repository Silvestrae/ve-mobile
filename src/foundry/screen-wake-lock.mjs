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

  // Check whether the current browser exposes the Screen Wake Lock request API.
  const supported = () => typeof getNavigator()?.wakeLock?.request === "function";
  // Hold a lock only while an owner requests it, the preference is enabled,
  // the API exists, and the page is visible.
  const shouldHold = () => Boolean(owners.size && readEnabled() && supported()
    && getDocument()?.visibilityState !== "hidden");

  // Clear the current handle before awaiting release so a newer request can
  // acquire independently; release failures are reported but do not block cleanup.
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

  // Coalesce browser requests and discard the result if owner/policy version
  // changed before the browser granted it.
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
        // A preference or owner can be disabled and re-enabled while the
        // browser request is still pending. The old request is correctly
        // discarded above, but its completion must not strand the new owner.
        if (expectedVersion !== version && shouldHold()) void reconcile();
      });
    return pending;
  };

  // Reconcile the owned lock with current visibility and preference; changing
  // to a release also advances the version to invalidate pending acquisitions.
  const reconcile = () => {
    if (shouldHold()) return acquire(version);
    version += 1;
    return release().then(() => false);
  };

  // Request while a real user gesture is still on the call stack, since browsers
  // may reject wake-lock requests started later from lifecycle callbacks.
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
    // Request and own a screen wake lock while the active mobile scope requires it.
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

  // Persist preference revisions in order, coalescing intermediate choices to
  // the newest value observed before each write begins.
  const drain = async () => {
    while (persistedRevision < revision) {
      const targetRevision = revision;
      const targetValue = enabled;
      await persist(targetValue);
      persistedRevision = targetRevision;
    }
  };

  // Keep one persistence task active and start another only if a newer revision
  // arrived while the previous write was in flight.
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
    // Record the user's wake-lock preference and reconcile the current browser lock request.
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
