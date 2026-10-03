/** A disposable owner for DOM listeners, Foundry hooks, timers, and children. */
export function createTaskScope(label = "scope", performanceObserver = null) {
  const cleanups = new Set();
  let disposed = false;
  const releaseScope = performanceObserver?.track?.("lifecycle.scope") ?? (() => {});

  const own = (cleanup) => {
    if (typeof cleanup !== "function") return cleanup;
    if (disposed) cleanup();
    else cleanups.add(cleanup);
    return cleanup;
  };

  const ownResource = (kind, cleanup) => {
    const release = performanceObserver?.track?.(`lifecycle.${kind}`) ?? (() => {});
    let active = true;
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
    listen(target, type, listener, options) {
      target?.addEventListener?.(type, listener, options);
      ownResource("listener", () => target?.removeEventListener?.(type, listener, options));
      return listener;
    },
    hook(name, listener) {
      const id = Hooks.on(name, listener);
      ownResource("hook", () => Hooks.off(name, id));
      return id;
    },
    timeout(callback, delay) {
      let disposeTimer = null;
      const id = setTimeout(() => {
        disposeTimer?.();
        callback();
      }, delay);
      disposeTimer = ownResource("timer", () => clearTimeout(id));
      return id;
    },
    child(childLabel) {
      const child = createTaskScope(`${label}/${childLabel}`, performanceObserver);
      const disposeChild = () => child.dispose();
      own(disposeChild);
      child.own(() => cleanups.delete(disposeChild));
      return child;
    },
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
