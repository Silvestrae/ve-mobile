/** A disposable owner for DOM listeners, Foundry hooks, timers, and children. */
export function createTaskScope(label = "scope", performanceObserver = null) {
  const cleanups = new Set();
  let disposed = false;
  const releaseScope = performanceObserver?.track?.("lifecycle.scope") ?? (() => {});

  // Register cleanup immediately; resources arriving after disposal are released straight away.
  const own = (cleanup) => {
    if (typeof cleanup !== "function") return cleanup;
    if (disposed) cleanup();
    else cleanups.add(cleanup);
    return cleanup;
  };

  // Pair a cleanup with its performance counter and make repeated disposal harmless.
  const ownResource = (kind, cleanup) => {
    const release = performanceObserver?.track?.(`lifecycle.${kind}`) ?? (() => {});
    let active = true;
    // Release this resource once and remove it from the parent's outstanding cleanup set.
    const dispose = () => {
      if (!active) return;
      active = false;
      cleanups.delete(dispose);
      try {
        cleanup();
      } finally {
        release();
      }
    };
    own(dispose);
    return dispose;
  };

  return Object.freeze({
    label,
    get disposed() {
      return disposed;
    },
    get ownedCount() {
      return cleanups.size;
    },
    own,
    // Register the DOM listener and immediately own its matching removal.
    listen(target, type, listener, options) {
      target?.addEventListener?.(type, listener, options);
      ownResource("listener", () => target?.removeEventListener?.(type, listener, options));
      return listener;
    },
    // Retain the Foundry hook ID so disposal removes this registration rather than another callback.
    hook(name, listener) {
      const id = Hooks.on(name, listener);
      ownResource("hook", () => Hooks.off(name, id));
      return id;
    },
    // Release timer accounting before invoking the callback, including when that callback schedules another timer.
    timeout(callback, delay) {
      let disposeTimer = null;
      const id = setTimeout(() => {
        disposeTimer?.();
        callback();
      }, delay);
      disposeTimer = ownResource("timer", () => clearTimeout(id));
      return id;
    },
    // Attach a nested owner and remove the parent cleanup entry when the child finishes independently.
    child(childLabel) {
      const child = createTaskScope(`${label}/${childLabel}`, performanceObserver);
      // Dispose the child through the parent; the child's own cleanup then removes this parent registration.
      const disposeChild = () => child.dispose();
      own(disposeChild);
      child.own(() => cleanups.delete(disposeChild));
      return child;
    },
    // Mark the owner inactive first, then run outstanding cleanups in reverse acquisition order.
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of [...cleanups].reverse()) {
        try {
          cleanup();
        } catch (error) {
          console.warn(`VE Mobile | Cleanup failed in ${label}`, error);
        }
      }
      cleanups.clear();
      releaseScope();
    }
  });
}
